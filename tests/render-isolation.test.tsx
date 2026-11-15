// @vitest-environment jsdom
import { Profiler } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useChat } from "../src/store/chat-store";
import { ToolRow } from "../src/components/tool-group";
import { ChatItemView } from "../src/components/chat-item";
import { StreamingText } from "../src/components/streaming-text";

function counted(id: string, counts: Record<string, number>, node: React.ReactNode) {
  return (
    <Profiler id={id} onRender={() => (counts[id] = (counts[id] || 0) + 1)}>
      {node}
    </Profiler>
  );
}

describe("render isolation", () => {
  beforeEach(() => useChat.getState().reset());

  it("updating one tool re-renders only that tool row", () => {
    act(() =>
      useChat.getState().apply([
        { type: "tool_start", id: "a", name: "Bash", input: { command: "ls" } },
        { type: "tool_start", id: "b", name: "Bash", input: { command: "pwd" } },
      ]),
    );
    const counts: Record<string, number> = {};
    render(
      <>
        {counted("a", counts, <ToolRow id="a" />)}
        {counted("b", counts, <ToolRow id="b" />)}
      </>,
    );
    expect(counts).toEqual({ a: 1, b: 1 });
    act(() => useChat.getState().apply([{ type: "tool_update", id: "b", status: "done", output: "/tmp" }]));
    expect(counts).toEqual({ a: 1, b: 2 });
  });

  it("streaming deltas re-render the stream, not earlier messages", () => {
    act(() => useChat.getState().apply([{ type: "user", text: "hi" }, { type: "text", text: "earlier answer" }]));
    const [userId, textId] = useChat.getState().itemIds;
    const counts: Record<string, number> = {};
    render(
      <>
        {counted("user", counts, <ChatItemView id={userId} />)}
        {counted("text", counts, <ChatItemView id={textId} />)}
        {counted("stream", counts, <StreamingText />)}
      </>,
    );
    for (const chunk of ["one ", "two ", "three"]) act(() => useChat.getState().apply([{ type: "text_delta", text: chunk }]));
    expect(counts.user).toBe(1);
    expect(counts.text).toBe(1);
    expect(counts.stream).toBe(4);
  });
});
