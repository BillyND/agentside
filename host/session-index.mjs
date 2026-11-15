// History for agents without a session listing of their own (ACP agents):
// the daemon records each session it starts.
import { SESSIONS_PATH } from "./paths.mjs";
import { readJson, writeJson } from "./util.mjs";

const MAX = 300;

export function recordSession({ agentId, sessionId, cwd, title, updatedAt = Date.now() }) {
  if (!agentId || !sessionId) return;
  const all = readJson(SESSIONS_PATH, []);
  const same = (s) => s.agentId === agentId && s.sessionId === sessionId;
  const prev = all.find(same);
  const rest = all.filter((s) => !same(s));
  rest.unshift({ agentId, sessionId, cwd, title: title || prev?.title || null, updatedAt });
  try {
    writeJson(SESSIONS_PATH, rest.slice(0, MAX));
  } catch {}
}

export function indexedSessions(agentIds) {
  const wanted = new Set(agentIds);
  return readJson(SESSIONS_PATH, []).filter((s) => wanted.has(s.agentId));
}
