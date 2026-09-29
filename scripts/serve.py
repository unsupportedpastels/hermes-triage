#!/usr/bin/env python3
"""Serve the triage dashboard and a read-only JSON API over the local mirror.

GET /api/reports?days=N returns open issues and PRs opened in the last N days (default 14, at
most 90) with their summaries and salvage links, open PRs whose salvage already merged, plus
pipeline stats, plus `apart`: pairs of those reports that check_pairs.py's model check judged to
have different causes, so the dashboard doesn't group them on keywords, and `same`: the pairs it
judged to share a cause, which All reports folds under one parent. Everything else is served
from web/dist. `&skip=M` leaves out reports from the newest M days (the dashboard loads those
first); `apart` and the rest still cover all N days.
Each report also carries `owners`: the STAFF members active on it (opened it, assigned, commented,
reviewed, pushed, or opened an open PR that fixes or salvages it), and `ownersChecked`, false until
ingest.py has read its activity. `mine` is the same record for ME, or null when they haven't touched it.
GET /api/stats?days=N returns counts over the whole mirror for the Stats page (default 30, at
most 365), including who merged or closed PRs in the window and the issues those merges closed.
GET /api/advisories returns every GHSA ID an issue or PR names, with the items naming it and the
advisory details ingest.py cached, plus hermes-agent's own published advisories.
GET /api/queue returns the issues and PRs queued for an agent to work (issue_queue.py status), and
POST /api/queue with {"numbers": [...], "related": {"N": [...]}} queues up to 10 more, each with the
duplicates the dashboard folded under it. That is the only write: it creates
Hermes Kanban cards, never touches GitHub, and is refused unless the request comes from this page.
The database is opened read-only; ingest.py, summarize.py and check_pairs.py stay the only writers.
"""
import argparse
import gzip
import json
import re
import sqlite3
import statistics
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import issue_queue

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "triage.db"
DIST = ROOT / "web" / "dist"
DEFAULT_DAYS, MAX_DAYS = 14, 90
STATS_DAYS, MAX_STATS_DAYS = 30, 365
WEEKS = 12
# An item counts as a duplicate when alt-glitch labeled it so or it was closed as a duplicate.
DUP = "(labels LIKE '%\"duplicate\"%' OR state_reason = 'duplicate')"
# A PR closed without merging counts as salvaged when a PR that names it as salvaged merged.
SALVAGED = ("EXISTS (SELECT 1 FROM salvages v JOIN items n ON n.number = v.new "
            "WHERE v.orig = items.number AND n.merged_at IS NOT NULL)")
SINCE = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)"
OPEN_SINCE = f"SELECT number FROM items WHERE state = 'open' AND created_at >= {SINCE}"
AGE_BUCKETS = ["Under a day", "1–7 days", "1–4 weeks", "1–3 months", "Over 3 months"]
PRIOS = ("P0", "P1", "P2", "P3", "P4", "")
# same pattern as ingest.py
GHSA = re.compile(r"\bGHSA(?:-[23456789cfghjmpqrvwx]{4}){3}\b", re.I)
# Nous staff on hermes-agent. When one of them is active on an item it's probably theirs.
STAFF = {s.lower() for s in ("alt-glitch", "austinpickett", "ethernet8023", "jquesnelle", "kshitijk4poor",
                             "OutThisLife", "teknium1", "yoniebans")}
# The dashboard's user. Their activity is read like STAFF's but kept apart, so they can see what
# they've already worked on.
ME = "unsupportedpastels"
WATCHED = STAFF | {ME}
ACT_KEY = {"comment": "comments", "review": "reviews", "commit": "commits", "push": "pushes"}


def connect():
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30)


