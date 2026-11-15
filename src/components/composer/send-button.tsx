import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../../store/app-store";
import { interrupt } from "../../lib/actions";
import { useT } from "../../i18n";
import { IconArrowUp, IconStop } from "../icons";

export const SendButton = memo(function SendButton({ hasText, onSend }: { hasText: boolean; onSend: () => void }) {
  const t = useT();
  const { busy, connected } = useApp(
    useShallow((st) => {
      const s = currentSession(st);
      return { busy: Boolean(s?.busy && !s.ended), connected: st.connected };
    }),
  );
  const stop = busy && !hasText;
  return (
    <button
      className={`send${stop ? " stop" : ""}`}
      title={stop ? t("stop") : t("send")}
      disabled={!connected || (!hasText && !busy)}
      onClick={stop ? interrupt : onSend}
    >
      {stop ? <IconStop /> : <IconArrowUp />}
    </button>
  );
});
