// Clustering, circuit breakers and incident reconciliation. Pure functions: code decides alert
// levels; the model only supplies problem statements and duplicate keywords.
import type { Cluster, Incident, Level, Reason, Report, Rule, RuleId } from "./types";

export const LEVELS: Level[] = ["watch", "warn", "urgent"];
export const rank = (l: Level) => LEVELS.indexOf(l);
const bump = (l: Level): Level => LEVELS[Math.min(rank(l) + 1, LEVELS.length - 1)];
const maxLevel = (ls: Level[]): Level => ls.reduce((a, b) => (rank(b) > rank(a) ? b : a), "watch");
const LEVEL_WORD: Record<Level, string> = { watch: "watching", warn: "a warning", urgent: "urgent" };
const span = (min: number) => (min % 60 === 0 ? `${min / 60} hour${min === 60 ? "" : "s"}` : `${min} minutes`);

export const DEFAULT_RULES: Rule[] = [
  {
    id: "passthrough",
    name: "Follow alt-glitch's priority",
    description: "Repeats alt-glitch's rating: P0 → urgent, P1 → warn. Never overrides it.",
    enabled: true,
    params: {},
  },
  {
    id: "spike",
    name: "Several people at once",
    description: "Distinct people opening issues or PRs on the same problem inside the window.",
    enabled: true,
    params: { windowMin: 120, warnAt: 3, urgentAt: 5 },
  },
  {
    id: "release",
    name: "Same version mentioned",
    description: "Several reports on the same problem name the same version.",
    enabled: true,
    params: { windowHours: 24, minReports: 2 },
  },
  {
    id: "crossSource",
    name: "Seen on GitHub and Discord",
    description: "Raises a firing alert one level when the problem shows up on both GitHub and Discord.",
    enabled: true,
    params: {},
  },
];

export const PARAM_LABELS: Record<string, string> = {
  windowMin: "window (min)",
  warnAt: "warn at",
  urgentAt: "urgent at",
  windowHours: "window (h)",
  minReports: "min reports",
};

const VERSION = /\bv?(\d+\.\d+\.\d+)\b/;
const STOP = new Set(["the", "and", "for", "with", "from", "not", "when", "after", "hermes", "agent"]);

const isOpen = (r: Report) => r.sample || r.state === "issue_open" || r.state === "pr_open";
/** Open issues and simulated reports can raise alerts; closed items only give context. */
export const isActive = (r: Report) => !r.isPr && isOpen(r);

// Code names so common that sharing them says nothing about the cause.
const COMMON_CODE = new Set(["config.yaml", "sys.executable", "sys.path", "os.environ", "os.getcwd", "site-packages", "__init__", "main"]);

/**
 * Keywords with paths and hyphenated phrases split, edge punctuation and `.py` dropped, so
 * `cron/scheduler.py` matches `scheduler` and `unable-to-run-program-bzip2` matches the plain words.
 */
const tokens = (r: Report) =>
  new Set(
    r.dupQuery
      .toLowerCase()
      .split(/[^a-z0-9_.]+/)
      .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, "").replace(/\.py$/, ""))
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  );
/** A function, module or config key: letters joined by `_` or `.`, not a version number. */
const isCode = (t: string) => /[a-z0-9][_.][a-z0-9_]/.test(t) && !/^v?\d/.test(t) && !COMMON_CODE.has(t);
/**
 * How much lower the threshold goes for 0, 1, 2 and 3+ shared uncommon code locations: a shared
 * function name raises the odds of a shared cause at any overlap (judged pairs, 14-day window). Two
 * reports that each name code but share none point at different causes, so general words ("cron",
 * "PYTHONPATH", the error text) can't group them on their own.
 */
const CODE_DISCOUNT = [0, 0.1, 0.15, 0.2];
/**
 * Code names in more reports than this are hubs (`context_compressor`, `kanban_db`): sharing two of
 * them says the reports touch the same file, not that they share a cause, so they don't count toward
 * CODE_DISCOUNT. Picked on the 14-day window, where 10 split the catch-all groups and kept every
 * hand-checked issue/fix pair together.
 */
const MAX_CODE_REPORTS = 10;

/**
 * Calls `each` for every pair of reports (indexes into `sorted`) whose duplicate keywords overlap
 * enough: Jaccard ≥ threshold, less CODE_DISCOUNT for shared uncommon code. Each keyword weighs
 * log(reports / reports using it), so "gateway" or "windows" counts for little and a specific error
 * or function name for a lot. Overlap doesn't count between two reports that name different code
 * and none in common. Only reports sharing a keyword can overlap, so each report is compared with
 * the others listed under its keywords rather than with every report.
 * `strength` is the overlap plus the discount, so stronger matches can be applied first.
 */
