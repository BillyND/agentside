// The browser starts this per side panel. It relays frames between native
// messaging (4-byte LE length + JSON on stdio) and the daemon socket
// (newline-delimited JSON), starting the daemon first if it is not running.
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openSync, mkdirSync } from "node:fs";
import { SOCKET_PATH, LAUNCH_LABEL, LOG_PATH, STATE_DIR } from "./paths.mjs";

const MAX_FRAME = 1024 * 1024;
const HERE = dirname(fileURLToPath(import.meta.url));

function writeFrame(obj) {
  let body = Buffer.from(JSON.stringify(obj), "utf8");
  if (body.length > MAX_FRAME) {
    body = Buffer.from(JSON.stringify({ type: "error", id: obj.id, key: obj.key, message: "Message too large to display." }));
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCKET_PATH);
    sock.once("connect", () => resolve(sock));
    sock.once("error", reject);
  });
}

function startDaemon() {
  if (process.platform === "darwin") {
    try {
      execFileSync("launchctl", ["kickstart", `gui/${process.getuid()}/${LAUNCH_LABEL}`], { stdio: "ignore" });
      return;
    } catch {}
  }
  if (process.platform === "linux") {
    try {
      execFileSync("systemctl", ["--user", "start", "agentside.service"], { stdio: "ignore" });
      return;
    } catch {}
  }
  // No service manager entry: run the daemon detached so it outlives this relay.
  mkdirSync(STATE_DIR, { recursive: true });
  const out = openSync(LOG_PATH, "a");
  spawn(process.execPath, [join(HERE, "daemon.mjs")], { detached: true, stdio: ["ignore", out, out], windowsHide: true }).unref();
}

async function connectWithStart() {
  try {
    return await connect();
  } catch {
    startDaemon();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        return await connect();
      } catch {}
    }
    throw new Error("Could not reach the AgentSide daemon. Run `npm run setup` again.");
  }
}

async function main() {
  let sock;
  try {
    sock = await connectWithStart();
  } catch (err) {
    writeFrame({ type: "fatal", message: err.message });
    setTimeout(() => process.exit(1), 100);
    return;
  }

  let out = "";
  sock.setEncoding("utf8");
  sock.on("data", (chunk) => {
    out += chunk;
    let i;
    while ((i = out.indexOf("\n")) >= 0) {
      const line = out.slice(0, i);
      out = out.slice(i + 1);
      if (!line.trim()) continue;
      try {
        writeFrame(JSON.parse(line));
      } catch {}
    }
  });
  sock.on("close", () => {
    writeFrame({ type: "fatal", message: "The AgentSide daemon disconnected." });
    setTimeout(() => process.exit(0), 100);
  });

  let inBuf = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    inBuf = Buffer.concat([inBuf, chunk]);
    while (inBuf.length >= 4) {
      const len = inBuf.readUInt32LE(0);
      if (inBuf.length < 4 + len) break;
      sock.write(inBuf.subarray(4, 4 + len).toString("utf8") + "\n");
      inBuf = inBuf.subarray(4 + len);
    }
  });
  // Panel closed: drop the relay; the daemon keeps the sessions alive.
  process.stdin.on("end", () => {
    sock.end();
    process.exit(0);
  });
}

main();
