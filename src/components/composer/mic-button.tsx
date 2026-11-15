import { memo, useEffect, useRef, useState } from "react";
import { useApp } from "../../store/app-store";
import { useChat } from "../../store/chat-store";
import { translate, useT } from "../../i18n";
import { IconMic } from "../icons";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

const SpeechRecognition: (new () => Recognition) | undefined =
  (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;

const notice = (key: "micBlocked" | "micUnsupported") =>
  useChat.getState().apply([{ type: "notice", tone: "error", text: translate(useApp.getState().lang, key) }]);

/**
 * Dictation into the composer. A side panel cannot show the microphone
 * prompt itself, so the first time we open a tab that asks for it.
 */
export const MicButton = memo(function MicButton({ onText }: { onText: (text: string) => void }) {
  const t = useT();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  useEffect(() => () => rec.current?.stop(), []);

  const toggle = () => {
    if (listening) return rec.current?.stop();
    if (!SpeechRecognition) return notice("micUnsupported");
    const r = new SpeechRecognition();
    r.lang = useApp.getState().lang === "vi" ? "vi-VN" : navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") });
        notice("micBlocked");
      }
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <button
      type="button"
      className={`tool-btn${listening ? " recording" : ""}`}
      title={listening ? t("voiceStop") : t("voice")}
      aria-label={listening ? t("voiceStop") : t("voice")}
      aria-pressed={listening}
      onClick={toggle}
    >
      <IconMic />
    </button>
  );
});
