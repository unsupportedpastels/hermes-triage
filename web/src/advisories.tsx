import { useEffect, useState } from "react";
import { useStore } from "./store";
import type { Advisory, AdvisoryItem } from "./types";
import { Age, cx, plural } from "./ui";
import { Head } from "./views";

const POLL_MS = 60_000;
/** Linked issues and PRs shown per advisory before "and N more". */
const SHOW_ITEMS = 5;
const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEV_CLASS: Record<string, string> = { critical: "lvl-urgent", high: "lvl-warn", medium: "lvl-watch", low: "sev-low" };

type Tab = "unresolved" | "fixed" | "own" | "all";
const TABS: [Tab, string][] = [
  ["unresolved", "Unresolved"],
  ["fixed", "Fixed"],
  ["own", "Hermes advisories"],
  ["all", "All"],
];

const merged = (a: Advisory) => a.items.some((i) => i.state === "merged");
const openPrs = (a: Advisory) => a.items.filter((i) => i.isPr && i.state === "open").length;
const openIssues = (a: Advisory) => a.items.filter((i) => !i.isPr && i.state === "open").length;

const matchTab = (a: Advisory, tab: Tab) =>
  tab === "all" ||
  (tab === "own" ? a.own : tab === "fixed" ? merged(a) : !merged(a) && !a.withdrawn && (openPrs(a) > 0 || openIssues(a) > 0));

/** Where an advisory stands, from the issues and PRs that name it. */
function status(a: Advisory): [string, string] {
  if (a.withdrawn) return ["Withdrawn", "st-closed"];
  if (merged(a)) return ["A merged PR names it", "st-fixed"];
  const prs = openPrs(a);
  if (prs) return [prs > 1 ? `${prs} open PRs` : "Open PR", prs > 1 ? "st-dup" : "st-pr"];
  if (openIssues(a)) return ["No PR yet", "st-none"];
  if (a.items.length) return ["Closed without a merge", "st-closed"];
  return ["Published", "st-closed"];
}

const lastMention = (a: Advisory) => (a.items[0] ? Date.parse(a.items[0].createdAt) : a.publishedAt ? Date.parse(a.publishedAt) : 0);

function useAdvisories() {
  const [data, setData] = useState<Advisory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/advisories")
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ advisories: Advisory[] }>;
        })
        .then(
          (d) => {
            if (!live) return;
            setData(d.advisories);
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
  }, []);
  return { data, error };
}

function SeverityBadge({ a }: { a: Advisory }) {
  if (a.severity) return <span className={cx("badge", SEV_CLASS[a.severity])}>{a.severity[0].toUpperCase() + a.severity.slice(1)}</span>;
  return <span className="badge sev-low">{a.lookup === "pending" ? "Looking up" : "Not public"}</span>;
}

const ITEM_STATE: Record<string, string> = { open: "Open", closed: "Closed", merged: "Merged" };

function ItemRow({ i, now }: { i: AdvisoryItem; now: number }) {
  return (
    <li>
      <a className="ref" href={i.url} target="_blank" rel="noreferrer">
        #{i.number}
      </a>
      <span className={`adv-state is-${i.state}`}>
        {ITEM_STATE[i.state]} {i.isPr ? (i.draft && i.state === "open" ? "draft PR" : "PR") : "issue"}
      </span>
      <span className="adv-title" title={i.title}>
        {i.title}
      </span>
      <span className="adv-who">
        {i.author} · <Age at={Date.parse(i.createdAt)} now={now} />
      </span>
    </li>
  );
}

function AdvisoryRow({ a, now }: { a: Advisory; now: number }) {
  const [all, setAll] = useState(false);
  const [label, tone] = status(a);
  const shown = all ? a.items : a.items.slice(0, SHOW_ITEMS);
  return (
    <li className={cx("item static adv", a.withdrawn && "quiet")}>
      <div className="item-top">
        <SeverityBadge a={a} />
        <span className="ref">
          <a href={a.url} target="_blank" rel="noreferrer">
            {a.id}
          </a>
        </span>
        {a.cve && <span>{a.cve}</span>}
        {a.own && <span className="chip">hermes-agent</span>}
        <span className="spacer" />
        <span className={cx("adv-status", tone)}>{label}</span>
      </div>
      <h2 className="item-title clamp">
        {a.summary ??
          (a.lookup === "pending"
            ? "Not looked up yet; the next sync fetches it."
            : "Not in GitHub's public advisory database: a private report or one not published yet.")}
      </h2>
      {a.packages.length > 0 && (
        <p className="adv-pkgs">
          {a.packages.map((p, k) => (
            <span key={`${p.ecosystem}/${p.name}`}>
              {k > 0 && " · "}
              <b>{p.name}</b> ({p.ecosystem}){p.patched.length ? `, fixed in ${p.patched.join(", ")}` : ", no fixed version"}
            </span>
          ))}
        </p>
      )}
      {a.items.length > 0 && (
        <ul className="adv-items">
          {shown.map((i) => (
            <ItemRow key={i.number} i={i} now={now} />
          ))}
          {a.items.length > SHOW_ITEMS && (
            <li>
              <button className="adv-more" onClick={() => setAll(!all)}>
                {all ? "Show fewer" : `and ${a.items.length - SHOW_ITEMS} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function AdvisoriesView() {
  const { data, error } = useAdvisories();
  const now = useStore((s) => s.now);
  const [tab, setTab] = useState<Tab>("unresolved");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = (data ?? [])
    .filter((a) => matchTab(a, tab))
    .filter(
      (a) =>
        !q ||
        [a.id, a.cve ?? "", a.summary ?? "", ...a.packages.map((p) => p.name), ...a.items.map((i) => `#${i.number} ${i.title} ${i.author}`)]
          .join(" ")
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => (SEV_RANK[b.severity ?? ""] ?? 0) - (SEV_RANK[a.severity ?? ""] ?? 0) || lastMention(b) - lastMention(a));
  const dupes = (data ?? []).filter((a) => matchTab(a, "unresolved") && openPrs(a) > 1).length;
  return (
    <section className="view">
      <Head
        title="Security advisories"
        lede={
          <>
            Every GHSA ID an issue or PR names, with severity and packages from GitHub's advisory database, plus advisories published against
            hermes-agent. Unresolved means an open issue or PR names it and no merged PR does yet. A merged PR naming an advisory usually fixes it, but
            check the PR.
            {dupes > 0 && ` ${plural(dupes, "unresolved advisory has", "unresolved advisories have")} more than one open PR.`}
          </>
        }
      >
        <input id="search" type="search" placeholder="Search IDs, packages, PRs" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="seg" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={cx(tab === id && "on")} onClick={() => setTab(id)}>
              {label} <span className="count">{data ? data.filter((a) => matchTab(a, id)).length : ""}</span>
            </button>
          ))}
        </div>
      </Head>
      {!data ? (
        <div className="empty">
          <b>{error ? "Can't reach the data server" : "Loading…"}</b>
          {error && <p>{error}</p>}
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <b>{q ? "No advisories match" : "Nothing here"}</b>
        </div>
      ) : (
        <ul className="list">
          {list.map((a) => (
            <AdvisoryRow key={a.id} a={a} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
