import { memo } from "react";
import { useT } from "../i18n";
import type { PlanEntry } from "../types";

export const PlanCard = memo(function PlanCard({ entries }: { entries: PlanEntry[] }) {
  const t = useT();
  const done = entries.filter((e) => e.status === "completed").length;
  return (
    <div className="plan-card">
      <div className="plan-head">
        <span>{t("plan")}</span>
        <span className="plan-count">{done}/{entries.length}</span>
      </div>
      <TodoList entries={entries} />
    </div>
  );
});

export function TodoList({ entries }: { entries: PlanEntry[] }) {
  return (
    <ul className="todos">
      {entries.map((e, i) => (
        <li key={i} className={e.status}>
          <span className="todo-box" />
          <span>{e.content}</span>
        </li>
      ))}
    </ul>
  );
}
