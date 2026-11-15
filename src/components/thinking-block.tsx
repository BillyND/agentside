import { memo, useState } from "react";
import { useT } from "../i18n";
import { IconChevronRight } from "./icons";

export const ThinkingBlock = memo(function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={`thinking${open ? " open" : ""}`}>
      <button className="thinking-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={live ? "shimmer" : ""}>{live ? t("thinkingNow") : t("thinking")}</span>
        <IconChevronRight className="chev" />
      </button>
      {open && <div className="thinking-body">{text}</div>}
    </div>
  );
});
