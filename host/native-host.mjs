// Chrome starts this per side panel. It only relays frames between Chrome's
// native-messaging stdio (4-byte LE length + JSON) and the daemon's socket
// (newline-delimited JSON), starting the daemon through launchd if needed.
import net from "node:net";
import { execFileSync } from "node:child_process";
import { SOCKET_PATH, LAUNCH_LABEL } from "./paths.mjs";

const MAX_FRAME = 1024 * 1024;

function writeFrame(obj) {
  let body = Buffer.from(JSON.stringify(obj), "utf8");
  if (body.length > MAX_FRAME) {
    body = Buffer.from(JSON.stringify({ type: "error", key: obj.key, message: "Tin nhắn quá lớn, đã bỏ qua" }));
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

async function connectWithStart() {
  try {
    return await connect();
  } catch {
    try {
      execFileSync("launchctl", ["kickstart", `gui/${process.getuid()}/${LAUNCH_LABEL}`], { stdio: "ignore" });
    } catch {}
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try { return await connect(); } catch {}
    }
    throw new Error("Không kết nối được daemon. Chạy lại: npm run setup");
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
      if (line.trim()) {
        try { writeFrame(JSON.parse(line)); } catch {}
      }
    }
  });
  sock.on("close", () => {
    writeFrame({ type: "fatal", message: "Daemon đã ngắt kết nối" });
    setTimeout(() => process.exit(0), 100);
  });

  let inBuf = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    inBuf = Buffer.concat([inBuf, chunk]);
    while (inBuf.length >= 4) {
      const len = inBuf.readUInt32LE(0);
      if (inBuf.length < 4 + len) break;
      const body = inBuf.subarray(4, 4 + len).toString("utf8");
      inBuf = inBuf.subarray(4 + len);
      sock.write(body + "\n");
    }
  });
  // Panel closed: drop our relay; the daemon keeps the sessions alive.
  process.stdin.on("end", () => {
    sock.end();
    process.exit(0);
  });
}

main();
