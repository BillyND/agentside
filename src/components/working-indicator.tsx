import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../store/app-store";
import { useChat } from "../store/chat-store";
import { useT } from "../i18n";

export const WorkingIndicator = memo(function WorkingIndicator() {
  const t = useT();
  const { busy, waiting } = useApp(
    useShallow((st) => {
      const s = currentSession(st);
      return { busy: Boolean(s?.busy && !s.ended), waiting: Boolean(s?.pending.length) };
    }),
  );
  // Hidden while text streams: the growing answer already shows progress.
  const streaming = useChat((st) => st.streaming !== null);
  if (!busy || streaming) return null;
  return (
    <div className="working">
      <span className={`pulse-dot${waiting ? " paused" : ""}`} />
      <span className={waiting ? "" : "shimmer"}>{waiting ? t("waitingForYou") : t("workingNow")}</span>
    </div>
  );
});
