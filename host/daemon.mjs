// Long-lived process that owns agent sessions. Panels connect through the
// native host; sessions survive panels being closed.
import net from "node:net";
import { mkdirSync, rmSync, chmodSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { STATE_DIR, SOCKET_PATH } from "./paths.mjs";
import { clip, log } from "./util.mjs";
import { describeAgents, getAgent, listAgents } from "./agents/registry.mjs";
import { createClaudeAgent, claudeHistory } from "./agents/claude-agent.mjs";
import { createCodexAgent, codexHistory } from "./agents/codex-agent.mjs";
import { createAcpAgent } from "./agents/acp-agent.mjs";
import { indexedSessions, recordSession } from "./session-index.mjs";

const MAX_LOG = 4000;
const FACTORIES = { "claude-sdk": createClaudeAgent, codex: createCodexAgent, acp: createAcpAgent };

const clients = new Set();
const sessions = new Map(); // key -> Session

function sendTo(sock, msg) {
  if (!sock.destroyed) sock.write(JSON.stringify(msg) + "\n");
}

function broadcast(msg) {
  for (const c of clients) sendTo(c, msg);
}

class Session {
  constructor(agent, { key, cwd, resume, model, mode }) {
    this.key = key || randomUUID();
    this.agent = agent;
    this.cwd = cwd || homedir();
    this.sessionId = resume || null;
    this.title = null;
    this.busy = false;
    this.ended = false;
    this.model = model || null;
    this.mode = mode || null;
    this.log = [];
    this.capabilities = { modes: [], models: [], commands: [] };
    this.pending = new Map(); // reqId -> { resolve }
    this.updatedAt = Date.now();
    this.adapter = FACTORIES[agent.protocol](agent, { cwd: this.cwd, resume, model, mode }, this.#host());
  }

  summary() {
    return {
      key: this.key,
      agentId: this.agent.id,
      agentName: this.agent.name,
      sessionId: this.sessionId,
      cwd: this.cwd,
      title: this.title,
      busy: this.busy,
      ended: this.ended,
      model: this.model,
      mode: this.mode,
      pending: [...this.pending.keys()],
      updatedAt: this.updatedAt,
    };
  }

  touch() {
    this.updatedAt = Date.now();
    broadcast({ type: "session", session: this.summary() });
  }

  emit(event, { keep = true } = {}) {
    const ev = clip(event);
    if (ev.type === "user" && !this.title) this.title = ev.text.slice(0, 80);
    if (keep) {
      this.log.push(ev);
      if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
    }
    broadcast({ type: "event", key: this.key, event: ev });
    if (ev.type === "turn_end" && this.busy) {
      this.busy = false;
      this.touch();
    }
  }

  // Interface the adapters talk to.
  #host() {
    return {
      emit: (ev, opts) => this.emit(ev, opts),
      update: (patch) => {
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) this[k] = v;
        if (this.agent.protocol === "acp" && this.sessionId) {
          recordSession({ agentId: this.agent.id, sessionId: this.sessionId, cwd: this.cwd, title: this.title });
        }
        this.touch();
      },
      capabilities: (cap) => {
        Object.assign(this.capabilities, cap);
        broadcast({ type: "event", key: this.key, event: { type: "capabilities", ...this.capabilities } });
      },
      askPermission: (request, signal) => this.#ask(request, signal),
      cancelPermissions: () => {
        for (const p of this.pending.values()) p.resolve(null);
      },
      ended: (err) => {
        if (this.ended) return;
        if (err) {
          log("session ended with error", this.key, err.stack || err.message);
          this.emit({ type: "notice", tone: "error", text: err.message });
        }
        this.ended = true;
        this.busy = false;
        for (const p of this.pending.values()) p.resolve(null);
        this.touch();
      },
    };
  }

  #ask(request, signal) {
    const reqId = randomUUID();
    return new Promise((resolve) => {
      const finish = (answer) => {
        if (!this.pending.has(reqId)) return;
        this.pending.delete(reqId);
        const allowed = Boolean(answer) && !/^(reject|decline|cancel)/.test(answer.optionId);
        this.emit({ type: "permission_resolved", reqId, outcome: allowed ? "allow" : "deny" });
        this.touch();
        resolve(answer);
      };
      this.pending.set(reqId, { resolve: finish });
      signal?.addEventListener("abort", () => finish(null));
      this.emit({ type: request.kind === "question" ? "question" : "permission_request", reqId, ...request });
      this.touch();
    });
  }

  async start() {
    await this.adapter.start();
  }

  send(text) {
    if (!this.title) this.title = text.slice(0, 80);
    this.busy = true;
    if (this.agent.protocol === "claude-sdk") this.emit({ type: "user", text });
    this.adapter.send(text);
    this.touch();
    if (this.agent.protocol === "acp" && this.sessionId) {
      recordSession({ agentId: this.agent.id, sessionId: this.sessionId, cwd: this.cwd, title: this.title });
    }
  }

  answer(reqId, payload) {
    this.pending.get(reqId)?.resolve(payload.optionId ? payload : null);
  }

  close() {
    this.ended = true;
    for (const p of this.pending.values()) p.resolve(null);
    try {
      this.adapter.close();
    } catch {}
  }
}

