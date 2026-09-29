#!/usr/bin/env python3
"""Compare duplicate grouping from the stored summaries with a fresh run of summarize.py's prompt.

The cases are hand-labeled groups of real reports: items in the same group share a cause and a
fix. Groups are formed the way web/src/engine.ts forms them (rarity-weighted keyword Jaccard >= --threshold,
union-find), and optionally also through "Fixes #N" links, as the dashboard does. Prints each
version's groups and pairwise precision and recall. Writes nothing to the database.
"""
import argparse
import json
import math
import re
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import summarize  # noqa: E402

# Cron PYTHONPATH reports: similar symptoms, four different causes.
CASES = {
    "external worker misses dependency site-packages": [122222, 122238, 122529, 122685, 123400, 123738, 123875],
    "POSIX .py cron scripts miss dependency env": [122742, 123044, 123440, 123547, 123548],
    "gateway PYTHONPATH leaks into script jobs": [89422, 89433],
    "PYTHONPATH doubles on restart": [91239],
    "worker runs in the repo cwd": [108778],
    "venv lacks ruamel, config save swallows it": [27660],
}
# Keep these in step with web/src/engine.ts.
STOP = {"the", "and", "for", "with", "from", "not", "when", "after", "hermes", "agent"}
COMMON_CODE = {"config.yaml", "sys.executable", "sys.path", "os.environ", "os.getcwd", "site-packages", "__init__", "main"}
MAX_CODE_REPORTS = 10
CODE_DISCOUNT = (0, 0.1, 0.15, 0.2)


def tokens(q):
    ts = (re.sub(r"\.py$", "", re.sub(r"^[.\-]+|[.\-]+$", "", t)) for t in re.split(r"[^a-z0-9_.]+", q.lower()))
    return {t for t in ts if len(t) >= 3 and t not in STOP}


def is_code(t):
    return bool(re.search(r"[a-z0-9][_.][a-z0-9_]", t)) and not re.match(r"v?\d", t) and t not in COMMON_CODE


def groups(nums, query, links, threshold, shared_code=True, df=None, docs=1):
    """df: reports per keyword across the dashboard's window of `docs` reports. With shared_code, each
    keyword weighs log(docs / df) and hub code names don't count as shared code."""
    df = df or {}
    weight = (lambda t: math.log(max(docs, 1) / max(df.get(t, 0), 1))) if shared_code else (lambda t: 1.0)
    parent = {n: n for n in nums}
    find = lambda n: n if parent[n] == n else find(parent[n])
    def join(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[max(a, b)] = min(a, b)
    toks = {n: tokens(query[n]) for n in nums}
    for a, b in combinations(nums, 2):
        inter = sum(map(weight, toks[a] & toks[b]))
        union = sum(map(weight, toks[a] | toks[b]))
        shared = [t for t in toks[a] & toks[b] if is_code(t)] if shared_code else []
        rare = sum(df.get(t, 1) <= MAX_CODE_REPORTS for t in shared)
        apart = shared_code and not shared and any(map(is_code, toks[a])) and any(map(is_code, toks[b]))
        overlap = inter / union if union else 0
        if not apart and overlap >= threshold - CODE_DISCOUNT[min(rare, 3)] * shared_code:
            join(a, b)
    for a, b in links:
        if a in parent and b in parent:
            join(a, b)
    out = {}
    for n in nums:
        out.setdefault(find(n), []).append(n)
    return sorted(out.values(), key=lambda g: (-len(g), g))


def score(found, truth):
    same = lambda gs: {frozenset(p) for g in gs for p in combinations(sorted(g), 2)}
    f, t = same(found), same(truth)
    return len(f & t) / len(f) if f else 1.0, len(f & t) / len(t) if t else 1.0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default=str(ROOT / "data" / "triage.db"))
    ap.add_argument("--threshold", type=float, default=0.5, help="the dashboard's default")
    ap.add_argument("--out", help="save the fresh summaries here as JSON")
    args = ap.parse_args()
    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    nums = [n for g in CASES.values() for n in g]
    items = {r[0]: r for r in db.execute(
        f"SELECT number, is_pr, title, body FROM items WHERE number IN ({','.join('?' * len(nums))})", nums)}
    old = dict(db.execute(f"SELECT number, duplicate_query FROM summaries WHERE number IN "
                          f"({','.join('?' * len(nums))})", nums))
    links = db.execute("SELECT pr, issue FROM fixes").fetchall()
    df, docs = {}, 0
    for (q,) in db.execute("SELECT s.duplicate_query FROM summaries s JOIN items i USING (number) WHERE i.state = 'open' "
                           "AND i.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-14 days')"):
        docs += 1
        for t in tokens(q):
            df[t] = df.get(t, 0) + 1
    auth = json.loads(summarize.AUTH.read_text())["providers"]["nous"]
    new, spent = {}, 0.0
    with ThreadPoolExecutor(8) as ex:
        for item, parsed, attempts in ex.map(lambda n: summarize.summarize(auth, items[n]), nums):
            spent += sum(summarize.cost_of(u) for u, _ in attempts)
            new[item[0]] = parsed or ("", "")
    if args.out:
        Path(args.out).write_text(json.dumps({n: {"problem": p, "query": q, "old_query": old.get(n, "")}
                                              for n, (p, q) in new.items()}, indent=1))
    truth = list(CASES.values())
    name = {n: k for k, g in CASES.items() for n in g}
    fresh = {n: q for n, (_, q) in new.items()}
    for label, query, use_links, code in (("stored summaries, old grouping", old, False, False),
                                          (f"prompt {summarize.PROMPT}, old grouping", fresh, False, False),
                                          (f"prompt {summarize.PROMPT} + shared code names + Fixes links", fresh, True, True)):
        found = groups(nums, {n: query.get(n, "") for n in nums}, links if use_links else [], args.threshold, code, df, docs)
        precision, recall = score(found, truth)
        print(f"\n== {label}: {len(found)} groups (truth {len(truth)}), pair precision {precision:.0%}, recall {recall:.0%}")
        for g in found:
            print("  " + ", ".join(f"#{n}" for n in g) + "  <- " + "; ".join(sorted({name[n] for n in g})))
    print(f"\nfresh summaries cost ${spent:.4f}")


if __name__ == "__main__":
    main()
