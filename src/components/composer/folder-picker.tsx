import { memo, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../../store/app-store";
import { rememberDir } from "../../lib/actions";
import { shortPath } from "../../lib/format";
import { useT } from "../../i18n";
import { IconChevron, IconFolder } from "../icons";

/** Folder the next chat runs in; shown on the empty screen until the first message. */
export const FolderPicker = memo(function FolderPicker() {
  const t = useT();
  const { cwd, recentDirs } = useApp(useShallow((st) => ({ cwd: st.cwd, recentDirs: st.recentDirs })));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(cwd);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setDraft(cwd);
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, cwd]);
  const choose = (dir: string) => {
    if (dir.trim()) rememberDir(dir.trim());
    setOpen(false);
  };
  return (
    <div className="folder-picker" ref={root}>
      <button className="folder-chip" title={t("folderHint")} onClick={() => setOpen((o) => !o)}>
        <IconFolder />
        <span>{shortPath(cwd) || t("folder")}</span>
        <IconChevron />
      </button>
      {open && (
        <div className="menu down center folder-menu">
          <input
            autoFocus
            spellCheck={false}
            value={draft}
            placeholder="/path/to/project"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") choose(draft);
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {recentDirs.length > 0 && <div className="menu-head">{t("recentFolders")}</div>}
          {recentDirs.map((d) => (
            <button key={d} className="menu-item" onClick={() => choose(d)}>
              <span className="menu-text">
                <span className="menu-label">{shortPath(d)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