async function openSession(msg) {
  const agent = getAgent(msg.agentId || "claude");
  const s = new Session(agent, msg);
  sessions.set(s.key, s);
  try {
    await s.start();
  } catch (err) {
    sessions.delete(s.key);
    s.close();
    throw err;
  }
  s.touch();
  return s;
}

async function history(limit) {
  const agents = listAgents().filter((a) => a.available);
  const jobs = agents.map(async (a) => {
    try {
      if (a.protocol === "claude-sdk") return await claudeHistory(limit);
      if (a.protocol === "codex") return await codexHistory(a, limit);
      return [];
    } catch (err) {
      log("history failed", a.id, err.message);
      return [];
    }
  });
  const acp = indexedSessions(agents.filter((a) => a.protocol === "acp").map((a) => a.id));
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  return [...(await Promise.all(jobs)).flat(), ...acp]
    .filter((s) => s.updatedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((s) => ({ ...s, agentName: names[s.agentId] || s.agentId }));
}

const opened = (s) => ({ session: s.summary(), log: s.log, capabilities: s.capabilities });

async function handle(sock, msg) {
  const s = msg.key ? sessions.get(msg.key) : null;
  const reply = (body) => sendTo(sock, { id: msg.id, ...body });
  const live = () => {
    if (!s || s.ended) throw new Error("This session has ended.");
    return s;
  };
  switch (msg.type) {
    case "hello":
      return reply({ type: "hello", home: homedir(), agents: describeAgents(), sessions: [...sessions.values()].map((x) => x.summary()) });
    case "agents":
      return reply({ type: "agents", agents: describeAgents() });
    case "history":
      return reply({ type: "history", sessions: await history(Math.min(msg.limit || 60, 200)) });
    case "open": {
      const existing = msg.resume && [...sessions.values()].find((x) => x.sessionId === msg.resume && x.agent.id === msg.agentId && !x.ended);
      return reply({ type: "opened", ...opened(existing || (await openSession(msg))) });
    }
    case "attach":
      if (!s) throw new Error("This session is no longer running.");
      return reply({ type: "opened", ...opened(s) });
    case "send":
      live().send(String(msg.text || ""));
      return reply({ type: "ok" });
    case "interrupt":
      await live().adapter.interrupt();
      return reply({ type: "ok" });
    case "set_model":
    case "set_mode":
      try {
        if (msg.type === "set_model") await live().adapter.setModel(msg.model || null);
        else await live().adapter.setMode(msg.mode);
      } finally {
        s?.touch(); // resync the panel's selector if the agent refused
      }
      return reply({ type: "ok" });
    case "permission":
      s?.answer(msg.reqId, { optionId: msg.optionId, answers: msg.answers });
      return reply({ type: "ok" });
    case "close":
      if (s) {
        s.close();
        sessions.delete(s.key);
        broadcast({ type: "closed", key: s.key });
      }
      return reply({ type: "ok" });
    default:
      throw new Error(`Unknown request: ${msg.type}`);
  }
}

function serve() {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") rmSync(SOCKET_PATH, { force: true });
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
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        handle(sock, msg).catch((err) => {
          log("request failed", msg.type, err.stack || err.message);
          sendTo(sock, { type: "error", id: msg.id, key: msg.key, message: err.message });
        });
      }
    });
    sock.on("close", () => clients.delete(sock));
    sock.on("error", () => clients.delete(sock));
  });
  server.on("error", (err) => {
    log("server error", err.message);
    process.exit(1);
  });
  server.listen(SOCKET_PATH, () => {
    if (process.platform !== "win32") chmodSync(SOCKET_PATH, 0o600);
    log("daemon listening", SOCKET_PATH);
  });
  const shutdown = () => {
    for (const s of sessions.values()) s.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

process.on("uncaughtException", (err) => log("uncaught", err.stack || err.message));
process.on("unhandledRejection", (err) => log("unhandled", err?.stack || String(err)));
serve();
