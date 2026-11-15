import { memo, useEffect } from "react";
import { useApp } from "./store/app-store";
import { newChat } from "./lib/actions";
import { Header } from "./components/header";
import { Banner } from "./components/banner";
import { MessageList } from "./components/message-list";
import { Composer } from "./components/composer/composer";
import { HistoryView } from "./components/history-view";
import { SettingsView } from "./components/settings-view";

export function App() {
  useThemeAndLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="app">
      <Header />
      <Banner />
      <Body />
    </div>
  );
}

const Body = memo(function Body() {
  const view = useApp((st) => st.view);
  if (view === "history") return <HistoryView />;
  if (view === "settings") return <SettingsView />;
  return (
    <>
      <MessageList />
      <Composer />
    </>
  );
});

function useThemeAndLang() {
  const theme = useApp((st) => st.theme);
  const lang = useApp((st) => st.lang);
  const answerFont = useApp((st) => st.answerFont);
  useEffect(() => {
    document.documentElement.dataset.answerFont = answerFont;
  }, [answerFont]);
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}
