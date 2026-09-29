"""Score results.json against the repo's own labels and a live duplicate-search check."""
import json, subprocess, statistics, sys, time
from collections import defaultdict

REPO = "NousResearch/hermes-agent"
items = {i["number"]: i for i in json.load(open("items.json"))}
RESULTS, TAG = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else ("results.json", "")
results = json.load(open(RESULTS))
by_model = defaultdict(dict)
for r in results:
    by_model[r["model"]][r["number"]] = r


def ref_kind(it):
    ls = set(it["labels"])
    if ls & {"type/bug", "bug"}:
        return "bug"
    if ls & {"type/feature", "enhancement"}:
        return "feature"
    return None


def ref_comps(it):
    return {l for l in it["labels"] if l.startswith("comp/")}


def ref_prio(it):
    ps = [l for l in it["labels"] if l in ("P0", "P1", "P2", "P3", "P4")]
    return ps[0] if len(ps) == 1 else None


def dup_hit(query, number):
    out = subprocess.run(["gh", "api", "-X", "GET", "search/issues", "-f", f"q=repo:{REPO} {query}", "-f", "per_page=10"],
                         capture_output=True, text=True)
    time.sleep(2.2)  # search API: 30 req/min
    if out.returncode:
        return None
    return number in [i["number"] for i in json.loads(out.stdout)["items"]]


report = {}
for model, rs in by_model.items():
    m = {"valid_json_first_try": 0, "retries": 0, "kind": [0, 0], "component": [0, 0], "priority": [0, 0],
         "prio_off_by_2": 0, "dup_self_hit": [0, 0], "lat": [], "pt": 0, "ct": 0, "rt": 0, "cost": 0.0,
         "bad_component": 0, "prio_over": 0, "prio_under": 0, "conf_min": 1.0, "conf_max": 0.0, "misses": []}
    for n, r in rs.items():
        it, p = items[n], r["parsed"] or {}
        m["valid_json_first_try"] += r["attempts"] == 1 and p != {}
        m["retries"] += r["attempts"] - 1
        m["lat"].append(r["latency_s"])
        m["pt"] += r["prompt_tokens"]; m["ct"] += r["completion_tokens"]; m["rt"] += r["reasoning_tokens"]; m["cost"] += r["cost"]
        if p.get("component") not in json.load(open("comps.json")):
            m["bad_component"] += 1
        if isinstance(p.get("confidence"), (int, float)):
            m["conf_min"] = min(m["conf_min"], p["confidence"]); m["conf_max"] = max(m["conf_max"], p["confidence"])
        if (k := ref_kind(it)):
            m["kind"][1] += 1
            ok = p.get("kind") == k
            m["kind"][0] += ok
            if not ok: m["misses"].append((n, "kind", k, p.get("kind")))
        if (cs := ref_comps(it)):
            m["component"][1] += 1
            ok = p.get("component") in cs
            m["component"][0] += ok
            if not ok: m["misses"].append((n, "component", sorted(cs), p.get("component")))
        if (pr := ref_prio(it)):
            m["priority"][1] += 1
            ok = p.get("priority") == pr
            m["priority"][0] += ok
            if not ok and str(p.get("priority", "")).startswith("P"):
                if p["priority"] < pr: m["prio_over"] += 1
                else: m["prio_under"] += 1
            if p.get("priority") in ("P1", "P3") and {pr, p.get("priority")} == {"P1", "P3"}:
                m["prio_off_by_2"] += 1
            if not ok: m["misses"].append((n, "priority", pr, p.get("priority")))
        if p.get("duplicate_query"):
            q = p["duplicate_query"] if isinstance(p["duplicate_query"], str) else " ".join(p["duplicate_query"])
            hit = dup_hit(q, n)
            if hit is not None:
                m["dup_self_hit"][1] += 1
                m["dup_self_hit"][0] += hit
    lat = sorted(m.pop("lat"))
    m["latency_median_s"] = round(statistics.median(lat), 1)
    m["latency_p90_s"] = round(lat[int(len(lat) * 0.9) - 1], 1)
    m["cost"] = round(m["cost"], 4)
    report[model] = m

json.dump(report, open(f"report{TAG}.json", "w"), indent=1, default=str)
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "misses"} for k, v in report.items()}, indent=1, default=str))

# Side-by-side problem statements for manual review.
with open(f"side_by_side{TAG}.md", "w") as f:
    for n, it in items.items():
        f.write(f"## #{n} [{it['stratum']}] {it['title']}\nlabels: {it['labels']}\n")
        for model in by_model:
            p = by_model[model][n]["parsed"] or {}
            f.write(f"- **{model.split('/')[-1]}** ({p.get('kind')}, {p.get('component')}, {p.get('priority')}, conf {p.get('confidence')}): {p.get('problem_statement')}\n")
        f.write("\n")
