#!/usr/bin/env python3
"""Mirror NousResearch/hermes-agent issues and PRs into a local SQLite database.

Read-only against GitHub. Uses the gh CLI's token. The same command does the first backfill and
later incremental syncs. Both follow GitHub's cursor links (rel="next"); page numbers stop working
on a repo this size.

- Backfill walks /issues by created_at ascending and saves the next link after every page, so an
  interrupted run resumes where it stopped.
- Once the backfill ends, each run walks /issues updated since the last stored updated_at.
  The cursor starts from when the backfill began, so changes made during the backfill are caught.

Summaries come from scripts/summarize.py.

Salvages are read from PR titles and bodies ("Salvages #123 by @x", "salvage of #123") into the
salvages table: `new` is the PR that carries the work on, `orig` the PR it names. Fix links
("Fixes #123", "Closes #123") go into the fixes table the same way.

After the pages, merged PRs not yet in the merges table are looked up over GraphQL, 50 per
query: who merged them and which issues GitHub closed with them. A merged PR never changes, so
each is fetched once; a run that stops near the rate limit carries on next time.
PRs closed without merging get the same treatment into the closes table (who closed them), and
are looked up again if they are reopened and closed again.

GHSA IDs named in any issue or PR title or body are looked up in GitHub's advisory database over
GraphQL, 50 per query, into the advisories table, and again after 30 days in case the advisory
changed. Advisories published against hermes-agent itself are read from the REST advisory search
every 6 hours and marked `own`.

Open items from the last 90 days get who is active on them into the activity table: authors of
their last 100 comments, reviews, commits and force-pushes, plus current assignees, 50 items per
GraphQL query. An item is read again whenever its updated_at moves (a comment or push moves it),
most recently updated first, at most ACTIVITY_QUERIES queries per run so a backlog never holds up
the sync for long.
"""
import argparse
import fcntl
import json
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "NousResearch/hermes-agent"
API = f"https://api.github.com/repos/{REPO}/issues"
PRIOS = {"P0", "P1", "P2", "P3", "P4"}
PER_PAGE = 100
KEEP_SPARE = 200  # stop short of the hourly limit so gh stays usable for other work
SALVAGE = re.compile(r"salvag\w*\s+(?:of\s+|from\s+)?(?:PR\s+)?#(\d+)", re.I)
# GitHub's closing keywords: https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue
FIXES = re.compile(r"\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?):?\s+(?:issue\s+)?#(\d+)", re.I)
GRAPHQL = "https://api.github.com/graphql"
MERGE_BATCH = 50  # PRs per GraphQL query; each query costs 1 point
# GHSA IDs as GitHub writes them; scripts/serve.py uses the same pattern
GHSA = re.compile(r"\bGHSA(?:-[23456789cfghjmpqrvwx]{4}){3}\b", re.I)
OWN_ADVISORIES = "https://api.github.com/advisories?affects=hermes-agent&per_page=100"
OWN_EVERY_S = 6 * 3600
REFETCH_DAYS = 30
ACTIVITY_DAYS = 90  # the dashboard loads at most 90 days (MAX_DAYS in serve.py)
ACTIVITY_QUERIES = 60  # per run; each takes ~5 s
ACTIVITY_KIND = {"IssueComment": "comment", "PullRequestReview": "review",
                 "PullRequestCommit": "commit", "HeadRefForcePushedEvent": "push"}
