import type { IncidentStatus, Labels, Level, Owner, Report, Source } from "./types";

export const cx = (...c: (string | false | null | undefined | 0)[]) => c.filter(Boolean).join(" ");

export function ago(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} sec ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const Age = ({ at, now }: { at: number; now: number }) => (
  <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()}>
    {ago(at, now)}
  </time>
);

export function fmtMinutes(m: number) {
  if (m < 1) return "under a minute";
  if (m < 90) return `${Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} hours`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** What one staff member did on an item, e.g. "pushed 2 commits and commented once". `you` words it for the dashboard user. */
export function ownerActs(o: Owner, you = false) {
  const acts: string[] = [];
  if (o.opened) acts.push("opened it");
  if (o.prs?.length) acts.push(`opened ${listJoin(o.prs.map((n) => `#${n}`))} for it`);
  if (o.assigned) acts.push(you ? "are assigned" : "is assigned");
  if (o.commits) acts.push(`pushed ${plural(o.commits, "commit")}`);
  if (o.pushes) acts.push(`force-pushed ${times(o.pushes)}`);
  if (o.reviews) acts.push(`reviewed ${times(o.reviews)}`);
  if (o.comments) acts.push(`commented ${times(o.comments)}`);
  return listJoin(acts);
}

/** Staff active on any of these reports, with how many of them each is on, most first. */
export function staffOn(reps: Report[]): [string, number][] {
  const on = new Map<string, number>();
  for (const r of reps) for (const o of r.owners ?? []) on.set(o.login, (on.get(o.login) ?? 0) + 1);
  return [...on].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Counts timestamps into `n` equal buckets ending at `now`. */
export function buckets(times: number[], now: number, spanMs: number, n: number) {
  const size = spanMs / n;
  const out: number[] = new Array(n).fill(0);
  for (const t of times) {
    const i = Math.floor((t - (now - spanMs)) / size);
    if (i >= 0 && i < n) out[i]++;
  }
  return out;
}

export function Sparkline({ values, w = 72, h = 16 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 1 - (v / max) * (h - 3)).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export const LEVEL_NAME: Record<Level, string> = { urgent: "Urgent", warn: "Warning", watch: "Watching" };
export const STATUS_NAME: Record<IncidentStatus, string> = { open: "Open", acked: "Acknowledged", resolved: "Resolved" };
export const sourceName = (s: Source) => (s === "github" ? "GitHub" : "Discord");

export const PRIO_NAME: Record<string, string> = { P0: "critical", P1: "high", P2: "medium", P3: "low", P4: "best effort" };
const KIND_NAME: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  docs: "Docs",
  perf: "Performance",
  refactor: "Refactor",
  test: "Tests",
  security: "Security",
};
const ACRONYMS = new Set(["cli", "tui", "acp", "lsp"]);
const STATE_NAME: Record<string, string> = {
  issue_open: "Open issue",
  issue_completed: "Fixed issue",
  issue_not_planned: "Closed issue (not planned)",
  pr_open: "Open PR",
  pr_merged: "Merged PR",
  pr_closed_unmerged: "Closed PR",
};

export function compName(c: string) {
  const x = c.replace("comp/", "");
  return ACRONYMS.has(x) ? x.toUpperCase() : x[0].toUpperCase() + x.slice(1);
}
export const kindName = (k: string) => {
  const x = k.replace("type/", "");
  return KIND_NAME[x] ?? x;
};
export const stateName = (r: Report) => (r.sample ? "Simulated" : (STATE_NAME[r.state] ?? r.state));
export const refLabel = (r: Report) => (r.sample ? `Sample ${r.id.replace("sample-", "")}` : `#${r.number}`);

export const LevelBadge = ({ level }: { level: Level }) => (
  <span className={`badge lvl-${level}`}>
    <i className="dot" />
    {LEVEL_NAME[level]}
  </span>
);

export const SourceBadge = ({ source }: { source: Source }) => <span className={`source src-${source}`}>{sourceName(source)}</span>;

export function LabelChips({ l }: { l: Labels }) {
  return (
    <>
      {l.prio && (
        <span className={`chip prio-${l.prio.toLowerCase()}`} title="Priority set by alt-glitch">
          {l.prio} · {PRIO_NAME[l.prio]}
        </span>
      )}
      {l.kind && <span className="chip">{kindName(l.kind)}</span>}
      {l.comp && <span className="chip">{compName(l.comp)}</span>}
    </>
  );
}

export function Delta({ v, title }: { v: number; title?: string }) {
  if (v === 0) return null;
  return (
    <span className={cx("delta", v > 0 ? "up" : "down")} title={title}>
      {v > 0 ? `↑${v}` : `↓${-v}`}
    </span>
  );
}