def load(days, skip=0):
    db = connect()
    try:
        newer = f"AND i.created_at < {SINCE} " if skip else ""
        window = (f"-{days} days",) + ((f"-{skip} days",) if skip else ())
        rows = db.execute(
            "SELECT i.number, i.url, i.title, i.author, i.created_at, i.is_pr, i.draft, i.kind, "
            "i.comp, i.prio, i.labels, s.problem_statement, s.duplicate_query "
            "FROM items i LEFT JOIN summaries s USING (number) "
            f"WHERE i.state = 'open' AND i.created_at >= {SINCE} {newer}"
            "ORDER BY i.created_at DESC", window).fetchall()
        watched_in = ",".join("?" * len(WATCHED))
        has_activity = db.execute("SELECT 1 FROM sqlite_master WHERE name = 'activity_checked'").fetchone()
        acts = db.execute(
            "SELECT a.number, a.login, a.kind, a.n, a.last_at FROM activity a JOIN items i USING (number) "
            f"WHERE lower(a.login) IN ({watched_in}) AND i.state = 'open' AND i.created_at >= {SINCE} {newer}",
            tuple(WATCHED) + window).fetchall() if has_activity else []
        checked = {n for (n,) in db.execute("SELECT number FROM activity_checked")} if has_activity else set()
        # open PRs by staff or ME that say they fix an issue or salvage a PR
        staff_prs = db.execute(
            "SELECT l.target, p.number, p.author FROM (SELECT issue AS target, pr FROM fixes "
            "UNION SELECT orig, new FROM salvages) l JOIN items p ON p.number = l.pr "
            f"WHERE p.state = 'open' AND lower(p.author) IN ({watched_in})", tuple(WATCHED)).fetchall()
        # CROSS JOIN scans the salvage links once; with `IN (...) OR IN (...)` SQLite took ~15x longer.
        links = db.execute(
            "SELECT v.new, v.orig, n.author, n.state, n.merged_at, o.author, o.state, o.merged_at "
            "FROM salvages v CROSS JOIN items n CROSS JOIN items o "
            "WHERE n.number = v.new AND o.number = v.orig AND o.is_pr = 1 "
            f"AND ((n.state = 'open' AND n.created_at >= {SINCE}) OR (o.state = 'open' AND o.created_at >= {SINCE}))",
            (f"-{days} days",) * 2).fetchall()
        # any age: an open PR whose work already merged elsewhere can probably be closed
        fix_rows = db.execute(f"SELECT pr, issue FROM fixes WHERE pr IN ({OPEN_SINCE})",
                              (f"-{days} days",)).fetchall()
        closable_rows = db.execute(
            "SELECT o.number, o.url, o.title, o.author, o.created_at, n.number, n.author, n.merged_at "
            "FROM salvages v JOIN items o ON o.number = v.orig JOIN items n ON n.number = v.new "
            "WHERE o.is_pr = 1 AND o.state = 'open' AND n.merged_at IS NOT NULL "
            "ORDER BY n.merged_at DESC").fetchall()
        status = dict(db.execute("SELECT summary_status, count(*) FROM items WHERE state = 'open' "
                                 "GROUP BY 1"))
        spend = db.execute("SELECT coalesce(sum(cost), 0) FROM llm_calls").fetchone()[0]
        synced = db.execute("SELECT max(finished_at) FROM runs WHERE outcome = 'ok'").fetchone()[0]
        # CROSS JOIN keeps the scan on the few checked pairs; as `a IN (...) AND b IN (...)` SQLite
        # probed every pair of open reports instead (seconds rather than milliseconds).
        checked_pairs = lambda same: db.execute(
            "SELECT p.a, p.b FROM pair_checks p CROSS JOIN items x CROSS JOIN items y "
            "WHERE p.same = ? AND x.number = p.a AND y.number = p.b AND x.state = 'open' AND y.state = 'open' "
            f"AND x.created_at >= {SINCE} AND y.created_at >= {SINCE}",
            (same,) + (f"-{days} days",) * 2).fetchall() if db.execute(
            "SELECT 1 FROM sqlite_master WHERE name = 'pair_checks'").fetchone() else []
        apart, same = checked_pairs(0), checked_pairs(1)
    finally:
        db.close()
    link = lambda number, author, state, merged: {
        "number": number, "author": author or "", "state": "merged" if merged else state}
    salvages, salvaged_by = {}, {}
    for new, orig, n_author, n_state, n_merged, o_author, o_state, o_merged in links:
        salvages.setdefault(new, []).append(link(orig, o_author, o_state, o_merged))
        salvaged_by.setdefault(orig, []).append(link(new, n_author, n_state, n_merged))
    fixes = {}
    for pr, issue in fix_rows:
        fixes.setdefault(pr, []).append(issue)
    owners = {}
    owner = lambda number, login: owners.setdefault(number, {}).setdefault(login.lower(), {"login": login})
    for number, login, kind, n, last in acts:
        o = owner(number, login)
        if kind == "assigned":
            o["assigned"] = True
        elif kind in ACT_KEY:
            o[ACT_KEY[kind]] = n
            if last and last > o.get("lastAt", ""):
                o["lastAt"] = last
    for target, pr, author in staff_prs:
        owner(target, author).setdefault("prs", []).append(pr)
    closable = {}
    for number, url, title, author, created, new, n_author, merged in closable_rows:
        closable.setdefault(number, {
            "number": number, "url": url, "title": title, "author": author or "",
            "createdAt": created, "by": [],
        })["by"].append({"number": new, "author": n_author or "", "mergedAt": merged})
    reports = []
    for (number, url, title, author, created, is_pr, draft, kind, comp, prio, raw_labels,
         problem, query) in rows:
        labels = {k: v for k, v in (("kind", kind), ("comp", comp), ("prio", prio)) if v}
        if labels:
            labels["by"] = "alt-glitch"  # the repo's labeler; the mirror doesn't record who applied them
        if author and author.lower() in WATCHED:
            owner(number, author)["opened"] = True
        people = owners.get(number, {})
        reports.append({
            "number": number, "url": url, "title": title, "author": author or "",
            "createdAt": created, "isPr": bool(is_pr), "draft": bool(draft),
            "state": "pr_open" if is_pr else "issue_open",
            "problem": problem or title, "dupQuery": query or "", "summarized": problem is not None,
            "labels": labels, "tags": json.loads(raw_labels) if raw_labels else [],
            "salvages": salvages.get(number, []), "salvagedBy": salvaged_by.get(number, []),
            "fixes": fixes.get(number, []),
            "owners": sorted((o for k, o in people.items() if k != ME), key=lambda o: o.get("lastAt", ""), reverse=True),
            "mine": people.get(ME),
            "ownersChecked": number in checked,
        })
    return {
        "days": days,
        "reports": reports,
        "closable": list(closable.values()),
        "apart": [list(p) for p in apart],
        "same": [list(p) for p in same],
        "meta": {
            "openTotal": sum(status.values()),
            "summarized": status.get("done", 0),
            "waiting": status.get("waiting", 0),
            "failed": status.get("failed", 0),
            "spendUsd": round(spend, 4),
            "lastSync": synced,
        },
    }


