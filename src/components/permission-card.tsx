import { memo, useState } from "react";
import { answerPermission } from "../lib/actions";
import { toolArg, toolLabel } from "../lib/format";
import { useT } from "../i18n";
import { ToolDetail } from "./tool-detail";
import type { ChatItem, PermissionOption } from "../types";

type Item = Extract<ChatItem, { kind: "permission" }>;

const OPTION_KEYS = {
  allow_once: "allowOnce",
  allow_always: "allowAlways",
  reject_once: "rejectOnce",
  reject_always: "rejectAlways",
} as const;

// Commands and edits are what a request is judged by, so they show up front.
const SHOW_DETAIL = new Set(["Bash", "Edit", "MultiEdit", "Write", "ExitPlanMode", "edit", "execute"]);

export const PermissionCard = memo(function PermissionCard({ item }: { item: Item }) {
  const t = useT();
  const [details, setDetails] = useState(SHOW_DETAIL.has(item.toolName));
  const isPlan = item.toolName === "ExitPlanMode";
  const tool = { name: item.toolName, title: item.title, input: item.input };
  const arg = toolArg(tool);
  const label = (o: PermissionOption) => {
    if (isPlan) return o.kind.startsWith("allow") ? (o.kind === "allow_once" ? t("approvePlan") : t(OPTION_KEYS[o.kind])) : t("decline");
    return OPTION_KEYS[o.kind] ? t(OPTION_KEYS[o.kind]) : o.label;
  };
  return (
    <div className={`permission${item.resolved ? " resolved" : ""}${isPlan ? " plan" : ""}`}>
      <div className="perm-eyebrow">{isPlan ? t("proposedPlan") : t("permissionNeeded")}</div>
      {!isPlan && (
        <div className="perm-title">
          {toolLabel(tool)}
          {!details && arg && <span className="perm-arg"> {arg}</span>}
        </div>
      )}
      {item.reason && <div className="perm-reason">{item.reason}</div>}
      {details ? (
        <ToolDetail name={item.toolName} input={item.input} />
      ) : (
        Object.keys(item.input).length > 0 && <button className="link-btn" onClick={() => setDetails(true)}>{t("showDetails")}</button>
      )}
      {item.resolved ? (
        <div className={`perm-done ${item.resolved}`}>{item.resolved === "allow" ? t("allowed") : t("denied")}</div>
      ) : (
        <div className="perm-actions">
          {item.options.map((o, i) => (
            <button
              key={o.id}
              className={`btn ${o.kind.startsWith("allow") ? (i === 0 ? "primary" : "") : "ghost"}`}
              autoFocus={i === 0}
              onClick={() => answerPermission(item.reqId, o.id)}
            >
              {label(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
