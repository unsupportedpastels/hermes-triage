#!/usr/bin/env python3
"""Queue hermes-agent issues and PRs for an agent to work end to end, and report how they're going.

`issue_queue.py add N [N ...]` creates one Hermes Kanban card per open issue or PR (at most 10 at a time). The
gateway's dispatcher runs each card as a worker that follows the hermes-issue-queue-worker skill:
it reads the issue and every PR on it, checks whether main already fixes it, compares and salvages
existing PRs or writes its own fix, and blocks at one outcome with its evidence in
~/hermes-issue-queue/N/. Workers never write to GitHub; the user approves each outcome first.
Queueing an issue that already has a card returns that card instead of a second one.

`issue_queue.py status [--json]` lists every queued issue with its card's status and the worker's outcome.
"""
import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "triage.db"
KANBAN_DB = Path.home() / ".hermes-dashboard" / "kanban.db"
ARTIFACTS = Path.home() / "hermes-issue-queue"
REPO = "NousResearch/hermes-agent"
MAX_BATCH = 10
KEY = "hermes-issue-{}"
# The web service's PATH may not include ~/.local/bin.
HERMES = shutil.which("hermes") or str(Path.home() / ".local" / "bin" / "hermes")
# Workers run on the delegate model, not the main one. 2 hours covers a salvage with a full test run.
CARD_ARGS = [
    "--assignee", "default", "--workspace", f"dir:{Path.home()}", "--created-by", "hermes-triage",
    "--model", "gpt-6-astra", "--provider", "openai-codex", "--max-runtime", "2h",
    "--skill", "hermes-issue-queue-worker", "--skill", "github-issue-to-pr",
    "--skill", "github-pr-supersession-and-credit",
]


def open_items(numbers):
    """(title, is_pr) of each number that the mirror has as an open issue or PR."""
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30)
    try:
        marks = ",".join("?" * len(numbers))
        return {n: (title, bool(is_pr)) for n, title, is_pr in db.execute(
            f"SELECT number, title, is_pr FROM items WHERE number IN ({marks}) AND state = 'open'",
            numbers).fetchall()}
    finally:
        db.close()


def card_body(number, title, is_pr, related=()):
    kind, path = ("PR", "pull") if is_pr else ("issue", "issues")
    body = (
        f"Work hermes-agent {kind} #{number} end to end: {title}\n"
        f"https://github.com/{REPO}/{path}/{number}\n\n"
        "Follow the hermes-issue-queue-worker skill exactly. No GitHub writes of any kind.\n"
        f"Write artifacts to {ARTIFACTS}/{number}/ (outcome.txt, evidence.md and the outcome's files),\n"
        "then kanban_block with the outcome tag as the first line of the reason.\n"
    )
    if related:
        body += ("\nThe triage dashboard folded these open reports under it as the same cause (a Fixes link "
                 "or the model check); put each in the ledger and verify it: "
                 + " ".join(f"#{m}" for m in related) + "\n")
    return body


def add(numbers, related=None):
    numbers = list(dict.fromkeys(numbers))
    if len(numbers) > MAX_BATCH:
        sys.exit(f"at most {MAX_BATCH} at a time, got {len(numbers)}")
    items = open_items(numbers)
    out = []
    for n in numbers:
        if n not in items:
            out.append({"number": n, "error": "not an open issue or PR in the mirror"})
            continue
        title, is_pr = items[n]
        cmd = [HERMES, "kanban", "create", f"Work hermes-agent {'PR' if is_pr else 'issue'} #{n}: {title[:80]}",
               "--body", card_body(n, title, is_pr, (related or {}).get(n, ())),
               "--idempotency-key", KEY.format(n), *CARD_ARGS, "--json"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if res.returncode:
            out.append({"number": n, "error": (res.stderr or res.stdout).strip()[-300:]})
            continue
        # the CLI may print notices before the JSON object
        card = json.loads(res.stdout[res.stdout.index("{"):])
        out.append({"number": n, "task": card.get("id") or card.get("task_id")})
    return out


def status():
    """Every card issue_queue.py created, keyed by issue number, newest card first."""
    if not KANBAN_DB.exists():
        return {}
    db = sqlite3.connect(f"file:{KANBAN_DB}?mode=ro", uri=True, timeout=30)
    try:
        rows = db.execute(
            "SELECT idempotency_key, id, status, created_at, started_at, completed_at, last_failure_error "
            "FROM tasks WHERE idempotency_key LIKE 'hermes-issue-%' ORDER BY created_at DESC").fetchall()
    finally:
        db.close()
    cards = {}
    for key, task, state, created, started, done, failure in rows:
        n = int(key.rsplit("-", 1)[1])
        if n in cards:
            continue
        outcome = ARTIFACTS / str(n) / "outcome.txt"
        cards[n] = {
            "task": task, "status": state, "createdAt": created, "startedAt": started, "completedAt": done,
            "outcome": outcome.read_text().strip().splitlines()[0] if outcome.is_file() else None,
            "failure": failure,
        }
    return cards


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add", help="queue issues or PRs")
    a.add_argument("numbers", type=int, nargs="+")
    s = sub.add_parser("status", help="list queued issues and PRs")
    s.add_argument("--json", action="store_true")
    args = ap.parse_args()
    if args.cmd == "add":
        print(json.dumps(add(args.numbers), indent=1))
        return
    cards = status()
    if args.json:
        print(json.dumps(cards, indent=1))
        return
    for n, c in cards.items():
        print(f"#{n}\t{c['task']}\t{c['status']}\t{c['outcome'] or ''}")


if __name__ == "__main__":
    main()
