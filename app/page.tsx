"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function LandingPage() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Always show landing page (demo mode)
    const id = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 safe-bottom">
      <div
        className={`flex-1 flex flex-col items-center justify-center text-center max-w-xs mx-auto transition-all duration-700 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* Logo identity block — tight grouping */}
        <div className="flex flex-col items-center mb-10">
          <img
            src="/ricordo-logo.png"
            alt="Ricordo"
            className="h-16 w-auto rounded-2xl"
          />
          <p className="text-xs italic text-white/35 tracking-widest mt-1.5">
            {t("logo_motto")}
          </p>
        </div>

        {/* Headline */}
        <h1 className="text-[22px] font-extrabold text-white leading-tight mb-3">
          {t("landing_headline")}
        </h1>

        {/* Subtext */}
        <p className="text-[13px] text-white/50 leading-relaxed mb-3">
          {t("landing_subtext")}
        </p>

        {/* Kravia trust layer */}
        <p className="text-[11px] text-white/60 tracking-wide">
          {t("landing_kravia")}
        </p>
      </div>

      {/* Bottom section — always visible */}
      <div
        className={`pb-6 pt-8 max-w-xs mx-auto w-full transition-all duration-700 delay-200 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* CTA */}
        <Link
          href="/signup"
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-bold text-slate-900 hover:bg-gray-100 transition-colors min-h-[48px] shadow-lg"
        >
          {t("landing_cta")}
          <ArrowRight className="h-4 w-4" />
        </Link>

        {/* Login link */}
        <p className="mt-3 text-xs text-white/35 text-center">
          {t("landing_login")}{" "}
          <Link href="/login" className="font-semibold text-white/60 hover:text-white transition-colors">
            {t("landing_login_link")}
          </Link>
        </p>

        {/* Footer trust */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-white/25">
          <Shield className="h-3 w-3" />
          {t("landing_footer")}
        </div>
      </div>
    </div>
  );
}
