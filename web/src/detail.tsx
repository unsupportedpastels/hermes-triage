import { useRef, useState } from "react";
import pipeline from "./data/pipeline.json";
import { SIM, actions, useStore, type State } from "./store";
import type { Cluster, Incident, Report } from "./types";
import { Age, LabelChips, LevelBadge, STATUS_NAME, SourceBadge, compName, fmtMinutes, plural, refLabel, stateName } from "./ui";
import { SalvageNote } from "./views";

const REPO_URL = "https://github.com/NousResearch/hermes-agent";

const KEYS: [string, string][] = [
  ["j / k", "Move down or up the list"],
  ["a", "Acknowledge the selected alert"],
  ["r", "Resolve the selected alert"],
  ["/", "Search reports"],
  ["1 – 7", "Switch views"],
  ["Space", "Pause or resume sample reports"],
  ["Esc", "Clear the selection"],
];

export function Detail() {
  const s = useStore((x) => x);
  const sel = s.selected;
  if (!sel) {
    return (
      <div className="detail-empty">
        <h2>Nothing selected</h2>
        <p>Click an item to see why it was flagged, what the reports say and which reports look alike.</p>
        <h3>Keyboard shortcuts</h3>
        <dl className="keys">
          {KEYS.filter(([k]) => SIM || k !== "Space").map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (sel.startsWith("inc-")) {
    const i = s.incidents.find((x) => x.id === sel);
    return i ? <IncidentDetail i={i} s={s} /> : null;
  }
  if (sel.startsWith("cl:")) {
    const c = s.clusterById.get(sel.slice(3));
    return c ? <ClusterDetail c={c} s={s} /> : <p className="muted">This group changed. Pick another one.</p>;
  }
  const r = s.byId.get(sel);
  return r ? <ReportDetail r={r} s={s} /> : null;
}

function ReportList({ ids, s }: { ids: string[]; s: State }) {
  const reps = ids.map((id) => s.byId.get(id)!).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <ul className="mini-list">
      {reps.map((r) => (
        <li key={r.id} onClick={() => actions.select(r.id)}>
          <div className="mini-top">
            <SourceBadge source={r.source} />
            <span className="ref">{refLabel(r)}</span>
            <span>{r.author}</span>
            <span className="meta">
              <Age at={r.createdAt} now={s.now} />
            </span>
          </div>
          <div className="mini-title">{r.title}</div>
        </li>
      ))}
    </ul>
  );
}

function AlertLink({ i }: { i: Incident }) {
  return (
    <button className="link-row" onClick={() => actions.select(i.id)}>
      <LevelBadge level={i.level} />
      <span>{STATUS_NAME[i.status]}</span>
      <span className="spacer" />
      <span>View alert →</span>
    </button>
  );
}

function IncidentDetail({ i, s }: { i: Incident; s: State }) {
  const [handoff, setHandoff] = useState(false);
  return (
    <>
      <div className="d-top">
        <LevelBadge level={i.level} />
        <span className="status" data-status={i.status}>
          {STATUS_NAME[i.status]}
          {!i.firing && " · rules quiet"}
        </span>
      </div>
      <h2>{i.headline}</h2>
      <p className="meta">
        First reported <Age at={i.firstAt} now={s.now} /> · last report <Age at={i.lastAt} now={s.now} />
      </p>
      <div className="btns">
        <button className="btn primary" disabled={i.status !== "open"} onClick={() => actions.ack(i.id)}>
          Acknowledge <kbd>a</kbd>
        </button>
        <button className="btn" disabled={i.status === "resolved"} onClick={() => actions.resolve(i.id)}>
          Resolve <kbd>r</kbd>
        </button>
        <button className="btn" aria-expanded={handoff} onClick={() => setHandoff(!handoff)}>
          Hand off to Hermes
        </button>
      </div>
      {handoff && <Handoff key={i.id} text={handoffPrompt(i, s)} />}
      {i.status === "acked" && (
        <p className="note">Silenced at {plural(i.countAtAck ?? 0, "report")}. It re-opens if more reports arrive or it gets worse.</p>
      )}
      {i.status === "resolved" && <p className="note">Marked resolved. It re-opens if new reports arrive.</p>}
      <h3>Why this was flagged</h3>
      {i.firing ? (
        <ul className="why">
          {i.reasons.map((r, k) => (
            <li key={k}>
              <LevelBadge level={r.level} />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No rule is firing right now.</p>
      )}
      <h3>Reports ({i.reportIds.length})</h3>
      <ReportList ids={i.reportIds} s={s} />
      <h3>History</h3>
      <ol className="log">
        {[...i.log].reverse().map((e, k) => (
          <li key={k}>
            <Age at={e.at} now={s.now} />
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** A prompt for a Hermes session to pick up an alert: what fired, the reports behind it, and how to work it. */
function handoffPrompt(i: Incident, s: State): string {
  const reps = i.reportIds.map((id) => s.byId.get(id)!).sort((a, b) => b.createdAt - a.createdAt);
  const lines = [
    `Work on this alert from the hermes-triage dashboard for ${REPO_URL}: ${i.headline}`,
    "",
    "Why it was flagged:",
    ...(i.firing ? i.reasons.map((r) => `- ${r.level}: ${r.text}`) : ["- No rule is firing right now."]),
    "",
    `Reports (${reps.length}):`,
  ];
  for (const r of reps) {
    lines.push(`- ${refLabel(r)} ${r.title}${r.sample ? " (simulated sample, not real data)" : ` ${r.url}`}`);
    const labels = [r.labels.kind, r.labels.comp, r.labels.prio].filter(Boolean).join(", ");
    if (labels) lines.push(`  Labels: ${labels}`);
    if (r.summarized && r.problem !== r.title) lines.push(`  Summary: ${r.problem}`);
    if (r.fixes?.length) lines.push(`  Says it fixes: ${r.fixes.map((n) => `#${n}`).join(", ")}`);
  }
  lines.push(
    "",
    "Please:",
    "1. Read each report on GitHub, comments included. Collect every open PR that addresses it: the PRs above, PRs that say they fix these issues, and any a GitHub search turns up.",
    "2. Trace the cause in the hermes-agent source until you can name the root cause, reproducing it if you can.",
    "3. Review each of those PRs against the root cause: does it fix the cause rather than a symptom, stay narrow, include a test, pass CI and apply cleanly to main? Pick the best one.",
    "4. If the best PR is sufficient as it is, it's the one to merge. If none is, salvage it: on a new branch off main, take the best PR's work plus anything useful from the others, finish the fix and its test following the repo's AGENTS.md, credit each original author with a Co-authored-by trailer, and write \"Salvages #N\" for each PR you drew on and \"Fixes #N\" for each issue in the PR body. With no PR to start from, write the narrow fix and test yourself.",
    "5. Tell me how the PRs compare, which one you picked and why, and whether it's a merge or a salvage. Don't merge, push, open a PR or comment on GitHub until I approve.",
  );
  return lines.join("\n");
}

function Handoff({ text }: { text: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = () => {
    // the dashboard is served over plain http on the LAN, where the Clipboard API is missing
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false));
      return;
    }
    area.current?.focus();
    area.current?.select();
    setCopied(document.execCommand("copy"));
  };
  return (
    <div className="handoff">
      <textarea ref={area} readOnly value={text} rows={12} aria-label="Prompt for Hermes" onFocus={(e) => e.currentTarget.select()} />
      <div className="btns">
        <button className="btn small primary" onClick={copy}>
          Copy prompt
        </button>
        {copied !== null && <span className="meta">{copied ? "Copied. Paste it into a Hermes chat." : "Couldn't copy. Select the text and copy it."}</span>}
      </div>
    </div>
  );
}

function ReportDetail({ r, s }: { r: Report; s: State }) {
  const cid = s.clusterOf.get(r.id)!;
  const cluster = s.clusterById.get(cid);
  const inc = s.incidents.find((i) => i.clusterId === cid);
  const others = cluster ? cluster.reportIds.filter((id) => id !== r.id) : [];
  return (
    <>
      <div className="d-top">
        <SourceBadge source={r.source} />
        <span className="ref">{refLabel(r)}</span>
        <span className="meta">{stateName(r)}</span>
      </div>
      <h2>{r.title}</h2>
      <p className="meta">
        Opened by {r.author} <Age at={r.createdAt} now={s.now} />
        {!r.sample && (
          <>
            {" · "}
            <a href={r.url} target="_blank" rel="noreferrer">
              View on GitHub ↗
            </a>
          </>
        )}
      </p>
      {r.sample && <p className="note warn">This is a simulated report for trying out the dashboard. It isn't real data.</p>}
      <SalvageNote r={r} />
      <h3>
        Summary <span className="by">written by the model</span>
      </h3>
      {r.sample || r.summarized ? (
        <p className="quote">{r.problem}</p>
      ) : (
        <p className="muted">Not summarized yet. Summaries are written every 5 minutes, newest items first.</p>
      )}
      <h3>
        Labels <span className="by">from alt-glitch</span>
      </h3>
      {r.labels.by ? (
        <>
          <div className="chips">
            <LabelChips l={r.labels} />
          </div>
          {r.labels.delayMin !== undefined && <p className="meta spaced">Added {fmtMinutes(r.labels.delayMin)} after it was opened.</p>}
        </>
      ) : (
        <p className="muted">
          No labels yet. alt-glitch typically labels new items within {fmtMinutes(pipeline.labelDelayMedianMin)}. The dashboard never adds labels
          itself.
        </p>
      )}
      <h3>
        Search keywords <span className="by">written by the model</span>
      </h3>
      <p className="mono">{r.dupQuery || "None"}</p>
      {r.dupQuery && (
        <a className="ext" href={`${REPO_URL}/issues?q=${encodeURIComponent(r.dupQuery)}`} target="_blank" rel="noreferrer">
          Search GitHub for duplicates ↗
        </a>
      )}
      <h3>Similar reports ({others.length})</h3>
      {others.length ? <ReportList ids={others} s={s} /> : <p className="muted">No other report shares enough keywords with this one.</p>}
      {inc && (
        <>
          <h3>Alert</h3>
          <AlertLink i={inc} />
        </>
      )}
    </>
  );
}

function ClusterDetail({ c, s }: { c: Cluster; s: State }) {
  const inc = s.incidents.find((i) => i.clusterId === c.id);
  return (
    <>
      <div className="d-top">
        <span className="size">{plural(c.reportIds.length, "report")}</span>
        <span className="meta">{c.comp ? compName(c.comp) : "No component label yet"}</span>
      </div>
      <h2>{c.headline}</h2>
      {inc && <AlertLink i={inc} />}
      <h3>Reports in this group</h3>
      <ReportList ids={c.reportIds} s={s} />
    </>
  );
}
