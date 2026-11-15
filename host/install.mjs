// One-time setup: native-messaging manifest for Chrome, launchd agent for the
// daemon, and the path to the user's own `claude` binary.
//   node host/install.mjs            install / refresh
//   node host/install.mjs uninstall  remove everything it created
import { writeFileSync, mkdirSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_NAME, LAUNCH_LABEL, STATE_DIR, CONFIG_PATH, LOG_PATH } from "./paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const EXTENSION_ID = JSON.parse(readFileSync(join(ROOT, "extension-id.json"), "utf8")).id;
const CHROME_HOSTS = join(homedir(), "Library/Application Support/Google/Chrome/NativeMessagingHosts");
const MANIFEST_PATH = join(CHROME_HOSTS, `${HOST_NAME}.json`);
const LAUNCHER_PATH = join(STATE_DIR, "native-host.sh");
const PLIST_PATH = join(homedir(), "Library/LaunchAgents", `${LAUNCH_LABEL}.plist`);
const uid = process.getuid();

function launchctl(...args) {
  try { execFileSync("launchctl", args, { stdio: "ignore" }); } catch {}
}

function findClaude() {
  try {
    return execFileSync("/bin/zsh", ["-lc", "whence -p claude"], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function install() {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(CHROME_HOSTS, { recursive: true });
  mkdirSync(dirname(PLIST_PATH), { recursive: true });

  const claudePath = findClaude();
  writeFileSync(CONFIG_PATH, JSON.stringify({ claudePath }, null, 2));

  // Chrome needs an executable path; the wrapper pins the node we were installed with.
  writeFileSync(LAUNCHER_PATH, `#!/bin/sh\nexec "${process.execPath}" "${join(HERE, "native-host.mjs")}" "$@"\n`);
  chmodSync(LAUNCHER_PATH, 0o755);

  writeFileSync(MANIFEST_PATH, JSON.stringify({
    name: HOST_NAME,
    description: "Claude Side Panel bridge",
    path: LAUNCHER_PATH,
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  }, null, 2));

  // Running the daemon under launchd keeps sessions alive across panels and keeps
  // `claude` out of Chrome's process tree (and its download quarantine).
  writeFileSync(PLIST_PATH, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCH_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(join(HERE, "daemon.mjs"))}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(homedir())}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(process.env.PATH || "/usr/bin:/bin")}</string>
    <key>HOME</key><string>${xml(homedir())}</string>
    <key>LANG</key><string>en_US.UTF-8</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(LOG_PATH)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG_PATH)}</string>
</dict>
</plist>
`);
  launchctl("bootout", `gui/${uid}/${LAUNCH_LABEL}`);
  launchctl("bootstrap", `gui/${uid}`, PLIST_PATH);

  console.log(`Extension ID : ${EXTENSION_ID}`);
  console.log(`claude       : ${claudePath || "không tìm thấy, SDK sẽ dùng bản đi kèm"}`);
  console.log(`Native host  : ${MANIFEST_PATH}`);
  console.log(`Daemon       : ${PLIST_PATH} (log: ${LOG_PATH})`);
  console.log("Tiếp theo: chrome://extensions → Load unpacked → chọn thư mục extension/");
}

function uninstall() {
  launchctl("bootout", `gui/${uid}/${LAUNCH_LABEL}`);
  rmSync(PLIST_PATH, { force: true });
  rmSync(MANIFEST_PATH, { force: true });
  rmSync(STATE_DIR, { recursive: true, force: true });
  console.log("Đã gỡ daemon, native host và ~/.claude-sidepanel");
}

process.argv[2] === "uninstall" ? uninstall() : install();
