import { useSyncExternalStore } from "react";
import { DEFAULT_RULES, clusterReports, evaluate, pairKey, rank, reconcile } from "./engine";
import { SCENARIO } from "./sim";
import type { Closable, Cluster, FeedEntry, Incident, IncidentTab, Meta, Report, Rule, RuleId, SeedRow, Source, View } from "./types";

const LEVEL_NAME = { watch: "Watching", warn: "Warning", urgent: "Urgent" } as const;

const params = new URLSearchParams(location.search);
/** `?sim` adds simulated reports for trying out the alert rules. Off by default. */
export const SIM = params.has("sim");
/** Open items opened in the last `?days=` days are loaded (default 14, server caps at 90). */
export const DAYS = Number(params.get("days")) || 14;
/** The first load fetches this many newest days, so the page fills in, then the rest of `DAYS`. */
const FIRST_DAYS = 2;
const POLL_MS = 60_000;

export interface State {
  reports: Report[];
  byId: Map<string, Report>;
  clusters: Cluster[];
  clusterById: Map<string, Cluster>;
  clusterOf: Map<string, string>;
  incidents: Incident[];
  rules: Rule[];
  clusterThreshold: number;
  /** pairKeys of reports the model check judged to have different causes; never grouped on keywords. */
  apart: Set<string>;
  live: boolean;
  simIndex: number;
  now: number;
  feed: FeedEntry[];
  view: View;
  selected: string | null;
  query: string;
  source: "all" | Source;
  /** Label filter on All reports; a report must carry every one. */
  tags: string[];
  includeClosed: boolean;
  incidentTab: IncidentTab;
  meta: Meta | null;
  closable: Closable[];
  loaded: boolean;
  /** False until the whole `DAYS` window has arrived; the first load comes in two parts. */
  complete: boolean;
  loadError: string | null;
}

const toReport = (s: SeedRow): Report => ({
  ...s,
  id: `gh#${s.number}`,
  source: "github",
  createdAt: Date.parse(s.createdAt),
  sample: false,
});

// Grouping compares keywords across every loaded report, so it only reruns when the reports, the
// threshold or the model check's verdicts change, not on every clock tick.
let memo: {
  reports: Report[];
  threshold: number;
  apart: Set<string>;
  byId: Map<string, Report>;
  clusters: Cluster[];
  clusterById: Map<string, Cluster>;
  clusterOf: Map<string, string>;
} | null = null;

function derive(s: State): State {
  if (!memo || memo.reports !== s.reports || memo.threshold !== s.clusterThreshold || memo.apart !== s.apart) {
    const clusters = clusterReports(s.reports, s.clusterThreshold, s.apart);
    const clusterOf = new Map<string, string>();
    clusters.forEach((c) => c.reportIds.forEach((id) => clusterOf.set(id, c.id)));
    memo = {
      reports: s.reports,
      threshold: s.clusterThreshold,
      apart: s.apart,
      byId: new Map(s.reports.map((r) => [r.id, r])),
      clusters,
      clusterById: new Map(clusters.map((c) => [c.id, c])),
      clusterOf,
    };
  }
  const { byId, clusters, clusterById, clusterOf } = memo;
  const incidents = reconcile(s.incidents, clusters, evaluate(byId, clusters, s.rules, s.now), byId, s.now);
  return { ...s, byId, clusters, clusterById, clusterOf, incidents };
}

/** Adds feed entries for incidents that opened, re-opened or escalated in this update. */
function withAlerts(prev: State, next: State): State {
  const before = new Map(prev.incidents.map((i) => [i.id, i]));
  const texts: string[] = [];
  for (const i of next.incidents) {
    const b = before.get(i.id);
    if (!b) texts.push(`New alert (${LEVEL_NAME[i.level]}): ${i.headline}`);
    else if (b.status !== "open" && i.status === "open") texts.push(`Re-opened (${LEVEL_NAME[i.level]}): ${i.headline}`);
    else if (rank(i.level) > rank(b.level)) texts.push(`Raised to ${LEVEL_NAME[i.level]}: ${i.headline}`);
  }
  if (!texts.length) return next;
  const alerts = texts.map((text): FeedEntry => ({ at: next.now, text, kind: "alert" }));
  return { ...next, feed: [...alerts, ...next.feed].slice(0, 60) };
}

let state: State = derive({
  reports: [],
  byId: new Map(),
  clusters: [],
  clusterById: new Map(),
  clusterOf: new Map(),
  incidents: [],
  rules: DEFAULT_RULES,
  clusterThreshold: 0.5,
  apart: new Set(),
  live: SIM,
  simIndex: 0,
  now: Date.now(),
  feed: [],
  view: "incidents",
  selected: null,
  query: "",
  source: "all",
  tags: [],
  includeClosed: false,
  incidentTab: "open",
  meta: null,
  closable: [],
  loaded: false,
  complete: false,
  loadError: null,
});

const listeners = new Set<() => void>();

