import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../../store/app-store";
import { interrupt, newChat, openHistory, send, setMode, showView } from "../../lib/actions";
import { useT } from "../../i18n";
import { AgentPicker } from "./agent-picker";
import { ModePicker, useModes } from "./mode-picker";
import { ModelPicker } from "./model-picker";
import { FolderPicker } from "./folder-picker";
import { SendButton } from "./send-button";
import { SlashMenu, type SlashItem } from "./slash-menu";

const LOCAL: SlashItem[] = [
  { name: "new", key: "cmd.new" },
  { name: "resume", key: "cmd.resume" },
];

export const Composer = memo(function Composer() {
  const t = useT();
  const [text, setText] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const { busy, started } = useApp(
    useShallow((st) => {
      const s = currentSession(st);
      return { busy: Boolean(s?.busy && !s.ended), started: Boolean(s) };
    }),
  );
  const commands = useApp((st) => st.capabilities.commands);
  const modes = useModes();

  const slashQuery = /^\/(\S*)$/.exec(text)?.[1]?.toLowerCase() ?? null;
  const slashItems = useMemo(() => {
    if (slashQuery === null) return [];
    const seen = new Set<string>();
    return [...LOCAL, ...commands.map((c) => ({ name: c.name, description: c.description, hint: c.hint }))]
      .filter((c) => !seen.has(c.name) && seen.add(c.name) && c.name.toLowerCase().includes(slashQuery))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(slashQuery)) - Number(a.name.toLowerCase().startsWith(slashQuery)))
      .slice(0, 60);
  }, [slashQuery, commands]);

  const resize = () => {
    const el = input.current!;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  };
  const setValue = (v: string) => {
    setText(v);
    setSlashIndex(0);
    requestAnimationFrame(resize);
  };

  const submit = useCallback(async () => {
    const value = input.current!.value.trim();
    if (!value) return;
    if (value === "/new") return setValue(""), newChat();
    if (value === "/resume") return setValue(""), openHistory();
    if (value === "/settings") return setValue(""), showView("settings");
    setValue("");
    if (!(await send(value))) setValue(value);
  }, []);

  const pickSlash = (i: number) => {
    const item = slashItems[i];
    if (!item) return;
    const value = `/${item.name} `;
    setValue(value);
    input.current?.focus();
    if (LOCAL.some((l) => l.name === item.name)) {
      input.current!.value = value;
      submit();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Vietnamese/CJK input methods compose with Enter; never send mid-composition.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (slashItems.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = slashItems.length;
        setSlashIndex((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        return pickSlash(slashIndex);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        return setValue("");
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Tab" && e.shiftKey && modes.length) {
      e.preventDefault();
      const current = useApp.getState();
      const id = currentSession(current)?.mode || current.draftMode || modes[0].id;
      setMode(modes[(modes.findIndex((m) => m.id === id) + 1) % modes.length].id);
    } else if (e.key === "Escape" && busy) {
      e.preventDefault();
      interrupt();
    }
  };

  return (
    <footer className="composer-wrap">
      {!started && <FolderPicker />}
      {slashItems.length > 0 && <SlashMenu items={slashItems} index={slashIndex} onPick={pickSlash} />}
      <div className="composer" onClick={(e) => e.target === e.currentTarget && input.current?.focus()}>
        <textarea
          ref={input}
          rows={1}
          autoFocus
          value={text}
          placeholder={busy ? t("placeholderBusy") : t("placeholder")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="composer-row">
          <AgentPicker />
          <ModePicker />
          <span className="spacer" />
          <ModelPicker />
          <SendButton hasText={Boolean(text.trim())} onSend={submit} />
        </div>
      </div>
    </footer>
  );
});
