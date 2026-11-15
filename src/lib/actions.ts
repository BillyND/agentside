import { applyCapabilities, clearQueue, connect, post, request } from "./bridge";
import { activeAgentId, currentSession, emptyCapabilities, isDraft, setApp, upsertSession, useApp, type Settings } from "../store/app-store";
import { useChat } from "../store/chat-store";
import { getLocal, setLocal } from "./storage";
import { resolveLang } from "../i18n";
import type { AgentEvent, Attachment, Capabilities, HistoryEntry, SessionSummary } from "../types";

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
    answerFont: saved.answerFont || "sans",
    agentPrefs: saved.agentPrefs || {},
    draftAgent: saved.defaultAgent || "claude",
    recentDirs,
  });
}

export function updateSettings(patch: Partial<Settings>) {
  const st = useApp.getState();
  const next: Settings = {
    langSetting: st.langSetting,
    theme: st.theme,
    defaultAgent: st.defaultAgent,
    answerFont: st.answerFont,
    agentPrefs: st.agentPrefs,
    ...patch,
  };
  setApp({ ...next, lang: resolveLang(next.langSetting) });
  setLocal("settings", next);
  if (patch.defaultAgent && patch.defaultAgent !== st.defaultAgent && isDraft(useApp.getState())) setAgent(patch.defaultAgent);
}

export function start() {
  connect(async (hello) => {
    const st = useApp.getState();
    if (!st.cwd) setApp({ cwd: (await getLocal<string>("lastCwd")) || hello.home });
    // Fall back to an installed agent if the preferred one is missing.
    const draft = hello.agents.find((a) => a.id === st.draftAgent && a.available) || hello.agents.find((a) => a.available);
    if (draft && draft.id !== st.draftAgent) setApp({ draftAgent: draft.id });
    const target = st.currentKey || (await getLocal<string>("lastKey"));
    const live = target ? useApp.getState().live[target] : undefined;
    if (live && !live.fresh && !live.ended) await attach(live.key);
    else prepareDraft();
  });
}

function show(res: Opened) {
  clearQueue();
  upsertSession(res.session);
  setApp({ currentKey: res.session.key, capabilities: emptyCapabilities() });
  applyCapabilities(res.capabilities);
  if (!res.session.fresh) setLocal("lastKey", res.session.key);
  const chat = useChat.getState();
  chat.reset();
  chat.apply(res.log);
}

function fail(err: unknown) {
  useChat.getState().apply([{ type: "notice", tone: "error", text: (err as Error).message }]);
}

// ---------- draft session ----------
// A new chat opens its agent session right away (without sending anything), so
// models, effort levels, modes and slash commands are real before the first
// message. Changing the agent or folder replaces that unused session.

let preparing = false;
let again = false;

export async function prepareDraft() {
  if (preparing) {
    again = true;
    return;
  }
  preparing = true;
  try {
    do {
      again = false;
      await reconcileDraft();
    } while (again);
  } finally {
    preparing = false;
  }
}

async function reconcileDraft() {
  const st = useApp.getState();
  if (!st.connected) return;
  const s = currentSession(st);
  if (s && !s.fresh && !s.ended) return; // a real chat is on screen
  const cwd = st.cwd.trim() || st.home;
  if (s && s.fresh && !s.ended && s.agentId === st.draftAgent && s.cwd === cwd) return;
  if (s?.fresh) post({ type: "close", key: s.key });
  const agent = st.agents.find((a) => a.id === st.draftAgent && a.available);
  if (!agent) {
    setApp({ currentKey: null, capabilities: emptyCapabilities() });
    return;
  }
  const pref = st.agentPrefs[agent.id] || {};
  try {
    const res = await request<Opened>({
      type: "open",
      agentId: agent.id,
      cwd,
      model: st.draftModel || pref.model || undefined,
      mode: st.draftMode || pref.mode || undefined,
      effort: st.draftEffort || pref.effort || undefined,
    });
    const now = useApp.getState();
    const current = currentSession(now);
    if (current && !current.fresh) {
      post({ type: "close", key: res.session.key }); // user moved on to a real chat meanwhile
      return;
    }
    show(res);
  } catch (err) {
    setApp({ currentKey: null });
    fail(err);
  }
}

// ---------- navigation ----------

export function newChat() {
  setApp({ view: "chat" });
  const st = useApp.getState();
  if (isDraft(st)) return prepareDraft();
  clearQueue();
  setApp({ currentKey: null, capabilities: emptyCapabilities(), draftAgent: activeAgentId(st), draftMode: null, draftModel: null, draftEffort: null });
  setLocal("lastKey", null);
  useChat.getState().reset();
  prepareDraft();
}