def stats(days):
    since = (f"-{days} days",)
    db = connect()
    try:
        one = lambda sql, args=(): db.execute(sql, args).fetchone()
        mirrored = one("SELECT count(*) FROM items")[0]
        open_issues, open_prs = one("SELECT coalesce(sum(is_pr = 0), 0), coalesce(sum(is_pr), 0) "
                                    "FROM items WHERE state = 'open'")
        opened = one(f"SELECT coalesce(sum(is_pr = 0), 0), coalesce(sum(is_pr), 0), "
                     f"coalesce(sum(is_pr = 0 AND {DUP}), 0), coalesce(sum(is_pr AND {DUP}), 0) "
                     f"FROM items WHERE created_at >= {SINCE}", since)
        closed = one("SELECT coalesce(sum(is_pr = 0), 0), coalesce(sum(is_pr AND merged_at IS NOT NULL), 0), "
                     f"coalesce(sum(is_pr AND merged_at IS NULL AND {SALVAGED}), 0), "
                     f"coalesce(sum(is_pr AND merged_at IS NULL AND NOT {SALVAGED}), 0) "
                     f"FROM items WHERE state = 'closed' AND closed_at >= {SINCE}", since)
        prio = dict(db.execute("SELECT coalesce(prio, ''), count(*) FROM items "
                               "WHERE state = 'open' AND is_pr = 0 GROUP BY 1"))
        kind = dict(db.execute("SELECT coalesce(kind, ''), count(*) FROM items "
                               "WHERE state = 'open' AND is_pr = 0 GROUP BY 1"))
        comp = db.execute("SELECT coalesce(comp, ''), count(*) FROM items WHERE state = 'open' "
                          "GROUP BY 1 ORDER BY 2 DESC").fetchall()
        age = dict(db.execute(
            "SELECT CASE WHEN a < 1 THEN 0 WHEN a < 7 THEN 1 WHEN a < 30 THEN 2 WHEN a < 90 THEN 3 "
            "ELSE 4 END, count(*) FROM (SELECT julianday('now') - julianday(created_at) AS a "
            "FROM items WHERE state = 'open' AND is_pr = 0) GROUP BY 1"))
        # Rolling 7-day buckets ending now; bucket 0 is the latest week.
        week = "CAST((julianday('now') - julianday({})) / 7 AS INTEGER)"
        span = (f"-{WEEKS * 7} days",)
        new = {w: rest for w, *rest in db.execute(
            f"SELECT {week.format('created_at')}, sum(is_pr = 0), sum(is_pr), sum({DUP}) "
            f"FROM items WHERE created_at >= {SINCE} GROUP BY 1", span)}
        done = {w: rest for w, *rest in db.execute(
            f"SELECT {week.format('closed_at')}, sum(is_pr = 0), sum(is_pr), sum(merged_at IS NOT NULL) "
            f"FROM items WHERE state = 'closed' AND closed_at >= {SINCE} GROUP BY 1", span)}
        fixed = db.execute(
            "SELECT coalesce(prio, ''), (julianday(closed_at) - julianday(created_at)) * 24 FROM items "
            f"WHERE is_pr = 0 AND state_reason = 'completed' AND closed_at >= {SINCE}", since).fetchall()
        merge_hours = [h for (h,) in db.execute(
            "SELECT (julianday(merged_at) - julianday(created_at)) * 24 FROM items "
            f"WHERE is_pr = 1 AND merged_at >= {SINCE}", since)]
        merged_prs = db.execute(
            "SELECT m.merged_by, count(*) "
            f"FROM items i JOIN merges m USING (number) WHERE i.merged_at >= {SINCE} AND m.merged_by IS NOT NULL "
            "GROUP BY 1",
            since).fetchall()
        merged_weeks = db.execute(
            f"SELECT m.merged_by, {week.format('i.merged_at')}, count(*) FROM items i JOIN merges m USING (number) "
            f"WHERE i.merged_at >= {SINCE} AND m.merged_by IS NOT NULL GROUP BY 1, 2", span).fetchall()
        # Issues GitHub closed with each merge, counted once per merger. Materializing the window first
        # keeps json_each off the whole merges table.
        closed_by = db.execute(
            "WITH w AS MATERIALIZED (SELECT m.merged_by, m.closes, i.merged_at FROM items i JOIN merges m "
            f"USING (number) WHERE i.merged_at >= {SINCE} AND m.merged_by IS NOT NULL AND m.closes != '[]') "
            "SELECT w.merged_by, s.number, coalesce(s.prio, '') "
            "FROM w, json_each(w.closes) c JOIN items s ON s.number = c.value AND s.is_pr = 0 GROUP BY 1, 2",
            since).fetchall()
        # PRs closed without merging, by whoever closed them. Only people who have merged a PR (only
        # Nous staff can) are counted, so authors closing their own PRs stay off the board.
        staff_closes = ("FROM items i JOIN closes c USING (number) WHERE i.state = 'closed' AND i.merged_at IS NULL "
                        "AND c.closed_at = i.closed_at AND c.closed_by IN (SELECT merged_by FROM merges) "
                        f"AND i.closed_at >= {SINCE}")
        staff_closed = db.execute(f"SELECT c.closed_by, count(*) {staff_closes} GROUP BY 1", since).fetchall()
        staff_closed_weeks = db.execute(f"SELECT c.closed_by, {week.format('i.closed_at')}, count(*) {staff_closes} "
                                        "GROUP BY 1, 2", span).fetchall()
        looked_up = one(f"SELECT count(*), count(m.number) FROM items i LEFT JOIN merges m USING (number) "
                        f"WHERE i.merged_at >= {SINCE}", since)
    finally:
        db.close()
    today = datetime.now(timezone.utc)
    weekly = []
    for w in range(WEEKS - 1, -1, -1):
        issues, prs, dups = new.get(w, (0, 0, 0))
        closed_issues, closed_prs, merged = done.get(w, (0, 0, 0))
        weekly.append({
            "start": (today - timedelta(days=7 * (w + 1))).date().isoformat(),
            "issues": issues, "prs": prs, "dups": dups, "closedIssues": closed_issues,
            "closedPrs": closed_prs, "merged": merged,
        })
    median = lambda xs: round(statistics.median(xs), 2) if xs else None
    mean = lambda xs: round(statistics.fmean(xs), 2) if xs else None
    by_prio = {p: [h for q, h in fixed if q == p] for p in PRIOS}
    people = {}
    new_person = lambda: {"merged": 0, "closed": 0, "weeks": [0] * WEEKS, "issues": 0, "urgent": 0}
    for login, n in merged_prs:
        people.setdefault(login, new_person())["merged"] = n
    for login, n in staff_closed:
        people.setdefault(login, new_person())["closed"] = n
    for login, _, label in closed_by:
        p = people.setdefault(login, new_person())
        p["issues"] += 1
        p["urgent"] += label in ("P0", "P1")
    mergers = sorted(({
        "login": login, "merged": p["merged"], "closed": p["closed"], "prs": p["merged"] + p["closed"],
        "issues": p["issues"], "urgent": p["urgent"], "weeks": p["weeks"],
    } for login, p in people.items()), key=lambda m: (-m["prs"], m["login"]))
    # the sparkline always covers the last 12 weeks, like the weekly charts, for whoever merged or closed
    # in the window, and counts both
    for login, w, n in merged_weeks + staff_closed_weeks:
        if login in people and w < WEEKS:
            people[login]["weeks"][WEEKS - 1 - w] += n
    return {
        "days": days,
        "mirrored": mirrored,
        "open": {"issues": open_issues, "prs": open_prs},
        "opened": dict(zip(("issues", "prs", "dupIssues", "dupPrs"), opened)),
        "closed": dict(zip(("issues", "merged", "salvaged", "unmerged"), closed)),
        "prio": prio,
        "kind": kind,
        "comp": comp,
        "age": [[name, age.get(k, 0)] for k, name in enumerate(AGE_BUCKETS)],
        "weekly": weekly,
        "hours": {"issueFix": median([h for _, h in fixed]), "prMerge": median(merge_hours)},
        "fixByPrio": [{"prio": p, "n": len(hs), "meanHours": mean(hs), "medianHours": median(hs)}
                      for p, hs in by_prio.items()],
        "mergers": mergers,
        "mergeLookup": {"merged": looked_up[0], "known": looked_up[1]},
    }


