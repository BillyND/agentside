import { memo } from "react";
import { useApp } from "../store/app-store";
import { start } from "../lib/actions";
import { useT } from "../i18n";

export const Banner = memo(function Banner() {
  const t = useT();
  const banner = useApp((st) => st.banner);
  if (!banner) return null;
  return (
    <div className="banner" role="alert">
      <span>{banner}</span>
      <button className="btn small" onClick={start}>{t("reconnect")}</button>
    </div>
  );
});
