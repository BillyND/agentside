import { memo } from "react";
import { useT } from "../i18n";
import { Fold } from "./collapse";

/** "Thought for 12s" — collapsed reasoning, as ChatGPT and Claude both show it. */
export const ThinkingBlock = memo(function ThinkingBlock(props: { text: string; live: boolean; durationMs?: number }) {
  const t = useT();
  const secs = props.durationMs && props.durationMs >= 1000 ? Math.round(props.durationMs / 1000) : 0;
  const label = props.live ? t("thinkingNow") : secs ? t("thoughtFor", { n: secs }) : t("thinking");
  return (
    <Fold className="thinking" bodyClassName="thinking-body" label={<span className={props.live ? "shimmer" : ""}>{label}</span>}>
      {/* pre-wrap would render the trailing newline agents send as an empty line. */}
      {props.text.trim()}
    </Fold>
  );
});
