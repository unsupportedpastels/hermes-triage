import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Detail } from "./detail";
import { SIM, actions, getState, useStore } from "./store";
import type { Level, View } from "./types";
import { Age, Delta, cx } from "./ui";
import { StatsView } from "./stats";
import { AdvisoriesView } from "./advisories";
import { BreakersView, ClustersView, IncidentsView, PipelineView, ReportsView, matchTab } from "./views";

const VIEWS: [View, string][] = [
  ["incidents", "Needs attention"],
  ["reports", "All reports"],
  ["clusters", "Similar reports"],
  ["breakers", "Alert rules"],
  ["pipeline", "Model & data"],
  ["stats", "Stats"],
  ["advisories", "Security advisories"],
];

/** Phones: the first three views get bottom tabs with these shorter labels; the rest go under More. */
const TABS: [View, string][] = [
  ["incidents", "Attention"],
  ["reports", "Reports"],
  ["clusters", "Similar"],
];
const IN_MORE = VIEWS.filter(([id]) => !TABS.some(([t]) => t === id));

const ICON: Record<View | "more", string> = {
  incidents: "M12 3 2 20h20L12 3zM12 10v4M12 17h.01",
  reports: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  clusters: "m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  breakers: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  pipeline: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  stats: "M3 20h18M6 16v-5M11 16V6M16 16v-8",
  advisories: "M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6l-8-3zM9 12l2 2 4-4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

const Icon = ({ name }: { name: View | "more" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICON[name]} />
  </svg>
);

const DAY = 86_400_000;
/** Below this width the detail pane opens over the list instead of beside it (matches styles.css). */
const OVERLAY = "(max-width: 1100px)";

function Health() {
  const s = useStore((x) => x);
  const open = s.incidents.filter((i) => matchTab(i, "open"));
  const n = (l: Level) => open.filter((i) => i.level === l).length;
  const [urgent, warn, watch] = [n("urgent"), n("warn"), n("watch")];
  const parts = [urgent ? `${urgent} urgent` : "", warn ? `${warn} warning${warn > 1 ? "s" : ""}` : "", watch ? `${watch} watching` : ""].filter(Boolean);
  const tone = urgent ? "urgent" : warn ? "warn" : watch ? "watch" : "ok";
  return (
    <button
      className={`health tone-${tone}`}
      onClick={() => {
        actions.view("incidents");
        actions.incidentTab("open");
      }}
    >
      <i className="dot" />
      {parts.length ? parts.join(" · ") : "All clear"}
    </button>
  );
}

/** Sync status, plus the sample-report controls when simulating. Phones show it under More. */
function Sync() {
  const s = useStore((x) => x);
  return (
    <>
      <span className={cx("live", s.meta && !s.loadError && "on")} title="The GitHub mirror syncs every 5 minutes; this page reloads it every minute">
        <i className="dot" />
        {s.loadError ? (
          "Data server unreachable"
        ) : s.meta?.lastSync ? (
          <>
            Synced <Age at={Date.parse(s.meta.lastSync)} now={s.now} />
            {!s.complete && " · loading older reports…"}
          </>
        ) : (
          "Loading…"
        )}
      </span>
      {SIM && (
        <>
          <button className={cx("live", s.live && "on")} onClick={actions.toggleLive} title="Pause or resume sample reports (Space)">
            <i className="dot" />
            {s.live ? "Simulating reports" : "Simulation paused"}
          </button>
          <button className="btn small" onClick={actions.injectNext}>
            Add a sample report
          </button>
        </>
      )}
    </>
  );
}

function TopBar() {
  const s = useStore((x) => x);
  const day = s.reports.filter((r) => r.createdAt >= s.now - DAY).length;
  const prevDay = s.reports.filter((r) => r.createdAt < s.now - DAY && r.createdAt >= s.now - 2 * DAY).length;
  const awaiting = s.reports.filter((r) => !r.labels.by && !r.isPr && (r.sample || r.state === "issue_open")).length;
  const diff = day - prevDay;
  return (
    <header className="top">
      <div className="brand">
        <b>Hermes triage</b>
        <span>NousResearch/hermes-agent</span>
      </div>
      <b className="top-title">{VIEWS.find(([id]) => id === s.view)?.[1]}</b>
      <Health />
      <span className="spacer" />
      <span className="top-stat">
        <b>{day}</b> reports in 24 h <Delta v={diff} title={`${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than the 24 hours before`} />
      </span>
      <span className="top-stat">
        <b>{awaiting}</b> waiting for labels
      </span>
      <Sync />
    </header>
  );
}

function useCounts(): Record<View, number | null> {
  const s = useStore((x) => x);
  return {
    incidents: s.incidents.filter((i) => matchTab(i, "open")).length,
    reports: s.reports.length,
    clusters: s.clusters.filter((c) => c.reportIds.length > 1).length,
    breakers: s.rules.filter((r) => r.enabled).length,
    pipeline: null,
    stats: null,
    advisories: null,
  };
}

function Nav() {
  const s = useStore((x) => x);
  const counts = useCounts();
  return (
    <nav className="nav">
      {VIEWS.map(([id, label], k) => (
        <button key={id} className={cx(s.view === id && "on")} onClick={() => actions.view(id)} title={`Shortcut: ${k + 1}`}>
          <span>{label}</span>
          <span className={cx("count", id === "incidents" && counts.incidents && "hot")}>{counts[id] ?? ""}</span>
        </button>
      ))}
    </nav>
  );
}

/** Phones only (styles.css): a floating bottom bar for the main views, with the rest in a More sheet. */
function TabBar() {
  const view = useStore((s) => s.view);
  const counts = useCounts();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [view]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);
  const inMore = IN_MORE.some(([id]) => id === view);
  return (
    <div className={cx("tabs-m", more && "open")}>
      <div className="scrim" onClick={() => setMore(false)} />
      <div className="sheet" aria-hidden={!more}>
        {IN_MORE.map(([id, label]) => (
          <button key={id} className={cx("sheet-row", view === id && "on")} onClick={() => actions.view(id)} tabIndex={more ? 0 : -1}>
            <Icon name={id} />
            {label}
            <span className="count">{counts[id] == null ? "" : id === "breakers" ? `${counts[id]} on` : counts[id]}</span>
          </button>
        ))}
        <div className="sheet-foot">
          <Sync />
        </div>
      </div>
      <nav className="tabbar" aria-label="Views">
        {TABS.map(([id, label]) => (
          <button key={id} className={cx(view === id && !more && "on")} aria-current={view === id ? "page" : undefined} onClick={() => actions.view(id)}>
            <Icon name={id} />
            <span>{label}</span>
            {id === "incidents" && counts.incidents ? <b className="tab-badge">{counts.incidents}</b> : null}
          </button>
        ))}
        <button className={cx((inMore || more) && "on")} aria-expanded={more} onClick={() => setMore(!more)}>
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

/** Brief notice when an alert opens or gets worse. */
function Toast() {
  const s = useStore((x) => x);
  const last = s.feed[0];
  if (!last || last.kind !== "alert" || s.now - last.at > 5000) return null;
  return (
    <div className="toast" role="status">
      <i className="dot" />
      <span>{last.text}</span>
    </div>
  );
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) {
        if (e.key === "Escape") target.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const sel = getState().selected;
      const rows = [...document.querySelectorAll<HTMLElement>("main [data-id]")];
      const at = rows.findIndex((r) => r.dataset.id === sel);
      if (e.key === "j" || e.key === "k") {
        const next = rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === "j" ? 1 : -1)))];
        if (next) {
          actions.select(next.dataset.id!);
          next.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "a" && sel?.startsWith("inc-")) actions.ack(sel);
      else if (e.key === "r" && sel?.startsWith("inc-")) actions.resolve(sel);
      else if (e.key === "/") {
        e.preventDefault();
        actions.view("reports");
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#search")?.focus());
      } else if (e.key >= "1" && e.key <= String(VIEWS.length)) actions.view(VIEWS[Number(e.key) - 1][0]);
      else if (e.key === " " && SIM) {
        e.preventDefault();
        actions.toggleLive();
      } else if (e.key === "Escape") actions.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * Where the detail pane covers the list, opening it adds a history entry so the phone's back
 * gesture closes it instead of leaving the page. Closing it any other way drops that entry.
 */
