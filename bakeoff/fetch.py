"""Fetch a stratified 50-item sample of hermes-agent issues/PRs for the triage bake-off."""
import json, subprocess, random

REPO = "NousResearch/hermes-agent"
STRATA = [
    ("issue_open", "is:issue is:open", 14),
    ("issue_completed", "is:issue is:closed reason:completed", 9),
    ("issue_not_planned", "is:issue is:closed reason:not-planned", 9),
    ("pr_open", "is:pr is:open", 6),
    ("pr_merged", "is:pr is:merged", 7),
    ("pr_closed_unmerged", "is:pr is:closed is:unmerged", 5),
]


def search(q, n):
    out = subprocess.run(
        ["gh", "api", "-X", "GET", "search/issues", "-f", f"q=repo:{REPO} {q}", "-f", "per_page=100",
         "-f", "sort=created", "-f", "order=desc"],
        capture_output=True, text=True, check=True).stdout
    items = [i for i in json.loads(out)["items"] if "[skip]" not in i["title"].lower()]
    random.Random(42).shuffle(items)
    return items[:n]


rows = []
for stratum, q, n in STRATA:
    for i in search(q, n):
        rows.append({
            "number": i["number"],
            "stratum": stratum,
            "is_pr": "pull_request" in i,
            "title": i["title"],
            "body": (i.get("body") or "")[:6000],
            "labels": [l["name"] for l in i.get("labels", [])],
            "state_reason": i.get("state_reason"),
            "url": i["html_url"],
        })

json.dump(rows, open("items.json", "w"), indent=1)
print(len(rows), "items")
from collections import Counter
print(Counter(r["stratum"] for r in rows))
print("labels seen:", Counter(l for r in rows for l in r["labels"]).most_common(30))
