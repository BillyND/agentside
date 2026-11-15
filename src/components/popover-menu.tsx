import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck } from "./icons";

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  badge?: string;
}

/**
 * Button that opens a small menu above or below it. Closes on outside click,
 * Escape or pick. Only the open menu renders its items.
 */
export const PopoverMenu = memo(function PopoverMenu(props: {
  trigger: ReactNode;
  title?: string;
  items: MenuItem[];
  selected?: string | null;
  onPick: (id: string) => void;
  placement?: "up" | "down";
  align?: "start" | "end";
  className?: string;
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className={`popover ${props.className || ""}`} ref={root}>
      <button type="button" className={`popover-trigger${open ? " open" : ""}`} title={props.title} onClick={() => setOpen((o) => !o)}>
        {props.trigger}
      </button>
      {open && (
        <div className={`menu ${props.placement || "up"} ${props.align || "start"}`} role="menu">
          {props.header}
          {props.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === props.selected}
              className="menu-item"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                props.onPick(item.id);
              }}
            >
              <span className="menu-text">
                <span className="menu-label">
                  {item.label}
                  {item.badge && <span className="menu-badge">{item.badge}</span>}
                </span>
                {item.description && <span className="menu-desc">{item.description}</span>}
              </span>
              {item.id === props.selected && <IconCheck className="menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
