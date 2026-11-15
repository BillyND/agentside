import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../../store/app-store";
import { setModel } from "../../lib/actions";
import { useT } from "../../i18n";
import { PopoverMenu } from "../popover-menu";
import { IconChevron } from "../icons";

export const ModelPicker = memo(function ModelPicker() {
  const t = useT();
  const models = useApp((st) => st.capabilities.models);
  const current = useApp(useShallow((st) => currentSession(st)?.model || st.draftModel));
  const items = useMemo(() => models.map((m) => ({ id: m.id, label: m.name, description: m.description })), [models]);
  const match = models.find((m) => m.id === current) || models.find((m) => current && current.includes(m.id));
  const label = match?.name || current || t("defaultModel");
  if (!models.length) return <span className="model-label muted">{label}</span>;
  return (
    <PopoverMenu
      className="chip-popover"
      title={t("model")}
      trigger={
        <span className="model-label">
          {label}
          <IconChevron />
        </span>
      }
      items={items}
      selected={match?.id}
      onPick={setModel}
      align="end"
    />
  );
});
