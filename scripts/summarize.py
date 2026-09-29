#!/usr/bin/env python3
"""Summarize open issues and PRs in the local mirror with DeepSeek V4.1 Flash on Nous Portal.

Picks open items whose summary_status is 'waiting', newest first, and stores a one-sentence
problem statement plus duplicate-search keywords. Labels come from alt-glitch, so the model does
not classify. Closed and merged items are never summarized.

Every call's cost, as reported by the Portal, is recorded in llm_calls. A run stops at --budget
for that run or --max-total across all runs, whichever comes first.

The dashboard groups reports by overlap between their duplicate keywords, so the prompt asks for
code names and error text first: two reports with the same error can have different causes.
Each summary records the PROMPT version it came from; --resummarize-days N sends open items from
the last N days that an older prompt summarized back to 'waiting'.
"""
import argparse
import fcntl
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUTH = Path.home() / ".hermes-dashboard" / "auth.json"
MODEL = "deepseek/deepseek-v4.1-flash"
MAX_BODY = 20_000  # the longest bodies run to ~190k chars; the head carries the problem
WORKERS = 32
BATCH = 160  # budget is checked between batches
# only used when the Portal omits usage.cost; undiscounted rates keep the budget conservative
FALLBACK_IN, FALLBACK_OUT = 0.15e-6, 0.60e-6