function useDetailHistory() {
  const selected = useStore((s) => s.selected);
  const aside = useRef<HTMLElement>(null);
  useEffect(() => {
    aside.current?.scrollTo(0, 0);
    if (selected && !history.state?.detail && matchMedia(OVERLAY).matches) history.pushState({ detail: true }, "");
    else if (!selected && history.state?.detail) history.back();
  }, [selected]);
  useEffect(() => {
    const onPop = () => getState().selected && actions.select(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return { selected, aside };
}

/**
 * On phones the page itself scrolls (not `.main`), so Safari can shrink its own toolbars too.
 * The top bar slides away while the page scrolls down and comes back on any scroll up.
 * Wider screens scroll `.main` instead and ignore `collapsed` (styles.css).
 */
function useCollapsingChrome(view: View) {
  const main = useRef<HTMLElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = chrome.current!;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // small moves add up until they pass the threshold, so a slow drag still counts
      if (y <= height || y - last < -8) setCollapsed(false);
      else if (y - last > 8) setCollapsed(true);
      else return;
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [height]);
  useEffect(() => {
    setCollapsed(false);
    window.scrollTo(0, 0);
  }, [view]);
  return { main, chrome, collapsed, height };
}

export default function App() {
  const view = useStore((s) => s.view);
  const { selected, aside } = useDetailHistory();
  const { main, chrome, collapsed, height } = useCollapsingChrome(view);
  useKeys();
  return (
    <div className={cx("shell", selected && "has-sel", collapsed && "collapsed")} style={{ "--chrome-h": `${height}px` } as CSSProperties}>
      <div className="chrome" ref={chrome}>
        <TopBar />
        <Nav />
      </div>
      <main className="main" ref={main}>
        {view === "incidents" && <IncidentsView />}
        {view === "reports" && <ReportsView />}
        {view === "clusters" && <ClustersView />}
        {view === "breakers" && <BreakersView />}
        {view === "pipeline" && <PipelineView />}
        {view === "stats" && <StatsView />}
        {view === "advisories" && <AdvisoriesView />}
      </main>
      <aside className="detail" ref={aside}>
        {selected && (
          <button className="detail-back" onClick={() => actions.select(null)}>
            ← Back
          </button>
        )}
        <Detail />
      </aside>
      <TabBar />
      <Toast />
    </div>
  );
}
