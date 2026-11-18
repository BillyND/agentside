import { useEffect, useState, type ReactNode } from "react";
import { IconChevronRight } from "./icons";

/**
 * Animated expand/collapse (grid-row 0fr → 1fr). Content mounts on first open
 * and unmounts after the closing transition, so closed sections cost nothing.
 * Style the children, never .collapse-inner: margin or padding on the grid item
 * keeps the row from reaching 0, and the leftover snaps away on unmount.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: let the closed layout paint so the height can animate.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    if (mounted) setShown(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mounted) return null;
  return (
    <div
      className={`collapse${shown ? " shown" : ""}`}
      onTransitionEnd={(e) => e.target === e.currentTarget && !open && setMounted(false)}
    >
      <div className="collapse-inner">{children}</div>
    </div>
  );
}

/** A quiet "label ›" line that folds its body open below it (thinking, tool runs, tool details). */
export function Fold(props: {
  className: string;
  toggleClassName?: string;
  bodyClassName: string;
  label: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    <div className={`fold ${props.className}${open ? " open" : ""}`}>
      <button
        className={`fold-toggle${props.toggleClassName ? " " + props.toggleClassName : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {props.label}
        <IconChevronRight className="chev" />
      </button>
      <Collapse open={open}>
        <div className={props.bodyClassName}>{props.children}</div>
      </Collapse>
    </div>
  );
}
