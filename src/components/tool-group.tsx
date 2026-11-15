import { memo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChat } from "../store/chat-store";
import { toolArg, toolLabel } from "../lib/format";
import { useT } from "../i18n";
import { ToolDetail } from "./tool-detail";
import { IconChevronRight } from "./icons";

/** A run of consecutive tool calls, drawn as one quiet timeline. */
export const ToolGroup = memo(function ToolGroup({ toolIds }: { toolIds: string[] }) {
  return (
    <div className="tool-group">
      {toolIds.map((id) => <ToolRow key={id} id={id} />)}
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
      <button className="tool-line" onClick={() => setOpen((o) => !o)}>
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
  const total = useChat(useShallow((st) => st.tools[id]?.childIds.length || 0));
  if (!total) return null;
  return <span className="tool-count">{t("steps", { n: total })}</span>;
});
