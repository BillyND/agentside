import { memo } from "react";
import { useChat } from "../store/chat-store";
import { MarkdownView } from "./markdown-view";

// The only component that re-renders on every streamed delta.
export const StreamingText = memo(function StreamingText() {
  const text = useChat((st) => st.streaming);
  if (!text) return null;
  return <MarkdownView text={text} className="assistant streaming" />;
});
