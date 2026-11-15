// Claude Code through the Agent SDK, translated into the panel's event set.
import { query, listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { blocksText, inputQueue, log, readJson } from "../util.mjs";

/**
 * Effort Claude Code uses when none is chosen, from project local, project,
 * then user settings; a per-model `modelSettings[<model>].effortLevel` wins
 * over the top-level `effortLevel` within each file.
 */
export function configuredEffort(cwd, modelId) {
  const files = [join(cwd, ".claude/settings.local.json"), join(cwd, ".claude/settings.json"), join(homedir(), ".claude/settings.json")];
  for (const f of files) {
    const settings = readJson(f, {}) || {};
    const level = (modelId && settings.modelSettings?.[modelId]?.effortLevel) || settings.effortLevel;
    if (typeof level === "string" && level) return level;
  }
  return null;
}

export const CLAUDE_MODES = [
  { id: "default", name: "Ask before acting" },
  { id: "acceptEdits", name: "Accept edits" },
  { id: "plan", name: "Plan" },
  { id: "auto", name: "Auto" },
  { id: "bypassPermissions", name: "Bypass permissions" },
];

const HIDDEN_TOOLS = new Set(["ToolSearch"]);

export async function claudeHistory(limit) {
  const list = await listSessions({ limit });
  return list.map((s) => ({
    agentId: "claude",
    sessionId: s.sessionId,
    cwd: s.cwd,
    title: s.customTitle || s.summary || s.firstPrompt || null,
    updatedAt: s.lastModified,
  }));
}

export function createClaudeAgent(agent, opts, host) {
  const input = inputQueue();
  const hidden = new Set();
  let q;
  let chosenEffort = opts.effort || null;
  let modelList = [];
  const resolveModel = (id) => modelList.find((m) => m.value === (id || "default"))?.resolvedModel || id;
  // Until the user picks an effort, show the one Claude Code will use for this model.
  const showDefaultEffort = (modelId) => {
    if (!chosenEffort) host.update({ effort: configuredEffort(opts.cwd, resolveModel(modelId)) });
  };

  function toolStart(b, parentId) {
    if (HIDDEN_TOOLS.has(b.name)) {
      hidden.add(b.id);
      return;
    }
    host.emit({ type: "tool_start", id: b.id, name: b.name, input: b.input || {}, parentId: parentId || null });
  }

  function toolResults(content) {
    if (!Array.isArray(content)) return;
    for (const b of content) {
      if (b?.type !== "tool_result" || hidden.has(b.tool_use_id)) continue;
      host.emit({ type: "tool_update", id: b.tool_use_id, status: b.is_error ? "error" : "done", output: blocksText(b.content) });
    }
  }

  function assistantBlocks(blocks, parentId) {
    for (const b of blocks || []) {
      if (b.type === "tool_use") toolStart(b, parentId);
      else if (parentId) continue; // a subagent's own prose stays inside its tool card
      else if (b.type === "text" && b.text?.trim()) host.emit({ type: "text", text: b.text });
      else if (b.type === "thinking" && b.thinking?.trim()) host.emit({ type: "thought", text: b.thinking });
    }
  }

  function transcriptUser(content) {
    if (Array.isArray(content)) {
      const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (text) transcriptUser(text);
      toolResults(content);
      return;
    }
    if (typeof content !== "string") return;
    const cmd = content.match(/<command-name>([^<]*)<\/command-name>(?:[\s\S]*?<command-args>([^<]*)<\/command-args>)?/);
    if (cmd) return host.emit({ type: "user", text: `${cmd[1]} ${cmd[2] || ""}`.trim() });
    const out = content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
    if (out) return out[1].trim() && host.emit({ type: "output", text: out[1] });
    if (/^<(system-reminder|local-command-caveat)/.test(content.trim())) return;
    host.emit({ type: "user", text: content });
  }

  async function loadHistory(sessionId) {
    try {
      for (const m of await getSessionMessages(sessionId, { dir: opts.cwd })) {
        if (m.type === "assistant") assistantBlocks(m.message?.content, m.parent_tool_use_id);
        else if (m.type === "user") transcriptUser(m.message?.content);
      }
    } catch (err) {
      host.emit({ type: "notice", tone: "error", text: `History unavailable: ${err.message}` });
    }
  }

  function onMessage(msg) {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") host.update({ sessionId: msg.session_id, model: msg.model, mode: msg.permissionMode, effort: msg.effort ?? undefined });
        else if (msg.subtype === "compact_boundary") host.emit({ type: "compact" });
        else if (msg.subtype === "conversation_reset") host.emit({ type: "reset" });
        else if (typeof msg.content === "string" && msg.content.trim()) host.emit({ type: "output", text: msg.content });
        break;
      case "stream_event": {
        const e = msg.event;
        if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") host.emit({ type: "text_delta", text: e.delta.text }, { keep: false });
        else if (e?.type === "content_block_delta" && e.delta?.type === "thinking_delta") host.emit({ type: "thought_delta", text: e.delta.thinking }, { keep: false });
        break;
      }
      case "assistant":
        assistantBlocks(msg.message?.content, msg.parent_tool_use_id);
        break;
      case "user":
        toolResults(msg.message?.content);
        break;
      case "result": {
        const failed = msg.is_error || msg.subtype !== "success";
        const error = failed
          ? ((msg.errors && msg.errors.join("\n")) || msg.result || "")
              .split("\n")
              .filter((l) => l.trim() && !l.startsWith("[ede_diagnostic]") && !/interrupt/i.test(l))
              .join("\n")
          : "";
        if (!failed && msg.local_command && msg.result) host.emit({ type: "output", text: msg.result });
        host.emit({ type: "turn_end", durationMs: msg.duration_ms, error: error || undefined });
        break;
      }
    }
  }

  async function canUseTool(toolName, toolInput, o) {
    if (toolName === "AskUserQuestion") {
      const res = await host.askPermission({ kind: "question", questions: toolInput.questions || [] }, o.signal);
      if (!res || res.optionId === "reject") return { behavior: "deny", message: "The user skipped the question." };
      return { behavior: "allow", updatedInput: { ...toolInput, answers: res.answers || {} } };
    }
    const options = [{ id: "allow", label: "Allow", kind: "allow_once" }];
    if (o.suggestions?.length && !o.suppressAlwaysAllowRule) options.push({ id: "always", label: "Always allow", kind: "allow_always" });
    options.push({ id: "reject", label: "Deny", kind: "reject_once" });
    const res = await host.askPermission({ kind: "tool", toolName, input: toolInput, reason: o.decisionReason, options }, o.signal);
    if (!res || res.optionId === "reject") return { behavior: "deny", message: "The user denied this action." };
    const result = { behavior: "allow", updatedInput: toolInput };
    if (res.optionId === "always") result.updatedPermissions = o.suggestions;
    return result;
  }

  return {
    async start() {
      host.capabilities({ modes: CLAUDE_MODES });
      if (opts.resume) await loadHistory(opts.resume);
      if (chosenEffort) host.update({ effort: chosenEffort });
      q = query({
        prompt: input,
        options: {
          cwd: opts.cwd,
          resume: opts.resume || undefined,
          model: opts.model || undefined,
          effort: opts.effort || undefined,
          permissionMode: opts.mode || "default",
          // Lets the panel switch to bypass mode later, like the CLI's own flag.
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          systemPrompt: { type: "preset", preset: "claude_code" },
          settingSources: ["user", "project", "local"],
          pathToClaudeCodeExecutable: agent.path || undefined,
          env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "agentdock" },
          stderr: (line) => log("[claude stderr]", line.trimEnd()),
          canUseTool,
        },
      });
      (async () => {
        try {
          for await (const msg of q) onMessage(msg);
          host.ended();
        } catch (err) {
          host.ended(err);
        }
      })();
      Promise.all([q.supportedCommands(), q.supportedModels()])
        .then(([commands, models]) => {
          modelList = models;
          showDefaultEffort(opts.model);
          host.capabilities({
            commands: commands.map((c) => ({ name: c.name, description: c.description, hint: c.argumentHint })),
            models: models.map((m) => ({
              id: m.value,
              name: m.displayName || m.value,
              description: m.description,
              efforts: m.supportsEffort ? m.supportedEffortLevels || [] : [],
            })),
          });
        })
        .catch((err) => log("claude capabilities failed", err.message));
    },
    send(text, images = []) {
      const content = images.length
        ? [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.data } })), { type: "text", text }]
        : text;
      input.push({ type: "user", message: { role: "user", content }, parent_tool_use_id: null });
    },
    async interrupt() {
      await q?.interrupt();
    },
    async setMode(mode) {
      await q.setPermissionMode(mode);
      host.update({ mode });
    },
    async setModel(model) {
      await q.setModel(model || undefined);
      host.update({ model: model || null });
      showDefaultEffort(model);
    },
    async setEffort(effort) {
      await q.applyFlagSettings({ effortLevel: effort || null });
      chosenEffort = effort || null;
      host.update({ effort: effort || null });
    },
    close() {
      input.end();
      q?.close();
    },
  };
}
