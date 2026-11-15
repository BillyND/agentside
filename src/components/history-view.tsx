import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../store/app-store";
import { attach, resume } from "../lib/actions";
import { ago, shortPath } from "../lib/format";
import { useT } from "../i18n";
import { IconSearch } from "./icons";
import type { HistoryEntry } from "../types";

export const HistoryView = memo(function HistoryView() {
  const t = useT();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const q = query.trim().toLowerCase();
  return (
    <section className="page">
      <label className="search">
        <IconSearch />
        <input ref={input} type="search" placeholder={t("searchChats")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="list">
        <LiveSessions q={q} />
        <PastSessions q={q} />
      </div>
    </section>
  );
});

const matches = (q: string, ...parts: (string | null | undefined)[]) => !q || parts.some((p) => p && p.toLowerCase().includes(q));

const LiveSessions = memo(function LiveSessions({ q }: { q: string }) {
  const t = useT();
  const keys = useApp(
    useShallow((st) =>
      Object.values(st.live)
        .filter((s) => !s.ended && matches(q, s.title, s.cwd, s.agentName))
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
  return <Row {...s} onClick={() => attach(sessionKey)} />;
});

const PastSessions = memo(function PastSessions({ q }: { q: string }) {
  const t = useT();
  const history = useApp((st) => st.history);
  const liveIds = useApp(useShallow((st) => Object.values(st.live).filter((s) => !s.ended).map((s) => s.sessionId)));
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
  return (
    <Row title={entry.title || entry.sessionId} cwd={entry.cwd} agent={entry.agentName} updatedAt={entry.updatedAt} onClick={() => resume(entry)} />
  );
});

function Row(p: { title: string; cwd?: string; agent?: string; updatedAt?: number; tag?: string; active?: boolean; onClick: () => void }) {
  return (
    <button className={`row${p.active ? " active" : ""}`} onClick={p.onClick}>
      <span className="row-title">
        <span>{p.title}</span>
        {p.tag && <span className="tag">{p.tag}</span>}
      </span>
      <span className="row-meta">
        {p.agent && <span className="agent-badge">{p.agent}</span>}
        {shortPath(p.cwd)} · {ago(p.updatedAt)}
      </span>
    </button>
  );
}
