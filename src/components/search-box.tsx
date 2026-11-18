import { useEffect, useRef } from "react";
import { IconSearch } from "./icons";

/** The rounded "🔍 Search…" field shared by the history dialog and long pick lists. */
export function SearchBox(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  onEnter?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <label className={`search${props.className ? " " + props.className : ""}`}>
      <IconSearch />
      <input
        ref={input}
        type="search"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && props.onEnter?.()}
      />
    </label>
  );
}
