import { create } from "zustand";
import { applyEvents, emptyChat, type ChatData } from "../lib/chat-reducer";
import type { AgentEvent } from "../types";

interface ChatStore extends ChatData {
  apply: (events: AgentEvent[]) => void;
  reset: () => void;
}

// Conversation of the session currently shown in the panel.
export const useChat = create<ChatStore>()((set, get) => ({
  ...emptyChat(),
  apply: (events) => set(applyEvents(get(), events)),
  reset: () => set(emptyChat()),
}));
