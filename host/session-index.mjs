// History for agents without a session listing of their own (ACP agents):
// the daemon records each session it starts.
import { SESSIONS_PATH } from "./paths.mjs";
import { readJson, writeJson } from "./util.mjs";

const MAX = 300;

// `active` marks a message sent now; other calls (rename, resume, mode change)
// keep the session's place in history.
export function recordSession({ agentId, sessionId, cwd, title, active = false }) {
  if (!agentId || !sessionId) return;
  const all = readJson(SESSIONS_PATH, []);
  const same = (s) => s.agentId === agentId && s.sessionId === sessionId;
  const prev = all.find(same);
  const rest = all.filter((s) => !same(s));
  const now = Date.now();
  const updatedAt = active || !prev ? now : prev.updatedAt;
  rest.unshift({ agentId, sessionId, cwd, title: title || prev?.title || null, createdAt: prev?.createdAt || now, updatedAt });
  try {
    writeJson(SESSIONS_PATH, rest.slice(0, MAX));
  } catch {}
}

export function indexedSessions(agentIds) {
  const wanted = new Set(agentIds);
  // Untitled entries are chats opened ahead of time that never got a message.
  return readJson(SESSIONS_PATH, []).filter((s) => wanted.has(s.agentId) && s.title);
}
