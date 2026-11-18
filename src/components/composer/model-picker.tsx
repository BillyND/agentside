import { memo, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../../store/app-store";
import { setEffort, setModel } from "../../lib/actions";
import { effortName, useT } from "../../i18n";
import { matches } from "../../lib/format";
import { MenuItems, Popover, type MenuItem } from "../popover-menu";
import { SearchBox } from "../search-box";
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
  // Until the agent names its model, the "default" entry (if any) is the one in use.
  const match = models.find((m) => m.id === model) || models.find((m) => model && model.startsWith(m.id)) ||
    models.find((m) => model && model.includes(m.id)) || (!model ? models.find((m) => m.id === "default") : undefined);
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
          <ModelList items={modelItems} selected={match?.id} onPick={(id) => (close(), setModel(id))} />
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

// Short lists read fine at a glance; long ones (OpenCode lists dozens) get a filter.
const SEARCH_FROM = 8;

function ModelList(props: { items: MenuItem[]; selected?: string; onPick: (id: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = props.items.filter((m) => matches(q, m.label, m.id, m.description));
  if (props.items.length < SEARCH_FROM) return <MenuItems items={props.items} selected={props.selected} onPick={props.onPick} />;
  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder={t("searchModels")} onEnter={() => shown[0] && props.onPick(shown[0].id)} />
      {shown.length ? <MenuItems items={shown} selected={props.selected} onPick={props.onPick} /> : <div className="menu-empty">{t("noModels")}</div>}
    </>
  );
}
