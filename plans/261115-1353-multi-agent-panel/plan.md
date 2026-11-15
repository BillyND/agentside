# Multi-agent side panel (AgentSide)

Status: done

## Outcome
A Chrome side panel that chats with any local coding agent (Claude Code, Codex, OpenCode, Gemini CLI, Qwen Code, or a custom ACP command). Layout follows the Claude in Chrome panel, with its own colour palette and open fonts. UI is React + zustand with per-item subscriptions. English and Vietnamese UI. Installs on macOS and Linux, best effort on Windows.

## Constraints
- Local only. Native messaging is locked to the extension ID. The Unix socket is mode 0600 (named pipe on Windows).
- No Anthropic fonts, logo or brand name in the product.
- Claude keeps the Agent SDK path (full slash commands, permission suggestions, history). Other agents go through ACP.

## Non-goals
- Chrome Web Store publishing, auto-update, telemetry.
- Browser-control tools (Helmsman covers that).
- Attachments and voice input.

## Design
- The daemon owns sessions. Adapters translate agent output into one event set: `user`, `text_delta`, `text`, `thought_delta`, `thought`, `tool_start`, `tool_update`, `plan`, `permission_request`, `question`, `permission_resolved`, `turn_end`, `output`, `notice`, `compact`, `reset`.
- `host/agents/claude-agent.mjs` uses the Agent SDK (with `allowDangerouslySkipPermissions`, so switching to bypass mode works).
- `host/agents/acp-agent.mjs` is a minimal JSON-RPC client with fs read/write, permissions, modes, model config options and session/load.
- The registry has built-in agent definitions, PATH detection and custom agents from `~/.agentside/agents.json`.
- The UI reducer is pure and batched per animation frame. Components select by id with `useShallow`.

## Acceptance
- A real Claude session works end to end: streaming, a tool call, a permission, a slash command, switching to bypass mode, and resume.
- A real ACP session (OpenCode) works: prompt, streaming and tool calls.
- Reducer unit tests and an ACP adapter test against a fake agent pass. Typecheck and build pass.
- Screenshots in light and dark mode, in both languages, look right.
- Installer covers Chrome, Chromium, Brave, Edge and Arc on macOS and Linux, and migrates the old `com.claude.sidepanel` install.
