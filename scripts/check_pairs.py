#!/usr/bin/env python3
"""Ask DeepSeek V4.1 Flash whether reports the keyword grouping would join share a cause.

Keyword overlap also joins reports that name the same file or error for different reasons. This
lists the pairs of open reports from the last --days whose keywords overlap enough to group at
CHECK_THRESHOLD, a little looser than the dashboard's default of 0.50, using web/src/engine.ts
itself (through keyword_matches.ts, so node must be on PATH). Each pair not checked yet goes to the
model. The dashboard keeps pairs judged different apart; unchecked pairs, and pairs a looser
threshold adds, group on keywords as before. "Fixes #N" links always group.

A verdict is dropped when either report is summarized again after it. A pair the model gave no
answer for is retried after a day. Each call's cost goes into llm_calls under the lower report
number and counts toward the same --max-total as summarize.py.
"""
import argparse
import fcntl
import json
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import serve
from summarize import AUTH, MODEL, ROOT, cost_of, log, now

CHECK_THRESHOLD = 0.4
PROMPT = "v1"
WORKERS = 24
BATCH = 200  # budget is checked between batches
SYSTEM = ("You compare two reports from the hermes-agent GitHub repository. Decide whether they share the same "
          "underlying cause, so that one fix would resolve both (a PR that fixes the other's bug counts as same). "
          "Same file or same symptom with different causes is NOT same. Reply with ONLY JSON: "
          '{"same": true|false, "why": "<12 words"}')

SCHEMA = """
CREATE TABLE IF NOT EXISTS pair_checks (
  a INTEGER NOT NULL,  -- the lower report number
  b INTEGER NOT NULL,
  same INTEGER,        -- NULL: the model gave no answer; retried after a day
  why TEXT,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (a, b)
);
"""


def describe(db, n):
    r = db.execute("SELECT i.is_pr, i.title, s.problem_statement, substr(i.body, 1, 1200) FROM items i "
                   "LEFT JOIN summaries s USING (number) WHERE number = ?", (n,)).fetchone()
    return f"{'PR' if r[0] else 'Issue'} #{n}: {r[1]}\nSummary: {r[2] or '-'}\nBody start: {r[3] or ''}"