/** `alert` is false for the first load, so existing problems don't all arrive as new alerts. */
function set(patch: Partial<State>, recompute = false, alert = true) {
  const next = { ...state, ...patch };
  state = recompute ? (alert ? withAlerts(state, derive(next)) : derive(next)) : next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getState = () => state;

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

function patchIncident(id: string, f: (i: Incident) => Incident) {
  set({ incidents: state.incidents.map((i) => (i.id === id ? f(i) : i)) });
}

type Payload = { reports: SeedRow[]; closable?: Closable[]; apart?: [number, number][]; meta: Meta };

async function fetchReports(query: string): Promise<Payload> {
  const res = await fetch(`/api/reports?${query}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Payload;
}

/**
 * Replaces the real reports with `fresh`; simulated reports are kept. New reports and alerts only
 * reach the feed once the whole window has loaded before, so the first load doesn't announce them.
 */
function apply(data: Payload, fresh: Report[], complete: boolean) {
  const known = new Set(state.reports.map((r) => r.id));
  const now = Date.now();
  const added = state.complete ? fresh.filter((r) => !known.has(r.id)) : [];
  const entries = added.slice(0, 20).map((r): FeedEntry => ({ at: now, text: `New report on GitHub: ${r.title}`, kind: "report" }));
  set(
    {
      reports: [...state.reports.filter((r) => r.sample), ...fresh],
      apart: new Set((data.apart ?? []).map(([a, b]) => pairKey(a, b))),
      meta: data.meta,
      closable: data.closable ?? [],
      loaded: true,
      complete,
      loadError: null,
      now,
      feed: [...entries, ...state.feed].slice(0, 60),
    },
    true,
    state.complete,
  );
}

/** The first load fetches the newest days, then everything older; later reloads fetch it all at once. */
async function loadReports() {
  try {
    if (!state.loaded && DAYS > FIRST_DAYS) {
      // both requests start now; the newest days are shown while the rest is still arriving
      const older = fetchReports(`days=${DAYS}&skip=${FIRST_DAYS}`);
      older.catch(() => {}); // a failure is reported when awaited below, not as an unhandled rejection
      const first = await fetchReports(`days=${FIRST_DAYS}`);
      const newest = first.reports.map(toReport);
      apply(first, newest, false);
      const rest = await older;
      const have = new Set(newest.map((r) => r.id));
      apply(rest, [...newest, ...rest.reports.map(toReport).filter((r) => !have.has(r.id))], true);
    } else {
      const data = await fetchReports(`days=${DAYS}`);
      apply(data, data.reports.map(toReport), true);
    }
  } catch (e) {
    set({ loadError: e instanceof Error ? e.message : String(e) });
  }
}

export const actions = {
  view: (view: View) => set({ view, selected: null }),
  select: (selected: string | null) => set({ selected }),
  query: (query: string) => set({ query }),
  source: (source: "all" | Source) => set({ source }),
  tag: (t: string) => set({ tags: state.tags.includes(t) ? state.tags.filter((x) => x !== t) : [...state.tags, t] }),
  clearTags: () => set({ tags: [] }),
  includeClosed: (includeClosed: boolean) => set({ includeClosed }),
  incidentTab: (incidentTab: IncidentTab) => set({ incidentTab }),
  toggleLive: () => set({ live: !state.live }),
  ack: (id: string) =>
    patchIncident(id, (i) =>
      i.status !== "open"
        ? i
        : {
            ...i,
            status: "acked",
            countAtAck: i.reportIds.length,
            log: [...i.log, { at: Date.now(), text: `Acknowledged at ${i.reportIds.length} reports; silenced until more arrive or it gets worse` }],
          },
    ),
  resolve: (id: string) =>
    patchIncident(id, (i) =>
      i.status === "resolved"
        ? i
        : { ...i, status: "resolved", countAtAck: i.reportIds.length, log: [...i.log, { at: Date.now(), text: "Resolved" }] },
    ),
  setRule: (id: RuleId, enabled: boolean) =>
    set({ rules: state.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) }, true),
  setParam: (id: RuleId, key: string, value: number) =>
    set({ rules: state.rules.map((r) => (r.id === id ? { ...r, params: { ...r.params, [key]: value } } : r)) }, true),
  setThreshold: (clusterThreshold: number) => set({ clusterThreshold }, true),
  injectNext() {
    const i = state.simIndex;
    const t = SCENARIO[i % SCENARIO.length];
    const cycle = Math.floor(i / SCENARIO.length);
    const now = Date.now();
    const report: Report = {
      id: `sample-${i + 1}`,
      source: t.source,
      url: "",
      title: t.title,
      author: cycle ? `${t.author}-${cycle + 1}` : t.author,
      createdAt: now,
      isPr: false,
      state: "issue_open",
      problem: t.problem,
      dupQuery: t.dup,
      labels: {},
      sample: true,
    };
    const entry: FeedEntry = { at: now, text: `New report on ${t.source === "github" ? "GitHub" : "Discord"}: ${t.title}`, kind: "report" };
    set({ reports: [report, ...state.reports], simIndex: i + 1, now, feed: [entry, ...state.feed].slice(0, 60) }, true);
  },
};

/**
 * One-second clock for ages and time windows. Reloads the mirror every minute; with `?sim`, also
 * injects a sample report every `?tick=` ms (default 6000) while live.
 */
export function startClock() {
  const tickMs = Number(params.get("tick")) || 6000;
  let last = Date.now();
  void loadReports();
  setInterval(() => void loadReports(), POLL_MS);
  setInterval(() => {
    if (SIM && state.live && Date.now() - last >= tickMs) {
      last = Date.now();
      actions.injectNext();
    } else {
      set({ now: Date.now() }, true);
    }
  }, 1000);
}
