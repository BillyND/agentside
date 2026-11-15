// One-time setup: native-messaging manifests for every Chromium browser found,
// a background service for the daemon, and removal of the old single-agent
// install.
//   node host/install.mjs            install / refresh
//   node host/install.mjs uninstall  remove everything it created
import { existsSync, writeFileSync, mkdirSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_NAME, LAUNCH_LABEL, STATE_DIR, CONFIG_PATH, LOG_PATH, LEGACY, APP_NAME } from "./paths.mjs";
import { which } from "./util.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const EXTENSION_ID = JSON.parse(readFileSync(join(ROOT, "extension-id.json"), "utf8")).id;
const HOME = homedir();
const platform = process.platform;

// Browser profile roots; a native-messaging manifest goes in <root>/NativeMessagingHosts.
const BROWSER_ROOTS = {
  darwin: [
    ["Google Chrome", "Library/Application Support/Google/Chrome"],
    ["Chrome Beta", "Library/Application Support/Google/Chrome Beta"],
    ["Chrome Canary", "Library/Application Support/Google/Chrome Canary"],
    ["Chromium", "Library/Application Support/Chromium"],
    ["Brave", "Library/Application Support/BraveSoftware/Brave-Browser"],
    ["Microsoft Edge", "Library/Application Support/Microsoft Edge"],
    ["Arc", "Library/Application Support/Arc/User Data"],
    ["Vivaldi", "Library/Application Support/Vivaldi"],
  ],
  linux: [
    ["Google Chrome", ".config/google-chrome"],
    ["Chrome Beta", ".config/google-chrome-beta"],
    ["Chromium", ".config/chromium"],
    ["Brave", ".config/BraveSoftware/Brave-Browser"],
    ["Microsoft Edge", ".config/microsoft-edge"],
    ["Vivaldi", ".config/vivaldi"],
  ],
};
const WINDOWS_KEYS = [
  ["Google Chrome", "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts"],
  ["Chromium", "HKCU\\Software\\Chromium\\NativeMessagingHosts"],
  ["Brave", "HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts"],
  ["Microsoft Edge", "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts"],
];

const PLIST_PATH = join(HOME, "Library/LaunchAgents", `${LAUNCH_LABEL}.plist`);
const UNIT_PATH = join(HOME, ".config/systemd/user/agentdock.service");
const launcherPath = (name) => join(STATE_DIR, platform === "win32" ? `${name}.cmd` : `${name}.sh`);

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function findClaude() {
  if (platform === "win32") return which("claude");
  try {
    const shell = process.env.SHELL || "/bin/sh";
    return execFileSync(shell, ["-lc", "command -v claude"], { encoding: "utf8" }).trim() || which("claude");
  } catch {
    return which("claude");
  }
}

