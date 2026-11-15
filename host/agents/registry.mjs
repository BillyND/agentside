// Which coding agents the panel can drive, and how to start each one.
import { AGENTS_PATH, CONFIG_PATH } from "../paths.mjs";
import { readJson, which } from "../util.mjs";

/**
 * protocol:
 *  - "claude-sdk": Claude Agent SDK (full Claude Code feature set)
 *  - "codex":      `codex app-server` JSON-RPC
 *  - "acp":        Agent Client Protocol over stdio
 */
const BUILTIN = [
  { id: "claude", name: "Claude Code", protocol: "claude-sdk", bin: "claude", login: "claude" },
  { id: "codex", name: "Codex", protocol: "codex", bin: "codex", command: ["codex", "app-server"], login: "codex login" },
  { id: "opencode", name: "OpenCode", protocol: "acp", bin: "opencode", command: ["opencode", "acp"], login: "opencode auth login" },
  { id: "gemini", name: "Gemini CLI", protocol: "acp", bin: "gemini", command: ["gemini", "--experimental-acp"], login: "gemini" },
  { id: "qwen", name: "Qwen Code", protocol: "acp", bin: "qwen", command: ["qwen", "--experimental-acp"], login: "qwen" },
];

/**
 * Custom agents live in ~/.agentdock/agents.json:
 *   [{ "id": "goose", "name": "Goose", "command": ["goose", "acp"], "env": {} }]
 * Custom entries speak ACP unless they set "protocol".
 */
function customAgents() {
  const list = readJson(AGENTS_PATH, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a.id === "string" && Array.isArray(a.command) && a.command.length)
    .map((a) => ({ protocol: "acp", name: a.id, bin: a.command[0], custom: true, ...a }));
}

export function listAgents() {
  const config = readJson(CONFIG_PATH, {});
  const custom = customAgents();
  const ids = new Set(custom.map((a) => a.id));
  return [...BUILTIN.filter((a) => !ids.has(a.id)), ...custom].map((a) => {
    const path = a.id === "claude" && config.claudePath ? config.claudePath : which(a.bin);
    return { ...a, path, available: Boolean(path) };
  });
}

export function getAgent(id) {
  const agent = listAgents().find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  if (!agent.available) throw new Error(`${agent.name} is not installed (\`${agent.bin}\` not found on PATH).`);
  return agent;
}

/** Public view sent to the panel. */
export function describeAgents() {
  return listAgents().map(({ id, name, protocol, available, bin, login, custom }) => ({
    id,
    name,
    protocol,
    available,
    bin,
    login: login || null,
    custom: Boolean(custom),
  }));
}