function keywordPairs(sorted: Report[], threshold: number, each: (i: number, j: number, strength: number) => void) {
  const toks = sorted.map(tokens);
  const hasCode = toks.map((ts) => [...ts].some(isCode));
  const postings = new Map<string, number[]>();
  toks.forEach((ts, i) => ts.forEach((t) => (postings.get(t) ?? postings.set(t, []).get(t)!).push(i)));
  const weight = (t: string) => Math.log(sorted.length / postings.get(t)!.length);
  const mass = toks.map((ts) => [...ts].reduce((sum, t) => sum + weight(t), 0));
  for (let i = 0; i < sorted.length; i++) {
    const candidates = new Set<number>();
    toks[i].forEach((t) => postings.get(t)!.forEach((j) => j > i && candidates.add(j)));
    for (const j of candidates) {
      let inter = 0;
      let code = 0;
      let rare = 0;
      toks[i].forEach((t) => {
        if (!toks[j].has(t)) return;
        inter += weight(t);
        if (!isCode(t)) return;
        code++;
        if (postings.get(t)!.length <= MAX_CODE_REPORTS) rare++;
      });
      const union = mass[i] + mass[j] - inter;
      const apart = hasCode[i] && hasCode[j] && code === 0;
      const overlap = union ? inter / union : 0;
      const discount = CODE_DISCOUNT[Math.min(rare, 3)];
      if (!apart && overlap >= threshold - discount) each(i, j, overlap + discount);
    }
  }
}

const byAge = (reports: Report[]) => [...reports].sort((a, b) => a.createdAt - b.createdAt);

/** Key for a pair of GitHub numbers, lower first, as scripts/check_pairs.py stores them. */
export const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** GitHub numbers of the report pairs whose keywords overlap enough to group at `threshold`. */
export function keywordMatches(reports: Report[], threshold: number): [number, number][] {
  const sorted = byAge(reports);
  const out: [number, number][] = [];
  keywordPairs(sorted, threshold, (i, j) => {
    const a = sorted[i].number, b = sorted[j].number;
    if (a !== undefined && b !== undefined) out.push([a, b]);
  });
  return out;
}

/**
 * Groups each PR with the open issues it says it fixes, then reports whose keywords overlap (see
 * keywordPairs). `apart` holds pairKeys the model check judged to have different causes, and no
 * keyword match may put such a pair in one group, even through a chain of other reports: matches
 * are applied strongest first, and one that would merge two groups holding an apart pair is
 * skipped. A "Fixes #N" link is applied before any match and always joins. A cluster's id is its
 * earliest report's id.
 */
export function clusterReports(reports: Report[], threshold: number, apart: ReadonlySet<string> = new Set()): Cluster[] {
  const sorted = byAge(reports);
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // Per group root: its members, and the reports any member was judged apart from.
  const members = sorted.map((_, i) => [i]);
  const banned = sorted.map(() => new Set<number>());
  const at = new Map(sorted.map((r, i) => [r.number, i]));
  apart.forEach((k) => {
    const [a, b] = k.split("-").map((n) => at.get(Number(n)));
    if (a !== undefined && b !== undefined) banned[a].add(b), banned[b].add(a);
  });
  const join = (i: number, j: number, force: boolean) => {
    let a = find(i), b = find(j);
    if (a === b) return;
    if (members[a].length < members[b].length) [a, b] = [b, a];
    if (!force && members[b].some((m) => banned[a].has(m))) return;
    const [keep, drop] = a < b ? [a, b] : [b, a];
    parent[drop] = keep;
    const [big, small] = members[a].length >= members[b].length ? [a, b] : [b, a];
    members[small].forEach((m) => members[big].push(m));
    banned[small].forEach((m) => banned[big].add(m));
    [members[keep], members[drop]] = [members[big], []];
    [banned[keep], banned[drop]] = [banned[big], new Set()];
  };
  sorted.forEach((r, i) =>
    r.fixes?.forEach((n) => {
      const j = at.get(n);
      if (j !== undefined) join(i, j, true);
    }),
  );
  const edges: [number, number, number][] = [];
  keywordPairs(sorted, threshold, (i, j, strength) => edges.push([i, j, strength]));
  edges.sort((x, y) => y[2] - x[2] || x[0] - y[0] || x[1] - y[1]);
  edges.forEach(([i, j]) => join(i, j, false));
  const groups = new Map<number, Report[]>();
  sorted.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });
  return [...groups.entries()].map(([root, rs]) => ({
    id: sorted[root].id,
    reportIds: rs.map((r) => r.id),
    headline: rs[0].problem,
    comp: rs.find((r) => r.labels.comp)?.labels.comp,
    lastAt: Math.max(...rs.map((r) => r.createdAt)),
  }));
}

export interface Verdict {
  level: Level;
  reasons: Reason[];
}

