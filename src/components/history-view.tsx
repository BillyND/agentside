import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { setApp, useApp } from "../store/app-store";
import { attach, resume } from "../lib/actions";
import { ago, dateGroup, dateTime, fullDateTime, matches, shortPath } from "../lib/format";
import { useT } from "../i18n";
import { IconClose } from "./icons";
import { SearchBox } from "./search-box";
import type { HistoryEntry, SessionSummary } from "../types";

const close = () => setApp({ view: "chat" });

/**
 * Chat history as a dialog over the conversation, like the original panel's
 * "Recent tasks": the search box stays put while only the list scrolls.
 */
export const HistoryModal = memo(function HistoryModal() {
  const t = useT();
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const q = query.trim().toLowerCase();
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t("history")}>
        <div className="modal-head">
          <span className="modal-title">{t("history")}</span>
          <button className="icon-btn" title={t("back")} aria-label={t("back")} onClick={close}>
            <IconClose size={14} />
          </button>
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder={t("searchChats")} />
        <div className="modal-list">
          <LiveSessions q={q} />
          <PastSessions q={q} />
        </div>
      </div>
    </div>
  );
});

const LiveSessions = memo(function LiveSessions({ q }: { q: string }) {
  const t = useT();
  // Order by the last message sent, not updatedAt: that moves on every status change and makes rows jump.
  const keys = useApp(
    useShallow((st) =>
      Object.values(st.live)
        .filter((s) => !s.ended && !s.fresh && matches(q, s.title, s.cwd, s.agentName))
        .sort((a, b) => lastActive(b) - lastActive(a))
        .map((s) => s.key),
    ),
  );
  if (!keys.length) return null;
  return (
    <>
      <div className="list-head">{t("running")}</div>
      {keys.map((k) => <LiveItem key={k} sessionKey={k} />)}
    </>
  );
});

const lastActive = (s: SessionSummary) => s.activeAt || s.createdAt || s.updatedAt;

const LiveItem = memo(function LiveItem({ sessionKey }: { sessionKey: string }) {
  const t = useT();
  const s = useApp(
    useShallow((st) => {
      const x = st.live[sessionKey];
      return {
        title: x?.title || t("newChat"),
        cwd: x?.cwd,
        agent: x?.agentName,
        // A resumed chat started before this daemon saw it; history knows when.
        createdAt: x?.createdAt || st.history.find((h) => h.sessionId === x?.sessionId)?.createdAt,
        activeAt: x ? lastActive(x) : undefined,
        tag: x?.pending.length ? t("needsApproval") : x?.busy ? t("working") : "",
        active: st.currentKey === sessionKey,
      };
    }),
  );
  return <Row {...s} live onClick={() => attach(sessionKey)} />;
});

/** Past chats, newest message first, under date headings (Today, Yesterday, …). */
const PastSessions = memo(function PastSessions({ q }: { q: string }) {
  const t = useT();
  const history = useApp((st) => st.history);
  const liveIds = useApp(useShallow((st) => Object.values(st.live).filter((s) => !s.ended && !s.fresh).map((s) => s.sessionId)));
  const groups = useMemo(() => {
    const live = new Set(liveIds);
    const out: { label: string; items: HistoryEntry[] }[] = [];
    for (const x of history) {
      if (live.has(x.sessionId) || !matches(q, x.title, x.cwd, x.agentName)) continue;
      const label = dateGroup(x.updatedAt);
      if (out[out.length - 1]?.label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(x);
    }
    return out;
  }, [history, liveIds, q]);
  if (!groups.length) return liveIds.length ? null : <div className="list-empty">{t("noChats")}</div>;
  return (
    <>
      {groups.map((g) => (
        <Fragment key={g.label}>
          <div className="list-head">{g.label}</div>
          {g.items.map((x) => <PastItem key={`${x.agentId}:${x.sessionId}`} entry={x} />)}
        </Fragment>
      ))}
    </>
  );
});

const PastItem = memo(function PastItem({ entry }: { entry: HistoryEntry }) {
  return (
    <Row
      title={entry.title || entry.sessionId}
      cwd={entry.cwd}
      agent={entry.agentName}
      createdAt={entry.createdAt}
      activeAt={entry.updatedAt}
      onClick={() => resume(entry)}
    />
  );
});

function Row(p: {
  title: string;
  cwd?: string;
  agent?: string;
  createdAt?: number | null;
  activeAt?: number;
  tag?: string;
  active?: boolean;
  live?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const tip = [
    p.createdAt && t("createdAt", { time: fullDateTime(p.createdAt) }),
    p.activeAt && t("lastActive", { time: fullDateTime(p.activeAt) }),
  ].filter(Boolean).join("\n");
  return (
    <button className={`row${p.active ? " active" : ""}`} title={tip} onClick={p.onClick}>
      <span className={`row-dot${p.live ? " live" : ""}`} />
      <span className="row-main">
        <span className="row-title">
          <span>{p.title}</span>
          {p.tag && <span className="tag">{p.tag}</span>}
        </span>
        <span className="row-meta">
          {p.agent && <span className="agent-badge">{p.agent}</span>}
          <span className="row-path">{shortPath(p.cwd)}</span>
          {p.createdAt && <span className="row-created">· {t("createdAt", { time: dateTime(p.createdAt) })}</span>}
        </span>
      </span>
      {p.activeAt && <span className="row-time">{ago(p.activeAt)}</span>}
    </button>
  );
}