PROMPT = "v2"
SYSTEM = """You are a GitHub triage clerk for the hermes-agent repository. Read one issue or pull request and reply with ONLY a JSON object with these keys:
"problem_statement": one plain sentence stating the problem (for a PR, the problem it fixes). Name the cause as well as the symptom, since two reports with the same error message can have different causes.
"duplicate_query": 4-8 space-separated search terms that would find other reports of this same cause, most specific first:
  1. the files, modules, functions, classes or config keys where the cause lies, spelled exactly as in the code;
  2. the distinctive part of the error text;
  3. the feature or component affected.
Leave out issue and PR numbers, version numbers, operating system names, the words hermes and agent, and generic words such as bug, fix, error, fails, broken, issue."""
# Made-up examples, so they can't leak into an evaluation on real items.
EXAMPLES = [
    ("Issue #1: Voice notes on Telegram fail with ffmpeg not found\n\nSince the last update every voice note "
     "fails: `RuntimeError: ffmpeg not found`. ffmpeg is installed under /opt/bin, which I add in "
     "config.yaml `terminal.path`. tools/transcription.py calls shutil.which('ffmpeg') at import, "
     "before the configured path is applied. Works on 0.20.1, broken on 0.21.0 (macOS).",
     {"problem_statement": "Voice-note transcription fails with 'ffmpeg not found' because "
                           "tools/transcription.py looks up ffmpeg at import, before the "
                           "configured terminal.path is applied.",
      "duplicate_query": "transcription.py shutil.which terminal.path ffmpeg-not-found voice-note"}),
    ("Pull request #2: fix(gateway): keep reconnecting Discord after close code 4004\n\nFixes #1234. "
     "`_reconnect_loop` in gateway/platforms/discord.py returns on any 4xxx close code, so after one "
     "4004 the bot stays offline until restart. Only 4004 on a revoked token should stop it; this "
     "retries the rest with backoff.",
     {"problem_statement": "The Discord gateway stays offline after any 4xxx close code because "
                           "_reconnect_loop in gateway/platforms/discord.py stops retrying instead "
                           "of backing off.",
      "duplicate_query": "_reconnect_loop platforms/discord.py close-code 4004 reconnect discord gateway"}),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS summaries (
  number INTEGER PRIMARY KEY,
  problem_statement TEXT NOT NULL,
  duplicate_query TEXT NOT NULL,
  model TEXT NOT NULL,
  summarized_at TEXT NOT NULL,
  prompt TEXT
);
CREATE TABLE IF NOT EXISTS llm_calls (
  at TEXT NOT NULL,
  number INTEGER NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost REAL NOT NULL,
  error TEXT
);
"""


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg):
    print(f"{now()} {msg}", flush=True)


def user_msg(number, is_pr, title, body):
    body = body or ""
    if len(body) > MAX_BODY:
        body = body[:MAX_BODY] + "\n\n[body truncated]"
    return f"{'Pull request' if is_pr else 'Issue'} #{number}: {title}\n\n{body}"


def messages(item):
    shots = [m for text, out in EXAMPLES for m in (
        {"role": "user", "content": text}, {"role": "assistant", "content": json.dumps(out)})]
    return [{"role": "system", "content": SYSTEM}, *shots, {"role": "user", "content": user_msg(*item)}]


def cost_of(u):
    if u.get("cost") is not None:
        return u["cost"]
    return u.get("prompt_tokens", 0) * FALLBACK_IN + u.get("completion_tokens", 0) * FALLBACK_OUT


def summarize(auth, item):
    """One item. Returns (item, (problem, query) or None, [(usage, error), ...] per attempt)."""
    body = json.dumps({
        "model": MODEL,
        "messages": messages(item),
        "max_tokens": 4000, "temperature": 0, "response_format": {"type": "json_object"},
        "reasoning": {"effort": "low"},
    }).encode()
    attempts = []
    for attempt in range(3):
        req = urllib.request.Request(auth["inference_base_url"].rstrip("/") + "/chat/completions",
                                     data=body, headers={
                                         "Authorization": "Bearer " + auth["agent_key"],
                                         "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
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
            problem, query = out["problem_statement"], out["duplicate_query"]
            if isinstance(query, list):
                query = " ".join(map(str, query))
            if not (isinstance(problem, str) and problem.strip() and isinstance(query, str)):
                raise ValueError
        except Exception:
            attempts.append((u, "invalid JSON"))
            continue
        attempts.append((u, None))
        return item, (problem.strip(), query.strip()), attempts
    return item, None, attempts


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default=str(ROOT / "data" / "triage.db"))
    ap.add_argument("--budget", type=float, default=1.0, help="USD cap for this run")
    ap.add_argument("--max-total", type=float, default=15.0, help="USD cap across all runs")
    ap.add_argument("--limit", type=int, default=0, help="stop after N items (0 = no limit)")
    ap.add_argument("--resummarize-days", type=int, default=0,
                    help=f"first send open items from the last N days not summarized by prompt {PROMPT} back to waiting")
    args = ap.parse_args()

    db_path = Path(args.db)
    lock = open(db_path.with_name("summarize.lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("another summarize run is going; exiting")
        return

    db = sqlite3.connect(db_path, timeout=60)  # ingest may be writing at the same time
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    if "prompt" not in [c for _, c, *_ in db.execute("PRAGMA table_info(summaries)")]:
        db.execute("ALTER TABLE summaries ADD COLUMN prompt TEXT")  # older rows stay NULL (v1)
    if args.resummarize_days:
        n = db.execute(
            "UPDATE items SET summary_status = 'waiting' WHERE state = 'open' AND summary_status = 'done' "
            "AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) AND number IN "
            "(SELECT number FROM summaries WHERE prompt IS NOT ?)",
            (f"-{args.resummarize_days} days", PROMPT)).rowcount
        db.commit()
        log(f"{n} items from the last {args.resummarize_days} days sent back to waiting for prompt {PROMPT}")
    auth = json.loads(AUTH.read_text())["providers"]["nous"]

    total = db.execute("SELECT coalesce(sum(cost), 0) FROM llm_calls").fetchone()[0]
    pending = db.execute(
        "SELECT number, is_pr, title, body FROM items WHERE state = 'open' AND "
        "summary_status = 'waiting' ORDER BY number DESC" + (f" LIMIT {args.limit}" if args.limit else "")
    ).fetchall()
    log(f"start: {len(pending)} open items waiting, spent so far ${total:.4f}, "
        f"run budget ${args.budget:.2f}, total cap ${args.max_total:.2f}")

    spent, done, failed, outcome = 0.0, 0, 0, "ok"
    with ThreadPoolExecutor(WORKERS) as ex:
        for i in range(0, len(pending), BATCH):
            if spent >= args.budget:
                outcome = "run budget reached"
                break
            if total + spent >= args.max_total:
                outcome = "total cap reached"
                break
            fatal = None
            for item, parsed, attempts in ex.map(lambda it: summarize(auth, it),
                                                 pending[i:i + BATCH]):
                number, _, title, body = item
                at = now()
                for u, err in attempts:
                    c = cost_of(u)
                    spent += c
                    db.execute("INSERT INTO llm_calls VALUES (?, ?, ?, ?, ?, ?, ?)",
                               (at, number, MODEL, u.get("prompt_tokens"),
                                u.get("completion_tokens"), c, err))
                    if err and err[:8] in ("HTTP 401", "HTTP 402", "HTTP 403"):
                        fatal = err
                if parsed:
                    db.execute("INSERT OR REPLACE INTO summaries (number, problem_statement, "
                               "duplicate_query, model, summarized_at, prompt) VALUES (?, ?, ?, ?, ?, ?)",
                               (number, *parsed, MODEL, at, PROMPT))
                    # if the sync changed the item mid-call it stays 'waiting' for the next run
                    db.execute("UPDATE items SET summary_status = 'done' WHERE number = ? AND "
                               "summary_status = 'waiting' AND title = ? AND body IS ?",
                               (number, title, body))
                    done += 1
                else:
                    db.execute("UPDATE items SET summary_status = 'failed' WHERE number = ? AND "
                               "summary_status = 'waiting'", (number,))
                    failed += 1
                db.commit()  # per item, so the sync never waits long for the write lock
            if fatal:
                outcome = f"stopped: {fatal}"
                break
            if (i // BATCH + 1) % 25 == 0:
                log(f"{done + failed}/{len(pending)} items, {failed} failed, run cost ${spent:.4f}")

    left = db.execute("SELECT count(*) FROM items WHERE state = 'open' AND "
                      "summary_status = 'waiting'").fetchone()[0]
    log(f"done ({outcome}): {done} summarized, {failed} failed, run cost ${spent:.4f}, "
        f"total ${total + spent:.4f}, {left} open items still waiting")


if __name__ == "__main__":
    sys.exit(main())
