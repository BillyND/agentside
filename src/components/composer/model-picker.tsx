import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../../store/app-store";
import { setEffort, setModel } from "../../lib/actions";
import { effortName, useT } from "../../i18n";
import { MenuItems, Popover } from "../popover-menu";
import { IconChevron } from "../icons";

/** "Opus 5.5  Medium": model name plus effort, one menu for both. */
export const ModelPicker = memo(function ModelPicker() {
  const t = useT();
  const models = useApp((st) => st.capabilities.models);
  const { model, effort } = useApp(
    useShallow((st) => {
      const s = currentSession(st);
      return { model: s?.model || st.draftModel, effort: s?.effort || st.draftEffort };
    }),
  );
  const match = models.find((m) => m.id === model) || models.find((m) => model && model.startsWith(m.id)) ||
    models.find((m) => model && model.includes(m.id));
  const efforts = match?.efforts || [];
  const modelItems = useMemo(() => models.map((m) => ({ id: m.id, label: m.name, description: m.description })), [models]);
  const effortItems = efforts.map((e) => ({ id: e, label: effortName(t, e) }));
  // Before the agent reports its model, name the default the way the CLI does ("currently Opus 5.5").
  const fallback = models.find((m) => m.id === "default");
  const label = (match && match.id !== "default" ? match.name : null) ||
    /currently ([^)]+)\)/.exec(fallback?.description || "")?.[1] || match?.name || model || t("defaultModel");
  const trigger = (
    <span className="model-label">
      <span className="model-name">{label}</span>
      {effort && efforts.includes(effort) && <span className="model-effort">{effortName(t, effort)}</span>}
      {models.length > 0 && <IconChevron />}
    </span>
  );
  if (!models.length) return <span className="model-static">{trigger}</span>;
  return (
    <Popover className="model-picker" title={t("selectModel")} trigger={trigger} align="end" panelClass="model-menu">
      {(close) => (
        <>
          <MenuItems items={modelItems} selected={match?.id} onPick={(id) => (close(), setModel(id))} />
          {effortItems.length > 0 && (
            <>
              <div className="menu-sep" />
              <div className="menu-head">{t("effort")}</div>
              <MenuItems items={effortItems} selected={effort} onPick={(id) => (close(), setEffort(id))} />
            </>
          )}
        </>
      )}
    </Popover>
  );
});
