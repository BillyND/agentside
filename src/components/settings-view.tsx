import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp, type Theme } from "../store/app-store";
import { updateSettings } from "../lib/actions";
import { LANGS, useT, type Lang } from "../i18n";

export const SettingsView = memo(function SettingsView() {
  const t = useT();
  const { langSetting, theme, defaultAgent, answerFont } = useApp(
    useShallow((st) => ({ langSetting: st.langSetting, theme: st.theme, defaultAgent: st.defaultAgent, answerFont: st.answerFont })),
  );
  return (
    <section className="page settings">
      <Field label={t("language")}>
        <Segmented
          value={langSetting}
          options={[{ id: "auto", name: t("languageAuto") }, ...LANGS]}
          onChange={(v) => updateSettings({ langSetting: v as "auto" | Lang })}
        />
      </Field>
      <Field label={t("theme")}>
        <Segmented
          value={theme}
          options={[
            { id: "system", name: t("themeSystem") },
            { id: "light", name: t("themeLight") },
            { id: "dark", name: t("themeDark") },
          ]}
          onChange={(v) => updateSettings({ theme: v as Theme })}
        />
      </Field>
      <Field label={t("answerFont")}>
        <Segmented
          value={answerFont}
          options={[
            { id: "sans", name: t("fontSans") },
            { id: "serif", name: t("fontSerif") },
          ]}
          onChange={(v) => updateSettings({ answerFont: v as "sans" | "serif" })}
        />
      </Field>
      <Field label={t("defaultAgent")}>
        <AgentList selected={defaultAgent} />
      </Field>
      <p className="hint">{t("customAgentsHint")}</p>
    </section>
  );
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { id: string; name: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={o.id === value} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.name}
        </button>
      ))}
    </div>
  );
}

const AgentList = memo(function AgentList({ selected }: { selected: string }) {
  const t = useT();
  const agents = useApp((st) => st.agents);
  return (
    <div className="agent-list">
      {agents.map((a) => (
        <button
          key={a.id}
          className={`agent-row${a.id === selected ? " on" : ""}`}
          disabled={!a.available}
          onClick={() => updateSettings({ defaultAgent: a.id })}
        >
          <span className="agent-row-main">
            <span className="agent-row-name">{a.name}</span>
            <span className={`status-pill ${a.available ? "ok" : "off"}`}>{a.available ? t("installed") : t("missing")}</span>
          </span>
          <span className="agent-row-meta">
            <code>{a.bin}</code>
            {a.available && a.login && <span> · {t("signInWith", { cmd: a.login })}</span>}
          </span>
        </button>
      ))}
    </div>
  );
});
