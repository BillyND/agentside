import { memo, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../store/app-store";
import { closeChat, renameChat } from "../lib/actions";
import { useT } from "../i18n";
import { IconChevron } from "./icons";
import { MenuItems, Popover } from "./popover-menu";

/** "Log errors investigation ⌄" bar above the conversation, as in the original panel. */
export const ConversationTitle = memo(function ConversationTitle() {
  const t = useT();
  const { title, show } = useApp(
    useShallow((st) => {
      const s = currentSession(st);
      return { title: s?.title || "", show: Boolean(s && !s.fresh) };
    }),
  );
  const [editing, setEditing] = useState(false);
  const items = useMemo(() => [{ id: "rename", label: t("renameChat") }, { id: "close", label: t("closeChat") }], [t("renameChat"), t("closeChat")]);
  if (!show) return null;
  if (editing) {
    return (
      <div className="conv-title">
        <input
          className="conv-title-input"
          autoFocus
          defaultValue={title}
          onBlur={(e) => (renameChat(e.target.value), setEditing(false))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      </div>
    );
  }
  return (
    <div className="conv-title">
      <Popover
        className="conv-title-popover"
        title={title}
        placement="down"
        trigger={
          <span className="conv-title-trigger">
            <span className="conv-title-text">{title}</span>
            <IconChevron />
          </span>
        }
      >
        {(close) => <MenuItems items={items} onPick={(id) => (close(), id === "rename" ? setEditing(true) : closeChat())} />}
      </Popover>
    </div>
  );
});
