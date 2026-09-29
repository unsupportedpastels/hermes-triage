# hermes-triage

Early-warning triage for NousResearch/hermes-agent: "Overwatch for GitHub".

- **alt-glitch owns labels.** `type/`, `comp/` and P0–P4 are read, never written.
- **The model extracts fields.** DeepSeek V4.1 Flash writes a one-sentence problem statement and duplicate-search keywords.
- **Code decides alerts.** Circuit breakers raise incidents at watch / warn / urgent; acknowledged incidents stay quiet until they grow or escalate.

## Layout

- `bakeoff/`: model bake-off scripts and results (50 real items).
- `scripts/build_seed.py`: builds `web/src/data/seed.json` and `pipeline.json` from the bake-off.
- `scripts/ingest.py`: mirrors every issue and PR into `data/triage.db` (SQLite, Git-ignored).
- `scripts/serve.py`: serves the built dashboard and a read-only `/api/reports` over the database.
- `scripts/check_pairs.py`: asks the model whether reports that keyword grouping joins share a cause.
- `web/`: Vite + React + TypeScript dashboard.

## Sync

`python3 scripts/ingest.py` is read-only against GitHub and uses the `gh` login. The first run
backfills everything (about 1,250 requests); later runs fetch only what changed. It resumes after
an interruption, and only one run happens at a time. Comments are not fetched.

`python3 scripts/summarize.py` summarizes open items still marked `waiting` with DeepSeek V4.1
Flash on Nous Portal, newest first. The prompt asks for the cause as well as the symptom, and for
duplicate keywords that start with the file and function names involved, then the error text. Each
summary records its prompt version; `--resummarize-days N` redoes open items from the last N days
that an older prompt summarized. Closed and merged items are skipped. Bodies are cut at 20k
characters. Each call's cost goes into `llm_calls`; a run stops at `--budget` (default $1) or
`--max-total` across all runs (default $15). An item whose title or body changes goes back to
`waiting`.

`python3 scripts/check_pairs.py` runs after each summarize run. It lists the pairs of open reports
from the last 14 days whose keywords overlap enough to group at 0.40, taken from
`web/src/engine.ts` itself through `scripts/keyword_matches.ts` (so it needs `node`), and asks the
same model whether each pair not yet checked shares a cause. Verdicts go into `pair_checks`; one
is dropped when either report is summarized again, and a pair with no answer is retried after a
day. Costs go into `llm_calls` and count toward the same `--max-total`; a run stops at `--budget`
(default $0.25). `--dry-run` only counts the pairs waiting.

`ingest.py` also records salvage links in the `salvages` table: a PR whose title or body says
"Salvages #N", "salvage of #N" or "(salvage #N)" is linked to #N. Only PR text is read, so a
salvage mentioned only in a comment is missed, and a number that points at another repository is
linked by mistake. The Stats page counts a PR closed unmerged as salvaged when a PR linked to it
merged, and Needs attention lists open PRs whose salvage has merged.

`ingest.py` also reads "Fixes #N" / "Closes #N" / "Resolves #N" from PR text into `fixes`, and
looks up every merged PR once over GraphQL (50 per query) into `merges`: who merged it and which
issues GitHub closed with it. PRs closed without merging get who closed them into `closes`. The
Stats page's "Merged by" leaderboard reads both; it counts closes only by people who have merged a
PR (only Nous staff can), so authors closing their own PRs stay off it.

`ingest.py` also reads who is active on open items from the last 90 days into `activity`: authors
of each item's last 100 comments, reviews, commits and force-pushes, plus its assignees (GraphQL,
50 items per query, at most 60 queries per run, most recently updated first). An item is read
again whenever its `updated_at` moves. `STAFF` in `scripts/serve.py` lists the Nous staff; a
report one of them opened, is assigned to, commented, reviewed or pushed on, or has an open PR
fixing or salvaging, is marked with their name in All reports and the detail pane, and "Hide items
staff are on" leaves those out. A commit counts for its author, so a staff member who only rebased
someone else's commits shows up through the force-push. `ME` in the same file is the dashboard's
user; their own activity is read the same way and shown apart from staff as a green "You're on it"
chip and detail section, so work they've already done stands out.

## Queueing issues for the agent

