"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { isOnboarded } from "@/lib/onboarding";

export default function LandingPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOnboarded()) {
      router.replace("/app");
      return;
    }
    const id = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 safe-bottom">
      <div
        className={`flex-1 flex flex-col items-center justify-center text-center max-w-xs mx-auto transition-all duration-700 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* Logo */}
        <img
          src="/ricordo-logo.png"
          alt="Ricordo"
          className="h-16 w-auto mb-2 rounded-2xl"
        />

        {/* Motto */}
        <p className="text-xs italic text-white/35 tracking-widest mb-8">
          {t("logo_motto")}
        </p>

        {/* Headline */}
        <h1 className="text-[22px] font-extrabold text-white leading-tight mb-3">
          {t("landing_headline")}
        </h1>

        {/* Subtext */}
        <p className="text-[13px] text-white/50 leading-relaxed">
          {t("landing_subtext")}
        </p>
      </div>

      {/* Bottom section — always visible */}
      <div
        className={`pb-6 pt-6 max-w-xs mx-auto w-full transition-all duration-700 delay-200 ${
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