ROUTES = {"/api/reports": (load, DEFAULT_DAYS, MAX_DAYS), "/api/stats": (stats, STATS_DAYS, MAX_STATS_DAYS)}


def advisories(_days=None):
    db = connect()
    try:
        rows = db.execute(
            "SELECT number, url, title, author, created_at, is_pr, draft, state, merged_at, body FROM items "
            "WHERE title LIKE '%GHSA-%' OR body LIKE '%GHSA-%' ORDER BY created_at DESC").fetchall()
        cached = {r[0]: r[1:] for r in db.execute(
            "SELECT ghsa_id, severity, summary, packages, cve, published_at, withdrawn_at, own FROM advisories")
        } if db.execute("SELECT 1 FROM sqlite_master WHERE name = 'advisories'").fetchone() else {}
    finally:
        db.close()
    named = {}
    for number, url, title, author, created, is_pr, draft, state, merged, body in rows:
        item = {"number": number, "url": url, "title": title, "author": author or "", "createdAt": created,
                "isPr": bool(is_pr), "draft": bool(draft), "state": "merged" if merged else state}
        for g in {"GHSA" + m[4:].lower() for m in GHSA.findall(f"{title}\n{body or ''}")}:
            named.setdefault(g, []).append(item)
    out = []
    for g in set(named) | {g for g, c in cached.items() if c[6]}:
        severity, summary, pkgs, cve, published, withdrawn, own = cached.get(g, (None,) * 6 + (0,))
        out.append({
            "id": g, "url": f"https://github.com/advisories/{g}",
            "lookup": "found" if severity else "missing" if g in cached else "pending",
            "severity": severity, "summary": summary, "packages": json.loads(pkgs) if pkgs else [],
            "cve": cve, "publishedAt": published, "withdrawn": bool(withdrawn), "own": bool(own),
            "items": named.get(g, []),
        })
    return {"advisories": out, "items": len(rows)}


