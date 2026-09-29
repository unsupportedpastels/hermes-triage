import { useEffect, useState } from "react";
import { DAYS, useStore } from "./store";
import type { Merger, Stats } from "./types";
import { PRIO_NAME, compName, cx, fmtMinutes, kindName } from "./ui";
import { Head, Stat } from "./views";

const WINDOWS = [7, 30, 90];
const POLL_MS = 60_000;
const PRIO_COLOR: Record<string, string> = {
  P0: "var(--urgent)",
  P1: "var(--warn)",
  P2: "var(--accent)",
  P3: "var(--watch)",
  P4: "#5a6273",
  "": "var(--line)",
};
const PALETTE = ["#5b96ff", "#3dd68c", "#f5a524", "#b58cff", "#4fc3d9", "#f28cb1", "#8d9dba", "#5a6273"];
const PR_FILL = "#3a4a66";

const pct = (n: number, d: number) => {
  if (!d) return "–";
  const p = (n / d) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
};
const fmtHours = (h: number | null) =>
  h === null ? "–" : h < 1.5 ? fmtMinutes(h * 60) : h < 48 ? `${Math.round(h)} hours` : `${(h / 24).toFixed(1)} days`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

function useStats(days: number) {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/stats?days=${days}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<Stats>;
        })
        .then(
          (d) => {
            if (!live) return;
            setData(d);
            setError(null);
          },
          (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
        );
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [days]);
  return { data, error };
}

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function Donut({ slices, unit }: { slices: Slice[]; unit: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  // Tiny slices such as P0 keep a visible sliver; the legend has the exact numbers.
  const raw = slices.map((s) => (s.value ? Math.max((s.value / Math.max(1, total)) * C, 2) : 0));
  const scale = C / Math.max(1, raw.reduce((a, b) => a + b, 0));
  let at = 0;
  const arcs = slices.map((s, k) => {
    const arc = { ...s, len: raw[k] * scale, at };
    at += arc.len;
    return arc;
  });
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" width="148" height="148" role="img" aria-label={slices.map((s) => `${s.label} ${s.value}`).join(", ")}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--line-soft)" strokeWidth="16" />
        {arcs
          .filter((a) => a.len > 0)
          .map((a) => (
            <circle
              key={a.key}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="16"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.at}
              transform="rotate(-90 60 60)"
            >
              <title>{`${a.label}: ${a.value.toLocaleString()} (${pct(a.value, total)})`}</title>
            </circle>
          ))}
        <text x="60" y="61" textAnchor="middle" className="donut-n">
          {total.toLocaleString()}
        </text>
        <text x="60" y="75" textAnchor="middle" className="donut-sub">
          {unit}
        </text>
      </svg>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} />
            <span className="legend-label">{s.label}</span>
            <b>{s.value.toLocaleString()}</b>
            <span className="pct">{pct(s.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ rows }: { rows: [string, number][] }) {
  const total = rows.reduce((a, [, v]) => a + v, 0);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <ul className="bars">
      {rows.map(([label, value]) => (
        <li key={label}>
          <span className="bar-label" title={label}>
            {label}
          </span>
          <span className="bar-track">
            <i style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <b>{value.toLocaleString()}</b>
          <span className="pct">{pct(value, total)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Mean hours to fix per priority as bars, with the median and count beside each. */
function FixTimes({ rows }: { rows: Stats["fixByPrio"] }) {
  const max = Math.max(1, ...rows.map((r) => r.meanHours ?? 0));
  return (
    <ul className="bars fix">
      {rows.map((r) => (
        <li key={r.prio || "none"}>
          <span className="bar-label">{r.prio ? `${r.prio} · ${PRIO_NAME[r.prio]}` : "No priority"}</span>
          <span className="bar-track">
            <i style={{ width: `${((r.meanHours ?? 0) / max) * 100}%`, background: r.prio ? PRIO_COLOR[r.prio] : "#8d9dba" }} />
          </span>
          <b>{fmtHours(r.meanHours)}</b>
          <span className="pct">{r.n ? `median ${fmtHours(r.medianHours)} · ${r.n.toLocaleString()} fixed` : "none fixed"}</span>
        </li>
      ))}
    </ul>
  );
}

function Spark({ values }: { values: number[] }) {
  const W = 96;
  const H = 22;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * (W - 4) + 2).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`PRs merged or closed per week: ${values.join(", ")}`}>
      <polyline points={pts.join(" ")} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2" fill="var(--accent)" />
    </svg>
  );
}

const SORTS: [keyof Merger, string][] = [
  ["prs", "PRs merged or closed"],
  ["issues", "Issues closed"],
  ["urgent", "P0–P1 closed"],
];

/** One row per person who merged or closed PRs in the window: volume and the issues it closed. */
function Mergers({ rows }: { rows: Merger[] }) {
  const [by, setBy] = useState<keyof Merger>("prs");
  const bots = rows.filter((m) => m.login.endsWith("[bot]"));
  const sorted = rows.filter((m) => !bots.includes(m)).sort((a, b) => (b[by] as number) - (a[by] as number) || b.prs - a.prs);
  return (
    <>
      <div className="seg board-sort" role="group" aria-label="Sort by">
        {SORTS.map(([k, label]) => (
          <button key={k} className={cx(by === k && "on")} onClick={() => setBy(k)}>
            {label}
          </button>
        ))}
      </div>
      <ol className="board">
        <li className="board-head" aria-hidden>
          <span />
          <span>Merged by</span>
          <span>12 weeks</span>
          <span className="board-nums">
            <span>
              <span className="board-long">PRs merged or closed</span>
              <span className="board-short">PRs</span>
            </span>
            <span>
              <span className="board-long">Issues closed</span>
              <span className="board-short">Issues</span>
            </span>
          </span>
        </li>
        {sorted.map((m, i) => (
          <li key={m.login}>
            <span className="board-rank">{i + 1}</span>
            <a className="board-who" href={`https://github.com/${m.login}`} target="_blank" rel="noreferrer">
              {m.login}
            </a>
            <Spark values={m.weeks} />
            <span className="board-nums">
              <span title="PRs merged or closed without merging in the window; the second number is the ones closed">
                <b>{m.prs.toLocaleString()}</b>
                <small>{m.closed.toLocaleString()} closed</small>
              </span>
              <span title="Issues GitHub closed through these merges; the second number is P0 or P1">
                <b>{m.issues.toLocaleString()}</b>
                <small>{m.urgent.toLocaleString()} P0–P1</small>
              </span>
            </span>
          </li>
        ))}
      </ol>
      {bots.length > 0 && (
        <p className="board-bots">
          Also merged by bots, not ranked: {bots.map((m) => `${m.login.replace("[bot]", "")} (${m.merged.toLocaleString()})`).join(", ")}.
        </p>
      )}
    </>
  );
}

/** Stacked new issues and PRs per week, with the duplicate share as a line in its own strip above. */
function Weekly({ weeks }: { weeks: Stats["weekly"] }) {
  const W = 640;
  const H = 210;
  const bottom = 22;
  const barTop = 66;
  const [shareTop, shareBottom] = [18, 50];
  const slot = W / weeks.length;
  const bw = slot * 0.56;
  const max = Math.max(1, ...weeks.map((w) => w.issues + w.prs));
  const share = weeks.map((w) => w.dups / Math.max(1, w.issues + w.prs));
  const maxShare = Math.max(0.01, ...share);
  const y = (v: number) => H - bottom - (v / max) * (H - barTop - bottom);
  const ys = (p: number) => shareBottom - (p / maxShare) * (shareBottom - shareTop);
  const xAt = (i: number) => (i + 0.5) * slot;
  return (
    <>
      <div className="key">
        <span>
          <i style={{ background: "var(--accent)" }} />
          Issues
        </span>
        <span>
          <i style={{ background: PR_FILL }} />
          PRs
        </span>
        <span>
          <i className="line" style={{ background: "var(--warn)" }} />
          Share labeled duplicate
        </span>
      </div>
      <svg className="weekly" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="New issues and PRs per week, with the share labeled duplicate">
        {weeks.map((w, i) => (
          <g key={w.start}>
            <title>{`Week from ${shortDate(w.start)}: ${w.issues} issues, ${w.prs} PRs, ${w.dups} duplicates (${pct(w.dups, w.issues + w.prs)}); ${w.closedIssues} issues closed, ${w.merged} PRs merged`}</title>
            <rect x={xAt(i) - bw / 2} y={y(w.issues + w.prs)} width={bw} height={y(w.issues) - y(w.issues + w.prs)} fill={PR_FILL} />
            <rect x={xAt(i) - bw / 2} y={y(w.issues)} width={bw} height={H - bottom - y(w.issues)} fill="var(--accent)" />
            <text x={xAt(i)} y={H - 6} textAnchor="middle">
              {shortDate(w.start)}
            </text>
          </g>
        ))}
        <polyline points={share.map((p, i) => `${xAt(i).toFixed(1)},${ys(p).toFixed(1)}`).join(" ")} fill="none" stroke="var(--warn)" strokeWidth="2" />
        {share.map((p, i) => (
          <g key={i}>
            <circle cx={xAt(i)} cy={ys(p)} r="3" fill="var(--warn)" />
            <text x={xAt(i)} y={ys(p) - 7} textAnchor="middle" className="share">
              {pct(p, 1)}
            </text>
          </g>
        ))}
      </svg>
    </>
  );
}

/** Items opened vs closed per week as two lines, with the net change under each week. */
function Velocity({ weeks }: { weeks: Stats["weekly"] }) {
  const [kind, setKind] = useState<"issues" | "prs">("issues");
  const rows = weeks.map((w) =>
    kind === "issues" ? { start: w.start, opened: w.issues, closed: w.closedIssues } : { start: w.start, opened: w.prs, closed: w.closedPrs },
  );
  const W = 640;
  const H = 200;
  const top = 14;
  const bottom = 40;
  const slot = W / rows.length;
  const max = Math.max(1, ...rows.flatMap((r) => [r.opened, r.closed]));
  const y = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  const xAt = (i: number) => (i + 0.5) * slot;
  const line = (k: "opened" | "closed") => rows.map((r, i) => `${xAt(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(" ");
  const opened = rows.reduce((a, r) => a + r.opened, 0);
  const closed = rows.reduce((a, r) => a + r.closed, 0);
  const noun = kind === "issues" ? "issues" : "PRs";
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString()}`;
  return (
    <>
      <div className="velocity-head">
        <div className="seg" role="group" aria-label="Issues or PRs">
          {(["issues", "prs"] as const).map((k) => (
            <button key={k} className={cx(kind === k && "on")} onClick={() => setKind(k)}>
              {k === "issues" ? "Issues" : "PRs"}
            </button>
          ))}
        </div>
        <span className="muted">
          12 weeks: {opened.toLocaleString()} {noun} opened, {closed.toLocaleString()} closed ({pct(closed, opened)} of the opening rate),{" "}
          <b className={opened > closed ? "net-up" : "net-down"}>{signed(opened - closed)}</b> open
        </span>
      </div>
      <div className="key">
        <span>
          <i className="line" style={{ background: "var(--accent)" }} />
          Opened
        </span>
        <span>
          <i className="line" style={{ background: "var(--ok)" }} />
          Closed{kind === "prs" ? " (merged or not)" : ""}
        </span>
      </div>
      <svg className="weekly" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${noun} opened and closed per week`}>
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--line-soft)" />
        ))}
        <text x="2" y={y(max) - 3} className="axis">
          {max.toLocaleString()}
        </text>
        <polyline points={line("opened")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <polyline points={line("closed")} fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinejoin="round" />
        {rows.map((r, i) => (
          <g key={r.start}>
            <title>{`Week from ${shortDate(r.start)}: ${r.opened} ${noun} opened, ${r.closed} closed`}</title>
            <rect x={i * slot} y={top} width={slot} height={H - top} fill="transparent" />
            <circle cx={xAt(i)} cy={y(r.opened)} r="3" fill="var(--accent)" />
            <circle cx={xAt(i)} cy={y(r.closed)} r="3" fill="var(--ok)" />
            <text x={xAt(i)} y={H - 24} textAnchor="middle">
              {shortDate(r.start)}
            </text>
            <text x={xAt(i)} y={H - 7} textAnchor="middle" className={r.opened > r.closed ? "net-up" : "net-down"}>
              {signed(r.opened - r.closed)}
            </text>
          </g>
        ))}
      </svg>
    </>
  );
}

export function StatsView() {
  const [days, setDays] = useState(30);
  const { data: st, error } = useStats(days);
  const s = useStore((x) => x);
  const loaded = s.reports.filter((r) => !r.sample).length;
  const groups = s.clusters.filter((c) => c.reportIds.length > 1);
  const grouped = groups.reduce((a, c) => a + c.reportIds.length, 0);
  const biggest = groups.reduce((a, c) => Math.max(a, c.reportIds.length), 0);
  return (
    <section className="view">
      <Head
        title="Stats"
        lede={`Counts over the whole GitHub mirror${st ? ` (${st.mirrored.toLocaleString()} issues and PRs)` : ""}. Duplicates are items alt-glitch labeled duplicate or that were closed as one.`}
      >
        <div className="seg" role="group" aria-label="Time window">
          {WINDOWS.map((d) => (
            <button key={d} className={cx(days === d && "on")} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </Head>
      {!st ? (
        <div className="block">
          <p className="block-lede">{error ? `Can't reach the data server: ${error}` : "Loading…"}</p>
        </div>
      ) : (
        <>
          <div className={cx("block", st.days !== days && "stale")}>
            <h2 className="block-title">Last {st.days} days</h2>
            <p className="block-lede">Labels arrive after items open, so the newest days undercount duplicates.</p>
            <div className="stats">
              <Stat value={pct(st.opened.dupIssues, st.opened.issues)} label={`of ${st.opened.issues.toLocaleString()} new issues are duplicates`} />
              <Stat value={pct(st.opened.dupPrs, st.opened.prs)} label={`of ${st.opened.prs.toLocaleString()} new PRs are duplicates`} />
              <Stat
                value={`${st.opened.issues >= st.closed.issues ? "+" : "−"}${Math.abs(st.opened.issues - st.closed.issues).toLocaleString()}`}
                label={`open issues: ${st.opened.issues.toLocaleString()} opened, ${st.closed.issues.toLocaleString()} closed`}
              />
              <Stat
                value={st.closed.merged.toLocaleString()}
                label={`PRs merged; ${st.closed.unmerged.toLocaleString()} closed with no merge or salvage (${pct(st.closed.merged + st.closed.salvaged, st.closed.merged + st.closed.salvaged + st.closed.unmerged)} of closed PRs shipped)`}
              />
              <Stat value={st.closed.salvaged.toLocaleString()} label="PRs closed unmerged whose work shipped in a salvage PR" />
              <Stat value={fmtHours(st.hours.issueFix)} label="typical time from opening to fixing an issue" />
              <Stat value={fmtHours(st.hours.prMerge)} label="typical time from opening to merging a PR" />
            </div>
          </div>
          <div className={cx("block", st.days !== days && "stale")}>
            <h2 className="block-title">Mean time to fix, by priority</h2>
            <p className="block-lede">
              Issues closed as fixed in the last {st.days} days, from opening to closing, grouped by their current priority label. A few old issues closed at
              once pull the mean up, so the median sits beside it.
            </p>
            <FixTimes rows={st.fixByPrio} />
          </div>
          <div className={cx("block", st.days !== days && "stale")}>
            <h2 className="block-title">Merged by</h2>
            <p className="block-lede">
              Who merged PRs in the last {st.days} days, from GitHub's merged-by field, and closed PRs without merging. Only Nous staff can merge, so
              closes count only for people who have merged a PR. Issues closed are the ones GitHub closed through the merge ("Fixes #N" or a
              linked issue), timed from the issue opening to the merge. Merging isn't the same as writing the fix: the PR's author may be someone else.
              {st.mergeLookup.known < st.mergeLookup.merged &&
                ` Still looking up ${(st.mergeLookup.merged - st.mergeLookup.known).toLocaleString()} of ${st.mergeLookup.merged.toLocaleString()} merges.`}
            </p>
            <Mergers rows={st.mergers} />
          </div>
          <div className="block charts">
            <div>
              <h2 className="block-title">Open issues by priority</h2>
              <Donut
                unit="open issues"
                slices={["P0", "P1", "P2", "P3", "P4", ""].map((p) => ({
                  key: p || "none",
                  label: p ? `${p} · ${PRIO_NAME[p]}` : "No priority yet",
                  value: st.prio[p] ?? 0,
                  color: PRIO_COLOR[p],
                }))}
              />
            </div>
            <div>
              <h2 className="block-title">Open issues by type</h2>
              <Donut
                unit="open issues"
                slices={Object.entries(st.kind)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v], i) => ({ key: k || "none", label: k ? kindName(k) : "No type yet", value: v, color: k ? PALETTE[i % PALETTE.length] : "var(--line)" }))}
              />
            </div>
          </div>
          <div className="block">
            <h2 className="block-title">New issues and PRs per week</h2>
            <p className="block-lede">The last 12 weeks, whatever the window above. Hover a week for closed and merged counts.</p>
            <Weekly weeks={st.weekly} />
          </div>
          <div className="block">
            <h2 className="block-title">Opened vs closed per week</h2>
            <p className="block-lede">When the closed line sits below the opened line, the backlog is growing. The number under each week is the change in open items.</p>
            <Velocity weeks={st.weekly} />
          </div>
          <div className="block charts">
            <div>
              <h2 className="block-title">Open issues and PRs by component</h2>
              <Bars rows={st.comp.map(([c, n]) => [c ? compName(c) : "No component yet", n])} />
            </div>
            <div>
              <h2 className="block-title">How long open issues have waited</h2>
              <Bars rows={st.age} />
            </div>
          </div>
        </>
      )}
      <div className="block">
        <h2 className="block-title">Similar reports</h2>
        <p className="block-lede">This dashboard's own grouping of open items from the last {DAYS} days, before anyone labels them.</p>
        <div className="stats">
          <Stat value={pct(grouped, loaded)} label={`of ${loaded.toLocaleString()} open items look like at least one other open item`} />
          <Stat value={groups.length.toLocaleString()} label="groups of similar reports" />
          <Stat value={biggest.toLocaleString()} label="items in the largest group" />
        </div>
      </div>
    </section>
  );
}
