import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChat } from "../store/chat-store";
import { toolArg, toolLabel } from "../lib/format";
import { useT } from "../i18n";
import { ToolDetail } from "./tool-detail";
import { Fold } from "./collapse";

/**
 * A run of consecutive tool calls as one quiet line, the way the original
 * panel shows "Used 2 tools ›". One call uses the same shape ("Used 1 tool ›"),
 * so a step always folds the same way. While a step runs, the line names it.
 */
export const ToolGroup = memo(function ToolGroup({ toolIds }: { toolIds: string[] }) {
  const t = useT();
  const { runningId, failed } = useChat(
    useShallow((st) => ({
      runningId: toolIds.find((id) => st.tools[id]?.status === "running") || null,
      failed: toolIds.some((id) => st.tools[id]?.status === "error"),
    })),
  );
  const label = (
    <>
      {runningId ? <RunningLabel id={runningId} /> : <span>{t(toolIds.length === 1 ? "usedTool" : "usedTools", { n: toolIds.length })}</span>}
      {failed && !runningId && <span className="fold-flag">!</span>}
    </>
  );
  return (
    <Fold className="tool-group" bodyClassName="steps-list" label={label}>
      {toolIds.map((id) => <ToolRow key={id} id={id} />)}
    </Fold>
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
  if (!tool) return null;
  const arg = toolArg(tool);
  const running = tool.status === "running";
  const label = (
    <>
      <span className={`tool-name${running ? " shimmer" : ""}`}>{toolLabel(tool)}</span>
      {arg && <span className="tool-arg">{arg}</span>}
      {tool.status === "error" && <span className="fold-flag">!</span>}
      <ChildCount id={id} />
    </>
  );
  return (
    <Fold
      className={`tool-row ${tool.status}${nested ? " nested" : ""}`}
      toggleClassName="tool-line"
      bodyClassName="tool-body"
      label={label}
      defaultOpen={tool.name === "TodoWrite"}
    >
      <ToolDetail name={tool.name} input={tool.input} diffs={tool.diffs} />
      {tool.childIds.length > 0 && (
        <div className="tool-children">
          {tool.childIds.map((c) => <ToolRow key={c} id={c} nested />)}
        </div>
      )}
      {tool.output && <pre className={`tool-output${tool.status === "error" ? " error" : ""}`}>{tool.output}</pre>}
    </Fold>
  );
});

const ChildCount = memo(function ChildCount({ id }: { id: string }) {
  const t = useT();
  const total = useChat((st) => st.tools[id]?.childIds.length || 0);
  if (!total) return null;
  return <span className="tool-count">{t("steps", { n: total })}</span>;
});
