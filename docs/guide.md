# AgentDock

AgentDock puts the coding agents on your computer in the browser side panel. The layout follows the Claude in Chrome panel. You choose the agent per chat:

| Agent | How AgentDock talks to it |
|---|---|
| Claude Code | Claude Agent SDK (slash commands, skills, permission rules, history) |
| Codex | `codex app-server` |
| OpenCode | ACP (`opencode acp`) |
| Gemini CLI | ACP (`gemini --experimental-acp`) |
| Qwen Code | ACP (`qwen --experimental-acp`) |
| Anything else that speaks ACP | your command, from `~/.agentdock/agents.json` |

Everything runs locally and uses each agent's own login. AgentDock opens no network port.

## Install

You need Node 20 or newer, and at least one agent installed and signed in (run it once in a terminal).

```sh
npm install
npm run setup
```

`npm run setup` builds the extension into `extension/` and registers the native-messaging host for every Chromium browser it finds (Chrome, Chromium, Brave, Edge, Arc, Vivaldi). It also installs the background daemon: a LaunchAgent on macOS, or a systemd user service on Linux. On Windows the browser starts the daemon on demand. Setup also removes the earlier `com.claude.sidepanel` install.

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `extension/` folder. Click the toolbar icon to open the panel.

To remove AgentDock, run `npm run uninstall` and then remove the extension in the browser.

## Use

- The header's left side switches agent. The working folder is picked on the empty screen, before the first message: choose a recent folder, or "Choose folder…" to open the system folder dialog (macOS `choose folder`, zenity/kdialog on Linux, the Windows folder browser).
- Mode, model and effort are remembered per agent, so new chats start the way you left them.
- Thinking shows as "Thought for Ns" and tool runs as one quiet line; both expand smoothly. Each reply has a copy button.
- Idle sessions you are not looking at close after 10 minutes, and at most two idle ones are kept, because each agent process uses a few hundred MB. They reopen from History.
- A new chat starts its agent session straight away, without sending anything. Models, effort levels, modes and slash commands are therefore real before the first message, and the model/effort menu works immediately. An unused session closes when you change the agent or folder, or when the last panel closes.
- The composer has the original panel's controls: **+** attaches images (pasting or dropping them works too), the mode button toggles permission modes, the model menu also sets effort, and the mic dictates. The first time, the mic opens a tab that asks for microphone access, because a side panel cannot show that prompt itself.
- **Enter** sends and **Shift+Enter** adds a new line. Enter never sends while an input method (Telex, VNI, Pinyin…) is still composing.
- **/** lists the agent's slash commands and skills. `/new` starts a new chat and `/resume` opens the history.
- **Shift+Tab** cycles permission modes, **Esc** stops the agent and **Ctrl/⌘+N** starts a new chat.
- Permission requests and multiple-choice questions show up as cards in the chat.
- Closing the panel does not stop a session. Reopen the panel to continue it.
- **History** opens as a dialog over the chat (search stays on top while the list scrolls) and lists running chats plus earlier Claude Code and Codex sessions (including ones started in the terminal) and earlier ACP sessions started from AgentDock.
- **Settings** sets the language (English or Vietnamese, or follow the browser), the theme and the default agent.

### Custom agents

```json
[
  { "id": "goose", "name": "Goose", "command": ["goose", "acp"] },
  { "id": "my-agent", "name": "My agent", "command": ["/opt/my-agent", "--acp"], "env": { "MY_FLAG": "1" } }
]
```

Save this as `~/.agentdock/agents.json`. Custom entries speak ACP. An entry with the same `id` as a built-in agent replaces the built-in.

### Agent notes

- **Gemini CLI:** Google now rejects the CLI for individual Gemini Code Assist accounts ("migrate to Antigravity"). The panel shows that message as it comes back. API-key and Workspace sign-ins are unaffected.
- **Qwen Code, OpenCode:** sign in with the agent's own CLI first. A free OpenCode account can hit its usage limit; the panel shows that error too.
- **Images:** Claude Code and Codex accept them. ACP agents receive images only if they advertise image support. Otherwise the text goes alone, with a notice.

## How it works

```
side panel (React + zustand)
  │ chrome.runtime.connectNative("com.agentdock.bridge")
host/native-host.mjs     relays frames; started by the browser per panel
  │ Unix socket ~/.agentdock/daemon.sock (0600) · named pipe on Windows
host/daemon.mjs          owns sessions; survives panels being closed
  ├─ agents/claude-agent.mjs   Claude Agent SDK
  ├─ agents/codex-agent.mjs    codex app-server (JSON-RPC)
  └─ agents/acp-agent.mjs      Agent Client Protocol (JSON-RPC over stdio)
```

Each adapter turns its agent's output into one shared set of events (`text_delta`, `tool_start`, `permission_request`, `turn_end`, …). Because of that, the panel does not need to know which agent it is talking to.

The panel batches incoming events once per animation frame. Components subscribe to a single item or tool by id, so a streamed reply re-renders only the streaming block, and a finished tool re-renders only its own row. `tests/render-isolation.test.tsx` checks this.

Only the extension ID in `extension-id.json` may start the native host. The `key` in `public/manifest.json` keeps that ID stable.

## Develop

```sh
npm run dev          # rebuild the panel on change (reload the panel to see it)
npm test             # reducer, ACP adapter, render isolation
npm run typecheck
npm run smoke -- claude "Reply with PONG" /tmp      # end-to-end against the running daemon
node scripts/smoke-acp.mjs "Reply with PONG" opencode acp   # any ACP command through the real adapter
node scripts/e2e-browser.cjs                        # browser flow (needs playwright)
```

After changing anything in `host/`, restart the daemon:

- macOS: `launchctl kickstart -k gui/$(id -u)/com.agentdock.daemon`
- Linux: `systemctl --user restart agentdock`

## Troubleshooting

- **The panel says the local helper is not installed.** Run `npm run setup`, then reload the extension.
- **An agent is greyed out.** Its command is not on the `PATH` the daemon sees. The daemon uses the `PATH` from the shell that ran `npm run setup`, so install the agent and run setup again.
- **An agent asks you to sign in.** Run the command shown in Settings in a terminal.
- **Logs** are in `~/.agentdock/daemon.log`.
