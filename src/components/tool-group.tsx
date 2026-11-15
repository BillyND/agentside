import { memo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChat } from "../store/chat-store";
import { toolArg, toolLabel } from "../lib/format";
import { useT } from "../i18n";
import { ToolDetail } from "./tool-detail";
import { IconChevronRight } from "./icons";
import { Collapse } from "./collapse";

/**
 * A run of consecutive tool calls as one quiet line, the way the original
 * panel shows "Used … (13 actions) ›". While a step runs, the line names it.
 */
export const ToolGroup = memo(function ToolGroup({ toolIds }: { toolIds: string[] }) {
  const t = useT();
  const { runningId, failed } = useChat(
    useShallow((st) => ({
      runningId: toolIds.find((id) => st.tools[id]?.status === "running") || null,
      failed: toolIds.some((id) => st.tools[id]?.status === "error"),
    })),
  );
  const [open, setOpen] = useState(false);
  if (toolIds.length === 1) return <ToolRow id={toolIds[0]} />;
  return (
    <div className={`tool-group${open ? " open" : ""}`}>
      <button className="fold-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {runningId ? <RunningLabel id={runningId} /> : <span>{t("usedTools", { n: toolIds.length })}</span>}
        {failed && !runningId && <span className="fold-flag">!</span>}
        <IconChevronRight className="chev" />
      </button>
      <Collapse open={open} className="steps-list">
        {toolIds.map((id) => <ToolRow key={id} id={id} />)}
      </Collapse>
    </div>
  );
});

const RunningLabel = memo(function RunningLabel({ id }: { id: string }) {
  const tool = useChat((st) => st.tools[id]);
  if (!tool) return null;
  const arg = toolArg(tool);
  return <span className="shimmer">{toolLabel(tool)}{arg ? ` ${arg}` : ""}</span>;
});

export const ToolRow = memo(function ToolRow({ id, nested = false }: { id: string; nested?: boolean }) {
  const tool = useChat((st) => st.tools[id]);
  const [open, setOpen] = useState(tool?.name === "TodoWrite");
  if (!tool) return null;
  const arg = toolArg(tool);
  const running = tool.status === "running";
  return (
    <div className={`tool-row ${tool.status}${nested ? " nested" : ""}${open ? " open" : ""}`}>
      <button className="fold-toggle tool-line" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`tool-name${running ? " shimmer" : ""}`}>{toolLabel(tool)}</span>
        {arg && <span className="tool-arg">{arg}</span>}
        {tool.status === "error" && <span className="fold-flag">!</span>}
        <ChildCount id={id} />
        <IconChevronRight className="chev" />
      </button>
      <Collapse open={open} className="tool-body">
        <ToolDetail name={tool.name} input={tool.input} diffs={tool.diffs} />
        {tool.childIds.length > 0 && (
          <div className="tool-children">
            {tool.childIds.map((c) => <ToolRow key={c} id={c} nested />)}
          </div>
        )}
        {tool.output && <pre className={`tool-output${tool.status === "error" ? " error" : ""}`}>{tool.output}</pre>}
      </Collapse>
    </div>
  );
});

const ChildCount = memo(function ChildCount({ id }: { id: string }) {
  const t = useT();
  const total = useChat((st) => st.tools[id]?.childIds.length || 0);
  if (!total) return null;
  return <span className="tool-count">{t("steps", { n: total })}</span>;
});
