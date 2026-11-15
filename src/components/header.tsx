import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { activeAgentId, useApp } from "../store/app-store";
import { newChat, openHistory, setAgent, showView } from "../lib/actions";
import { useT } from "../i18n";
import { IconBack, IconChevron, IconHistory, IconMore, IconNewChat } from "./icons";
import { PopoverMenu } from "./popover-menu";

// Layout of the original panel: the product name on the left (here the agent
// switcher, since AgentDock drives several agents) and actions on the right.
export const Header = memo(function Header() {
  const t = useT();
  const view = useApp((st) => st.view);
  const moreItems = useMemo(() => [{ id: "settings", label: t("settings") }], [t("settings")]);
  return (
    <header className="header">
      {view !== "settings" ? (
        <AgentSwitcher />
      ) : (
        <button className="header-back" onClick={() => showView("chat")}>
          <IconBack />
          <span>{t("settings")}</span>
        </button>
      )}
      <div className="header-actions">
        <button
          className={`icon-btn${view === "history" ? " on" : ""}`}
          title={t("history")}
          aria-label={t("history")}
          onClick={() => (view === "history" ? showView("chat") : openHistory())}
        >
          <IconHistory />
        </button>
        <button className="icon-btn" title={t("newChat")} aria-label={t("newChat")} onClick={newChat}>
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

const AgentSwitcher = memo(function AgentSwitcher() {
  const t = useT();
  const agentId = useApp(activeAgentId);
  const { agents, connected } = useApp(useShallow((st) => ({ agents: st.agents, connected: st.connected })));
  const notInstalled = t("notInstalled");
  const items = useMemo(
    () => agents.map((a) => ({ id: a.id, label: a.name, disabled: !a.available, badge: a.available ? undefined : notInstalled })),
    [agents, notInstalled],
  );
  const name = agents.find((a) => a.id === agentId)?.name || (agents.length ? agentId : "…");
  return (
    <PopoverMenu
      className="agent-switcher"
      title={t("agent")}
      trigger={
        <span className="agent-trigger">
          <span className={`agent-dot${connected ? "" : " off"}`} data-agent={agentId} />
          <span className="agent-name">{name}</span>
          <IconChevron />
        </span>
      }
      items={items}
      selected={agentId}
      onPick={setAgent}
      placement="down"
    />
  );
});
