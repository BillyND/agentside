import { memo, useState } from "react";
import { answerPermission } from "../lib/actions";
import { useT } from "../i18n";
import type { ChatItem, Question } from "../types";

type Item = Extract<ChatItem, { kind: "question" }>;

/** Multiple-choice questions an agent asks mid-task. */
export const QuestionCard = memo(function QuestionCard({ item }: { item: Item }) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const done = Boolean(item.resolved);
  return (
    <div className={`permission question${done ? " resolved" : ""}`}>
      {item.questions.map((q) => (
        <QuestionBlock
          key={q.question}
          q={q}
          value={answers[q.question] || ""}
          disabled={done}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.question]: v }))}
        />
      ))}
      {done ? (
        <div className={`perm-done ${item.resolved}`}>{item.resolved === "allow" ? t("answered") : t("skipped")}</div>
      ) : (
        <div className="perm-actions">
          <button className="btn primary" onClick={() => answerPermission(item.reqId, "answer", answers)}>{t("sendAnswer")}</button>
          <button className="btn ghost" onClick={() => answerPermission(item.reqId, "reject")}>{t("skip")}</button>
        </div>
      )}
    </div>
  );
});

function QuestionBlock({ q, value, disabled, onChange }: { q: Question; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT();
  const picked = new Set(value ? value.split(", ") : []);
  const toggle = (label: string) => {
    if (!q.multiSelect) return onChange(picked.has(label) ? "" : label);
    picked.has(label) ? picked.delete(label) : picked.add(label);
    onChange([...picked].join(", "));
  };
  const isOption = q.options.some((o) => picked.has(o.label));
  return (
    <div className="q-block">
      {q.header && <div className="q-header">{q.header}</div>}
      <div className="perm-title">{q.question}</div>
      <div className="q-options">
        {q.options.map((o) => (
          <button key={o.label} className={`q-option${picked.has(o.label) ? " picked" : ""}`} disabled={disabled} onClick={() => toggle(o.label)}>
            <span className="q-label">{o.label}</span>
            {o.description && <span className="q-desc">{o.description}</span>}
          </button>
        ))}
      </div>
      <input className="q-other" placeholder={t("otherAnswer")} disabled={disabled} value={isOption ? "" : value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
