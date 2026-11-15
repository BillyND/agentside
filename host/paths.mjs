import { homedir } from "node:os";
import { join } from "node:path";

export const HOST_NAME = "com.claude.sidepanel";
export const LAUNCH_LABEL = "com.claude.sidepanel.daemon";
export const STATE_DIR = join(homedir(), ".claude-sidepanel");
export const SOCKET_PATH = join(STATE_DIR, "daemon.sock");
export const CONFIG_PATH = join(STATE_DIR, "config.json");
export const LOG_PATH = join(STATE_DIR, "daemon.log");
