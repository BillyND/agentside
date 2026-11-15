import { memo, useCallback, useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";
import { translate } from "../i18n";
import { useApp } from "../store/app-store";

// Copy buttons are handled by delegation, so the HTML string stays the only input.
function onCopyClick(e: React.MouseEvent<HTMLDivElement>) {
  const btn = (e.target as HTMLElement).closest(".code-copy");
  if (!btn) return;
  const code = btn.closest(".code-block")?.querySelector("code");
  if (!code) return;
  navigator.clipboard.writeText(code.textContent || "");
  const lang = useApp.getState().lang;
  btn.textContent = translate(lang, "copied");
  setTimeout(() => (btn.textContent = translate(lang, "copy")), 1200);
}

export const MarkdownView = memo(function MarkdownView({ text, className = "" }: { text: string; className?: string }) {
  const lang = useApp((st) => st.lang);
  const html = useMemo(() => renderMarkdown(text, translate(lang, "copy")), [text, lang]);
  const onClick = useCallback(onCopyClick, []);
  return <div className={`prose ${className}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
});
