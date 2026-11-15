import { memo } from "react";
import { shortPath } from "../lib/format";
import { MarkdownView } from "./markdown-view";
import { TodoList } from "./plan-card";
import type { Diff } from "../types";

/** Readable view of a tool call: commands, diffs, todo lists, plans, raw input. */
export const ToolDetail = memo(function ToolDetail({ name, input, diffs }: { name: string; input: Record<string, any>; diffs?: Diff[] }) {
  if (diffs?.length) return <>{diffs.map((d, i) => <DiffView key={i} diff={d} />)}</>;
  if (name === "Bash" && input.command) return <pre className="code-line">$ {input.command}</pre>;
  if ((name === "Edit" || name === "MultiEdit") && (input.edits || input.old_string !== undefined)) {
    const edits = input.edits || [{ old_string: input.old_string, new_string: input.new_string }];
    return <>{edits.map((e: any, i: number) => <DiffView key={i} diff={{ path: i === 0 ? input.file_path : "", oldText: e.old_string, newText: e.new_string }} />)}</>;
  }
  if (name === "Write" && input.content !== undefined) return <DiffView diff={{ path: input.file_path, newText: String(input.content) }} />;
  if (name === "TodoWrite" && Array.isArray(input.todos)) return <TodoList entries={input.todos.map((t: any) => ({ content: t.content, status: t.status }))} />;
  if (name === "ExitPlanMode" && input.plan) return <MarkdownView text={input.plan} className="plan-text" />;
  if (!Object.keys(input).length) return null;
  return <pre className="json">{JSON.stringify(input, null, 2)}</pre>;
});

function DiffView({ diff }: { diff: Diff }) {
  const lines = diff.unified
    ? diff.unified.split("\n").filter((l) => !l.startsWith("+++") && !l.startsWith("---"))
    : [
        ...(diff.oldText ? diff.oldText.split("\n").map((l) => "-" + l) : []),
        ...(diff.newText ? diff.newText.split("\n").map((l) => "+" + l) : []),
      ];
  return (
    <div className="diff">
      {diff.path && <div className="diff-path">{shortPath(diff.path)}</div>}
      <pre>
        {lines.map((l, i) => (
          <span key={i} className={l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@@") ? "hunk" : ""}>
            {l}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}
