// Long-lived process that owns agent sessions. Panels connect through the
// native host; sessions survive panels being closed.
import net from "node:net";
import { mkdirSync, rmSync, chmodSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { STATE_DIR, SOCKET_PATH } from "./paths.mjs";
import { clip, log, which } from "./util.mjs";
import { describeAgents, getAgent, listAgents } from "./agents/registry.mjs";
import { createClaudeAgent, claudeHistory } from "./agents/claude-agent.mjs";
import { createCodexAgent, codexHistory } from "./agents/codex-agent.mjs";
import { createAcpAgent } from "./agents/acp-agent.mjs";
import { indexedSessions, recordSession } from "./session-index.mjs";

const MAX_LOG = 4000;
// Each agent process holds hundreds of MB, so idle sessions nobody is looking
// at are closed (they can be resumed from history).
const IDLE_CLOSE_MS = 10 * 60 * 1000;
const MAX_IDLE_SESSIONS = 2;
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
  constructor(agent, { key, cwd, resume, model, mode, effort }) {
    this.key = key || randomUUID();
    this.agent = agent;
    this.cwd = cwd || homedir();
    this.sessionId = resume || null;
    this.title = null;
    this.busy = false;
    this.ended = false;
    this.model = model || null;
    this.mode = mode || null;
    this.effort = effort || null;
    this.fresh = !resume; // no message sent yet (opened ahead of time by the panel)
    this.createdAt = resume ? null : Date.now(); // a resumed chat's real start is in history
    this.activeAt = null; // last message sent from here
    this.log = [];
    this.capabilities = { modes: [], models: [], commands: [] };
    this.pending = new Map(); // reqId -> { resolve }
    // Messages sent mid-turn to agents that reject a second prompt (ACP, Codex); sent in order as turns end.
    this.queue = [];
    this.updatedAt = Date.now();
    this.adapter = FACTORIES[agent.protocol](agent, { cwd: this.cwd, resume, model, mode, effort }, this.#host());
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
      effort: this.effort,
      fresh: this.fresh,
      createdAt: this.createdAt,
      activeAt: this.activeAt,
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
      if (this.queue.length) this.adapter.send(...this.queue.shift());
      else this.busy = false;
      this.touch();
    }
  }

  // Interface the adapters talk to.
  #host() {
    return {
      emit: (ev, opts) => this.emit(ev, opts),
      update: (patch) => {
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) this[k] = v;
        if (this.agent.protocol === "acp" && this.sessionId && !this.fresh) {
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
        this.queue = [];
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

  send(text, images = [], thumbs = []) {
    if (!this.title) this.title = text.slice(0, 80) || "Image";
    this.fresh = false;
    this.activeAt = Date.now();
    this.emit({ type: "user", text, thumbs });
    if (this.busy && !this.adapter.queuesInput) this.queue.push([text, images]);
    else this.adapter.send(text, images);
    this.busy = true;
    this.touch();
    if (this.agent.protocol === "acp" && this.sessionId) {
      recordSession({ agentId: this.agent.id, sessionId: this.sessionId, cwd: this.cwd, title: this.title, active: true });
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

/** Sessions the panel opened ahead of time but never sent a message to. */
function closeUnusedSessions() {
  for (const s of sessions.values()) {
    if (!s.fresh || s.busy) continue;
    s.close();
    sessions.delete(s.key);
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

// Listing history spawns `codex app-server` and scans Claude transcripts, so
// results are reused briefly; panels show the cached list while it refreshes.
const HISTORY_TTL_MS = 30 * 1000;
let historyCache = { at: 0, limit: 0, list: null, pending: null };

async function history(limit) {
  const fresh = historyCache.list && Date.now() - historyCache.at < HISTORY_TTL_MS && historyCache.limit >= limit;
  if (fresh) return historyCache.list.slice(0, limit);
  if (!historyCache.pending) {
    historyCache.pending = loadHistory(Math.max(limit, 100))
      .then((list) => {
        historyCache = { at: Date.now(), limit: Math.max(limit, 100), list, pending: null };
        return list;
      })
      .catch((err) => {
        historyCache.pending = null;
        throw err;
      });
  }
  return (await historyCache.pending).slice(0, limit);
}

async function loadHistory(limit) {
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

const viewed = () => new Set([...clients].map((c) => c.viewing).filter(Boolean));

function closeSession(s) {
  s.close();
  sessions.delete(s.key);
  broadcast({ type: "closed", key: s.key });
}

/** Closes idle, unwatched sessions: all past the idle limit, then the oldest beyond the cap. */
function reapSessions() {
  const watching = viewed();
  const idle = [...sessions.values()]
    .filter((s) => !s.busy && !s.pending.size && !watching.has(s.key))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  idle.forEach((s, i) => {
    if (s.fresh || i >= MAX_IDLE_SESSIONS || Date.now() - s.updatedAt > IDLE_CLOSE_MS) closeSession(s);
  });
}

/** Native folder chooser, so the panel never asks for a typed path. */
function pickFolder(startDir, prompt) {
  const dir = startDir && existsSync(startDir) ? startDir : homedir();
  const run = (cmd, args) =>
    new Promise((resolve) => {
      execFile(cmd, args, { timeout: 10 * 60 * 1000 }, (err, stdout) => resolve(err ? null : stdout.trim().replace(/\/$/, "") || null));
    });
  if (process.platform === "darwin") {
    const q = (v) => JSON.stringify(v);
    return run("osascript", ["-e", "activate", "-e", `POSIX path of (choose folder with prompt ${q(prompt)} default location (POSIX file ${q(dir)}))`]);
  }
  if (process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${prompt.replace(/'/g, "''")}'; $d.SelectedPath = '${dir.replace(/'/g, "''")}'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`;
    return run("powershell", ["-NoProfile", "-STA", "-Command", ps]);
  }
  if (which("zenity")) return run("zenity", ["--file-selection", "--directory", `--title=${prompt}`, `--filename=${dir}/`]);
  if (which("kdialog")) return run("kdialog", ["--getexistingdirectory", dir, "--title", prompt]);
  throw new Error("No folder dialog available (install zenity or kdialog).");
}

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
    case "pick_folder":
      return reply({ type: "folder", path: await pickFolder(msg.start, msg.prompt || "Choose a folder") });
    case "open": {
      const existing = msg.resume && [...sessions.values()].find((x) => x.sessionId === msg.resume && x.agent.id === msg.agentId && !x.ended);
      const target = existing || (await openSession(msg));
      sock.viewing = target.key;
      reapSessions();
      return reply({ type: "opened", ...opened(target) });
    }
    case "attach":
      if (!s) throw new Error("This session is no longer running.");
      sock.viewing = s.key;
      reapSessions();
      return reply({ type: "opened", ...opened(s) });
    case "send":
      live().send(String(msg.text || ""), Array.isArray(msg.images) ? msg.images : [], Array.isArray(msg.thumbs) ? msg.thumbs : []);
      return reply({ type: "ok" });
    case "interrupt":
      // Stop means stop: drop what was waiting behind the current turn too.
      live().queue = [];
      await live().adapter.interrupt();
      return reply({ type: "ok" });
    case "set_model":
    case "set_mode":
    case "set_effort":
      try {
        if (msg.type === "set_model") await live().adapter.setModel(msg.model || null);
        else if (msg.type === "set_effort") await live().adapter.setEffort(msg.effort || null);
        else await live().adapter.setMode(msg.mode);
      } finally {
        s?.touch(); // resync the panel's selector if the agent refused
      }
      return reply({ type: "ok" });
    case "permission":
      s?.answer(msg.reqId, { optionId: msg.optionId, answers: msg.answers });
      return reply({ type: "ok" });
    case "close":
      if (s) closeSession(s);
      return reply({ type: "ok" });
    case "rename":
      if (s && typeof msg.title === "string" && msg.title.trim()) {
        s.title = msg.title.trim().slice(0, 120);
        if (s.agent.protocol === "acp" && s.sessionId) recordSession({ agentId: s.agent.id, sessionId: s.sessionId, cwd: s.cwd, title: s.title });
        s.touch();
      }
      return reply({ type: "ok" });
    case "view":
      sock.viewing = msg.key || null;
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
    const gone = () => {
      clients.delete(sock);
      if (clients.size === 0) closeUnusedSessions();
    };
    sock.viewing = null;
    sock.on("close", gone);
    sock.on("error", gone);
  });
  server.on("error", (err) => {
    log("server error", err.message);
    process.exit(1);
  });
  setInterval(reapSessions, 60 * 1000).unref();
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
