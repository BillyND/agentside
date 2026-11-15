import { memo, useState } from "react";
import { IconCheck, IconCopy } from "./icons";
import { useChat } from "../store/chat-store";
import { duration, stripAnsi } from "../lib/format";
import { useT } from "../i18n";
import { MarkdownView } from "./markdown-view";
import { ToolGroup } from "./tool-group";
import { PermissionCard } from "./permission-card";
import { QuestionCard } from "./question-card";
import { PlanCard } from "./plan-card";
import { ThinkingBlock } from "./thinking-block";

/** One conversation item; re-renders only when that item object changes. */
export const ChatItemView = memo(function ChatItemView({ id }: { id: string }) {
  const item = useChat((st) => st.items[id]);
  if (!item) return null;
  switch (item.kind) {
    case "user":
      return (
        <div className="user-row">
          {item.thumbs && (
            <div className="user-images">
              {item.thumbs.map((src, i) => <img key={i} src={src} alt="" />)}
            </div>
          )}
          {item.text && <div className="user-bubble">{item.text}</div>}
        </div>
      );
    case "text":
      return <MarkdownView text={item.text} className="assistant" />;
    case "thinking":
      return <ThinkingBlock text={item.text} live={item.live} durationMs={item.durationMs} />;
    case "tools":
      return <ToolGroup toolIds={item.toolIds} />;
    case "plan":
      return <PlanCard entries={item.entries} />;
    case "output":
      return <MarkdownView text={stripAnsi(item.text)} className="cmd-output" />;
    case "notice":
      return <div className={`notice${item.tone ? " " + item.tone : ""}`}>{item.text}</div>;
    case "divider":
      return <Divider />;
    case "meta":
      return <TurnMeta durationMs={item.durationMs} copyText={item.copyText} />;
    case "permission":
      return <PermissionCard item={item} />;
    case "question":
      return <QuestionCard item={item} />;
  }
});

function TurnMeta({ durationMs, copyText }: { durationMs: number; copyText: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="turn-meta">
      {copyText && (
        <button
          className="meta-btn"
          title={copied ? t("copied") : t("copy")}
          aria-label={t("copy")}
          onClick={() => {
            navigator.clipboard.writeText(copyText);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <IconCheck /> : <IconCopy />}
        </button>
      )}
      <span>{duration(durationMs)}</span>
    </div>
  );
}

function Divider() {
  const t = useT();
  return <div className="divider"><span>{t("compacted")}</span></div>;
}
