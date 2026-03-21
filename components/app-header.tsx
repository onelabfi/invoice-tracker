"use client";

import { useTranslation } from "@/lib/i18n";

export function AppHeader() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <img src="/ricordo-logo1.png" alt="Ricordo" className="h-6 w-auto" />
      <span className="text-[11px] font-normal text-gray-400 tracking-wide italic">
        {t("logo_motto")}
      </span>
    </div>
  );
}
