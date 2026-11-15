// Any agent that speaks the Agent Client Protocol (OpenCode, Gemini CLI,
// Qwen Code, custom commands), translated into the panel's event set.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { JsonRpc, methodNotFound } from "../json-rpc.mjs";
import { blocksText, log } from "../util.mjs";

const TOOL_STATUS = { pending: "running", in_progress: "running", completed: "done", failed: "error" };

export function createAcpAgent(agent, opts, host) {
  let child;
  let rpc;
  let sessionId = opts.resume || null;
  let modelOptionId = null;
  let effortOptionId = null;
  let acceptsImages = false;
  let userBuffer = "";
  let stderrTail = "";
  let started = 0;
  let closing = false;

  // During session/load the agent replays user turns as chunks.
  const flushUser = () => {
    if (userBuffer.trim()) host.emit({ type: "user", text: userBuffer });
    userBuffer = "";
  };

  function toolEvent(type, u) {
    const diffs = (u.content || []).filter((c) => c.type === "diff").map((c) => ({ path: c.path, oldText: c.oldText ?? null, newText: c.newText }));
    const output = (u.content || []).filter((c) => c.type === "content").map((c) => blocksText(c.content)).join("\n");
    const event = { type, id: u.toolCallId };
    if (type === "tool_start") {
      Object.assign(event, { name: u.kind || "other", title: u.title, kind: u.kind, input: u.rawInput || {}, parentId: null });
    } else {
      if (u.title) event.title = u.title;
      if (u.rawInput) event.input = u.rawInput;
    }
    if (u.status) event.status = TOOL_STATUS[u.status] || "running";
    if (diffs.length) event.diffs = diffs;
    if (output) event.output = output;
    else if (u.rawOutput && u.status && u.status !== "in_progress") event.output = typeof u.rawOutput === "string" ? u.rawOutput : JSON.stringify(u.rawOutput, null, 2);
    if (u.locations?.length) event.locations = u.locations;
    host.emit(event);
  }

  const flatOptions = (opt) => opt.options.flatMap((o) => (o.options ? o.options : [o]));

  function applyConfig(configOptions) {
    const select = (category) => (configOptions || []).find((o) => o.category === category && o.type === "select");
    const model = select("model");
    const effort = select("thought_level");
    if (effort) {
      effortOptionId = effort.id;
      host.update({ effort: effort.currentValue });
    }
    if (!model) return;
    modelOptionId = model.id;
    const efforts = effort ? flatOptions(effort).map((o) => o.value) : [];
    host.capabilities({ models: flatOptions(model).map((o) => ({ id: o.value, name: o.name, description: o.description, efforts })) });
    host.update({ model: model.currentValue });
  }

  function applyModes(modes) {
    if (!modes) return;
    host.capabilities({ modes: modes.availableModes.map((m) => ({ id: m.id, name: m.name, description: m.description })) });
    host.update({ mode: modes.currentModeId });
  }

  function onUpdate(u) {
    if (u.sessionUpdate !== "user_message_chunk") flushUser();
    switch (u.sessionUpdate) {
      case "user_message_chunk":
        userBuffer += blocksText([u.content]);
        break;
      case "agent_message_chunk":
        host.emit({ type: "text_delta", text: blocksText([u.content]) });
        break;
      case "agent_thought_chunk":
        host.emit({ type: "thought_delta", text: blocksText([u.content]) });
        break;
      case "tool_call":
        toolEvent("tool_start", u);
        break;
      case "tool_call_update":
        toolEvent("tool_update", u);
        break;
      case "plan":
        host.emit({ type: "plan", entries: (u.entries || []).map((e) => ({ content: e.content, status: e.status })) });
        break;
      case "available_commands_update":
        host.capabilities({ commands: (u.availableCommands || []).map((c) => ({ name: c.name, description: c.description, hint: c.input?.hint })) });
        break;
      case "current_mode_update":
        host.update({ mode: u.currentModeId });
        break;
      case "config_option_update":
        applyConfig(u.configOptions);
        break;
      case "session_info_update":
        if (u.title) host.update({ title: u.title });
        break;
      case "notice":
        host.emit({ type: "notice", text: [u.title, u.description].filter(Boolean).join(": "), tone: u.severity === "error" ? "error" : undefined });
        break;
      case "compaction_update":
        if (u.status === "completed") host.emit({ type: "compact" });
        break;
    }
  }

  async function onRequest(method, params) {
    switch (method) {
      case "session/request_permission": {
        const res = await host.askPermission({
          kind: "tool",
          toolName: params.toolCall?.kind || "other",
          title: params.toolCall?.title,
          input: params.toolCall?.rawInput || {},
          options: (params.options || []).map((o) => ({ id: o.optionId, label: o.name, kind: o.kind })),
        });
        return { outcome: res ? { outcome: "selected", optionId: res.optionId } : { outcome: "cancelled" } };
      }
      case "fs/read_text_file": {
        const text = await readFile(params.path, "utf8");
        if (!params.line && !params.limit) return { content: text };
        const lines = text.split("\n");
        const from = Math.max(0, (params.line || 1) - 1);
        return { content: lines.slice(from, params.limit ? from + params.limit : undefined).join("\n") };
      }
      case "fs/write_text_file":
        await mkdir(dirname(params.path), { recursive: true });
        await writeFile(params.path, params.content);
        return {};
      default:
        throw methodNotFound(method);
    }
  }

  return {
    async start() {
      const [cmd, ...args] = agent.command;
      child = spawn(agent.path && cmd === agent.bin ? agent.path : cmd, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(agent.env || {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c) => {
        stderrTail = (stderrTail + c).slice(-2000);
        log(`[${agent.id} stderr]`, c.trimEnd());
      });
      child.on("error", (err) => host.ended(err));
      child.on("exit", (code) => {
        if (closing) return;
        host.ended(code ? new Error(`${agent.name} exited (code ${code}). ${stderrTail.trim().split("\n").slice(-3).join(" ")}`) : undefined);
      });
      rpc = new JsonRpc(child, {
        onRequest,
        onNotification: (method, params) => method === "session/update" && onUpdate(params.update || {}),
        onLog: (line) => log(`[${agent.id}]`, line),
      });

      const init = await rpc.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
        clientInfo: { name: "agentside", version: "1.0.0" },
      });
      const canLoad = Boolean(init?.agentCapabilities?.loadSession);
      acceptsImages = Boolean(init?.agentCapabilities?.promptCapabilities?.image);
      try {
        let res;
        if (opts.resume && canLoad) {
          res = await rpc.request("session/load", { sessionId: opts.resume, cwd: opts.cwd, mcpServers: [] });
          flushUser();
        } else {
          if (opts.resume) host.emit({ type: "notice", text: `${agent.name} cannot reopen old sessions; starting a new one.` });
          res = await rpc.request("session/new", { cwd: opts.cwd, mcpServers: [] });
          sessionId = res.sessionId;
        }
        host.update({ sessionId });
        applyModes(res?.modes);
        applyConfig(res?.configOptions);
        if (opts.mode && res?.modes && opts.mode !== res.modes.currentModeId) await this.setMode(opts.mode).catch(() => {});
        if (opts.model && modelOptionId) await this.setModel(opts.model).catch(() => {});
        if (opts.effort && effortOptionId) await this.setEffort(opts.effort).catch(() => {});
      } catch (err) {
        if (init?.authMethods?.length && /auth/i.test(err.message)) {
          throw new Error(`${agent.name} needs you to sign in. Run \`${agent.login || agent.bin}\` in a terminal, then try again.`);
        }
        throw err;
      }
    },
    send(text, images = []) {
      started = Date.now();
      if (images.length && !acceptsImages) host.emit({ type: "notice", text: `${agent.name} does not accept images; sent the text only.` });
      const prompt = [...(acceptsImages ? images.map((i) => ({ type: "image", data: i.data, mimeType: i.mimeType })) : []), { type: "text", text }];
      rpc
        .request("session/prompt", { sessionId, prompt })
        .then((res) => host.emit({ type: "turn_end", durationMs: Date.now() - started, stopReason: res?.stopReason }))
        .catch((err) => host.emit({ type: "turn_end", durationMs: Date.now() - started, error: err.message }));
    },
    async interrupt() {
      rpc?.notify("session/cancel", { sessionId });
      host.cancelPermissions();
    },
    async setMode(mode) {
      await rpc.request("session/set_mode", { sessionId, modeId: mode });
      host.update({ mode });
    },
    async setModel(model) {
      if (!modelOptionId) throw new Error(`${agent.name} does not let clients pick a model.`);
      const res = await rpc.request("session/set_config_option", { sessionId, configId: modelOptionId, value: model });
      if (res?.configOptions) applyConfig(res.configOptions);
      else host.update({ model });
    },
    async setEffort(level) {
      if (!effortOptionId) throw new Error(`${agent.name} does not let clients pick an effort level.`);
      const res = await rpc.request("session/set_config_option", { sessionId, configId: effortOptionId, value: level });
      if (res?.configOptions) applyConfig(res.configOptions);
      else host.update({ effort: level });
    },
    close() {
      closing = true;
      child?.kill();
    },
  };
}
