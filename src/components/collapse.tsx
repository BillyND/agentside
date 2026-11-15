import { useEffect, useState, type ReactNode } from "react";

/**
 * Animated expand/collapse (grid-row 0fr → 1fr). Content mounts on first open
 * and unmounts after the closing transition, so closed sections cost nothing.
 */
export function Collapse({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
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
      <div className={`collapse-inner ${className}`}>{children}</div>
    </div>
  );
}
