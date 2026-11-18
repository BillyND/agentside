// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useChat } from "../src/store/chat-store";
import { useApp } from "../src/store/app-store";
import { ToolGroup } from "../src/components/tool-group";

const start = (id: string, command: string) =>
  ({ type: "tool_start", id, name: "Bash", input: { command } }) as const;
const done = (id: string) => ({ type: "tool_update", id, status: "done" }) as const;

describe("tool group", () => {
  beforeEach(() => {
    useChat.getState().reset();
    act(() => useApp.setState({ lang: "en" }));
  });

  it("folds a single tool call like a run of many", () => {
    act(() => useChat.getState().apply([start("a", "ls -la"), done("a")]));
    render(<ToolGroup toolIds={["a"]} />);

    // Collapsed: no tool row in the DOM until the group is opened.
    expect(screen.getByText("Used 1 tool")).toBeTruthy();
    expect(screen.queryByText("Run")).toBeNull();

    act(() => screen.getByText("Used 1 tool").closest("button")!.click());
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("ls -la")).toBeTruthy();
  });

  it("keeps the plural label for several calls", () => {
    act(() =>
      useChat.getState().apply([start("a", "ls"), start("b", "pwd"), done("a"), done("b")]),
    );
    render(<ToolGroup toolIds={["a", "b"]} />);
    expect(screen.getByText("Used 2 tools")).toBeTruthy();
  });
});
