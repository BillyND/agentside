import { create } from "zustand";
import type { Lang } from "../i18n";
import type { AgentInfo, Capabilities, HistoryEntry, SessionSummary } from "../types";

export type Theme = "system" | "light" | "dark";
export type View = "chat" | "history" | "settings";

export interface AgentPrefs {
  mode?: string | null;
  model?: string | null;
  effort?: string | null;
}

export interface Settings {
  langSetting: "auto" | Lang;
  theme: Theme;
  defaultAgent: string;
  answerFont: "sans" | "serif";
  /** Last mode/model/effort picked per agent, reused by new chats. */
  agentPrefs: Record<string, AgentPrefs>;
}

interface AppStore extends Settings {
  lang: Lang;
  connected: boolean;
  banner: string | null;
  home: string;
  agents: AgentInfo[];
  live: Record<string, SessionSummary>;
  currentKey: string | null;
  capabilities: Capabilities; // of the session shown
  history: HistoryEntry[];
  view: View;
  cwd: string;
  recentDirs: string[];
  // Choices for a chat that has not started yet.
  draftAgent: string;
  draftMode: string | null;
  draftModel: string | null;
  draftEffort: string | null;
}

export const emptyCapabilities = (): Capabilities => ({ modes: [], models: [], commands: [] });

export const useApp = create<AppStore>()(() => ({
  langSetting: "auto",
  theme: "system",
  defaultAgent: "claude",
  answerFont: "sans",
  agentPrefs: {},
  lang: "en",
  connected: false,
  banner: null,
  home: "",
  agents: [],
  live: {},
  currentKey: null,
  capabilities: emptyCapabilities(),
  history: [],
  view: "chat",
  cwd: "",
  recentDirs: [],
  draftAgent: "claude",
  draftMode: null,
  draftModel: null,
  draftEffort: null,
}));

export const setApp = useApp.setState;

export function upsertSession(s: SessionSummary) {
  setApp((st) => ({ live: { ...st.live, [s.key]: s } }));
}

export function removeSession(key: string) {
  setApp((st) => {
    const live = { ...st.live };
    delete live[key];
    return { live };
  });
}

type State = ReturnType<typeof useApp.getState>;

/** Summary of the session shown in the panel, if one has started. */
export const currentSession = (st: State): SessionSummary | undefined => (st.currentKey ? st.live[st.currentKey] : undefined);

/** Agent of the visible chat, or the one picked for the next chat. */
export const activeAgentId = (st: State): string => {
  const s = currentSession(st);
  return s && !s.fresh ? s.agentId : st.draftAgent;
};

/** True until the first message: folder and agent can still change. */
export const isDraft = (st: State): boolean => {
  const s = currentSession(st);
  return !s || s.fresh;
};
