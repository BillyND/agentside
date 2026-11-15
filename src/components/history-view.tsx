import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { setApp, useApp } from "../store/app-store";
import { attach, resume } from "../lib/actions";
import { ago, shortPath } from "../lib/format";
import { useT } from "../i18n";
import { IconClose, IconSearch } from "./icons";
import type { HistoryEntry } from "../types";

const close = () => setApp({ view: "chat" });

/**
 * Chat history as a dialog over the conversation, like the original panel's
 * "Recent tasks": the search box stays put while only the list scrolls.
 */
export const HistoryModal = memo(function HistoryModal() {
  const t = useT();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
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
        <label className="search">
          <IconSearch />
          <input ref={input} type="search" placeholder={t("searchChats")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="modal-list">
          <LiveSessions q={q} />
          <PastSessions q={q} />
        </div>
      </div>
    </div>
  );
});

const matches = (q: string, ...parts: (string | null | undefined)[]) => !q || parts.some((p) => p && p.toLowerCase().includes(q));

const LiveSessions = memo(function LiveSessions({ q }: { q: string }) {
  const t = useT();
  const keys = useApp(
    useShallow((st) =>
      Object.values(st.live)
        .filter((s) => !s.ended && !s.fresh && matches(q, s.title, s.cwd, s.agentName))
        .sort((a, b) => b.updatedAt - a.updatedAt)
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

const LiveItem = memo(function LiveItem({ sessionKey }: { sessionKey: string }) {
  const t = useT();
  const s = useApp(
    useShallow((st) => {
      const x = st.live[sessionKey];
      return {
        title: x?.title || t("newChat"),
        cwd: x?.cwd,
        agent: x?.agentName,
        updatedAt: x?.updatedAt,
        tag: x?.pending.length ? t("needsApproval") : x?.busy ? t("working") : "",
        active: st.currentKey === sessionKey,
      };
    }),
  );
  return <Row {...s} live onClick={() => attach(sessionKey)} />;
});

const PastSessions = memo(function PastSessions({ q }: { q: string }) {
  const t = useT();
  const history = useApp((st) => st.history);
  const liveIds = useApp(useShallow((st) => Object.values(st.live).filter((s) => !s.ended && !s.fresh).map((s) => s.sessionId)));
  const list = useMemo(() => {
    const live = new Set(liveIds);
    return history.filter((x) => !live.has(x.sessionId) && matches(q, x.title, x.cwd, x.agentName));
  }, [history, liveIds, q]);
  if (!list.length) return liveIds.length ? null : <div className="list-empty">{t("noChats")}</div>;
  return (
    <>
      <div className="list-head">{t("recent")}</div>
      {list.map((x) => <PastItem key={`${x.agentId}:${x.sessionId}`} entry={x} />)}
    </>
  );
});

const PastItem = memo(function PastItem({ entry }: { entry: HistoryEntry }) {
  return <Row title={entry.title || entry.sessionId} cwd={entry.cwd} agent={entry.agentName} updatedAt={entry.updatedAt} onClick={() => resume(entry)} />;
});

function Row(p: { title: string; cwd?: string; agent?: string; updatedAt?: number; tag?: string; active?: boolean; live?: boolean; onClick: () => void }) {
  return (
    <button className={`row${p.active ? " active" : ""}`} onClick={p.onClick}>
      <span className={`row-dot${p.live ? " live" : ""}`} />
      <span className="row-main">
        <span className="row-title">
          <span>{p.title}</span>
          {p.tag && <span className="tag">{p.tag}</span>}
        </span>
        <span className="row-meta">
          {p.agent && <span className="agent-badge">{p.agent}</span>}
          <span className="row-path">{shortPath(p.cwd)}</span>
          <span>· {ago(p.updatedAt)}</span>
        </span>
      </span>
    </button>
  );
}
