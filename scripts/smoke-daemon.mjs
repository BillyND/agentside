// End-to-end check against the running daemon: opens a session with the given
// agent, sends one prompt, auto-answers permissions, prints what came back.
//   node scripts/smoke-daemon.mjs <agentId> "<prompt>" [cwd] [mode]
import net from "node:net";
import { SOCKET_PATH } from "../host/paths.mjs";

const [agentId = "claude", prompt = "Reply with exactly: PONG", cwd = process.cwd(), mode] = process.argv.slice(2);
const sock = net.createConnection(SOCKET_PATH);
let seq = 0;
let buf = "";
let key;
const seen = {};
let text = "";
const send = (m) => sock.write(JSON.stringify({ id: ++seq, ...m }) + "\n");
const timer = setTimeout(() => finish("TIMEOUT"), 180_000);

function finish(status) {
  clearTimeout(timer);
  console.log(status, "| events:", JSON.stringify(seen), "| text:", text.trim().slice(0, 200));
  if (key) send({ type: "close", key });
  setTimeout(() => process.exit(status === "OK" ? 0 : 1), 200);
}

sock.on("data", (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.type === "hello") {
      console.log("agents:", m.agents.map((a) => `${a.id}${a.available ? "" : "(missing)"}`).join(" "));
      send({ type: "open", agentId, cwd, mode });
    } else if (m.type === "opened") {
      key = m.session.key;
      console.log("opened", agentId, "mode", m.session.mode, "model", m.session.model);
      send({ type: "send", key, text: prompt });
    } else if (m.type === "error") {
      console.log("ERROR", m.message);
      if (!key) finish("FAILED");
    } else if (m.type === "event" && m.key === key) {
      const e = m.event;
      seen[e.type] = (seen[e.type] || 0) + 1;
      if (e.type === "capabilities") console.log("capabilities: modes", e.modes.length, "models", e.models.length, "commands", e.commands.length);
      if (e.type === "text_delta") text += e.text;
      if (e.type === "text" && !text) text = e.text;
      if (e.type === "tool_start") console.log("tool", e.name, e.title || "", JSON.stringify(e.input).slice(0, 80));
      if (e.type === "permission_request") {
        console.log("permission", e.toolName, e.options.map((o) => o.id).join("/"));
        send({ type: "permission", key, reqId: e.reqId, optionId: e.options[0].id });
      }
      if (e.type === "notice") console.log("notice", e.tone || "", e.text);
      if (e.type === "turn_end") finish(e.error ? `TURN ERROR: ${e.error}` : "OK");
    }
  }
});
send({ type: "hello" });
