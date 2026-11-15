import { applyCapabilities, clearQueue, connect, post, request } from "./bridge";
import { activeAgentId, currentSession, emptyCapabilities, setApp, upsertSession, useApp, type Settings } from "../store/app-store";
import { useChat } from "../store/chat-store";
import { getLocal, setLocal } from "./storage";
import { resolveLang } from "../i18n";
import type { AgentEvent, Capabilities, HistoryEntry, SessionSummary } from "../types";

interface Opened {
  session: SessionSummary;
  log: AgentEvent[];
  capabilities?: Capabilities;
}

export async function loadSettings() {
  const saved = (await getLocal<Partial<Settings>>("settings")) || {};
  const recentDirs = (await getLocal<string[]>("recentDirs")) || [];
  const langSetting = saved.langSetting || "auto";
  setApp({
    langSetting,
    lang: resolveLang(langSetting),
    theme: saved.theme || "system",
    defaultAgent: saved.defaultAgent || "claude",
    draftAgent: saved.defaultAgent || "claude",
    recentDirs,
  });
}

export function updateSettings(patch: Partial<Settings>) {
  const st = useApp.getState();
  const next: Settings = { langSetting: st.langSetting, theme: st.theme, defaultAgent: st.defaultAgent, ...patch };
  setApp({ ...next, lang: resolveLang(next.langSetting), ...(patch.defaultAgent && !st.currentKey ? { draftAgent: patch.defaultAgent } : {}) });
  setLocal("settings", next);
}

export function start() {
  connect(async (hello) => {
    const st = useApp.getState();
    if (!st.cwd) setApp({ cwd: (await getLocal<string>("lastCwd")) || hello.home });
    // Fall back to an installed agent if the preferred one is missing.
    const draft = hello.agents.find((a) => a.id === st.draftAgent && a.available) || hello.agents.find((a) => a.available);
    if (draft && draft.id !== st.draftAgent) setApp({ draftAgent: draft.id });
    const target = st.currentKey || (await getLocal<string>("lastKey"));
    if (target && useApp.getState().live[target]) attach(target);
  });
}

function show(res: Opened) {
  clearQueue();
  upsertSession(res.session);
  setApp({ currentKey: res.session.key, view: "chat", capabilities: emptyCapabilities() });
  applyCapabilities(res.capabilities);
  setLocal("lastKey", res.session.key);
  const chat = useChat.getState();
  chat.reset();
  chat.apply(res.log);
}

function fail(err: unknown) {
  useChat.getState().apply([{ type: "notice", tone: "error", text: (err as Error).message }]);
}

export function newChat() {
  clearQueue();
  const st = useApp.getState();
  setApp({ currentKey: null, view: "chat", capabilities: emptyCapabilities(), draftAgent: activeAgentId(st), draftMode: null, draftModel: null });
  setLocal("lastKey", null);
  useChat.getState().reset();
}

export async function attach(key: string) {
  try {
    show(await request<Opened>({ type: "attach", key }));
  } catch (err) {
    fail(err);
  }
}

export async function resume(entry: HistoryEntry) {
  setApp({ view: "chat" });
  try {
    show(await request<Opened>({ type: "open", agentId: entry.agentId, resume: entry.sessionId, cwd: entry.cwd }));
  } catch (err) {
    fail(err);
  }
}

async function ensureSession(): Promise<string> {
  const st = useApp.getState();
  const s = currentSession(st);
  if (s && !s.ended) return s.key;
  const cwd = st.cwd.trim() || st.home;
  rememberDir(cwd);
  const res = await request<Opened>({
    type: "open",
    agentId: s?.agentId || st.draftAgent,
    cwd: s?.cwd || cwd,
    resume: s?.ended ? s.sessionId : undefined,
    model: st.draftModel || undefined,
    mode: st.draftMode || undefined,
  });
  show(res);
  return res.session.key;
}

export async function send(text: string): Promise<boolean> {
  try {
    const key = await ensureSession();
    await request({ type: "send", key, text });
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}

export function interrupt() {
  const key = useApp.getState().currentKey;
  if (key) post({ type: "interrupt", key });
}

export function setMode(mode: string) {
  const key = useApp.getState().currentKey;
  if (key) request({ type: "set_mode", key, mode }).catch(fail);
  else setApp({ draftMode: mode });
}

export function setModel(model: string | null) {
  const key = useApp.getState().currentKey;
  if (key) request({ type: "set_model", key, model }).catch(fail);
  else setApp({ draftModel: model });
}

/** Picking another agent starts a fresh chat with it. */
export function setAgent(agentId: string) {
  const st = useApp.getState();
  if (st.currentKey) newChat();
  setApp({ draftAgent: agentId, draftMode: null, draftModel: null });
}

export function answerPermission(reqId: string, optionId: string | null, answers?: Record<string, string>) {
  post({ type: "permission", key: useApp.getState().currentKey, reqId, optionId, answers });
}

export async function openHistory() {
  setApp({ view: "history" });
  try {
    const res = await request<{ sessions: HistoryEntry[] }>({ type: "history", limit: 100 });
    setApp({ history: res.sessions });
  } catch (err) {
    fail(err);
  }
}

export function showView(view: "chat" | "settings") {
  setApp({ view });
  if (view === "settings") request<{ agents: any[] }>({ type: "agents" }).then((r) => setApp({ agents: r.agents })).catch(() => {});
}

export function rememberDir(dir: string) {
  if (!dir) return;
  const dirs = [dir, ...useApp.getState().recentDirs.filter((d) => d !== dir)].slice(0, 12);
  setApp({ recentDirs: dirs, cwd: dir });
  setLocal("recentDirs", dirs);
  setLocal("lastCwd", dir);
}
