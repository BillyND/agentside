import type { AgentEvent, ChatItem, ToolState } from "../types";

export interface ChatData {
  itemIds: string[];
  items: Record<string, ChatItem>;
  tools: Record<string, ToolState>;
  permissionItems: Record<string, string>; // reqId -> item id
  streaming: string | null; // text block being streamed
}

export const emptyChat = (): ChatData => ({ itemIds: [], items: {}, tools: {}, permissionItems: {}, streaming: null });

let seq = 0;
const nextId = () => `i${++seq}`;

/**
 * Applies a batch of normalised agent events. Containers are copied at most
 * once per batch and only changed items/tools get new objects, so components
 * that select a single item by id re-render only when that item changed.
 */
export function applyEvents(prev: ChatData, events: AgentEvent[]): ChatData {
  let { itemIds, items, tools, permissionItems, streaming } = prev;
  let idsCopied = false;
  let itemsCopied = false;
  let toolsCopied = false;
  let permCopied = false;

  const setItem = (item: ChatItem) => {
    if (!itemsCopied) {
      items = { ...items };
      itemsCopied = true;
    }
    items[item.id] = item;
  };
  const lastItem = () => (itemIds.length ? items[itemIds[itemIds.length - 1]] : undefined);
  const setTool = (tool: ToolState) => {
    if (!toolsCopied) {
      tools = { ...tools };
      toolsCopied = true;
    }
    tools[tool.id] = tool;
  };

  // Streamed text becomes a real item as soon as anything else follows it.
  const flushStreaming = () => {
    if (streaming) {
      const text = streaming;
      streaming = null;
      append({ id: nextId(), kind: "text", text });
    } else streaming = null;
  };
  const append = (item: ChatItem) => {
    if (!idsCopied) {
      itemIds = [...itemIds];
      idsCopied = true;
    }
    setItem(item);
    itemIds.push(item.id);
  };
  const closeThinking = () => {
    const last = lastItem();
    if (last?.kind === "thinking" && last.live) setItem({ ...last, live: false, durationMs: Date.now() - last.startedAt });
  };
  const push = (item: ChatItem) => {
    flushStreaming();
    closeThinking();
    append(item);
  };
  // Text the agent wrote since the last user message, for the copy button.
  const turnText = () => {
    const parts: string[] = [];
    for (let i = itemIds.length - 1; i >= 0; i--) {
      const it = items[itemIds[i]];
      if (it.kind === "user") break;
      if (it.kind === "text") parts.unshift(it.text);
    }
    return parts.join("\n\n");
  };

  for (const ev of events) {
    switch (ev.type) {
      case "user":
        push({ id: nextId(), kind: "user", text: ev.text, thumbs: ev.thumbs?.length ? ev.thumbs : undefined });
        break;

      case "text_delta":
        if (!ev.text) break;
        if (streaming === null) closeThinking();
        streaming = (streaming ?? "") + ev.text;
        break;

      case "text": {
        // Final text of a streamed block replaces the stream; skip exact repeats.
        streaming = null;
        const last = lastItem();
        if (last?.kind === "text" && last.text === ev.text) break;
        push({ id: nextId(), kind: "text", text: ev.text });
        break;
      }

      case "thought_delta": {
        if (!ev.text) break;
        const last = lastItem();
        if (streaming === null && last?.kind === "thinking" && last.live) setItem({ ...last, text: last.text + ev.text });
        else push({ id: nextId(), kind: "thinking", text: ev.text, live: true, startedAt: Date.now() });
        break;
      }

      case "thought": {
        if (!ev.text?.trim()) break;
        const last = lastItem();
        if (streaming === null && last?.kind === "thinking" && last.live) {
          setItem({ ...last, text: ev.text, live: false, durationMs: Date.now() - last.startedAt });
        } else push({ id: nextId(), kind: "thinking", text: ev.text, live: false, startedAt: Date.now() });
        break;
      }

      case "tool_start": {
        if (tools[ev.id]) break;
        setTool({
          id: ev.id,
          name: ev.name,
          title: ev.title,
          input: ev.input || {},
          status: ev.status || "running",
          output: ev.output,
          diffs: ev.diffs,
          childIds: [],
        });
        const parent = ev.parentId ? tools[ev.parentId] : undefined;
        if (parent) {
          setTool({ ...parent, childIds: [...parent.childIds, ev.id] });
          break;
        }
        flushStreaming();
        const last = lastItem();
        if (last?.kind === "tools") setItem({ ...last, toolIds: [...last.toolIds, ev.id] });
        else push({ id: nextId(), kind: "tools", toolIds: [ev.id] });
        break;
      }

      case "tool_update": {
        const tool = tools[ev.id];
        if (!tool) break;
        setTool({
          ...tool,
          status: ev.status ?? tool.status,
          title: ev.title ?? tool.title,
          input: ev.input ?? tool.input,
          output: ev.output ?? tool.output,
          diffs: ev.diffs ?? tool.diffs,
        });
        break;
      }

      case "plan": {
        // Agents resend the whole plan; keep one plan card per run of updates.
        const last = lastItem();
        if (last?.kind === "plan" && streaming === null) setItem({ ...last, entries: ev.entries });
        else push({ id: nextId(), kind: "plan", entries: ev.entries });
        break;
      }

      case "permission_request":
      case "question": {
        const id = nextId();
        if (ev.type === "question") push({ id, kind: "question", reqId: ev.reqId, questions: ev.questions || [] });
        else {
          push({
            id,
            kind: "permission",
            reqId: ev.reqId,
            toolName: ev.toolName,
            title: ev.title,
            input: ev.input || {},
            reason: ev.reason,
            options: ev.options || [],
          });
        }
        if (!permCopied) {
          permissionItems = { ...permissionItems };
          permCopied = true;
        }
        permissionItems[ev.reqId] = id;
        break;
      }

      case "permission_resolved": {
        const item = items[permissionItems[ev.reqId]];
        if (item && (item.kind === "permission" || item.kind === "question")) setItem({ ...item, resolved: ev.outcome });
        break;
      }

      case "turn_end": {
        flushStreaming();
        // Whatever is still running was cut off by an interrupt or an error.
        for (const t of Object.values(tools)) if (t.status === "running") setTool({ ...t, status: "cancelled" });
        closeThinking();
        if (ev.error) push({ id: nextId(), kind: "notice", text: ev.error, tone: "error" });
        if (ev.durationMs) push({ id: nextId(), kind: "meta", durationMs: ev.durationMs, copyText: turnText() });
        break;
      }

      case "output":
        push({ id: nextId(), kind: "output", text: ev.text });
        break;

      case "notice":
        push({ id: nextId(), kind: "notice", text: ev.text, tone: ev.tone });
        break;

      case "compact":
        push({ id: nextId(), kind: "divider", text: "compacted" });
        break;

      case "reset":
        ({ itemIds, items, tools, permissionItems, streaming } = emptyChat());
        idsCopied = itemsCopied = toolsCopied = permCopied = true; // fresh containers are already private
        break;
    }
  }

  return { itemIds, items, tools, permissionItems, streaming };
}