export async function attach(key: string) {
  setApp({ view: "chat" });
  try {
    const st = useApp.getState();
    const draft = currentSession(st);
    show(await request<Opened>({ type: "attach", key }));
    if (draft?.fresh && draft.key !== key) post({ type: "close", key: draft.key });
  } catch (err) {
    fail(err);
  }
}

export async function resume(entry: HistoryEntry) {
  setApp({ view: "chat" });
  const draft = currentSession(useApp.getState());
  try {
    show(await request<Opened>({ type: "open", agentId: entry.agentId, resume: entry.sessionId, cwd: entry.cwd }));
    if (draft?.fresh) post({ type: "close", key: draft.key });
  } catch (err) {
    fail(err);
  }
}

// ---------- chat ----------

async function ensureSession(): Promise<string> {
  const st = useApp.getState();
  const s = currentSession(st);
  if (s && !s.ended) return s.key;
  const res = await request<Opened>({
    type: "open",
    agentId: s?.agentId || st.draftAgent,
    cwd: s?.cwd || st.cwd.trim() || st.home,
    resume: s?.ended && !s.fresh ? s.sessionId : undefined,
    model: st.draftModel || undefined,
    mode: st.draftMode || undefined,
    effort: st.draftEffort || undefined,
  });
  show(res);
  return res.session.key;
}

export async function send(text: string, attachments: Attachment[] = []): Promise<boolean> {
  try {
    const key = await ensureSession();
    const st = useApp.getState();
    if (currentSession(st)?.fresh) rememberDir(currentSession(st)!.cwd, false);
    await request({
      type: "send",
      key,
      text,
      images: attachments.map((a) => ({ mimeType: a.mimeType, data: a.data })),
      thumbs: attachments.map((a) => a.thumb),
    });
    setLocal("lastKey", key);
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

function setOnSession(type: "set_mode" | "set_model" | "set_effort", field: "mode" | "model" | "effort", value: string | null) {
  const st0 = useApp.getState();
  const key = st0.currentKey;
  // Remember the choice for this agent so the next chat starts the same way.
  const agentId = currentSession(st0)?.agentId || st0.draftAgent;
  const prefs = { ...st0.agentPrefs, [agentId]: { ...st0.agentPrefs[agentId], [field]: value } };
  if (field === "model") prefs[agentId].effort = null; // effort levels differ per model
  updateSettings({ agentPrefs: prefs });
  const draftField = field === "mode" ? "draftMode" : field === "model" ? "draftModel" : "draftEffort";
  setApp({ [draftField]: value } as Partial<ReturnType<typeof useApp.getState>>);
  if (key) request({ type, key, [field]: value }).catch(fail);
}

export const setMode = (mode: string) => setOnSession("set_mode", "mode", mode);
export const setModel = (model: string | null) => setOnSession("set_model", "model", model);
export const setEffort = (effort: string | null) => setOnSession("set_effort", "effort", effort);

/** Switching agent mid-chat starts a new chat with the chosen agent. */
export function setAgent(agentId: string) {
  const st = useApp.getState();
  if (!isDraft(st)) {
    clearQueue();
    setApp({ currentKey: null, capabilities: emptyCapabilities() });
    useChat.getState().reset();
  }
  setApp({ draftAgent: agentId, draftMode: null, draftModel: null, draftEffort: null, view: "chat" });
  prepareDraft();
}

export function answerPermission(reqId: string, optionId: string | null, answers?: Record<string, string>) {
  post({ type: "permission", key: useApp.getState().currentKey, reqId, optionId, answers });
}

export async function openHistory() {
  // The last list shows at once; the daemon answers from its cache or refreshes.
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

/** Opens the operating system's folder chooser (through the daemon). */
export async function chooseFolder(prompt: string) {
  const st = useApp.getState();
  try {
    const res = await request<{ path: string | null }>({ type: "pick_folder", start: st.cwd || st.home, prompt });
    if (res.path) rememberDir(res.path);
  } catch (err) {
    fail(err);
  }
}

export function rememberDir(dir: string, reopen = true) {
  if (!dir) return;
  const dirs = [dir, ...useApp.getState().recentDirs.filter((d) => d !== dir)].slice(0, 12);
  setApp({ recentDirs: dirs, cwd: dir });
  setLocal("recentDirs", dirs);
  setLocal("lastCwd", dir);
  if (reopen) prepareDraft();
}