Tick up to 10 open issues or PRs in All reports, or tick an alert in Needs attention to pick every
open report behind it, and press "Queue N for the agent", or run
`scripts/issue_queue.py add N [N ...]`. Each issue becomes a Hermes Kanban card that the gateway's
dispatcher runs as a worker (at most `kanban.max_in_progress` at once) on the delegate model,
following the `hermes-issue-queue-worker` skill. The worker reads the issue and every PR on it,
checks whether main already fixes it, compares and salvages existing PRs with authorship kept or
writes its own fix, and stops at one outcome: ready to push, ready to close (fixed on main),
an existing PR ready to merge, or stopped with a reason. Its evidence and drafted PR body or
comments go in `~/hermes-issue-queue/N/`. Workers never write to GitHub; pushing, commenting and
closing happen only after the user approves. The row shows the card's status and outcome;
`scripts/issue_queue.py status` lists them. Queueing an issue twice returns the existing card.
`POST /api/queue` is the dashboard's only write and is refused unless the request comes from the page.

`ingest.py` also looks up every GHSA ID named in an issue or PR title or body in GitHub's advisory
database (GraphQL, 50 per query) into `advisories`: severity, summary, CVE and affected packages
with their first fixed versions. Each ID is looked up again after 30 days. An ID GitHub doesn't
know gets a row with no severity; these are private reports against hermes-agent or upstream
advisories not published yet. Advisories published against hermes-agent itself come from the REST
advisory search every 6 hours and are marked `own`. The Security advisories page reads them from
`/api/advisories` and counts an advisory as fixed once a merged PR names it.

`python3 bakeoff/dupe_eval.py` checks the grouping against hand-labeled cron reports that share
symptoms but not causes, comparing stored summaries with a fresh run of the current prompt.

Two systemd user timers run them separately, each 5 minutes after its last run finishes, so a
long summarize backlog never holds up the GitHub sync:

```bash
systemctl --user status hermes-triage-sync.timer hermes-triage-summarize.timer
journalctl --user -u hermes-triage-sync.service -n 20
journalctl --user -u hermes-triage-summarize.service -n 20
```

## Grouping

The dashboard groups open reports when their duplicate keywords overlap enough, or when a PR says it
fixes the issue. Overlap weights each keyword by how rare it is in the window, so generic words
(`gateway`, `windows`) count for little. The threshold on Similar reports (0.50 by default) drops by
0.10, 0.15 or 0.20 when the reports share one, two, or three or more uncommon code locations. Code
names found in more than 10 reports (`context_compressor`, `kanban_db`) mark a busy file, not a
shared cause, so they don't count. Hyphenated phrases are compared word by word. Two reports that
each name code but share none are never grouped on general words alone. `bakeoff/dupe_eval.py` mirrors these rules; keep the two in step.

Pairs the model check judged to have different causes (`apart` in `/api/reports`) never end up in
one group through keyword matches, not even through a chain of other reports. `clusterReports`
applies "Fixes #N" links first, then keyword matches strongest first, and skips any match that
would merge two groups holding such a pair. Only "Fixes #N" links can still put one in a group. On the 14-day window this raised the
share of same-cause pairs inside groups from 85% to 89% (67% to 75% in groups of 6 or more), by
DeepSeek's judgment, which agreed with a blind hand-labeling on 92% of 99 pairs. Pairs that only
group below 0.40 are never checked and group on keywords alone.

All reports folds confident duplicates ("Fold duplicates", on by default): within a group, reports
joined by a "Fixes #N" link or judged the same cause by the model check (`same` in `/api/reports`)
are listed under one parent, the open issue the group's PRs fix most, else its oldest issue, else
its oldest PR. Keyword overlap alone never folds. Queueing a parent sends its folded duplicates to
the worker to check, and a Needs attention alert picks parents rather than each duplicate.

## Dashboard

The `hermes-triage-web` user service runs `scripts/serve.py` on the LAN at port 4180. The page
loads open issues and PRs from the last 14 days (`?days=` up to 90) and reloads every minute. The
first load comes in two parts, the newest 2 days and then the rest (`/api/reports?skip=2`), so the
page fills in before the full set arrives; the sync status says so until it has.
The Stats page reads `/api/stats?days=N` (7, 30 or 90 in the UI, up to 365), which counts over the
whole mirror: duplicate rates, open issues by priority and type, weekly flow, components and age.
Rebuild after changing `web/`:

```bash
cd web
npm install
npm run build     # the service serves web/dist
npm run dev       # http://127.0.0.1:5180, API proxied to serve.py
```

Add `?sim` to inject simulated reports, marked **sample**, to exercise the alert rules
(`?tick=2000` speeds them up). Nothing is sent anywhere; alerts only appear in the dashboard.
