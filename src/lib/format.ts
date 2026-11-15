import { useApp } from "../store/app-store";
import { translate } from "../i18n";
import type { ToolState } from "../types";

export function shortPath(p: string | undefined | null): string {
  if (!p) return "";
  const home = useApp.getState().home;
  const rel = home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
  const parts = rel.split("/");
  return parts.length > 4 ? "…/" + parts.slice(-2).join("/") : rel;
}

export function ago(t: number | undefined): string {
  if (!t) return "";
  const lang = useApp.getState().lang;
  const s = (Date.now() - t) / 1000;
  if (s < 60) return translate(lang, "justNow");
  if (s < 3600) return translate(lang, "minutesAgo", { n: Math.floor(s / 60) });
  if (s < 86400) return translate(lang, "hoursAgo", { n: Math.floor(s / 3600) });
  return translate(lang, "daysAgo", { n: Math.floor(s / 86400) });
}

export function duration(ms: number): string {
  const lang = useApp.getState().lang;
  const s = ms / 1000;
  if (s < 60) return translate(lang, "seconds", { n: s.toFixed(1) });
  return translate(lang, "minutesSeconds", { m: Math.floor(s / 60), s: Math.round(s % 60) });
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

const NAMES: Record<string, string> = {
  Read: "Read",
  Write: "Write",
  Edit: "Edit",
  MultiEdit: "Edit",
  NotebookEdit: "Edit notebook",
  Bash: "Run",
  Grep: "Search",
  Glob: "Find files",
  WebFetch: "Fetch",
  WebSearch: "Web search",
  TodoWrite: "Update todos",
  Task: "Delegate",
  Agent: "Delegate",
  Skill: "Skill",
  ExitPlanMode: "Plan",
  edit: "Edit",
  read: "Read",
  execute: "Run",
  search: "Search",
  fetch: "Fetch",
  delete: "Delete",
  move: "Move",
  think: "Think",
  other: "Tool",
};

/** Short verb for a tool row; agents that send a full title use that instead. */
export function toolLabel(tool: Pick<ToolState, "name" | "title">): string {
  if (tool.title) return tool.title;
  const name = tool.name;
  if (name.startsWith("mcp__")) return name.split("__").slice(1).join(" · ");
  return NAMES[name] || name;
}

export function toolArg(tool: Pick<ToolState, "name" | "title" | "input">): string {
  if (tool.title) return "";
  const input = tool.input as Record<string, any>;
  const v = input.command ?? input.file_path ?? input.notebook_path ?? input.path ?? input.pattern ?? input.url ?? input.query
    ?? input.description ?? input.skill ?? input.action ?? input.element ?? input.prompt ?? "";
  const s = String(v);
  if (tool.name === "Bash") return s.split("\n")[0];
  if (s.startsWith("/") && !s.includes(" ")) return shortPath(s);
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}
