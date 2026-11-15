import { memo, useEffect, useRef, useState } from "react";
import { IconArrowDown } from "./icons";
import { useShallow } from "zustand/react/shallow";
import { useChat } from "../store/chat-store";
import { currentSession, useApp } from "../store/app-store";
import { useT } from "../i18n";
import { ChatItemView } from "./chat-item";
import { StreamingText } from "./streaming-text";
import { WorkingIndicator } from "./working-indicator";
import { EmptyState } from "./empty-state";

export const MessageList = memo(function MessageList() {
  const t = useT();
  const itemIds = useChat(useShallow((st) => st.itemIds));
  const hasStream = useChat((st) => st.streaming !== null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);

  // Follow new output only while the reader is already at the bottom.
  useEffect(() => {
    const el = scroller.current!;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
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
      {away && (
        <button
          className="jump-latest"
          title={t("jumpToLatest")}
          aria-label={t("jumpToLatest")}
          onClick={() => scroller.current!.scrollTo({ top: scroller.current!.scrollHeight, behavior: "smooth" })}
        >
          <IconArrowDown />
        </button>
      )}
    </main>
  );
});

const EndedNotice = memo(function EndedNotice() {
  const t = useT();
  const ended = useApp((st) => {
    const s = currentSession(st);
    return Boolean(s?.ended && !s.fresh);
  });
  return ended ? <div className="notice">{t("ended")}</div> : null;
});
