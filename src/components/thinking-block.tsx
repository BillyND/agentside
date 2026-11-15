import { memo, useState } from "react";
import { useT } from "../i18n";
import { IconChevronRight } from "./icons";
import { Collapse } from "./collapse";

/** "Thought for 12s" — collapsed reasoning, as ChatGPT and Claude both show it. */
export const ThinkingBlock = memo(function ThinkingBlock(props: { text: string; live: boolean; durationMs?: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const secs = props.durationMs && props.durationMs >= 1000 ? Math.round(props.durationMs / 1000) : 0;
  const label = props.live ? t("thinkingNow") : secs ? t("thoughtFor", { n: secs }) : t("thinking");
  return (
    <div className={`thinking${open ? " open" : ""}`}>
      <button className="fold-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={props.live ? "shimmer" : ""}>{label}</span>
        <IconChevronRight className="chev" />
      </button>
      <Collapse open={open}>
        <div className="thinking-body">{props.text}</div>
      </Collapse>
    </div>
  );
});
