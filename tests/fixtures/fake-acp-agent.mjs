// Minimal ACP agent for tests: streams a reply, runs one tool behind a
// permission request, writes a file through the client, and sends a plan.
import { createInterface } from "node:readline";

let seq = 1000;
const waiting = new Map();
const write = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
const notify = (sessionId, update) => write({ method: "session/update", params: { sessionId, update } });
const ask = (method, params) =>
  new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    write({ id, method, params });
  });

createInterface({ input: process.stdin }).on("line", async (line) => {
  const msg = JSON.parse(line);
  if (msg.id !== undefined && !msg.method) return waiting.get(msg.id)?.(msg.result ?? msg.error);
  const { id, method, params } = msg;
  if (method === "initialize") {
    return write({ id, result: { protocolVersion: 1, agentCapabilities: { loadSession: false }, authMethods: [] } });
  }
  if (method === "session/new") {
    write({
      id,
      result: {
        sessionId: "fake-1",
        modes: { currentModeId: "ask", availableModes: [{ id: "ask", name: "Ask" }, { id: "code", name: "Code" }] },
        configOptions: [{ id: "model", name: "Model", category: "model", type: "select", currentValue: "m1", options: [{ value: "m1", name: "Model One" }, { value: "m2", name: "Model Two" }] }],
      },
    });
    notify("fake-1", { sessionUpdate: "available_commands_update", availableCommands: [{ name: "review", description: "Review code" }] });
    return;
  }
  if (method === "session/set_mode") {
    notify(params.sessionId, { sessionUpdate: "current_mode_update", currentModeId: params.modeId });
    return write({ id, result: {} });
  }
  if (method === "session/prompt") {
    const sid = params.sessionId;
    notify(sid, { sessionUpdate: "plan", entries: [{ content: "Write file", priority: "high", status: "in_progress" }] });
    notify(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Writing " } });
    notify(sid, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "the file." } });
    notify(sid, { sessionUpdate: "tool_call", toolCallId: "call-1", title: "Write out.txt", kind: "edit", status: "pending", rawInput: { path: "out.txt" } });
    const perm = await ask("session/request_permission", {
      sessionId: sid,
      toolCall: { toolCallId: "call-1", title: "Write out.txt", kind: "edit" },
      options: [
        { optionId: "yes", name: "Allow", kind: "allow_once" },
        { optionId: "no", name: "Reject", kind: "reject_once" },
      ],
    });
    if (perm?.outcome?.optionId === "yes") {
      await ask("fs/write_text_file", { sessionId: sid, path: `${process.cwd()}/out.txt`, content: params.prompt[0].text });
      const read = await ask("fs/read_text_file", { sessionId: sid, path: `${process.cwd()}/out.txt` });
      notify(sid, {
        sessionUpdate: "tool_call_update",
        toolCallId: "call-1",
        status: "completed",
        content: [{ type: "diff", path: "out.txt", oldText: null, newText: read.content }],
      });
    } else {
      notify(sid, { sessionUpdate: "tool_call_update", toolCallId: "call-1", status: "failed" });
    }
    notify(sid, { sessionUpdate: "plan", entries: [{ content: "Write file", priority: "high", status: "completed" }] });
    return write({ id, result: { stopReason: "end_turn" } });
  }
  if (method === "session/cancel") return;
  if (id !== undefined) write({ id, error: { code: -32601, message: "nope" } });
});
