#!/usr/bin/env python3
"""Build the dashboard seed data from the triage bake-off sample (50 real hermes-agent items).

Reads bakeoff/items.json, results_v3_deepseek.json (short-prompt extraction), label_provenance.json
and report_v3.json, and fetches each item's author and creation time from GitHub.
"""
import json
import statistics
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BAKEOFF, OUT = ROOT / "bakeoff", ROOT / "web" / "src" / "data"
REPO = "NousResearch/hermes-agent"
PRIOS = {"P0", "P1", "P2", "P3", "P4"}
MODEL = "deepseek/deepseek-v4.1-flash"


def load(name):
    return json.loads((BAKEOFF / name).read_text())


items = load("items.json")
extracted = {r["number"]: r.get("parsed") or {} for r in load("results_v3_deepseek.json")}
provenance = {p["number"]: p["labels"] for p in load("label_provenance.json")}

rows = []
for it in items:
    n = it["number"]
    meta = json.loads(subprocess.run(
        ["gh", "api", f"repos/{REPO}/issues/{n}", "--jq", "{created_at, user: .user.login}"],
        capture_output=True, text=True, check=True).stdout)
    got = provenance.get(n, [])
    labels = {}
    for name, _actor, _delay in got:
        if name.startswith("type/"):
            labels.setdefault("kind", name)
        elif name.startswith("comp/"):
            labels.setdefault("comp", name)
        elif name in PRIOS:
            labels.setdefault("prio", name)
    if got:
        labels["by"] = ", ".join(sorted({a for _, a, _ in got}))
        labels["delayMin"] = min(d for _, _, d in got)
    x = extracted.get(n, {})
    dq = x.get("duplicate_query") or ""
    rows.append({
        "number": n,
        "url": it["url"],
        "title": it["title"],
        "author": meta["user"],
        "createdAt": meta["created_at"],
        "isPr": it["is_pr"],
        "state": it["stratum"],
        "problem": x.get("problem_statement") or it["title"],
        "dupQuery": dq if isinstance(dq, str) else " ".join(dq),
        "labels": labels,
    })

rep = load("report_v3.json")[MODEL]
delays = [d for p in provenance.values() for _, _, d in p]
pipeline = {
    "model": MODEL,
    "items": len(items),
    "validJsonFirstTry": rep["valid_json_first_try"],
    "dupSelfHit": rep["dup_self_hit"],
    "cost": rep["cost"],
    "latencyMedianS": rep["latency_median_s"],
    "latencyP90S": rep["latency_p90_s"],
    "promptTokens": rep["pt"],
    "completionTokens": rep["ct"],
    "reasoningTokens": rep["rt"],
    "labeledItems": sum(1 for p in provenance.values() if p),
    "labelCount": len(delays),
    "labelActors": sorted({a for p in provenance.values() for _, a, _ in p}),
    "labelDelayMedianMin": round(statistics.median(delays), 1),
    "labelDelayMaxMin": round(max(delays), 1),
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "seed.json").write_text(json.dumps(rows, indent=1))
(OUT / "pipeline.json").write_text(json.dumps(pipeline, indent=1))
print(len(rows), "seed rows;", sum(1 for r in rows if r["labels"]), "labeled")