function writeLauncher() {
  const path = launcherPath("native-host");
  const script = join(HERE, "native-host.mjs");
  if (platform === "win32") writeFileSync(path, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
  else {
    writeFileSync(path, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
    chmodSync(path, 0o755);
  }
  return path;
}

function manifest(path) {
  return JSON.stringify(
    { name: HOST_NAME, description: `${APP_NAME} bridge`, path, type: "stdio", allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] },
    null,
    2,
  );
}

function installManifests(launcher) {
  const installed = [];
  if (platform === "win32") {
    const file = join(STATE_DIR, `${HOST_NAME}.json`);
    writeFileSync(file, manifest(launcher));
    for (const [name, key] of WINDOWS_KEYS) {
      if (run("reg", ["add", `${key}\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", file, "/f"])) installed.push(name);
    }
    return installed;
  }
  for (const [name, rel] of BROWSER_ROOTS[platform] || []) {
    const root = join(HOME, rel);
    if (!existsSync(root) && name !== "Google Chrome") continue;
    const dir = join(root, "NativeMessagingHosts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${HOST_NAME}.json`), manifest(launcher));
    installed.push(name);
  }
  return installed;
}

function removeManifests(hostName) {
  if (platform === "win32") {
    for (const [, key] of WINDOWS_KEYS) run("reg", ["delete", `${key}\\${hostName}`, "/f"]);
    return;
  }
  for (const [, rel] of BROWSER_ROOTS[platform] || []) rmSync(join(HOME, rel, "NativeMessagingHosts", `${hostName}.json`), { force: true });
}

function installService() {
  const daemon = join(HERE, "daemon.mjs");
  if (platform === "darwin") {
    mkdirSync(dirname(PLIST_PATH), { recursive: true });
    // launchd keeps sessions alive across panels and keeps agent processes out
    // of the browser's process tree (and its download quarantine).
    writeFileSync(PLIST_PATH, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCH_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(process.execPath)}</string><string>${xml(daemon)}</string></array>
  <key>WorkingDirectory</key><string>${xml(HOME)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(process.env.PATH || "/usr/bin:/bin")}</string>
    <key>HOME</key><string>${xml(HOME)}</string>
    <key>LANG</key><string>${xml(process.env.LANG || "en_US.UTF-8")}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(LOG_PATH)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG_PATH)}</string>
</dict>
</plist>
`);
    run("launchctl", ["bootout", `gui/${process.getuid()}/${LAUNCH_LABEL}`]);
    run("launchctl", ["bootstrap", `gui/${process.getuid()}`, PLIST_PATH]);
    return `launchd (${PLIST_PATH})`;
  }
  if (platform === "linux" && which("systemctl")) {
    mkdirSync(dirname(UNIT_PATH), { recursive: true });
    writeFileSync(UNIT_PATH, `[Unit]
Description=${APP_NAME} daemon

[Service]
ExecStart="${process.execPath}" "${daemon}"
Environment="PATH=${process.env.PATH || "/usr/bin:/bin"}"
Restart=always

[Install]
WantedBy=default.target
`);
    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", "--now", "agentdock.service"]);
    run("systemctl", ["--user", "restart", "agentdock.service"]);
    return `systemd user service (${UNIT_PATH})`;
  }
  return "started on demand by the browser";
}

function removeLegacy() {
  if (platform === "darwin") {
    run("launchctl", ["bootout", `gui/${process.getuid()}/${LEGACY.launchLabel}`]);
    rmSync(join(HOME, "Library/LaunchAgents", `${LEGACY.launchLabel}.plist`), { force: true });
  }
  removeManifests(LEGACY.hostName);
  rmSync(LEGACY.stateDir, { recursive: true, force: true });
}

function install() {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  removeLegacy();
  const claudePath = findClaude();
  writeFileSync(CONFIG_PATH, JSON.stringify({ claudePath }, null, 2));
  const browsers = installManifests(writeLauncher());
  const service = installService();
  console.log(`${APP_NAME} installed.`);
  console.log(`  Extension ID : ${EXTENSION_ID}`);
  console.log(`  Browsers     : ${browsers.join(", ") || "none found"}`);
  console.log(`  Daemon       : ${service}`);
  console.log(`  Log          : ${LOG_PATH}`);
  console.log("Next: open chrome://extensions, turn on Developer mode, click \"Load unpacked\" and pick the extension/ folder.");
}

function uninstall() {
  if (platform === "darwin") {
    run("launchctl", ["bootout", `gui/${process.getuid()}/${LAUNCH_LABEL}`]);
    rmSync(PLIST_PATH, { force: true });
  }
  if (platform === "linux" && existsSync(UNIT_PATH)) {
    run("systemctl", ["--user", "disable", "--now", "agentdock.service"]);
    rmSync(UNIT_PATH, { force: true });
  }
  removeManifests(HOST_NAME);
  removeLegacy();
  rmSync(STATE_DIR, { recursive: true, force: true });
  console.log(`${APP_NAME} removed (daemon, native host and ~/.agentdock).`);
}

process.argv[2] === "uninstall" ? uninstall() : install();
