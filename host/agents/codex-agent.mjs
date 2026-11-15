// Codex through its own `codex app-server` JSON-RPC protocol, translated into
// the panel's event set. (The ACP adapter for Codex lags behind Codex
// releases and fails on newer config files.)
import { spawn } from "node:child_process";
import { JsonRpc, methodNotFound } from "../json-rpc.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../util.mjs";
import { STATE_DIR } from "../paths.mjs";

function uploadDir() {
  const dir = join(STATE_DIR, "uploads");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export const CODEX_MODES = [
  { id: "read-only", name: "Read only", approvalPolicy: "on-request", sandboxPolicy: { type: "readOnly" } },
  { id: "auto", name: "Auto", approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite" } },
  { id: "full-access", name: "Full access", approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } },
];

const PLAN_STATUS = { pending: "pending", inProgress: "in_progress", completed: "completed" };

/** `/bin/zsh -lc 'cat x'` → `cat x`: show the command the model wrote, not Codex's shell wrapper. */
export function unwrapShell(command = "") {
  const m = /^\S*\/(?:ba|z)?sh -l?c '([\s\S]*)'$/.exec(command);
  return m ? m[1].replace(/'\\''/g, "'") : command;
}

function startServer(agent, cwd) {
  const child = spawn(agent.path || "codex", agent.command.slice(1), { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c) => log("[codex stderr]", c.trimEnd()));
  return child;
}

async function handshake(rpc) {
  await rpc.request("initialize", { clientInfo: { name: "agentdock", title: "AgentDock", version: "1.0.0" } });
  rpc.notify("initialized", {});
}

const toMs = (t) => (t && t < 1e12 ? t * 1000 : t);

export async function codexHistory(agent, limit) {
  const child = startServer(agent, process.env.HOME);
  const rpc = new JsonRpc(child, { onRequest: async (m) => { throw methodNotFound(m); }, onNotification: () => {} });
  try {
    await handshake(rpc);
    const res = await rpc.request("thread/list", { limit });
    return (res?.data || []).map((t) => ({
      agentId: agent.id,
      sessionId: t.id,
      cwd: t.cwd,
      title: t.name || t.preview || null,
      updatedAt: toMs(t.updatedAt),
    }));
  } finally {
    child.kill();
  }
}

export function createCodexAgent(agent, opts, host) {
  let child;
  let rpc;
  let threadId = opts.resume || null;
  let turnId = null;
  let mode = CODEX_MODES.find((m) => m.id === opts.mode) || CODEX_MODES[1];
  let model = opts.model || null;
  let effort = opts.effort || null;
  let closing = false;
  const outputs = new Map(); // command item id -> streamed output

  function itemStart(item) {
    switch (item.type) {
      case "commandExecution":
        host.emit({ type: "tool_start", id: item.id, name: "Bash", input: { command: unwrapShell(item.command), cwd: item.cwd }, parentId: null });
        break;
      case "fileChange":
        host.emit({
          type: "tool_start",
          id: item.id,
          name: "edit",
          kind: "edit",
          title: item.changes?.map((c) => c.path).join(", ") || "Edit files",
          input: {},
          diffs: (item.changes || []).map((c) => ({ path: c.path, unified: c.diff })),
          parentId: null,
        });
        break;
      case "mcpToolCall":
        host.emit({ type: "tool_start", id: item.id, name: `mcp__${item.server}__${item.tool}`, input: item.arguments || {}, parentId: null });
        break;
      case "dynamicToolCall":
        host.emit({ type: "tool_start", id: item.id, name: item.tool, input: item.arguments || {}, parentId: null });
        break;
      case "webSearch":
        host.emit({ type: "tool_start", id: item.id, name: "WebSearch", input: { query: item.query }, parentId: null });
        break;
      case "collabAgentToolCall":
        host.emit({ type: "tool_start", id: item.id, name: "Task", input: { description: item.prompt || item.tool }, parentId: null });
        break;
      case "contextCompaction":
        host.emit({ type: "compact" });
        break;
    }
  }

  function itemDone(item) {
    const failed = item.status === "failed" || item.status === "declined";
    switch (item.type) {
      case "agentMessage":
        if (item.text?.trim()) host.emit({ type: "text", text: item.text });
        break;
      case "reasoning": {
        const text = [...(item.summary || []), ...(item.content || [])].join("\n").trim();
        if (text) host.emit({ type: "thought", text });
        break;
      }
      case "commandExecution":
        outputs.delete(item.id);
        host.emit({ type: "tool_update", id: item.id, status: failed || (item.exitCode ?? 0) !== 0 ? "error" : "done", output: item.aggregatedOutput || "" });
        break;
      case "fileChange":
        host.emit({ type: "tool_update", id: item.id, status: failed ? "error" : "done" });
        break;
      case "mcpToolCall":
      case "dynamicToolCall":
        host.emit({
          type: "tool_update",
          id: item.id,
          status: item.error || failed ? "error" : "done",
          output: item.error?.message || (item.result ? JSON.stringify(item.result, null, 2) : ""),
        });
        break;
      case "webSearch":
      case "collabAgentToolCall":
        host.emit({ type: "tool_update", id: item.id, status: failed ? "error" : "done" });
        break;
    }
  }

  function replay(turns) {
    for (const turn of turns || []) {
      for (const item of turn.items || []) {
        if (item.type === "userMessage") {
          const text = (item.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
          if (text) host.emit({ type: "user", text });
          continue;
        }
        itemStart(item);
        itemDone(item);
      }
    }
  }

  function onNotification(method, p) {
    if (p.threadId && threadId && p.threadId !== threadId) return;
    switch (method) {
      case "item/started":
        itemStart(p.item);
        break;
      case "item/completed":
        itemDone(p.item);
        break;
      case "item/agentMessage/delta":
        host.emit({ type: "text_delta", text: p.delta }, { keep: false });
        break;
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta":
        host.emit({ type: "thought_delta", text: p.delta }, { keep: false });
        break;
      case "item/commandExecution/outputDelta": {
        const out = (outputs.get(p.itemId) || "") + p.delta;
        outputs.set(p.itemId, out);
        host.emit({ type: "tool_update", id: p.itemId, output: out }, { keep: false });
        break;
      }
      case "turn/plan/updated":
        host.emit({ type: "plan", entries: (p.plan || []).map((s) => ({ content: s.step, status: PLAN_STATUS[s.status] || "pending" })) });
        break;
      case "turn/started":
        turnId = p.turn?.id || turnId;
        break;
      case "turn/completed":
        turnId = null;
        host.emit({
          type: "turn_end",
          durationMs: p.turn?.durationMs,
          error: p.turn?.status === "failed" ? p.turn?.error?.message || "Turn failed" : undefined,
        });
        break;
      case "error":
        if (!p.willRetry) host.emit({ type: "notice", tone: "error", text: p.error?.message || "Codex error" });
        break;
      case "thread/name/updated":
        if (p.name) host.update({ title: p.name });
        break;
    }
  }

  async function approval(kind, p) {
    const title = kind === "command" ? "Run command" : "Edit files";
    const res = await host.askPermission({
      kind: "tool",
      toolName: kind === "command" ? "Bash" : "edit",
      title,
      input: kind === "command" ? { command: unwrapShell(p.command), cwd: p.cwd } : { reason: p.reason },
      reason: p.reason || undefined,
      options: [
        { id: "accept", label: "Allow", kind: "allow_once" },
        { id: "acceptForSession", label: "Allow for this session", kind: "allow_always" },
        { id: "decline", label: "Deny", kind: "reject_once" },
      ],
    });
    return { decision: res?.optionId || "cancel" };
  }

  async function onRequest(method, p) {
    if (method === "item/commandExecution/requestApproval") return approval("command", p);
    if (method === "item/fileChange/requestApproval") return approval("file", p);
    throw methodNotFound(method);
  }

  return {
    async start() {
      child = startServer(agent, opts.cwd);
      child.on("error", (err) => host.ended(err));
      child.on("exit", (code) => !closing && host.ended(code ? new Error(`Codex exited (code ${code}).`) : undefined));
      rpc = new JsonRpc(child, { onRequest, onNotification, onLog: (l) => log("[codex]", l) });
      await handshake(rpc);
      host.capabilities({ modes: CODEX_MODES.map(({ id, name }) => ({ id, name })) });
      host.update({ mode: mode.id });

      const params = { cwd: opts.cwd, approvalPolicy: mode.approvalPolicy, model: model || undefined };
      const res = opts.resume
        ? await rpc.request("thread/resume", { ...params, threadId: opts.resume })
        : await rpc.request("thread/start", params);
      threadId = res.thread.id;
      effort = effort || res.reasoningEffort || null;
      host.update({ sessionId: threadId, model: res.model || model, effort, title: res.thread.name || null });
      if (opts.resume) replay(res.thread.turns);

      rpc
        .request("model/list", {})
        .then((r) => host.capabilities({
          models: (r?.data || []).filter((m) => !m.hidden).map((m) => ({
            id: m.model || m.id,
            name: m.displayName || m.model,
            description: m.description,
            efforts: (m.supportedReasoningEfforts || []).map((e) => e.reasoningEffort || e),
          })),
        }))
        .catch((err) => log("codex model/list failed", err.message));
    },
    send(text, images = []) {
      // Codex takes images as files on disk.
      const files = images.map((img, i) => {
        const path = join(uploadDir(), `${Date.now()}-${i}.${img.mimeType.split("/")[1] || "png"}`);
        writeFileSync(path, Buffer.from(img.data, "base64"));
        return { type: "localImage", path };
      });
      rpc
        .request("turn/start", {
          threadId,
          input: [...files, { type: "text", text, text_elements: [] }],
          approvalPolicy: mode.approvalPolicy,
          sandboxPolicy: mode.sandboxPolicy,
          model: model || undefined,
          effort: effort || undefined,
        })
        .then((r) => (turnId = r?.turn?.id || turnId))
        .catch((err) => host.emit({ type: "turn_end", error: err.message }));
    },
    async interrupt() {
      host.cancelPermissions();
      if (turnId) await rpc.request("turn/interrupt", { threadId, turnId });
    },
    async setMode(id) {
      mode = CODEX_MODES.find((m) => m.id === id) || mode;
      host.update({ mode: mode.id });
    },
    async setModel(id) {
      model = id || null;
      host.update({ model });
    },
    async setEffort(level) {
      effort = level || null;
      host.update({ effort });
    },
    close() {
      closing = true;
      child?.kill();
    },
  };
}