def check(auth, pair):
    """One pair. Returns (pair, (same, why) or None, [(usage, error), ...] per attempt)."""
    db = sqlite3.connect(f"file:{serve.DB}?mode=ro", uri=True, timeout=60)
    try:
        content = describe(db, pair[0]) + "\n\n---\n\n" + describe(db, pair[1])
    finally:
        db.close()
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": content}],
        "max_tokens": 800, "temperature": 0, "response_format": {"type": "json_object"},
        "reasoning": {"effort": "low"},
    }).encode()
    attempts = []
    for attempt in range(3):
        req = urllib.request.Request(auth["inference_base_url"].rstrip("/") + "/chat/completions",
                                     data=body, headers={
                                         "Authorization": "Bearer " + auth["agent_key"],
                                         "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.load(r)
        except urllib.error.HTTPError as e:
            attempts.append(({}, f"HTTP {e.code}: {e.read()[:200]!r}"))
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * 2 ** attempt)
                continue
            break
        except (urllib.error.URLError, TimeoutError) as e:
            attempts.append(({}, repr(e)[:200]))
            time.sleep(5 * 2 ** attempt)
            continue
        u = resp.get("usage") or {}
        try:
            out = json.loads(resp["choices"][0]["message"]["content"])
            if not isinstance(out["same"], bool):
                raise ValueError
        except Exception:  # the Portal sometimes returns empty content
            attempts.append((u, "invalid JSON"))
            continue
        attempts.append((u, None))
        return pair, (out["same"], str(out.get("why", ""))[:200]), attempts
    return pair, None, attempts


def import_verdicts(db, path):
    """Loads {"a-b": {"same": bool, "why": str}} verdicts made with this prompt and model, dated
    when the file was last written so later summaries still drop them."""
    at = datetime.fromtimestamp(Path(path).stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = [(*sorted(map(int, k.split("-"))), int(v["same"]), v.get("why", ""), MODEL, PROMPT, at)
            for k, v in json.loads(Path(path).read_text()).items() if isinstance(v.get("same"), bool)]
    n = db.executemany("INSERT OR IGNORE INTO pair_checks VALUES (?, ?, ?, ?, ?, ?, ?)", rows).rowcount
    db.commit()
    log(f"imported {n} of {len(rows)} verdicts from {path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--days", type=int, default=serve.DEFAULT_DAYS, help="window of open reports, as on the dashboard")
    ap.add_argument("--budget", type=float, default=0.25, help="USD cap for this run")
    ap.add_argument("--max-total", type=float, default=15.0, help="USD cap across all runs, shared with summarize.py")
    ap.add_argument("--import", dest="import_path", metavar="FILE",
                    help='first load verdicts made with this prompt from {"a-b": {"same", "why"}} JSON')
    ap.add_argument("--dry-run", action="store_true", help="count the pairs waiting, then stop")
    args = ap.parse_args()

    lock = open(serve.DB.with_name("check_pairs.lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("another check_pairs run is going; exiting")
        return

    db = sqlite3.connect(serve.DB, timeout=60)  # ingest and summarize may be writing at the same time
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    if args.import_path:
        import_verdicts(db, args.import_path)
    # a newer summary changes what the model would be shown
    stale = db.execute("DELETE FROM pair_checks WHERE EXISTS (SELECT 1 FROM summaries s WHERE s.number IN "
                       "(pair_checks.a, pair_checks.b) AND s.summarized_at > pair_checks.checked_at)").rowcount
    db.commit()

    node = shutil.which("node")
    if not node:
        log("node not found on PATH; nothing checked")
        return 1
    matches = subprocess.run(
        [node, str(ROOT / "scripts" / "keyword_matches.ts")], capture_output=True, text=True, check=True,
        input=json.dumps({"threshold": CHECK_THRESHOLD, "reports": serve.load(args.days)["reports"]}))
    pairs = {tuple(sorted(p)) for p in json.loads(matches.stdout)}
    known = set(db.execute("SELECT a, b FROM pair_checks WHERE same IS NOT NULL OR checked_at >= "
                           "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')"))
    pending = sorted(pairs - known, reverse=True)  # newest first
    total = db.execute("SELECT coalesce(sum(cost), 0) FROM llm_calls").fetchone()[0]
    log(f"start: {len(pairs)} keyword matches at {CHECK_THRESHOLD} in the last {args.days} days, "
        f"{len(pending)} not checked, {stale} stale verdicts dropped, spent so far ${total:.4f}")
    if args.dry_run:
        return

    auth = json.loads(AUTH.read_text())["providers"]["nous"]
    spent, judged, apart, failed, outcome = 0.0, 0, 0, 0, "ok"
    with ThreadPoolExecutor(WORKERS) as ex:
        for i in range(0, len(pending), BATCH):
            if spent >= args.budget:
                outcome = "run budget reached"
                break
            if total + spent >= args.max_total:
                outcome = "total cap reached"
                break
            fatal = None
            for (a, b), verdict, attempts in ex.map(lambda p: check(auth, p), pending[i:i + BATCH]):
                at = now()
                for u, err in attempts:
                    c = cost_of(u)
                    spent += c
                    db.execute("INSERT INTO llm_calls VALUES (?, ?, ?, ?, ?, ?, ?)",
                               (at, a, MODEL, u.get("prompt_tokens"), u.get("completion_tokens"), c, err))
                    if err and err[:8] in ("HTTP 401", "HTTP 402", "HTTP 403"):
                        fatal = err
                same, why = verdict or (None, attempts[-1][1] if attempts else None)
                db.execute("INSERT OR REPLACE INTO pair_checks VALUES (?, ?, ?, ?, ?, ?, ?)",
                           (a, b, same, why, MODEL, PROMPT, at))
                db.commit()
                judged += verdict is not None
                apart += same is False
                failed += verdict is None
            if fatal:
                outcome = f"stopped: {fatal}"
                break

    log(f"done ({outcome}): {judged} pairs checked, {apart} judged different, {failed} without an answer, "
        f"run cost ${spent:.4f}, total ${total + spent:.4f}")


if __name__ == "__main__":
    sys.exit(main())