_WHO = "__typename ... on IssueComment { author { login } createdAt }"
ACTIVITY_FIELDS = (
    f"... on Issue {{ assignees(first: 10) {{ nodes {{ login }} }} "
    f"timelineItems(last: 100, itemTypes: [ISSUE_COMMENT]) {{ nodes {{ {_WHO} }} }} }} "
    f"... on PullRequest {{ assignees(first: 10) {{ nodes {{ login }} }} timelineItems(last: 100, itemTypes: "
    f"[ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_COMMIT, HEAD_REF_FORCE_PUSHED_EVENT]) {{ nodes {{ {_WHO} "
    "... on PullRequestReview { author { login } submittedAt } "
    "... on PullRequestCommit { commit { committedDate author { user { login } } } } "
    "... on HeadRefForcePushedEvent { actor { login } createdAt } } } }"
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
  number INTEGER PRIMARY KEY,
  is_pr INTEGER NOT NULL,
  state TEXT NOT NULL,
  state_reason TEXT,
  draft INTEGER,
  merged_at TEXT,
  title TEXT NOT NULL,
  body TEXT,
  author TEXT,
  author_association TEXT,
  labels TEXT NOT NULL,
  kind TEXT,
  comp TEXT,
  prio TEXT,
  comments INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  url TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  summary_status TEXT NOT NULL DEFAULT 'waiting'
);
CREATE INDEX IF NOT EXISTS items_updated ON items(updated_at);
CREATE INDEX IF NOT EXISTS items_created ON items(created_at);
CREATE INDEX IF NOT EXISTS items_open ON items(state, is_pr);
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  started_at TEXT NOT NULL,
  finished_at TEXT,
  requests INTEGER,
  upserted INTEGER,
  cursor TEXT,
  outcome TEXT
);
CREATE TABLE IF NOT EXISTS salvages (
  new INTEGER NOT NULL,
  orig INTEGER NOT NULL,
  PRIMARY KEY (new, orig)
);
CREATE INDEX IF NOT EXISTS salvages_orig ON salvages(orig);
CREATE TABLE IF NOT EXISTS fixes (
  pr INTEGER NOT NULL,
  issue INTEGER NOT NULL,
  PRIMARY KEY (pr, issue)
);
CREATE INDEX IF NOT EXISTS fixes_issue ON fixes(issue);
-- merged PRs only: who merged it (apps end in "[bot]"), and the issues GitHub closed with it (JSON list)
CREATE TABLE IF NOT EXISTS merges (
  number INTEGER PRIMARY KEY,
  merged_by TEXT,
  closes TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS merges_by ON merges(merged_by);
-- PRs closed without merging: who closed them, for the close at closed_at
CREATE TABLE IF NOT EXISTS closes (
  number INTEGER PRIMARY KEY,
  closed_by TEXT,
  closed_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS closes_by ON closes(closed_by);
-- GitHub's advisory database entry for each GHSA ID an issue or PR names, plus advisories published
-- against hermes-agent (own = 1). severity is NULL when GitHub has no advisory with that ID.
-- packages: JSON list of {name, ecosystem, patched: [first patched versions]}.
CREATE TABLE IF NOT EXISTS advisories (
  ghsa_id TEXT PRIMARY KEY,
  severity TEXT,
  summary TEXT,
  packages TEXT NOT NULL,
  cve TEXT,
  published_at TEXT,
  withdrawn_at TEXT,
  own INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL
);
-- who is active on an open item: kind is comment, review, commit or push (n of them among the item's
-- last 100, newest at last_at; a commit counts for its author, not whoever pushed it), or assigned
CREATE TABLE IF NOT EXISTS activity (
  number INTEGER NOT NULL,
  login TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL,
  last_at TEXT,
  PRIMARY KEY (number, login, kind)
);
-- the updated_at each item's activity was read at; it is read again once the item changes
CREATE TABLE IF NOT EXISTS activity_checked (
  number INTEGER PRIMARY KEY,
  updated_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
"""

UPSERT = """
INSERT INTO items (number, is_pr, state, state_reason, draft, merged_at, title, body, author,
  author_association, labels, kind, comp, prio, comments, created_at, updated_at, closed_at, url,
  synced_at)
VALUES (:number, :is_pr, :state, :state_reason, :draft, :merged_at, :title, :body, :author,
  :author_association, :labels, :kind, :comp, :prio, :comments, :created_at, :updated_at,
  :closed_at, :url, :synced_at)
ON CONFLICT(number) DO UPDATE SET
  is_pr = excluded.is_pr, state = excluded.state, state_reason = excluded.state_reason,
  draft = excluded.draft, merged_at = excluded.merged_at, title = excluded.title,
  body = excluded.body, author = excluded.author,
  author_association = excluded.author_association, labels = excluded.labels,
  kind = excluded.kind, comp = excluded.comp, prio = excluded.prio,
  comments = excluded.comments, created_at = excluded.created_at,
  updated_at = excluded.updated_at, closed_at = excluded.closed_at, url = excluded.url,
  synced_at = excluded.synced_at,
  -- a changed title or body needs a fresh summary
  summary_status = CASE WHEN items.title IS NOT excluded.title OR items.body IS NOT excluded.body
                        THEN 'waiting' ELSE items.summary_status END
"""


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg):
    print(f"{now()} {msg}", flush=True)


def gh_token():
    return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True,
                          check=True).stdout.strip()


def first_url(since):
    q = {"state": "all", "direction": "asc", "per_page": PER_PAGE}
    q |= {"sort": "updated", "since": since} if since else {"sort": "created"}
    return f"{API}?{urllib.parse.urlencode(q)}"


def fetch(token, url):
    """One page of issues+PRs. Returns (items, headers, next_url or None)."""
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "hermes-triage-ingest",
    })
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                nxt = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link") or "")
                return json.load(r), r.headers, nxt.group(1) if nxt else None
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                wait = rate_wait(e.headers) or 60
                log(f"rate limited ({e.code}); sleeping {wait}s")
                time.sleep(wait)
            elif e.code >= 500:
                time.sleep(2 ** attempt * 5)
            else:
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            log(f"network error: {e}; retrying")
            time.sleep(2 ** attempt * 5)
    raise RuntimeError(f"gave up on {url}")


def rate_wait(h):
    """Seconds to wait before the next request, or 0."""
    if h.get("Retry-After"):
        return int(h["Retry-After"]) + 1
    if h.get("X-RateLimit-Remaining") is not None and \
            int(h["X-RateLimit-Remaining"]) <= KEEP_SPARE:
        return max(0, int(h["X-RateLimit-Reset"]) - int(time.time())) + 5
    return 0


def row(it, synced):
    names = [l["name"] for l in it.get("labels", [])]
    pr = it.get("pull_request")
    return {
        "number": it["number"],
        "is_pr": int(pr is not None),
        "state": it["state"],
        "state_reason": it.get("state_reason"),
        "draft": int(it["draft"]) if it.get("draft") is not None else None,
        "merged_at": pr.get("merged_at") if pr else None,
        "title": it["title"],
        "body": it.get("body"),
        "author": (it.get("user") or {}).get("login"),
        "author_association": it.get("author_association"),
        "labels": json.dumps(names),
        "kind": next((n for n in names if n.startswith("type/")), None),
        "comp": next((n for n in names if n.startswith("comp/")), None),
        "prio": next((n for n in names if n in PRIOS), None),
        "comments": it.get("comments"),
        "created_at": it["created_at"],
        "updated_at": it["updated_at"],
        "closed_at": it.get("closed_at"),
        "url": it["html_url"],
        "synced_at": synced,
    }


def link_salvages(db, prs):
    """Replace the salvage and fix links of these (number, title, body) PRs with the ones their text names."""
    prs = list(prs)
    for table, key, pattern in (("salvages", "new", SALVAGE), ("fixes", "pr", FIXES)):
        db.executemany(f"DELETE FROM {table} WHERE {key} = ?", [(n,) for n, _, _ in prs])
        db.executemany(f"INSERT OR IGNORE INTO {table} VALUES (?, ?)",
                       [(n, int(o)) for n, title, body in prs
                        for o in pattern.findall(f"{title}\n{body or ''}") if int(o) != n])


def graphql(token, query):
    req = urllib.request.Request(GRAPHQL, data=json.dumps({"query": query}).encode(), headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "hermes-triage-ingest",
    })
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.load(r)
            if out.get("errors") and not out.get("data"):
                raise RuntimeError(f"GraphQL: {out['errors'][0].get('message')}")
            return out["data"]
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                wait = rate_wait(e.headers) or 60
                log(f"GraphQL rate limited ({e.code}); sleeping {wait}s")
                time.sleep(wait)
            elif e.code >= 500:
                time.sleep(2 ** attempt * 5)
            else:
                raise
        except (urllib.error.URLError, TimeoutError) as e:
            log(f"network error: {e}; retrying")
            time.sleep(2 ** attempt * 5)
    raise RuntimeError("gave up on GraphQL")


def merger(actor):
    """Login of whoever merged or closed, with GitHub's "[bot]" suffix for apps so the leaderboard can set them apart."""
    if not actor:
        return None  # deleted account
    return actor["login"] + ("[bot]" if actor.get("__typename") == "Bot" else "")


def ghsa_id(text):
    """GitHub's spelling of a GHSA ID: upper-case prefix, lower-case rest."""
    return "GHSA" + text[4:].lower()


def packages(vulns):
    """Affected packages from (name, ecosystem, first patched version) triples, one entry per package."""
    out = {}
    for name, eco, patched in vulns:
        p = out.setdefault((eco.lower(), name), {"name": name, "ecosystem": eco.lower(), "patched": []})
        if patched and patched not in p["patched"]:
            p["patched"].append(patched)
    return json.dumps(list(out.values()))


# GraphQL says MODERATE where REST and the advisory pages say medium
SEVERITY = {"moderate": "medium"}
UPSERT_ADVISORY = """
INSERT INTO advisories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(ghsa_id) DO UPDATE SET severity = excluded.severity, summary = excluded.summary,
  packages = excluded.packages, cve = excluded.cve, published_at = excluded.published_at,
  withdrawn_at = excluded.withdrawn_at, own = max(advisories.own, excluded.own), fetched_at = excluded.fetched_at
"""


def fetch_advisories(db, token, state):
    """Look up the GHSA IDs items name, and hermes-agent's own advisories. Returns requests made."""
    requests = 0
    if time.time() - float(state.get("own_advisories_at", 0)) > OWN_EVERY_S:
        items, _, _ = fetch(token, OWN_ADVISORIES)
        requests += 1
        at = now()
        db.executemany(UPSERT_ADVISORY, [(
            ghsa_id(a["ghsa_id"]), SEVERITY.get(a["severity"], a["severity"]), a["summary"],
            packages((v["package"]["name"], v["package"]["ecosystem"], v.get("first_patched_version"))
                     for v in a.get("vulnerabilities") or [] if v.get("package")),
            a.get("cve_id"), a.get("published_at"), a.get("withdrawn_at"), 1, at)
            for a in items if a.get("source_code_location") == f"https://github.com/{REPO}"])
        db.execute("INSERT OR REPLACE INTO sync_state VALUES ('own_advisories_at', ?)", (str(time.time()),))
        db.commit()
    named = {ghsa_id(m) for title, body in db.execute(
        "SELECT title, body FROM items WHERE title LIKE '%GHSA-%' OR body LIKE '%GHSA-%'")
        for m in GHSA.findall(f"{title}\n{body or ''}")}
    fresh = {g for (g,) in db.execute("SELECT ghsa_id FROM advisories WHERE fetched_at >= "
                                      "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)", (f"-{REFETCH_DAYS} days",))}
    todo = sorted(named - fresh)
    for start in range(0, len(todo), MERGE_BATCH):
        batch = todo[start:start + MERGE_BATCH]
        fields = " ".join(f'a{k}: securityAdvisory(ghsaId: "{g}") {{ summary severity publishedAt withdrawnAt '
                          "identifiers { type value } vulnerabilities(first: 20) { nodes { "
                          "package { name ecosystem } firstPatchedVersion { identifier } } } }"
                          for k, g in enumerate(batch))
        data = graphql(token, f"{{ rateLimit {{ remaining resetAt }} {fields} }}")
        requests += 1
        at, rows = now(), []
        for k, g in enumerate(batch):
            a = data.get(f"a{k}")
            if not a:  # GitHub has no advisory with this ID; keep a row so it isn't asked again for a while
                rows.append((g, None, None, "[]", None, None, None, 0, at))
                continue
            rows.append((
                g, SEVERITY.get(a["severity"].lower(), a["severity"].lower()), a["summary"],
                packages((v["package"]["name"], v["package"]["ecosystem"], (v.get("firstPatchedVersion") or {}).get("identifier"))
                         for v in a["vulnerabilities"]["nodes"] if v.get("package")),
                next((i["value"] for i in a["identifiers"] if i["type"] == "CVE"), None),
                a["publishedAt"], a["withdrawnAt"], 0, at))
        db.executemany(UPSERT_ADVISORY, rows)
        db.commit()
        if data["rateLimit"]["remaining"] <= KEEP_SPARE:
            log("advisories: near the GraphQL rate limit; the rest waits for the next run")
            break
    return requests


def fetch_merges(db, token):
    """Look up merger and closed issues for merged PRs not yet in merges, newest first. Returns queries made."""
    owner, name = REPO.split("/")
    queries = 0
    while True:
        todo = [n for (n,) in db.execute(
            "SELECT number FROM items WHERE merged_at IS NOT NULL AND number NOT IN "
            "(SELECT number FROM merges) ORDER BY merged_at DESC LIMIT ?", (MERGE_BATCH,))]
        if not todo:
            return queries
        fields = " ".join(f"p{n}: pullRequest(number: {n}) {{ mergedBy {{ __typename login }} "
                          f"closingIssuesReferences(first: 25) {{ nodes {{ number }} }} }}" for n in todo)
        data = graphql(token, f'{{ rateLimit {{ remaining resetAt }} '
                              f'repository(owner: "{owner}", name: "{name}") {{ {fields} }} }}')
        queries += 1
        at, repo = now(), data["repository"] or {}
        db.executemany("INSERT OR REPLACE INTO merges VALUES (?, ?, ?, ?)", [
            (n, merger((repo.get(f"p{n}") or {}).get("mergedBy")),
             json.dumps([c["number"] for c in ((repo.get(f"p{n}") or {}).get("closingIssuesReferences")
                                                or {}).get("nodes", [])]), at) for n in todo])
        db.commit()
        if queries % 50 == 0:
            left = db.execute("SELECT count(*) FROM items WHERE merged_at IS NOT NULL AND number "
                              "NOT IN (SELECT number FROM merges)").fetchone()[0]
            log(f"merges: {queries} queries, {left} merged PRs left to look up")
        if data["rateLimit"]["remaining"] <= KEEP_SPARE:
            log("merges: near the GraphQL rate limit; the rest waits for the next run")
            return queries


def fetch_closes(db, token):
    """Look up who closed PRs closed without merging, newest close first. Returns queries made."""
    owner, name = REPO.split("/")
    queries = 0
    todo_sql = ("FROM items i LEFT JOIN closes c USING (number) WHERE i.is_pr = 1 AND i.state = 'closed' "
                "AND i.merged_at IS NULL AND i.closed_at IS NOT NULL AND c.closed_at IS NOT i.closed_at")
    while True:
        todo = db.execute(f"SELECT i.number, i.closed_at {todo_sql} ORDER BY i.closed_at DESC LIMIT ?",
                          (MERGE_BATCH,)).fetchall()
        if not todo:
            return queries
        fields = " ".join(f"p{n}: pullRequest(number: {n}) {{ timelineItems(itemTypes: [CLOSED_EVENT], last: 1) "
                          f"{{ nodes {{ ... on ClosedEvent {{ actor {{ __typename login }} }} }} }} }}" for n, _ in todo)
        data = graphql(token, f'{{ rateLimit {{ remaining resetAt }} '
                              f'repository(owner: "{owner}", name: "{name}") {{ {fields} }} }}')
        queries += 1
        at, repo = now(), data["repository"] or {}
        rows = []
        for n, closed in todo:
            nodes = ((repo.get(f"p{n}") or {}).get("timelineItems") or {}).get("nodes") or []
            rows.append((n, merger(nodes[-1].get("actor")) if nodes else None, closed, at))
        db.executemany("INSERT OR REPLACE INTO closes VALUES (?, ?, ?, ?)", rows)
        db.commit()
        if queries % 50 == 0:
            left = db.execute(f"SELECT count(*) {todo_sql}").fetchone()[0]
            log(f"closes: {queries} queries, {left} closed PRs left to look up")
        if data["rateLimit"]["remaining"] <= KEEP_SPARE:
            log("closes: near the GraphQL rate limit; the rest waits for the next run")
            return queries


def activity_rows(number, it):
    """(number, login, kind, n, last_at) rows for one item's timeline nodes and assignees."""
    seen = {}
    for node in (it.get("timelineItems") or {}).get("nodes") or []:
        kind = ACTIVITY_KIND.get(node.get("__typename"))
        if node.get("commit"):
            c = node["commit"]
            who, at = (c.get("author") or {}).get("user"), c.get("committedDate")
        else:
            who, at = node.get("author") or node.get("actor"), node.get("createdAt") or node.get("submittedAt")
        login = (who or {}).get("login")  # None for deleted accounts and commit emails not linked to one
        if not kind or not login:
            continue
        n, last = seen.get((login, kind), (0, None))
        seen[(login, kind)] = (n + 1, max(filter(None, (last, at)), default=None))
    rows = [(number, login, kind, n, last) for (login, kind), (n, last) in seen.items()]
    return rows + [(number, a["login"], "assigned", 1, None)
                   for a in (it.get("assignees") or {}).get("nodes") or [] if a]


def fetch_activity(db, token):
    """Read who is active on recent open items that changed since they were last read. Returns queries made."""
    owner, name = REPO.split("/")
    todo_sql = ("FROM items i LEFT JOIN activity_checked a USING (number) WHERE i.state = 'open' "
                f"AND i.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-{ACTIVITY_DAYS} days') "
                "AND a.updated_at IS NOT i.updated_at")
    queries = 0
    while queries < ACTIVITY_QUERIES:
        todo = db.execute(f"SELECT i.number, i.updated_at {todo_sql} ORDER BY i.updated_at DESC LIMIT ?",
                          (MERGE_BATCH,)).fetchall()
        if not todo:
            break
        fields = " ".join(f"i{n}: issueOrPullRequest(number: {n}) {{ {ACTIVITY_FIELDS} }}" for n, _ in todo)
        data = graphql(token, f'{{ rateLimit {{ remaining resetAt }} '
                              f'repository(owner: "{owner}", name: "{name}") {{ {fields} }} }}')
        queries += 1
        at, repo = now(), data["repository"] or {}
        db.executemany("DELETE FROM activity WHERE number = ?", [(n,) for n, _ in todo])
        # an item GitHub no longer returns (transferred or deleted) is marked read too, so it isn't asked again
        db.executemany("INSERT INTO activity VALUES (?, ?, ?, ?, ?)",
                       [r for n, _ in todo for r in activity_rows(n, repo.get(f"i{n}") or {})])
        db.executemany("INSERT OR REPLACE INTO activity_checked VALUES (?, ?, ?)", [(n, u, at) for n, u in todo])
        db.commit()
        if data["rateLimit"]["remaining"] <= KEEP_SPARE:
            log("activity: near the GraphQL rate limit; the rest waits for the next run")
            break
    if queries:
        left = db.execute(f"SELECT count(*) {todo_sql}").fetchone()[0]
        log(f"activity: {queries} GraphQL queries, {left} items left to read")
    return queries


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default=str(ROOT / "data" / "triage.db"))
    ap.add_argument("--max-pages", type=int, default=0, help="stop after N pages (0 = no limit)")
    args = ap.parse_args()

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # one sync at a time: a timer run that starts during the backfill just exits
    lock = open(db_path.with_suffix(".lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("another sync is running; exiting")
        return

    db = sqlite3.connect(db_path, timeout=60)  # summarize.py writes to the same database
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    state = dict(db.execute("SELECT key, value FROM sync_state"))

    def save(**kv):
        db.executemany("INSERT OR REPLACE INTO sync_state VALUES (?, ?)", kv.items())

    if "fixes_linked" not in state:
        # one pass over PRs mirrored before fix links existed; later runs link as they upsert
        link_salvages(db, db.execute("SELECT number, title, body FROM items WHERE is_pr = 1"))
        save(salvages_linked=now(), fixes_linked=now())
        db.commit()

    backfill = "cursor" not in state
    if backfill:
        if "backfill_started" not in state:
            save(backfill_started=now())
        url, since = state.get("backfill_next") or first_url(None), None
    else:
        since = state["cursor"]
        url = first_url(since)
    started = now()
    run = db.execute("INSERT INTO runs (started_at) VALUES (?)", (started,)).lastrowid
    db.commit()
    log(f"start: {'backfill' if backfill else f'changes since {since}'} db={db_path}")

    token, requests, upserted, outcome = gh_token(), 0, 0, "ok"
    try:
        while True:
            items, headers, nxt = fetch(token, url)
            requests += 1
            synced = now()
            db.executemany(UPSERT, [row(it, synced) for it in items])
            link_salvages(db, ((it["number"], it["title"], it.get("body")) for it in items
                               if it.get("pull_request")))
            upserted += len(items)
            if backfill:
                if nxt:
                    save(backfill_next=nxt)
                else:
                    # done: pick up everything changed since the backfill began
                    save(cursor=db.execute("SELECT value FROM sync_state WHERE key = "
                                           "'backfill_started'").fetchone()[0])
                    db.execute("DELETE FROM sync_state WHERE key = 'backfill_next'")
            elif items:
                # pages run oldest change first, so the cursor can move after every page;
                # `since` is inclusive, so the next run re-reads only items from that second
                since = max(since, max(it["updated_at"] for it in items))
                save(cursor=since)
            db.commit()
            if requests % 20 == 0:
                total = db.execute("SELECT count(*) FROM items").fetchone()[0]
                log(f"{requests} requests, {total} items stored, newest created="
                    f"{items[-1]['created_at'] if items else '-'}, "
                    f"rate remaining={headers.get('X-RateLimit-Remaining')}")
            if not nxt:
                break
            url = nxt
            if args.max_pages and requests >= args.max_pages:
                outcome = "max-pages"
                break
            wait = rate_wait(headers)
            if wait:
                log(f"near the rate limit; sleeping {wait}s")
                time.sleep(wait)
        if not backfill:
            merge_queries = fetch_merges(db, token)
            if merge_queries:
                log(f"merges: {merge_queries} GraphQL queries")
            close_queries = fetch_closes(db, token)
            if close_queries:
                log(f"closes: {close_queries} GraphQL queries")
            fetch_activity(db, token)
            advisory_requests = fetch_advisories(db, token, state)
            if advisory_requests:
                log(f"advisories: {advisory_requests} requests")
    except BaseException as e:
        outcome = f"error: {e!r}"[:500]
        raise
    finally:
        db.execute("UPDATE runs SET finished_at=?, requests=?, upserted=?, cursor=?, outcome=? "
                   "WHERE rowid=?", (now(), requests, upserted, since, outcome, run))
        db.commit()
        total = db.execute("SELECT count(*) FROM items").fetchone()[0]
        log(f"done ({outcome}): {requests} requests, {upserted} upserted, {total} items stored, "
            f"cursor={since}")


if __name__ == "__main__":
    sys.exit(main())
