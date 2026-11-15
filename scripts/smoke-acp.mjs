// Starts an ACP agent through the real adapter and reports how far it gets:
// handshake, session, models/modes, and optionally one prompt.
//   node scripts/smoke-acp.mjs "<prompt or ->" <command> [args...]
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAcpAgent } from "../host/agents/acp-agent.mjs";

const [prompt, ...command] = process.argv.slice(2);
const cwd = mkdtempSync(join(tmpdir(), "agentdock-acp-"));
const state = { caps: {}, patch: {} };
let done;
const finished = new Promise((r) => (done = r));
const host = {
  emit: (e) => {
    if (e.type === "notice") console.log("notice:", e.text);
    if (e.type === "turn_end") done(e);
  },
  update: (p) => Object.assign(state.patch, p),
  capabilities: (c) => Object.assign(state.caps, c),
  askPermission: async (req) => ({ optionId: req.options?.find((o) => o.kind === "allow_once")?.id }),
  cancelPermissions: () => {},
  ended: (err) => err && console.log("ended:", err.message.slice(0, 300)),
};
const agent = createAcpAgent({ id: "smoke", name: command[0], command, bin: command[0] }, { cwd }, host);
const timer = setTimeout(() => (console.log("TIMEOUT"), process.exit(1)), 240_000);
try {
  await agent.start();
  console.log("session:", state.patch.sessionId, "| modes:", (state.caps.modes || []).map((m) => m.id).join(","), "| models:", (state.caps.models || []).length);
  if (prompt && prompt !== "-") {
    agent.send(prompt);
    const end = await finished;
    console.log("turn:", end.error ? `error: ${end.error.slice(0, 300)}` : `ok (${end.stopReason})`);
  }
} catch (err) {
  console.log("start failed:", err.message.slice(0, 400));
}
clearTimeout(timer);
agent.close();
process.exit(0);
