import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { currentSession, useApp } from "../../store/app-store";
import { interrupt, newChat, openHistory, send, setMode, showView } from "../../lib/actions";
import { ImageTooLargeError, MAX_IMAGE_MB, toAttachment } from "../../lib/images";
import { useChat } from "../../store/chat-store";
import { translate, useT } from "../../i18n";
import { ModeToggle, useModes } from "./mode-picker";
import { ModelPicker } from "./model-picker";
import { SendButton } from "./send-button";
import { MicButton } from "./mic-button";
import { AttachButton, AttachmentStrip } from "./attachments";
import { SlashMenu, type SlashItem } from "./slash-menu";
import type { Attachment } from "../../types";

const LOCAL: SlashItem[] = [
  { name: "new", key: "cmd.new" },
  { name: "resume", key: "cmd.resume" },
];

export const Composer = memo(function Composer() {
  const t = useT();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const { busy, started } = useApp(useShallow((st) => {
    const s = currentSession(st);
    return { busy: Boolean(s?.busy && !s.ended), started: Boolean(s && !s.fresh) };
  }));
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
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  };
  const setValue = useCallback((v: string) => {
    setText(v);
    setSlashIndex(0);
    requestAnimationFrame(resize);
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      try {
        const att = await toAttachment(file);
        setAttachments((list) => [...list, att]);
      } catch (err) {
        const msg = err instanceof ImageTooLargeError
          ? translate(useApp.getState().lang, "imageTooLarge", { n: MAX_IMAGE_MB })
          : (err as Error).message;
        useChat.getState().apply([{ type: "notice", tone: "error", text: msg }]);
      }
    }
  }, []);

  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const submit = useCallback(async () => {
    const value = input.current!.value.trim();
    const files = attachmentsRef.current;
    if (!value && !files.length) return;
    if (value === "/new") return setValue(""), newChat();
    if (value === "/resume") return setValue(""), openHistory();
    if (value === "/settings") return setValue(""), showView("settings");
    setValue("");
    setAttachments([]);
    if (!(await send(value, files))) {
      setValue(value);
      setAttachments(files);
    }
  }, [setValue]);

  const appendText = useCallback((spoken: string) => {
    const current = input.current?.value || "";
    setValue(current ? `${current.replace(/\s+$/, "")} ${spoken}` : spoken);
  }, [setValue]);

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
      const st = useApp.getState();
      const id = currentSession(st)?.mode || st.draftMode || modes[0].id;
      setMode(modes[(modes.findIndex((m) => m.id === id) + 1) % modes.length].id);
    } else if (e.key === "Escape" && busy) {
      e.preventDefault();
      interrupt();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.files];
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      addFiles(files);
    }
  };

  return (
    <footer className="composer-wrap">
      {slashItems.length > 0 && <SlashMenu items={slashItems} index={slashIndex} onPick={pickSlash} />}
      <div
        className="composer"
        onClick={(e) => e.target === e.currentTarget && input.current?.focus()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles([...e.dataTransfer.files]);
        }}
      >
        {attachments.length > 0 && (
          <AttachmentStrip items={attachments} onRemove={(id) => setAttachments((l) => l.filter((a) => a.id !== id))} />
        )}
        <textarea
          ref={input}
          rows={1}
          autoFocus
          value={text}
          aria-label={t("placeholder")}
          placeholder={busy ? t("placeholderBusy") : started ? t("placeholderReply") : t("placeholder")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <div className="composer-row">
          <AttachButton onFiles={addFiles} />
          <ModeToggle />
          <span className="spacer" />
          <ModelPicker />
          <MicButton onText={appendText} />
          <SendButton hasText={Boolean(text.trim()) || attachments.length > 0} onSend={submit} />
        </div>
      </div>
    </footer>
  );
});
