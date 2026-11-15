import { memo, useRef } from "react";
import { useT } from "../../i18n";
import { IconClose, IconPlus } from "../icons";
import type { Attachment } from "../../types";

export const AttachButton = memo(function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const t = useT();
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="tool-btn" title={t("attach")} aria-label={t("attach")} onClick={() => picker.current?.click()}>
        <IconPlus />
      </button>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files || [])]);
          e.target.value = "";
        }}
      />
    </>
  );
});

export const AttachmentStrip = memo(function AttachmentStrip({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  const t = useT();
  return (
    <div className="attachments">
      {items.map((a) => (
        <div key={a.id} className="attachment" title={a.name}>
          <img src={a.thumb} alt={a.name} />
          <button type="button" className="attachment-remove" title={t("removeImage")} aria-label={t("removeImage")} onClick={() => onRemove(a.id)}>
            <IconClose size={10} />
          </button>
        </div>
      ))}
    </div>
  );
});
