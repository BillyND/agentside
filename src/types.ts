export interface AgentInfo {
  id: string;
  name: string;
  protocol: "claude-sdk" | "codex" | "acp";
  available: boolean;
  bin: string;
  login: string | null;
  custom: boolean;
}

export interface SessionSummary {
  key: string;
  agentId: string;
  agentName: string;
  sessionId: string | null;
  cwd: string;
  title: string | null;
  busy: boolean;
  ended: boolean;
  model: string | null;
  mode: string | null;
  effort: string | null;
  fresh: boolean;
  /** When this chat started; null for a resumed one (its start is in history). */
  createdAt: number | null;
  /** Last message sent from the panel. */
  activeAt: number | null;
  pending: string[];
  updatedAt: number;
}

export interface HistoryEntry {
  agentId: string;
  agentName: string;
  sessionId: string;
  cwd?: string;
  title: string | null;
  createdAt?: number;
  /** Last message in the conversation. */
  updatedAt: number;
}

export interface Choice {
  id: string;
  name: string;
  description?: string;
  efforts?: string[]; // reasoning effort levels a model accepts
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64, no data: prefix
  thumb: string; // small data: URL for display
}

export interface SlashCommand {
  name: string;
  description?: string;
  hint?: string;
}

export interface Capabilities {
  modes: Choice[];
  models: Choice[];
  commands: SlashCommand[];
}

export type ToolStatus = "running" | "done" | "error" | "cancelled";

export interface Diff {
  path: string;
  oldText?: string | null;
  newText?: string;
  unified?: string;
}

export interface ToolState {
  id: string;
  name: string;
  title?: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  output?: string;
  diffs?: Diff[];
  childIds: string[];
}

export interface PermissionOption {
  id: string;
  label: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: { label: string; description?: string }[];
}

export interface PlanEntry {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export type ChatItem =
  | { id: string; kind: "user"; text: string; thumbs?: string[] }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "thinking"; text: string; live: boolean; startedAt: number; durationMs?: number }
  | { id: string; kind: "tools"; toolIds: string[] }
  | { id: string; kind: "plan"; entries: PlanEntry[] }
  | { id: string; kind: "output"; text: string }
  | { id: string; kind: "notice"; text: string; tone?: "error" }
  | { id: string; kind: "divider"; text: string }
  | { id: string; kind: "meta"; durationMs: number; copyText: string }
  | {
      id: string;
      kind: "permission";
      reqId: string;
      toolName: string;
      title?: string;
      input: Record<string, unknown>;
      reason?: string;
      options: PermissionOption[];
      resolved?: "allow" | "deny";
    }
  | { id: string; kind: "question"; reqId: string; questions: Question[]; resolved?: "allow" | "deny" };

/** Normalised event from the daemon (see host/daemon.mjs). */
export type AgentEvent = { type: string; [key: string]: any };