export function evaluate(byId: Map<string, Report>, clusters: Cluster[], rules: Rule[], now: number): Map<string, Verdict> {
  const rule = (id: RuleId) => rules.find((r) => r.id === id && r.enabled);
  const out = new Map<string, Verdict>();
  for (const c of clusters) {
    // Open PRs count toward the spike rule only, since people often push a fix without filing an issue.
    const open = c.reportIds.map((id) => byId.get(id)!).filter(isOpen);
    if (!open.length) continue;
    const rs = open.filter(isActive);
    const reasons: Reason[] = [];

    if (rule("passthrough")) {
      for (const [prio, level] of [["P0", "urgent"], ["P1", "warn"]] as const) {
        const hits = rs.filter((r) => r.labels.prio === prio);
        if (hits.length) {
          reasons.push({ rule: "passthrough", level, text: `alt-glitch rated it ${prio} (${prio === "P0" ? "critical" : "high"})`, evidence: hits.map((r) => r.id) });
          break;
        }
      }
    }

    const spike = rule("spike");
    if (spike) {
      const recent = open.filter((r) => r.createdAt >= now - spike.params.windowMin * 60_000);
      const n = new Set(recent.map((r) => r.author)).size;
      if (n >= spike.params.warnAt) {
        reasons.push({
          rule: "spike",
          level: n >= spike.params.urgentAt ? "urgent" : "warn",
          text: `${n} different people opened issues or PRs about it in the last ${span(spike.params.windowMin)}`,
          evidence: recent.map((r) => r.id),
        });
      }
    }

    const release = rule("release");
    if (release) {
      const byVersion = new Map<string, Report[]>();
      for (const r of rs) {
        if (r.createdAt < now - release.params.windowHours * 3_600_000) continue;
        const v = `${r.title} ${r.problem}`.match(VERSION)?.[1];
        if (v) byVersion.set(v, [...(byVersion.get(v) ?? []), r]);
      }
      for (const [v, hits] of byVersion) {
        if (hits.length >= release.params.minReports) {
          reasons.push({ rule: "release", level: "watch", text: `${hits.length} reports mention version ${v}`, evidence: hits.map((r) => r.id) });
        }
      }
    }

    if (!reasons.length) continue;
    let level = maxLevel(reasons.map((r) => r.level));
    if (rule("crossSource") && new Set(rs.map((r) => r.source)).size > 1) {
      level = bump(level);
      reasons.push({ rule: "crossSource", level, text: "Reported on both GitHub and Discord", evidence: rs.map((r) => r.id) });
    }
    out.set(c.id, { level, reasons });
  }
  return out;
}

/**
 * Carries incident state across re-evaluations. Acked or resolved incidents stay quiet until
 * the problem gains reports or escalates, so each incident alerts once.
 */
export function reconcile(
  prev: Incident[],
  clusters: Cluster[],
  verdicts: Map<string, Verdict>,
  byId: Map<string, Report>,
  now: number,
): Incident[] {
  const old = new Map(prev.map((i) => [i.clusterId, i]));
  const seen = new Set<string>();
  const next: Incident[] = [];
  for (const c of clusters) {
    const v = verdicts.get(c.id);
    const o = old.get(c.id);
    if (o) seen.add(c.id);
    if (!v) {
      if (o) next.push(o.firing ? { ...o, firing: false, log: [...o.log, { at: now, text: "Rules stopped firing" }] } : o);
      continue;
    }
    if (!o) {
      const evidenceTimes = v.reasons.flatMap((r) => r.evidence).map((id) => byId.get(id)!.createdAt);
      next.push({
        id: `inc-${c.id}`,
        clusterId: c.id,
        headline: c.headline,
        level: v.level,
        status: "open",
        firing: true,
        reasons: v.reasons,
        reportIds: c.reportIds,
        firstAt: Math.min(...evidenceTimes),
        lastAt: c.lastAt,
        log: [{ at: now, text: `Opened as ${LEVEL_WORD[v.level]}: ${v.reasons.map((r) => r.text).join("; ")}` }],
      });
      continue;
    }
    const log = [...o.log];
    const escalated = rank(v.level) > rank(o.level);
    const grew = o.countAtAck !== undefined && c.reportIds.length > o.countAtAck;
    let status = o.status;
    if (status !== "open" && (escalated || grew)) {
      status = "open";
      log.push({ at: now, text: escalated ? `Re-opened: now ${LEVEL_WORD[v.level]}` : `Re-opened: grew from ${o.countAtAck} to ${c.reportIds.length} reports` });
    } else if (escalated) {
      log.push({ at: now, text: `Raised to ${LEVEL_WORD[v.level]}` });
    } else if (!o.firing) {
      log.push({ at: now, text: "Rules firing again" });
    }
    next.push({ ...o, headline: c.headline, level: v.level, status, firing: true, reasons: v.reasons, reportIds: c.reportIds, lastAt: c.lastAt, log });
  }
  // Incidents whose cluster dissolved (for example after a threshold change) stay as history.
  for (const i of prev) if (!seen.has(i.clusterId)) next.push(i.firing ? { ...i, firing: false } : i);
  return next;
}
