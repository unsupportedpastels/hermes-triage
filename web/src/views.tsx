import { useState, type ReactNode } from "react";
import pipeline from "./data/pipeline.json";
import { rank } from "./engine";
import { DAYS, SIM, actions, useStore, type State } from "./store";
import type { Closable, Incident, IncidentTab, Report, Rule, Source } from "./types";
import {
  Age,
  LabelChips,
  LevelBadge,
  STATUS_NAME,
  SourceBadge,
  Sparkline,
  buckets,
  compName,
  cx,
  fmtMinutes,
  listJoin,
  ownerActs,
  plural,
  refLabel,
  sourceName,
  stateName,
} from "./ui";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FRESH_MS = 6000;
/** Long lists only render their first rows; search narrows the rest. */
const SHOW = 300;
const PR_URL = "https://github.com/NousResearch/hermes-agent/pull/";

export const matchTab = (i: Incident, tab: IncidentTab) =>
  tab === "all" || (tab === "open" ? i.status === "open" && i.firing : i.status === tab);

const TABS: [IncidentTab, string][] = [
  ["open", "Open"],
  ["acked", "Acknowledged"],
  ["resolved", "Resolved"],
  ["all", "All"],
];

export function Head({ title, lede, children }: { title: string; lede: ReactNode; children?: ReactNode }) {
  return (
    <header className="view-head">
      <div>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </div>
      {children && <div className="toolbar">{children}</div>}
    </header>
  );
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

/* ---------- Needs attention ---------- */

export function IncidentsView() {
  const s = useStore((x) => x);
  const list = s.incidents
    .filter((i) => matchTab(i, s.incidentTab))
    .sort((a, b) => Number(b.firing) - Number(a.firing) || rank(b.level) - rank(a.level) || b.lastAt - a.lastAt);
  return (
    <section className="view">
      <Head
        title="Needs attention"
        lede="Problems the alert rules have flagged. Acknowledging one silences it until more reports arrive or it gets worse."
      >
        <div className="seg" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={s.incidentTab === id} className={cx(s.incidentTab === id && "on")} onClick={() => actions.incidentTab(id)}>
              {label} <span className="count">{s.incidents.filter((i) => matchTab(i, id)).length}</span>
            </button>
          ))}
        </div>
      </Head>
      {list.length === 0 &&
        (s.incidentTab === "open" ? (
          <Empty title={s.closable.length ? "No alerts right now" : "Nothing needs attention right now"}>New alerts will appear here as reports come in.</Empty>
        ) : (
          <Empty title="Nothing here yet" />
        ))}
      <ul className="list">
        {list.slice(0, SHOW).map((i) => (
          <IncidentItem key={i.id} i={i} s={s} />
        ))}
      </ul>
      {list.length > SHOW && <p className="meta">Showing the first {SHOW} of {list.length}.</p>}
      {s.closable.length > 0 && (
        <>
          <h2 className="group-head">
            Can probably be closed <span className="count">{s.closable.length}</span>
          </h2>
          <p className="group-lede">Open PRs whose work another PR salvaged and merged. Check the original has nothing extra before closing it on GitHub.</p>
          <ul className="list">
            {s.closable.map((c) => (
              <ClosableItem key={c.number} c={c} now={s.now} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PrLink({ n }: { n: number }) {
  return (
    <a href={`${PR_URL}${n}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      #{n}
    </a>
  );
}

function ClosableItem({ c, now }: { c: Closable; now: number }) {
  return (
    <li className="item rep static">
      <div className="item-top">
        <span className="ref">
          <PrLink n={c.number} />
        </span>
        <span>
          Open PR · {c.author} · <Age at={Date.parse(c.createdAt)} now={now} />
        </span>
      </div>
      <h2 className="item-title clamp">{c.title}</h2>
      <p className="salvage">
        <span>
          Salvaged in{" "}
          {c.by.map((b, k) => (
            <span key={b.number}>
              {k > 0 && ", "}
              <PrLink n={b.number} /> by @{b.author}, merged <Age at={Date.parse(b.mergedAt)} now={now} />
            </span>
          ))}
        </span>
      </p>
    </li>
  );
}

const LINK_STATE = { open: "open", merged: "merged", closed: "closed without merging" } as const;

/** Which PRs this one salvages, and which PRs carried it on. */
export function SalvageNote({ r }: { r: Report }) {
  const from = r.salvages ?? [];
  const into = r.salvagedBy ?? [];
  if (!from.length && !into.length) return null;
  return (
    <p className="salvage">
      {from.length > 0 && (
        <span>
          Salvages{" "}
          {from.map((l, k) => (
            <span key={l.number}>
              {k > 0 && ", "}
              <PrLink n={l.number} /> by @{l.author}
            </span>
          ))}
        </span>
      )}
      {into.length > 0 && (
        <span>
          Carried on in{" "}
          {into.map((l, k) => (
            <span key={l.number}>
              {k > 0 && ", "}
              <PrLink n={l.number} /> ({LINK_STATE[l.state]})
            </span>
          ))}
        </span>
      )}
    </p>
  );
}

/** Which Nous staff are active on a report, so work that's theirs isn't picked up twice. */
export function OwnerNote({ r, now }: { r: Report; now: number }) {
  if (!r.owners?.length) {
    return (
      <p className="muted">
        {r.ownersChecked
          ? "No staff activity: none of them opened it, is assigned, or commented, reviewed or pushed in its last 100 events, and none has an open PR for it."
          : "Not checked yet. The sync reads recently updated items first."}
      </p>
    );
  }
  return (
    <ul className="owners">
      {r.owners.map((o) => (
        <li key={o.login}>
          <b>{o.login}</b> {ownerActs(o)}
          {o.lastAt && (
            <span className="meta">
              {" · last "}
              <Age at={Date.parse(o.lastAt)} now={now} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function IncidentItem({ i, s }: { i: Incident; s: State }) {
  const reps = i.reportIds.map((id) => s.byId.get(id)!);
  const sources = [...new Set(reps.map((r) => sourceName(r.source)))];
  const recent = reps.some((r) => s.now - r.createdAt < 2 * HOUR);
  return (
    <li
      data-id={i.id}
      className={cx(
        "item inc",
        `edge-${i.level}`,
        s.selected === i.id && "sel",
        s.now - i.lastAt < FRESH_MS && "fresh",
        (i.status !== "open" || !i.firing) && "quiet",
      )}
      onClick={() => actions.select(i.id)}
    >
      <div className="item-top">
        <LevelBadge level={i.level} />
        <span className="status" data-status={i.status}>
          {STATUS_NAME[i.status]}
          {!i.firing && " · rules quiet"}
        </span>
        <span className="spacer" />
        <span>
          Last report <Age at={i.lastAt} now={s.now} />
        </span>
      </div>
      <h2 className="item-title">{i.headline}</h2>
      {i.firing && (
        <ul className="reasons">
          {i.reasons.map((r, k) => (
            <li key={k}>
              <i className={`dot lvl-${r.level}`} />
              {r.text}
            </li>
          ))}
        </ul>
      )}
      <div className="item-foot">
        <span>
          {plural(reps.length, "report")} from {listJoin(sources)}
        </span>
        <span className="sep">·</span>
        <span>
          first seen <Age at={i.firstAt} now={s.now} />
        </span>
        {recent && (
          <span className="trend" title="Reports per 5 minutes over the last 2 hours">
            <Sparkline values={buckets(reps.map((r) => r.createdAt), s.now, 2 * HOUR, 24)} />
            last 2 hours
          </span>
        )}
        <span className="spacer" />
        {i.status === "open" && (
          <button
            className="btn small"
            onClick={(e) => {
              e.stopPropagation();
              actions.ack(i.id);
            }}
          >
            Acknowledge
          </button>
        )}
      </div>
    </li>
  );
}

/* ---------- All reports ---------- */

const isOpenState = (r: Report) => r.sample || r.state === "issue_open" || r.state === "pr_open";

function dayLabel(t: number, now: number) {
  const start = (x: number) => {
    const d = new Date(x);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((start(now) - start(t)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(t).toLocaleDateString(undefined, { weekday: "long" });
  return new Date(t).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

const SOURCES: ["all" | Source, string][] = [
  ["all", "All sources"],
  ["github", "GitHub"],
  ["discord", "Discord"],
];

export function ReportsView() {
  const s = useStore((x) => x);
  const q = s.query.trim().toLowerCase();
  const list = s.reports
    .filter(
      (r) =>
        (s.includeClosed || isOpenState(r)) &&
        (s.source === "all" || r.source === s.source) &&
        s.tags.every((t) => r.tags?.includes(t)) &&
        (!s.hideOwned || !r.owners?.length) &&
        (!q ||
          `${r.number ?? ""} ${r.title} ${r.problem} ${(r.tags ?? []).join(" ")} ${r.author} ${(r.owners ?? []).map((o) => o.login).join(" ")}`
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  // Counts come from the current results, so they show how far each label would narrow them.
  const tagCounts = new Map<string, number>();
  for (const r of list) for (const t of r.tags ?? []) if (!s.tags.includes(t)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const groups: [string, Report[]][] = [];
  for (const r of list.slice(0, SHOW)) {
    const d = dayLabel(r.createdAt, s.now);
    const last = groups[groups.length - 1];
    if (last && last[0] === d) last[1].push(r);
    else groups.push([d, [r]]);
  }
  return (
    <section className="view">
      <Head title="All reports" lede={`Open issues and pull requests from the last ${DAYS} days, with a one-sentence summary from the model and labels from alt-glitch.`}>
        <input
          id="search"
          type="search"
          placeholder="Search reports, people, components"
          value={s.query}
          onChange={(e) => actions.query(e.target.value)}
        />
        <div className="seg">
          {SOURCES.map(([id, label]) => (
            <button key={id} className={cx(s.source === id && "on")} onClick={() => actions.source(id)}>
              {label}
            </button>
          ))}
        </div>
        <TagFilter counts={tagCounts} selected={s.tags} />
        <label className="check" title="Items a Nous staff member opened, is assigned, commented, reviewed or pushed on, or opened a PR for">
          <input type="checkbox" checked={s.hideOwned} onChange={(e) => actions.hideOwned(e.target.checked)} />
          Hide items staff are on
        </label>
        <span className="meta">
          {plural(list.length, "report")}
          {list.length > SHOW && ` · showing the newest ${SHOW}; search to narrow`}
        </span>
      </Head>
      {list.length === 0 && <Empty title="No reports match">Try a different search or remove a label filter.</Empty>}
      {groups.map(([day, rs]) => (
        <div key={day}>
          <h2 className="group-head">
            {day} <span className="count">{rs.length}</span>
          </h2>
          <ul className="list">
            {rs.map((r) => (
              <ReportItem key={r.id} r={r} s={s} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function TagFilter({ counts, selected }: { counts: Map<string, number>; selected: string[] }) {
  const [text, setText] = useState("");
  const options = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pick = (t: string) => {
    actions.tag(t);
    setText("");
  };
  return (
    <div className="tag-filter">
      <input
        className="tag-input"
        list="tag-options"
        placeholder="Filter by label"
        aria-label="Filter by alt-glitch label"
        value={text}
        onChange={(e) => (counts.has(e.target.value) ? pick(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          const needle = text.trim().toLowerCase();
          const match = needle && options.find(([t]) => t.toLowerCase().includes(needle));
          if (e.key === "Enter" && match) pick(match[0]);
        }}
      />
      <datalist id="tag-options">
        {options.map(([t, n]) => (
          <option key={t} value={t}>{`${n} ${n === 1 ? "report" : "reports"}`}</option>
        ))}
      </datalist>
      {selected.map((t) => (
        <button key={t} className="chip tag on" title="Remove this filter" onClick={() => actions.tag(t)}>
          {t} ×
        </button>
      ))}
      {selected.length > 1 && (
        <button className="clear-tags" onClick={actions.clearTags}>
          Clear labels
        </button>
      )}
    </div>
  );
}

/** Type, component and priority already show as LabelChips. */
const CORE_TAG = /^(type\/|comp\/|P[0-4]$)/;

function ReportItem({ r, s }: { r: Report; s: State }) {
  const size = s.clusterById.get(s.clusterOf.get(r.id)!)?.reportIds.length ?? 1;
  return (
    <li
      data-id={r.id}
      className={cx("item rep", s.selected === r.id && "sel", s.now - r.createdAt < FRESH_MS && "fresh", !isOpenState(r) && "quiet")}
      onClick={() => actions.select(r.id)}
    >
      <div className="item-top">
        <SourceBadge source={r.source} />
        <span className="ref">{refLabel(r)}</span>
        <span>
          {stateName(r)} · {r.author} · <Age at={r.createdAt} now={s.now} />
        </span>
        <span className="spacer" />
        {size > 1 && <span className="similar">{plural(size - 1, "similar report")}</span>}
        {r.owners?.length ? (
          <span className="chip owned" title={r.owners.map((o) => `${o.login} ${ownerActs(o)}`).join("\n")}>
            Staff: {listJoin(r.owners.map((o) => o.login))}
          </span>
        ) : null}
        {!r.sample && !r.summarized && <span className="pending">Summary pending</span>}
      </div>
      <h2 className="item-title clamp">{r.title}</h2>
      {r.problem !== r.title && <p className="summary clamp">{r.problem}</p>}
      <SalvageNote r={r} />
      <div className="chips">
        {r.labels.by ? <LabelChips l={r.labels} /> : <span className="pending">{isOpenState(r) ? "Waiting for alt-glitch's labels" : "No labels"}</span>}
        {(r.tags ?? [])
          .filter((t) => !CORE_TAG.test(t))
          .map((t) => (
            <button
              key={t}
              className={cx("chip tag", s.tags.includes(t) && "on")}
              title={s.tags.includes(t) ? "Remove this filter" : "Show only reports with this label"}
              onClick={(e) => {
                e.stopPropagation();
                actions.tag(t);
              }}
            >
              {t}
            </button>
          ))}
      </div>
    </li>
  );
}

/* ---------- Similar reports ---------- */

export function ClustersView() {
  const s = useStore((x) => x);
  const groups = s.clusters
    .filter((c) => c.reportIds.length > 1)
    .sort((a, b) => b.reportIds.length - a.reportIds.length || b.lastAt - a.lastAt);
  const singles = s.clusters.length - groups.length;
  return (
    <section className="view">
      <Head
        title="Similar reports"
        lede="Reports grouped together because their search keywords overlap, unless a model check found different causes. A big group usually means several people hit the same problem."
      >
        <label className="slider">
          Looser
          <input
            type="range"
            min={0.15}
            max={0.8}
            step={0.01}
            value={s.clusterThreshold}
            onChange={(e) => actions.setThreshold(Number(e.target.value))}
            aria-label="Required keyword overlap"
          />
          Stricter
        </label>
        <span className="meta">
          {Math.round(s.clusterThreshold * 100)}% keyword overlap · {plural(groups.length, "group")} · {plural(singles, "report")} on their own
        </span>
      </Head>
      {groups.length === 0 && <Empty title="No groups at this setting">Slide toward Looser to group reports with less keyword overlap.</Empty>}
      <ul className="list">
        {groups.slice(0, SHOW).map((c) => {
          const reps = c.reportIds.map((id) => s.byId.get(id)!).sort((a, b) => b.createdAt - a.createdAt);
          const sources = [...new Set(reps.map((r) => sourceName(r.source)))];
          const inc = s.incidents.find((i) => i.clusterId === c.id && i.firing);
          const id = `cl:${c.id}`;
          return (
            <li
              key={c.id}
              data-id={id}
              className={cx("item", s.selected === id && "sel", s.now - c.lastAt < FRESH_MS && "fresh")}
              onClick={() => actions.select(id)}
            >
              <div className="item-top">
                <span className="size">{plural(reps.length, "report")}</span>
                <span>from {listJoin(sources)}</span>
                {c.comp && <span className="chip">{compName(c.comp)}</span>}
                {inc && <LevelBadge level={inc.level} />}
                <span className="spacer" />
                <span>
                  Last report <Age at={c.lastAt} now={s.now} />
                </span>
              </div>
              <h2 className="item-title clamp">{c.headline}</h2>
              <ul className="members">
                {reps.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <span className="ref">{refLabel(r)}</span>
                    {r.title}
                  </li>
                ))}
                {reps.length > 3 && <li>and {reps.length - 3} more</li>}
              </ul>
            </li>
          );
        })}
      </ul>
      {groups.length > SHOW && <p className="meta">Showing the largest {SHOW} of {groups.length} groups.</p>}
    </section>
  );
}

/* ---------- Alert rules ---------- */

function NumField({ r, k, label }: { r: Rule; k: string; label: string }) {
  return (
    <input
      className="num-input"
      type="number"
      min={1}
      aria-label={label}
      value={r.params[k]}
      disabled={!r.enabled}
      onChange={(e) => actions.setParam(r.id, k, Math.max(1, Number(e.target.value) || 1))}
    />
  );
}

function ruleText(r: Rule): ReactNode {
  switch (r.id) {
    case "passthrough":
      return (
        <>
          Copy alt-glitch's priority: <b>P0</b> becomes <b>urgent</b> and <b>P1</b> becomes a <b>warning</b>. Lower priorities never alert on their own.
        </>
      );
    case "spike":
      return (
        <>
          Raise a <b>warning</b> when <NumField r={r} k="warnAt" label="People needed for a warning" /> different people open issues or PRs about the same problem within{" "}
          <NumField r={r} k="windowMin" label="Window in minutes" /> minutes, and make it <b>urgent</b> at{" "}
          <NumField r={r} k="urgentAt" label="People needed for urgent" /> people.
        </>
      );
    case "release":
      return (
        <>
          Start <b>watching</b> when <NumField r={r} k="minReports" label="Reports needed" /> reports about the same problem mention the same version
          within <NumField r={r} k="windowHours" label="Window in hours" /> hours.
        </>
      );
    case "crossSource":
      return (
        <>
          Raise an alert by one level when the same problem is reported on both <b>GitHub</b> and <b>Discord</b>.
        </>
      );
  }
}

export function BreakersView() {
  const s = useStore((x) => x);
  return (
    <section className="view">
      <Head title="Alert rules" lede="These rules decide when a problem becomes an alert. The model never sets alert levels. Changes apply immediately." />
      <ul className="list">
        {s.rules.map((r) => {
          const firing = s.incidents.filter((i) => i.firing && i.reasons.some((x) => x.rule === r.id)).length;
          return (
            <li key={r.id} className={cx("rule", !r.enabled && "off")}>
              <input
                type="checkbox"
                className="switch"
                checked={r.enabled}
                aria-label={`Turn “${r.name}” on or off`}
                onChange={(e) => actions.setRule(r.id, e.target.checked)}
              />
              <div>
                <h2 className="rule-name">{r.name}</h2>
                <p className="rule-text">{ruleText(r)}</p>
              </div>
              <span className={cx("firing", r.enabled && firing && "on")}>
                {!r.enabled ? "Off" : firing ? `Firing on ${plural(firing, "problem")}` : "Not firing"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="callout">
        <b>Alert levels are separate from priority labels</b>
        <p>
          Alerts use their own three levels (Watching, Warning and Urgent) so they're never mistaken for alt-glitch's P0–P4 labels. Only the
          “Follow alt-glitch's priority” rule reads those labels, and nothing here ever changes them.
        </p>
        <p>Alerts only show up in this dashboard for now. A Discord webhook can be added later.</p>
      </div>
    </section>
  );
}

/* ---------- Model & data ---------- */

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function PipelineView() {
  const s = useStore((x) => x);
  const p = pipeline;
  const samples = s.reports.filter((r) => r.sample).length;
  const per1k = (p.cost / p.items) * 1000;
  return (
    <section className="view">
      <Head title="Model & data" lede={`How the pieces behave. Model and label figures come from a test run on ${p.items} real hermes-agent issues and pull requests.`} />
      <div className="block">
        <h2 className="block-title">Live data</h2>
        {s.meta ? (
          <div className="stats">
            <Stat value={`${s.meta.summarized.toLocaleString()} of ${s.meta.openTotal.toLocaleString()}`} label="open items summarized" />
            <Stat value={s.meta.waiting.toLocaleString()} label={`waiting for a summary${s.meta.failed ? `; ${s.meta.failed} failed` : ""}`} />
            <Stat value={`$${s.meta.spendUsd.toFixed(2)}`} label="spent on summaries so far" />
            <Stat value={(s.reports.length - samples).toLocaleString()} label={`open items from the last ${DAYS} days loaded here`} />
          </div>
        ) : (
          <p className="block-lede">{s.loadError ? `Can't reach the data server: ${s.loadError}` : "Loading…"}</p>
        )}
      </div>
      <div className="block">
        <h2 className="block-title">Summaries and search keywords</h2>
        <p className="block-lede">
          DeepSeek V4.1 Flash (<code>{p.model}</code>) writes a one-sentence summary and duplicate-search keywords for each new report. It never sets
          labels or alert levels.
        </p>
        <div className="stats">
          <Stat value={`${p.validJsonFirstTry} of ${p.items}`} label="answers were usable on the first try" />
          <Stat value={`${p.dupSelfHit[0]} of ${p.dupSelfHit[1]}`} label="keyword searches found the original report in GitHub's top 10" />
          <Stat value={`$${per1k.toFixed(2)}`} label="per 1,000 reports" />
          <Stat value={`${p.latencyMedianS} s`} label={`typical time per report; the slowest 10% took over ${p.latencyP90S} s`} />
        </div>
      </div>
      <div className="block">
        <h2 className="block-title">Labels from alt-glitch</h2>
        <p className="block-lede">Type, component and priority labels come from alt-glitch. The dashboard reads them and never writes its own.</p>
        <div className="stats">
          <Stat value={`${p.labeledItems} of ${p.items}`} label="items were labeled" />
          <Stat value={fmtMinutes(p.labelDelayMedianMin)} label="typical wait for labels after an item opens" />
          <Stat value={fmtMinutes(p.labelDelayMaxMin)} label="longest wait seen" />
        </div>
      </div>
      <div className="block">
        <h2 className="block-title">This session</h2>
        <div className="stats">
          <Stat value={String(s.reports.length - samples)} label="real GitHub items loaded" />
          {SIM && <Stat value={String(samples)} label={`sample reports added (${s.live ? "simulation running" : "simulation paused"})`} />}
          <Stat value={String(s.clusters.filter((c) => c.reportIds.length > 1).length)} label="groups of similar reports" />
          <Stat value={String(s.incidents.filter((i) => i.firing).length)} label="alerts firing" />
        </div>
      </div>
      <div className="block">
        <h2 className="block-title">Activity</h2>
        {s.feed.length === 0 ? (
          <p className="block-lede">New reports and alerts will show up here.</p>
        ) : (
          <ul className="feed">
            {s.feed.map((e, k) => (
              <li key={`${e.at}-${k}`} className={cx(s.now - e.at < FRESH_MS && "fresh")}>
                <span className={cx("feed-kind", e.kind === "alert" && "alert")}>{e.kind === "alert" ? "Alert" : "Report"}</span>
                <span className="feed-text" title={e.text}>
                  {e.text}
                </span>
                <Age at={e.at} now={s.now} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
