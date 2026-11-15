import { homedir, userInfo } from "node:os";
import { join } from "node:path";

export const APP_NAME = "AgentSide";
export const HOST_NAME = "com.agentside.bridge";
export const LAUNCH_LABEL = "com.agentside.daemon";
export const STATE_DIR = join(homedir(), ".agentside");
export const SOCKET_PATH =
  process.platform === "win32" ? `\\\\.\\pipe\\agentside-${userInfo().username}` : join(STATE_DIR, "daemon.sock");
export const CONFIG_PATH = join(STATE_DIR, "config.json");
export const AGENTS_PATH = join(STATE_DIR, "agents.json");
export const SESSIONS_PATH = join(STATE_DIR, "sessions.json");
export const LOG_PATH = join(STATE_DIR, "daemon.log");

// Earlier installs under previous names, removed by the installer.
export const LEGACY = [
  { hostName: "com.agentdock.bridge", launchLabel: "com.agentdock.daemon", systemdUnit: "agentdock.service", stateDir: join(homedir(), ".agentdock") },
  { hostName: "com.claude.sidepanel", launchLabel: "com.claude.sidepanel.daemon", stateDir: join(homedir(), ".claude-sidepanel") },
];
