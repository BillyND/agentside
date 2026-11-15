import { homedir, userInfo } from "node:os";
import { join } from "node:path";

export const APP_NAME = "AgentDock";
export const HOST_NAME = "com.agentdock.bridge";
export const LAUNCH_LABEL = "com.agentdock.daemon";
export const STATE_DIR = join(homedir(), ".agentdock");
export const SOCKET_PATH =
  process.platform === "win32" ? `\\\\.\\pipe\\agentdock-${userInfo().username}` : join(STATE_DIR, "daemon.sock");
export const CONFIG_PATH = join(STATE_DIR, "config.json");
export const AGENTS_PATH = join(STATE_DIR, "agents.json");
export const SESSIONS_PATH = join(STATE_DIR, "sessions.json");
export const LOG_PATH = join(STATE_DIR, "daemon.log");

// Earlier single-agent install, removed by the installer.
export const LEGACY = { hostName: "com.claude.sidepanel", launchLabel: "com.claude.sidepanel.daemon", stateDir: join(homedir(), ".claude-sidepanel") };