ROUTES["/api/advisories"] = (advisories, None, None)
ROUTES["/api/queue"] = (lambda _days: issue_queue.status(), None, None)


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, status, obj):
        body = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlparse(self.path).path != "/api/queue":
            return self.send_json(404, {"error": "not found"})
        # Only this page may queue: a browser always sends Origin on a cross-site POST.
        origin = urlparse(self.headers.get("Origin", "")).netloc
        if origin != self.headers.get("Host"):
            return self.send_json(403, {"error": "cross-origin request refused"})
        try:
            raw = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 10_000)))
            numbers = [int(n) for n in raw["numbers"]]
            related = {int(k): [int(m) for m in v][:50] for k, v in (raw.get("related") or {}).items()}
        except (ValueError, KeyError, TypeError):
            return self.send_json(400, {"error": 'expected {"numbers": [issue or PR numbers]}'})
        if not 1 <= len(numbers) <= issue_queue.MAX_BATCH:
            return self.send_json(400, {"error": f"queue 1 to {issue_queue.MAX_BATCH} at a time"})
        return self.send_json(200, {"queued": issue_queue.add(numbers, related), "cards": issue_queue.status()})

    def do_GET(self):
        url = urlparse(self.path)
        if url.path not in ROUTES:
            return super().do_GET()
        fn, default, cap = ROUTES[url.path]
        days = default
        if default is not None:
            try:
                days = int(parse_qs(url.query).get("days", [default])[0])
            except ValueError:
                pass
            days = max(1, min(days, cap))
        args = (days,)
        if fn is load:
            try:
                args += (max(0, min(int(parse_qs(url.query).get("skip", [0])[0]), days)),)
            except ValueError:
                pass
        body = json.dumps(fn(*args), separators=(",", ":")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        if "gzip" in self.headers.get("Accept-Encoding", ""):
            body = gzip.compress(body, 5)
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if not self.path.startswith("/assets/"):
            super().log_message(fmt, *args)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=4180)
    args = ap.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(DIST)))
    print(f"serving http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
