import { memo, useEffect, useRef } from "react";
import { useT } from "../../i18n";

export interface SlashItem {
  name: string;
  description?: string;
  hint?: string;
  key?: "cmd.new" | "cmd.resume";
}

export const SlashMenu = memo(function SlashMenu({ items, index, onPick }: { items: SlashItem[]; index: number; onPick: (i: number) => void }) {
  const t = useT();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);
  return (
    <div className="slash-menu" ref={list} role="listbox">
      {items.map((c, i) => (
        <div
          key={c.name}
          role="option"
          aria-selected={i === index}
          className={`slash-item${i === index ? " active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(i);
          }}
        >
          <span className="slash-name">
            /{c.name}
            {c.hint && <span className="slash-hint"> {c.hint}</span>}
          </span>
          <span className="slash-desc">{c.key ? t(c.key) : c.description}</span>
        </div>
      ))}
    </div>
  );
});
