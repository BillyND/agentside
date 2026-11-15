import { memo } from "react";
import { Logo } from "./icons";
import { FolderPicker } from "./composer/folder-picker";

/** Before the first message: the mark, plus the folder the chat will run in. */
export const EmptyState = memo(function EmptyState() {
  return (
    <div className="empty">
      <Logo size={56} className="empty-logo" />
      <FolderPicker />
    </div>
  );
});
