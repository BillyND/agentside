import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { activeAgentId, currentSession, useApp } from "../../store/app-store";
import { setMode } from "../../lib/actions";
import { modeName, useT } from "../../i18n";
import { PopoverMenu } from "../popover-menu";
import { IconMode } from "../icons";
import type { Choice } from "../../types";

// Known modes, so the picker works before the first message reaches the agent.
const PRESET_MODES: Record<string, Choice[]> = {
  claude: ["default", "acceptEdits", "plan", "auto", "bypassPermissions"].map((id) => ({ id, name: id })),
  codex: ["read-only", "auto", "full-access"].map((id) => ({ id, name: id })),
};
const AUTO_MODES = new Set(["acceptEdits", "auto", "bypassPermissions", "full-access"]);

export function useModes(): Choice[] {
  const live = useApp((st) => st.capabilities.modes);
  const agentId = useApp(activeAgentId);
  return live.length ? live : PRESET_MODES[agentId] || [];
}

export const ModePicker = memo(function ModePicker() {
  const t = useT();
  const modes = useModes();
  const current = useApp(useShallow((st) => currentSession(st)?.mode || st.draftMode));
  const items = useMemo(() => modes.map((m) => ({ id: m.id, label: modeName(t, m.id, m.name), description: m.description })), [modes, t("mode")]);
  if (!modes.length) return null;
  const selected = current && modes.some((m) => m.id === current) ? current : modes[0].id;
  return (
    <PopoverMenu
      className="chip-popover"
      title={`${t("mode")} (Shift+Tab)`}
      trigger={
        <span className={`chip mode-chip${AUTO_MODES.has(selected) ? " auto" : ""}`}>
          <IconMode size={15} auto={AUTO_MODES.has(selected)} />
          <span className="chip-label">{modeName(t, selected, modes.find((m) => m.id === selected)?.name)}</span>
        </span>
      }
      items={items}
      selected={selected}
      onPick={setMode}
    />
  );
});
