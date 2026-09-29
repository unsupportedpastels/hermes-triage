"""Run the triage prompt over items.json on each model via the Nous Portal API.

Repo labels are withheld from the prompt; they are the reference answers.
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

MODELS = sys.argv[2].split(",") if len(sys.argv) > 2 else ["stealth/space-bunny-alpha", "meituan/longcat-2.0"]
OUT = sys.argv[1] if len(sys.argv) > 1 else "results.json"
REPO = "NousResearch/hermes-agent"

labels = json.loads(subprocess.run(
    ["gh", "label", "list", "-R", REPO, "--limit", "500", "--json", "name,description"],
    capture_output=True, text=True, check=True).stdout)
comps = sorted(l["name"] for l in labels if l["name"].startswith("comp/"))
prios = sorted(l["name"] for l in labels if l["name"] in ("P0", "P1", "P2", "P3", "P4"))
desc = {l["name"]: l["description"] for l in labels}
json.dump(comps, open("comps.json", "w"))
comp_lines = "\n".join(f"  {c}: {desc[c]}" for c in comps)
prio_lines = "\n".join(f"  {p}: {desc[p]}" for p in prios)

SYSTEM = f"""You are a GitHub triage clerk for the hermes-agent repository. Read one issue or pull request and reply with ONLY a JSON object with these keys:
"problem_statement": one plain sentence stating the problem (for a PR, the problem it addresses),
"kind": "bug" | "feature" | "other",
"component": exactly one of these component labels, choosing where the fix lives:
{comp_lines}
"priority": exactly one of these priority labels. Most real defects are P2; reserve P1 for a major feature broken with no workaround and P0 for data loss, security or crash loops:
{prio_lines}
"duplicate_query": 3-6 distinctive keywords to search GitHub for duplicates,
"confidence": number 0-1, how sure you are of kind, component and priority together; use lower values when the report is vague or spans several components."""

# Lean mode: labels come from alt-glitch, so the model only summarizes and writes duplicate-search keywords.
if len(sys.argv) > 3 and sys.argv[3] == "lean":
    SYSTEM = """You are a GitHub triage clerk for the hermes-agent repository. Read one issue or pull request and reply with ONLY a JSON object with these keys:
"problem_statement": one plain sentence stating the problem (for a PR, the problem it addresses),
"duplicate_query": 3-6 distinctive keywords to search GitHub for duplicates."""


def user_msg(it):
    kind = "Pull request" if it["is_pr"] else "Issue"
    return f"{kind} #{it['number']}: {it['title']}\n\n{it['body']}"


auth = json.load(open(os.path.expanduser("~/.hermes-dashboard/auth.json")))["providers"]["nous"]
BASE = auth["inference_base_url"].rstrip("/")


def call(model, it):
    body = {"model": model, "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user_msg(it)}],
            "max_tokens": 4000, "temperature": 0, "response_format": {"type": "json_object"},
            "reasoning": {"effort": "low"}}
    rec = {"model": model, "number": it["number"], "attempts": 0, "latency_s": 0.0, "prompt_tokens": 0,
           "completion_tokens": 0, "reasoning_tokens": 0, "cost": 0.0, "parsed": None, "error": None, "raw": None}
    for attempt in range(2):
        rec["attempts"] += 1
        req = urllib.request.Request(BASE + "/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + auth["agent_key"], "Content-Type": "application/json"})
        t = time.time()
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180))
        except urllib.error.HTTPError as e:
            rec["error"] = f"HTTP {e.code}: {e.read()[:200]!r}"
            time.sleep(5)
            continue
        except Exception as e:
            rec["error"] = repr(e)[:200]
            continue
        finally:
            rec["latency_s"] += time.time() - t
        u = r.get("usage") or {}
        rec["prompt_tokens"] += u.get("prompt_tokens", 0)
        rec["completion_tokens"] += u.get("completion_tokens", 0)
        rec["reasoning_tokens"] += (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
        rec["cost"] += u.get("cost") or 0
        rec["raw"] = r["choices"][0]["message"].get("content")
        try:
            rec["parsed"] = json.loads(rec["raw"])
            rec["error"] = None
            break
        except Exception:
            rec["error"] = "invalid JSON"
    return rec


items = json.load(open("items.json"))
results = []
for model in MODELS:
    t = time.time()
    with ThreadPoolExecutor(4) as ex:
        results += list(ex.map(lambda it: call(model, it), items))
    print(model, "done in", round(time.time() - t), "s", file=sys.stderr)
json.dump(results, open(OUT, "w"), indent=1)
print(len(results), "results;", sum(1 for r in results if r["error"]), "errors")
