export type Source = "github" | "discord";
export type Level = "watch" | "warn" | "urgent";
export type IncidentStatus = "open" | "acked" | "resolved";
export type IncidentTab = IncidentStatus | "all";
export type View = "incidents" | "reports" | "clusters" | "breakers" | "pipeline" | "stats" | "advisories";
export type RuleId = "passthrough" | "spike" | "release" | "crossSource";

/** Labels applied by alt-glitch. We only read these, never set them. */
export interface Labels {
  kind?: string;
  comp?: string;
  prio?: string;
  by?: string;
  delayMin?: number;
}

/** One end of a salvage: a PR that carried work on, or the PR it carried on. */
export interface SalvageLink {
  number: number;
  author: string;
  state: "open" | "merged" | "closed";
}

/** A Nous staff member active on an item, so it's probably theirs. Counts cover the item's last 100 comments, reviews, commits and force-pushes. */
export interface Owner {
  login: string;
  opened?: boolean;
  assigned?: boolean;
  comments?: number;
  reviews?: number;
  commits?: number;
  pushes?: number;
  /** Open PRs by this person that say they fix or salvage the item. */
  prs?: number[];
  /** Newest comment, review, commit or push. */
  lastAt?: string;
}

export interface Report {
  id: string;
  source: Source;
  number?: number;
  url: string;
  title: string;
  author: string;
  createdAt: number;
  isPr: boolean;
  state: string;
  problem: string;
  dupQuery: string;
  labels: Labels;
  sample: boolean;
  /** Every GitHub label on the item, as alt-glitch applied it. */
  tags?: string[];
  /** False while the model hasn't summarized it yet; `problem` is then the title. */
  summarized?: boolean;
  draft?: boolean;
  /** PRs this PR names as salvaged, and PRs that name this one. */
  salvages?: SalvageLink[];
  salvagedBy?: SalvageLink[];
  /** For a PR, the issues its text says it fixes ("Fixes #N"). */
  fixes?: number[];
  owners?: Owner[];
  /** False until the sync has read who is active on it. */
  ownersChecked?: boolean;
}

export interface SeedRow {
  number: number;
  url: string;
  title: string;
  author: string;
  createdAt: string;
  isPr: boolean;
  state: string;
  problem: string;
  dupQuery: string;
  labels: Labels;
  tags?: string[];
  summarized?: boolean;
  draft?: boolean;
  salvages?: SalvageLink[];
  salvagedBy?: SalvageLink[];
  owners?: Owner[];
  ownersChecked?: boolean;
}

/** Pipeline stats from /api/reports. */
export interface Meta {
  openTotal: number;
  summarized: number;
  waiting: number;
  failed: number;
  spendUsd: number;
  lastSync: string | null;
}

/** An open PR, of any age, whose work another PR salvaged and merged. */
export interface Closable {
  number: number;
  url: string;
  title: string;
  author: string;
  createdAt: string;
  by: { number: number; author: string; mergedAt: string }[];
}

/** Whole-mirror counts from /api/stats. `opened` and `closed` cover the last `days` days. */
export interface Stats {
  days: number;
  mirrored: number;
  open: { issues: number; prs: number };
  opened: { issues: number; prs: number; dupIssues: number; dupPrs: number };
  /** `salvaged`: closed unmerged PRs whose work merged through a salvage PR; `unmerged` excludes them. */
  closed: { issues: number; merged: number; salvaged: number; unmerged: number };
  prio: Record<string, number>;
  kind: Record<string, number>;
  comp: [string, number][];
  age: [string, number][];
  /** `closedPrs` includes merged PRs. */
  weekly: { start: string; issues: number; prs: number; dups: number; closedIssues: number; closedPrs: number; merged: number }[];
  /** Median hours from opening to a fix (issues closed as completed) or a merge (PRs). */
  hours: { issueFix: number | null; prMerge: number | null };
  /** Issues closed as fixed in the window, by priority label ("" = none), with mean and median hours. */
  fixByPrio: { prio: string; n: number; meanHours: number | null; medianHours: number | null }[];
  /** Everyone who merged a PR in the window, or closed one as staff, most PRs first. */
  mergers: Merger[];
  /** Merged PRs in the window, and how many have their merger looked up yet. */
  mergeLookup: { merged: number; known: number };
}

export interface Merger {
  login: string;
  merged: number;
  /** PRs closed without merging. */
  closed: number;
  /** `merged` + `closed`. */
  prs: number;
  /** Issues GitHub closed through this person's merges, and how many of them were P0 or P1. */
  issues: number;
  urgent: number;
  /** PRs merged per week over the last 12 weeks, oldest first. */
  weeks: number[];
}

export interface Cluster {
  id: string;
  reportIds: string[];
  headline: string;
  comp?: string;
  lastAt: number;
}

export interface Reason {
  rule: RuleId;
  level: Level;
  text: string;
  evidence: string[];
}

export interface Rule {
  id: RuleId;
  name: string;
  description: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface LogEntry {
  at: number;
  text: string;
}

export interface Incident {
  id: string;
  clusterId: string;
  headline: string;
  level: Level;
  status: IncidentStatus;
  firing: boolean;
  reasons: Reason[];
  reportIds: string[];
  firstAt: number;
  lastAt: number;
  countAtAck?: number;
  log: LogEntry[];
}

export interface FeedEntry {
  at: number;
  text: string;
  kind: "alert" | "report";
}

/** An issue or PR that names a GHSA ID. `state` is "merged" for merged PRs. */
export interface AdvisoryItem {
  number: number;
  url: string;
  title: string;
  author: string;
  createdAt: string;
  isPr: boolean;
  draft: boolean;
  state: "open" | "closed" | "merged";
}

/**
 * A GHSA ID named in the repo, or published against hermes-agent (`own`), from /api/advisories.
 * `lookup`: "found" in GitHub's public advisory database, "missing" from it (private or not yet
 * published), or "pending" until the next sync looks it up.
 */
export interface Advisory {
  id: string;
  url: string;
  lookup: "found" | "missing" | "pending";
  severity: "critical" | "high" | "medium" | "low" | null;
  summary: string | null;
  packages: { name: string; ecosystem: string; patched: string[] }[];
  cve: string | null;
  publishedAt: string | null;
  withdrawn: boolean;
  own: boolean;
  /** Newest first. */
  items: AdvisoryItem[];
}
