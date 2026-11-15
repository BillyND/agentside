// Which coding agents the panel can drive, and how to start each one.
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENTS_PATH, CONFIG_PATH } from "../paths.mjs";
import { readJson, which } from "../util.mjs";

const versionOf = (s) => (/(\d+)\.(\d+)\.(\d+)/.exec(s || "") || []).slice(1).map(Number);
const newer = (a, b) => {
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};
const cliVersions = new Map();
function cliVersion(path) {
  if (!cliVersions.has(path)) {
    try {
      cliVersions.set(path, versionOf(execFileSync(path, ["--version"], { encoding: "utf8", timeout: 5000 })));
    } catch {
      cliVersions.set(path, []);
    }
  }
  return cliVersions.get(path);
}

/**
 * The Codex desktop app keeps its own, often newer, Codex build under
 * ~/.codex/packages. Config files follow the newest build, so an older CLI on
 * PATH can fail to read them; use whichever build is newest.
 */
function newestCodex(onPath) {
  let best = onPath;
  let bestVersion = onPath ? cliVersion(onPath) : [];
  const root = join(homedir(), ".codex/packages");
  if (!existsSync(root)) return best;
  for (const pkg of readdirSync(root)) {
    const releases = join(root, pkg, "releases");
    if (!existsSync(releases)) continue;
    for (const rel of readdirSync(releases)) {
      const bin = join(releases, rel, "bin/codex");
      if (existsSync(bin) && newer(versionOf(rel), bestVersion)) {
        best = bin;
        bestVersion = versionOf(rel);
      }
    }
  }
  return best;
}

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
 * Custom agents live in ~/.agentside/agents.json:
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
    let path = a.id === "claude" && config.claudePath ? config.claudePath : which(a.bin);
    if (a.id === "codex" && !a.custom) path = newestCodex(path);
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
