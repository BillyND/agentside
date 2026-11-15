import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { activeAgentId, useApp } from "../../store/app-store";
import { setAgent } from "../../lib/actions";
import { useT } from "../../i18n";
import { PopoverMenu } from "../popover-menu";
import { IconChevron } from "../icons";

export const AgentPicker = memo(function AgentPicker() {
  const t = useT();
  const agentId = useApp(activeAgentId);
  const agents = useApp(useShallow((st) => st.agents));
  const notInstalled = t("notInstalled");
  const items = useMemo(
    () => agents.map((a) => ({ id: a.id, label: a.name, disabled: !a.available, badge: a.available ? undefined : notInstalled })),
    [agents, notInstalled],
  );
  const name = agents.find((a) => a.id === agentId)?.name || (agents.length ? agentId : "…");
  return (
    <PopoverMenu
      className="chip-popover"
      title={t("agent")}
      trigger={
        <span className="chip">
          <span className="agent-dot" data-agent={agentId} />
          {name}
          <IconChevron />
        </span>
      }
      items={items}
      selected={agentId}
      onPick={setAgent}
    />
  );
});
