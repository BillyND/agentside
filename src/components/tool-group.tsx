import { memo, useState } from "react";
import { useChat } from "../store/chat-store";
import { toolArg, toolLabel } from "../lib/format";
import { useT } from "../i18n";
import { ToolDetail } from "./tool-detail";
import { IconChevronRight } from "./icons";

/**
 * A run of consecutive tool calls. Like the original panel, several steps
 * collapse into one "N steps" line once they finish; while any step runs the
 * list stays open so progress is visible.
 */
export const ToolGroup = memo(function ToolGroup({ toolIds }: { toolIds: string[] }) {
  const t = useT();
  const running = useChat((st) => toolIds.some((id) => st.tools[id]?.status === "running"));
  const failed = useChat((st) => toolIds.some((id) => st.tools[id]?.status === "error"));
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  if (toolIds.length === 1) return <div className="tool-group"><ToolRow id={toolIds[0]} /></div>;
  const open = userOpen ?? running;
  return (
    <div className={`tool-group steps${open ? " open" : ""}`}>
      <button className="steps-toggle" onClick={() => setUserOpen(!open)} aria-expanded={open}>
        <span className={`tool-dot ${running ? "running" : failed ? "error" : "done"}`} />
        <span>{t("stepsToggle", { n: toolIds.length })}</span>
        <IconChevronRight className="chev" />
      </button>
      {open && (
        <div className="steps-list">
          {toolIds.map((id) => <ToolRow key={id} id={id} />)}
        </div>
      )}
    </div>
  );
});

export const ToolRow = memo(function ToolRow({ id, nested = false }: { id: string; nested?: boolean }) {
  const tool = useChat((st) => st.tools[id]);
  const [open, setOpen] = useState(tool?.name === "TodoWrite");
  if (!tool) return null;
  const arg = toolArg(tool);
  return (
    <div className={`tool-row${nested ? " nested" : ""}${open ? " open" : ""}`}>
      <button className="tool-line" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`tool-dot ${tool.status}`} />
        <span className="tool-name">{toolLabel(tool)}</span>
        {arg && <span className="tool-arg">{arg}</span>}
        <ChildCount id={id} />
        <IconChevronRight className="chev" />
      </button>
      {open && (
        <div className="tool-body">
          <ToolDetail name={tool.name} input={tool.input} diffs={tool.diffs} />
          {tool.childIds.length > 0 && (
            <div className="tool-children">
              {tool.childIds.map((c) => <ToolRow key={c} id={c} nested />)}
            </div>
          )}
          {tool.output && <pre className={`tool-output${tool.status === "error" ? " error" : ""}`}>{tool.output}</pre>}
        </div>
      )}
    </div>
  );
});

const ChildCount = memo(function ChildCount({ id }: { id: string }) {
  const t = useT();
  const total = useChat((st) => st.tools[id]?.childIds.length || 0);
  if (!total) return null;
  return <span className="tool-count">{t("steps", { n: total })}</span>;
});
