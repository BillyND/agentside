import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../store/app-store";
import { newChat, openHistory, showView } from "../lib/actions";
import { useT } from "../i18n";
import { IconBack, IconHistory, IconMore, IconNewChat } from "./icons";
import { PopoverMenu } from "./popover-menu";

export const Header = memo(function Header() {
  const t = useT();
  const { title, view, connected } = useApp(
    useShallow((st) => ({ title: currentSession(st)?.title || "", view: st.view, connected: st.connected })),
  );
  const moreItems = useMemo(() => [{ id: "settings", label: t("settings") }], [t("settings")]);
  return (
    <header className="header">
      {view === "chat" ? (
        <div className="header-title" title={title}>
          {!connected && <span className="conn-dot" title={t("notConnected")} />}
          <span>{title}</span>
        </div>
      ) : (
        <button className="header-back" onClick={() => showView("chat")}>
          <IconBack />
          <span>{view === "history" ? t("history") : t("settings")}</span>
        </button>
      )}
      <div className="header-actions">
        <button className="icon-btn" title={t("history")} onClick={openHistory}>
          <IconHistory />
        </button>
        <button className="icon-btn" title={t("newChat")} onClick={newChat}>
          <IconNewChat />
        </button>
        <PopoverMenu
          className="icon-popover"
          title={t("more")}
          trigger={<IconMore />}
          items={moreItems}
          onPick={(id) => id === "settings" && showView("settings")}
          placement="down"
          align="end"
        />
      </div>
    </header>
  );
});
