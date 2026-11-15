import { describe, expect, it } from "vitest";
import { applyEvents, emptyChat } from "../src/lib/chat-reducer";

const kinds = (s: ReturnType<typeof emptyChat>) => s.itemIds.map((id) => s.items[id].kind);

describe("applyEvents", () => {
  it("turns streamed deltas into one text item when the final text arrives", () => {
    let s = applyEvents(emptyChat(), [{ type: "user", text: "hi" }, { type: "text_delta", text: "Hel" }, { type: "text_delta", text: "lo" }]);
    expect(s.streaming).toBe("Hello");
    expect(kinds(s)).toEqual(["user"]);
    s = applyEvents(s, [{ type: "text", text: "Hello" }]);
    expect(s.streaming).toBeNull();
    expect(kinds(s)).toEqual(["user", "text"]);
  });

  it("flushes deltas into a text item when a tool starts (ACP agents send no final text)", () => {
    const s = applyEvents(emptyChat(), [
      { type: "text_delta", text: "Let me look." },
      { type: "tool_start", id: "t1", name: "read", title: "Read a.ts", input: {} },
      { type: "tool_start", id: "t2", name: "read", title: "Read b.ts", input: {} },
    ]);
    expect(kinds(s)).toEqual(["text", "tools"]);
    const group = s.items[s.itemIds[1]];
    expect(group.kind === "tools" && group.toolIds).toEqual(["t1", "t2"]);
  });

  it("only replaces the objects that changed", () => {
    const a = applyEvents(emptyChat(), [
      { type: "user", text: "go" },
      { type: "tool_start", id: "t1", name: "Bash", input: { command: "ls" } },
    ]);
    const b = applyEvents(a, [{ type: "tool_update", id: "t1", status: "done", output: "file" }]);
    expect(b.items).toBe(a.items);
    expect(b.itemIds).toBe(a.itemIds);
    expect(b.tools.t1).not.toBe(a.tools.t1);
    expect(b.tools.t1).toMatchObject({ status: "done", output: "file" });
  });

  it("nests subagent tools under their parent", () => {
    const s = applyEvents(emptyChat(), [
      { type: "tool_start", id: "task", name: "Task", input: {} },
      { type: "tool_start", id: "child", name: "Read", input: {}, parentId: "task" },
    ]);
    expect(s.tools.task.childIds).toEqual(["child"]);
    expect(kinds(s)).toEqual(["tools"]);
  });

  it("marks running tools cancelled and reports errors at the end of a turn", () => {
    const s = applyEvents(emptyChat(), [
      { type: "tool_start", id: "t1", name: "Bash", input: {} },
      { type: "turn_end", error: "Usage limit reached", durationMs: 1200 },
    ]);
    expect(s.tools.t1.status).toBe("cancelled");
    expect(kinds(s)).toEqual(["tools", "notice", "meta"]);
  });

  it("appends thought deltas to the live thinking block and closes it", () => {
    let s = applyEvents(emptyChat(), [{ type: "thought_delta", text: "Hmm" }, { type: "thought_delta", text: ", ok" }]);
    expect(kinds(s)).toEqual(["thinking"]);
    const first = s.items[s.itemIds[0]];
    expect(first.kind === "thinking" && first.text).toBe("Hmm, ok");
    s = applyEvents(s, [{ type: "text_delta", text: "Answer" }, { type: "turn_end" }]);
    const closed = s.items[s.itemIds[0]];
    expect(closed.kind === "thinking" && closed.live).toBe(false);
    expect(kinds(s)).toEqual(["thinking", "text"]);
  });

  it("keeps one plan card per run of plan updates", () => {
    const s = applyEvents(emptyChat(), [
      { type: "plan", entries: [{ content: "a", status: "pending" }] },
      { type: "plan", entries: [{ content: "a", status: "completed" }] },
    ]);
    expect(kinds(s)).toEqual(["plan"]);
    const plan = s.items[s.itemIds[0]];
    expect(plan.kind === "plan" && plan.entries[0].status).toBe("completed");
  });

  it("resolves permission cards by request id", () => {
    const s = applyEvents(emptyChat(), [
      { type: "permission_request", reqId: "r1", toolName: "Bash", input: {}, options: [{ id: "allow", label: "Allow", kind: "allow_once" }] },
      { type: "permission_resolved", reqId: "r1", outcome: "deny" },
    ]);
    const card = s.items[s.permissionItems.r1];
    expect(card.kind === "permission" && card.resolved).toBe("deny");
  });

  it("clears everything on reset", () => {
    const s = applyEvents(emptyChat(), [{ type: "user", text: "x" }, { type: "reset" }, { type: "user", text: "y" }]);
    expect(kinds(s)).toEqual(["user"]);
  });
});
