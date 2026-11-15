// Long-lived process (run by launchd) that owns the Claude Agent SDK sessions.
// Panels come and go through the native host; sessions survive them.
import net from "node:net";
import { mkdirSync, readFileSync, rmSync, chmodSync, appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { query, listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { STATE_DIR, SOCKET_PATH, CONFIG_PATH, LOG_PATH } from "./paths.mjs";

const MAX_STRING = 40_000; // keeps every frame well under Chrome's 1 MB native-messaging cap
const MAX_LOG = 3000;

function log(...args) {
  try { appendFileSync(LOG_PATH, `${new Date().toISOString()} ${args.join(" ")}\n`); } catch {}
}

function readConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { return {}; }
}

// Deep-copies a message, shortening huge strings (file dumps, base64 images).
function clip(value) {
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}\n… [${value.length - MAX_STRING} ký tự bị cắt]` : value;
  }
  if (Array.isArray(value)) return value.map(clip);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clip(v);
    return out;
  }
  return value;
}

// Async iterable the SDK reads user turns from; push() feeds it.
function inputQueue() {
  const items = [];
  let wake = null;
  let done = false;
  return {
    push(item) { items.push(item); wake?.(); },
    end() { done = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (items.length) { yield items.shift(); continue; }
        if (done) return;
        await new Promise((r) => (wake = r));
        wake = null;
      }
    },
  };
}

const clients = new Set();
const sessions = new Map(); // key -> session

function sendTo(sock, msg) {
  if (!sock.destroyed) sock.write(JSON.stringify(msg) + "\n");
}

function broadcast(msg) {
  for (const c of clients) sendTo(c, msg);
}

function summary(s) {
  return {
    key: s.key,
    sessionId: s.sessionId,
    cwd: s.cwd,
    title: s.title,
    busy: s.busy,
    ended: s.ended,
    model: s.model,
    permissionMode: s.permissionMode,
    pending: [...s.pending.keys()],
    updatedAt: s.updatedAt,
  };
}

function emit(s, event, { keep = true } = {}) {
  const msg = { type: "event", key: s.key, event: clip(event) };
  if (keep) {
    s.log.push(msg.event);
    if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  }
  s.updatedAt = Date.now();
  broadcast(msg);
}

function touch(s) {
  broadcast({ type: "session", session: summary(s) });
}

async function loadHistory(s, sessionId) {
  try {
    const messages = await getSessionMessages(sessionId, { dir: s.cwd });
    for (const m of messages) emit(s, { type: "history", role: m.type, message: m.message, parent: m.parent_tool_use_id });
  } catch (err) {
    emit(s, { type: "daemon_error", message: `Không tải được lịch sử: ${err.message}` });
  }
}

async function openSession({ key, cwd, resume, model, permissionMode }) {
  const config = readConfig();
  const s = {
    key: key || randomUUID(),
    cwd: cwd || homedir(),
    sessionId: resume || null,
    title: null,
    busy: false,
    ended: false,
    model: model || null,
    permissionMode: permissionMode || "default",
    log: [],
    pending: new Map(), // reqId -> { resolve, request }
    input: inputQueue(),
    updatedAt: Date.now(),
  };
  sessions.set(s.key, s);

  if (resume) {
    try {
      const info = (await listSessions({ dir: s.cwd, limit: 200 })).find((x) => x.sessionId === resume);
      s.title = info?.customTitle || info?.summary || info?.firstPrompt || null;
    } catch {}
    await loadHistory(s, resume);
  }

  s.query = query({
    prompt: s.input,
    options: {
      cwd: s.cwd,
      resume: resume || undefined,
      model: model || undefined,
      permissionMode: s.permissionMode,
      includePartialMessages: true,
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project", "local"],
      pathToClaudeCodeExecutable: config.claudePath || undefined,
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "claude-sidepanel" },
      stderr: (line) => log(`[${s.key.slice(0, 8)} stderr]`, line.trimEnd()),
      canUseTool: (toolName, input, opts) => askPermission(s, toolName, input, opts),
    },
  });

  pump(s);
  fetchCapabilities(s);
  touch(s);
  return s;
}

async function fetchCapabilities(s) {
  try {
    const [commands, models] = await Promise.all([s.query.supportedCommands(), s.query.supportedModels()]);
    emit(s, { type: "capabilities", commands, models }, { keep: false });
    s.capabilities = { commands, models };
  } catch (err) {
    log("capabilities failed", err.message);
  }
}

async function pump(s) {
  try {
    for await (const msg of s.query) {
      if (msg.type === "system" && msg.subtype === "init") {
        s.sessionId = msg.session_id;
        s.model = msg.model;
        s.permissionMode = msg.permissionMode;
        touch(s);
      }
      if (msg.type === "result") {
        s.busy = false;
        touch(s);
      }
      // Partial deltas are only useful live; replay uses the full messages.
      emit(s, msg, { keep: msg.type !== "stream_event" });
    }
  } catch (err) {
    log("session error", s.key, err.stack || err.message);
    emit(s, { type: "daemon_error", message: err.message });
  } finally {
    s.ended = true;
    s.busy = false;
    for (const p of s.pending.values()) p.resolve({ behavior: "deny", message: "Phiên đã kết thúc" });
    s.pending.clear();
    touch(s);
  }
}

function askPermission(s, toolName, input, opts) {
  const reqId = randomUUID();
  const request = {
    type: "permission_request",
    reqId,
    toolName,
    input,
    decisionReason: opts.decisionReason,
    blockedPath: opts.blockedPath,
    canAlwaysAllow: Boolean(opts.suggestions?.length) && !opts.suppressAlwaysAllowRule,
  };
  return new Promise((resolve) => {
    const finish = (result) => {
      if (!s.pending.has(reqId)) return;
      s.pending.delete(reqId);
      emit(s, { type: "permission_resolved", reqId, behavior: result.behavior });
      touch(s);
      resolve(result);
    };
    s.pending.set(reqId, { resolve: finish, request, suggestions: opts.suggestions, input });
    opts.signal?.addEventListener("abort", () => finish({ behavior: "deny", message: "Đã huỷ" }));
    emit(s, request);
    touch(s);
  });
}

function answerPermission(s, { reqId, allow, always, answers, message }) {
  const p = s.pending.get(reqId);
  if (!p) return;
  if (!allow) {
    p.resolve({ behavior: "deny", message: message || "Người dùng từ chối" });
    return;
  }
  const result = { behavior: "allow", updatedInput: p.input };
  if (answers) result.updatedInput = { ...p.input, answers };
  if (always && p.suggestions?.length) result.updatedPermissions = p.suggestions;
  p.resolve(result);
}

function sendUser(s, text) {
  if (!s.title) s.title = text.slice(0, 80);
  s.busy = true;
  emit(s, { type: "local_user", text, at: Date.now() });
  s.input.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
  touch(s);
}

async function handle(sock, msg) {
  const s = msg.key ? sessions.get(msg.key) : null;
  switch (msg.type) {
    case "hello":
      sendTo(sock, { type: "hello", id: msg.id, home: homedir(), sessions: [...sessions.values()].map(summary) });
      return;
    case "history": {
      const list = await listSessions({ dir: msg.cwd || undefined, limit: msg.limit || 60 });
      sendTo(sock, { type: "history", id: msg.id, sessions: list });
      return;
    }
    case "open": {
      let target = msg.resume && [...sessions.values()].find((x) => x.sessionId === msg.resume && !x.ended);
      if (!target) target = await openSession(msg);
      sendTo(sock, { type: "opened", id: msg.id, session: summary(target), log: target.log, capabilities: target.capabilities });
      return;
    }
    case "attach":
      if (s) sendTo(sock, { type: "opened", id: msg.id, session: summary(s), log: s.log, capabilities: s.capabilities });
      else sendTo(sock, { type: "error", id: msg.id, message: "Phiên không còn" });
      return;
    case "send":
      if (s && !s.ended) sendUser(s, msg.text);
      return;
    case "interrupt":
      if (s && !s.ended) await s.query.interrupt();
      return;
    case "set_model":
      if (s && !s.ended) {
        await s.query.setModel(msg.model || undefined);
        s.model = msg.model;
        emit(s, { type: "notice", text: `Đã đổi model: ${msg.model || "mặc định"}` });
        touch(s);
      }
      return;
    case "set_mode":
      if (s && !s.ended) {
        await s.query.setPermissionMode(msg.mode);
        s.permissionMode = msg.mode;
        touch(s);
      }
      return;
    case "permission":
      if (s) answerPermission(s, msg);
      return;
    case "close":
      if (s) {
        s.input.end();
        s.query.close();
        sessions.delete(s.key);
        broadcast({ type: "closed", key: s.key });
      }
      return;
    default:
      sendTo(sock, { type: "error", id: msg.id, message: `Không rõ lệnh ${msg.type}` });
  }
}

function serve() {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  rmSync(SOCKET_PATH, { force: true });
  const server = net.createServer((sock) => {
    clients.add(sock);
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        handle(sock, msg).catch((err) => {
          log("handle error", msg.type, err.stack || err.message);
          sendTo(sock, { type: "error", id: msg.id, key: msg.key, message: err.message });
        });
      }
    });
    sock.on("close", () => clients.delete(sock));
    sock.on("error", () => clients.delete(sock));
  });
  server.listen(SOCKET_PATH, () => {
    chmodSync(SOCKET_PATH, 0o600);
    log("daemon listening", SOCKET_PATH);
  });
}

process.on("uncaughtException", (err) => log("uncaught", err.stack || err.message));
process.on("unhandledRejection", (err) => log("unhandled", err?.stack || String(err)));
serve();
