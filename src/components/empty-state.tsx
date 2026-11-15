import { memo } from "react";
import { Logo } from "./icons";

/** Before the first message: just the mark, like a fresh Claude panel. */
export const EmptyState = memo(function EmptyState() {
  return (
    <div className="empty">
      <Logo size={56} className="empty-logo" />
    </div>
  );
});
