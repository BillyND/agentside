import { useChat } from "../store/chat-store";
import { removeSession, setApp, upsertSession, useApp } from "../store/app-store";
import { translate } from "../i18n";
import type { AgentEvent, AgentInfo, Capabilities, SessionSummary } from "../types";

const HOST = "com.agentside.bridge";

export interface Hello {
  home: string;
  agents: AgentInfo[];
  sessions: SessionSummary[];
}

let port: chrome.runtime.Port | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (m: any) => void; reject: (e: Error) => void }>();

// Live events are batched per animation frame: one store update per frame no
// matter how many deltas arrived.
let queue: AgentEvent[] = [];
let frame = 0;
function enqueue(ev: AgentEvent) {
  queue.push(ev);
  if (!frame) frame = requestAnimationFrame(flush);
}
function flush() {
  frame = 0;
  const batch = queue;
  queue = [];
  if (batch.length) useChat.getState().apply(batch);
}

/** Drops queued live events (when switching sessions). */
export function clearQueue() {
  queue = [];
}

export function connect(onReady: (hello: Hello) => void) {
  port?.disconnect();
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (err) {
    setApp({ banner: (err as Error).message });
    return;
  }
  const self = port;
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    if (port !== self) return;
    const reason = chrome.runtime.lastError?.message || "";
    port = null;
    for (const w of waiting.values()) w.reject(new Error(translate(useApp.getState().lang, "disconnected")));
    waiting.clear();
    const lang = useApp.getState().lang;
    setApp({
      connected: false,
      banner: /not found|forbidden/i.test(reason) ? translate(lang, "hostMissing") : `${translate(lang, "disconnected")}${reason ? ` (${reason})` : ""}`,
    });
  });
  request<Hello>({ type: "hello" })
    .then((res) => {
      setApp({ connected: true, banner: null, home: res.home, agents: res.agents });
      for (const s of res.sessions) upsertSession(s);
      onReady(res);
    })
    .catch(() => {});
}

export function post(msg: Record<string, unknown>): boolean {
  if (!port) return false;
  port.postMessage(msg);
  return true;
}

export function request<T = any>(msg: Record<string, unknown>): Promise<T> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    if (!post({ ...msg, id })) {
      waiting.delete(id);
      reject(new Error(translate(useApp.getState().lang, "notConnected")));
    }
  });
}

export function applyCapabilities(cap: Partial<Capabilities> | undefined) {
  if (!cap) return;
  setApp((st) => ({
    capabilities: {
      modes: cap.modes ?? st.capabilities.modes,
      models: cap.models ?? st.capabilities.models,
      commands: cap.commands ?? st.capabilities.commands,
    },
  }));
}

function onMessage(msg: any) {
  if (msg.id && waiting.has(msg.id)) {
    const w = waiting.get(msg.id)!;
    waiting.delete(msg.id);
    if (msg.type === "error") w.reject(new Error(msg.message));
    else w.resolve(msg);
    return;
  }
  switch (msg.type) {
    case "event":
      if (msg.key !== useApp.getState().currentKey) return;
      if (msg.event.type === "capabilities") applyCapabilities(msg.event);
      else enqueue(msg.event);
      return;
    case "session":
      upsertSession(msg.session);
      return;
    case "closed": {
      // The daemon closes idle sessions to free memory; keep the one on screen
      // as "ended" so sending a message resumes it.
      const st = useApp.getState();
      const s = st.live[msg.key];
      if (msg.key === st.currentKey && s && !s.fresh) upsertSession({ ...s, ended: true, busy: false, pending: [] });
      else removeSession(msg.key);
      return;
    }
    case "fatal":
      setApp({ banner: msg.message });
      return;
    case "error":
      if (!msg.key || msg.key === useApp.getState().currentKey) enqueue({ type: "notice", tone: "error", text: msg.message });
      return;
  }
}
