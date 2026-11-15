import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "../../store/app-store";
import { chooseFolder, rememberDir } from "../../lib/actions";
import { shortPath } from "../../lib/format";
import { useT } from "../../i18n";
import { IconChevron, IconFolder } from "../icons";
import { MenuItems, Popover } from "../popover-menu";

const PICK = "\0pick";

/** Folder the next chat runs in: recent folders, or the system folder chooser. */
export const FolderPicker = memo(function FolderPicker() {
  const t = useT();
  const { cwd, recentDirs } = useApp(useShallow((st) => ({ cwd: st.cwd, recentDirs: st.recentDirs })));
  const items = useMemo(
    () => [
      ...recentDirs.map((d) => ({ id: d, label: shortPath(d), description: d })),
      { id: PICK, label: t("chooseFolder") },
    ],
    [recentDirs, t("chooseFolder")],
  );
  const pick = (id: string) => (id === PICK ? chooseFolder(t("chooseFolderPrompt")) : rememberDir(id));
  // With no recent folders, go straight to the system chooser.
  if (!recentDirs.length) {
    return (
      <button className="folder-chip" title={t("folderHint")} onClick={() => pick(PICK)}>
        <IconFolder />
        <span>{shortPath(cwd) || t("chooseFolder")}</span>
        <IconChevron />
      </button>
    );
  }
  return (
    <Popover
      className="folder-picker"
      title={t("folderHint")}
      placement="down"
      panelClass="center folder-menu"
      trigger={
        <span className="folder-chip">
          <IconFolder />
          <span>{shortPath(cwd) || t("folder")}</span>
          <IconChevron />
        </span>
      }
    >
      {(close) => (
        <>
          <div className="menu-head">{t("recentFolders")}</div>
          <MenuItems items={items} selected={cwd} onPick={(id) => (close(), pick(id))} />
        </>
      )}
    </Popover>
  );
});
