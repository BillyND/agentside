import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck } from "./icons";

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  badge?: string;
}

/** Button with a floating panel. Closes on outside click or Escape. */
export const Popover = memo(function Popover(props: {
  trigger: ReactNode;
  title?: string;
  className?: string;
  placement?: "up" | "down";
  align?: "start" | "end";
  panelClass?: string;
  disabled?: boolean;
  children: (close: () => void) => ReactNode;
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
      <button
        type="button"
        className={`popover-trigger${open ? " open" : ""}`}
        title={props.title}
        aria-label={props.title}
        aria-expanded={open}
        disabled={props.disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {props.trigger}
      </button>
      {open && (
        <div className={`menu ${props.placement || "up"} ${props.align || "start"} ${props.panelClass || ""}`} role="menu">
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
});

export function MenuItems({ items, selected, onPick }: { items: MenuItem[]; selected?: string | null; onPick: (id: string) => void }) {
  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitemradio"
          aria-checked={item.id === selected}
          className="menu-item"
          disabled={item.disabled}
          onClick={() => onPick(item.id)}
        >
          <span className="menu-text">
            <span className="menu-label">
              {item.label}
              {item.badge && <span className="menu-badge">{item.badge}</span>}
            </span>
            {item.description && <span className="menu-desc">{item.description}</span>}
          </span>
          {item.id === selected && <IconCheck className="menu-check" />}
        </button>
      ))}
    </>
  );
}

/** Popover holding a single pick-one list. */
export const PopoverMenu = memo(function PopoverMenu(props: {
  trigger: ReactNode;
  title?: string;
  items: MenuItem[];
  selected?: string | null;
  onPick: (id: string) => void;
  placement?: "up" | "down";
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <Popover trigger={props.trigger} title={props.title} className={props.className} placement={props.placement} align={props.align}>
      {(close) => (
        <MenuItems
          items={props.items}
          selected={props.selected}
          onPick={(id) => {
            close();
            props.onPick(id);
          }}
        />
      )}
    </Popover>
  );
});
