import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAcpAgent } from "../host/agents/acp-agent.mjs";
import { unwrapShell } from "../host/agents/codex-agent.mjs";

const FAKE = join(dirname(fileURLToPath(import.meta.url)), "fixtures/fake-acp-agent.mjs");

function fakeHost(answer) {
  const events = [];
  const state = { capabilities: {}, patch: {} };
  let resolveEnd;
  const done = new Promise((r) => (resolveEnd = r));
  return {
    events,
    state,
    done,
    host: {
      emit: (ev) => {
        events.push(ev);
        if (ev.type === "turn_end") resolveEnd(ev);
      },
      update: (p) => Object.assign(state.patch, p),
      capabilities: (c) => Object.assign(state.capabilities, c),
      askPermission: async (req) => {
        events.push({ type: "asked", ...req });
        return answer ? { optionId: answer } : null;
      },
      cancelPermissions: () => {},
      ended: (err) => err && events.push({ type: "ended", error: err.message }),
    },
  };
}

const agentDef = { id: "fake", name: "Fake", protocol: "acp", bin: process.execPath, path: process.execPath, command: [process.execPath, FAKE] };

describe("ACP adapter", () => {
  it("runs a prompt end to end: modes, models, commands, stream, permission, fs, plan", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentdock-acp-"));
    const t = fakeHost("yes");
    const agent = createAcpAgent(agentDef, { cwd }, t.host);
    await agent.start();
    expect(t.state.patch).toMatchObject({ sessionId: "fake-1", mode: "ask", model: "m1" });
    expect(t.state.capabilities.models.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(t.state.capabilities.modes.map((m) => m.id)).toEqual(["ask", "code"]);

    agent.send("hello from test");
    const end = await t.done;
    expect(end.error).toBeUndefined();
    expect(readFileSync(join(cwd, "out.txt"), "utf8")).toBe("hello from test");
    expect(t.state.capabilities.commands).toEqual([{ name: "review", description: "Review code", hint: undefined }]);

    const types = t.events.map((e) => e.type);
    expect(types).toContain("text_delta");
    const asked = t.events.find((e) => e.type === "asked");
    expect(asked.options.map((o) => o.kind)).toEqual(["allow_once", "reject_once"]);
    const update = t.events.find((e) => e.type === "tool_update" && e.status === "done");
    expect(update.diffs[0]).toMatchObject({ path: "out.txt", newText: "hello from test" });
    expect(t.events.filter((e) => e.type === "plan").at(-1).entries[0].status).toBe("completed");

    await agent.setMode("code");
    expect(t.state.patch.mode).toBe("code");
    agent.close();
  });

  it("reports a denied tool as an error without writing", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentdock-acp-"));
    const t = fakeHost("no");
    const agent = createAcpAgent(agentDef, { cwd }, t.host);
    await agent.start();
    agent.send("nope");
    await t.done;
    expect(t.events.find((e) => e.type === "tool_update").status).toBe("error");
    agent.close();
  });
});

describe("unwrapShell", () => {
  it("shows the command inside Codex's login-shell wrapper", () => {
    expect(unwrapShell("/bin/zsh -lc 'cat hello.txt'")).toBe("cat hello.txt");
    expect(unwrapShell("/bin/bash -lc 'echo '\\''hi'\\'''")).toBe("echo 'hi'");
    expect(unwrapShell("ls -la")).toBe("ls -la");
  });
});
