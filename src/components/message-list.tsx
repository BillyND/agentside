import { memo, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChat } from "../store/chat-store";
import { currentSession, useApp } from "../store/app-store";
import { useT } from "../i18n";
import { ChatItemView } from "./chat-item";
import { StreamingText } from "./streaming-text";
import { WorkingIndicator } from "./working-indicator";
import { EmptyState } from "./empty-state";

export const MessageList = memo(function MessageList() {
  const itemIds = useChat(useShallow((st) => st.itemIds));
  const hasStream = useChat((st) => st.streaming !== null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Follow new output only while the reader is already at the bottom.
  useEffect(() => {
    const el = scroller.current!;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(content.current!);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  // A message the user just sent always scrolls into view.
  const lastId = itemIds[itemIds.length - 1];
  useEffect(() => {
    if (lastId && useChat.getState().items[lastId]?.kind === "user") {
      stick.current = true;
      scroller.current!.scrollTop = scroller.current!.scrollHeight;
    }
  }, [lastId]);

  const empty = !itemIds.length && !hasStream;
  return (
    <main className="scroller" ref={scroller}>
      <div className={`messages${empty ? " is-empty" : ""}`} ref={content}>
        {empty && <EmptyState />}
        {itemIds.map((id) => <ChatItemView key={id} id={id} />)}
        <StreamingText />
        <WorkingIndicator />
        <EndedNotice />
      </div>
    </main>
  );
});

const EndedNotice = memo(function EndedNotice() {
  const t = useT();
  const ended = useApp((st) => Boolean(currentSession(st)?.ended));
  return ended ? <div className="notice">{t("ended")}</div> : null;
});
