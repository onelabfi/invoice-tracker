"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Shield, Globe } from "lucide-react";
import { useTranslation, SUPPORTED_LOCALES } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

export default function LandingPage() {
  const { t, locale, setLocale } = useTranslation();
  const [show, setShow] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(id);
  }, []);

  // Check auth state so CTAs route correctly
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) setIsAuthed(true);
      });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    if (langOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [langOpen]);

  const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === locale);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 safe-bottom relative">
      {/* Language switcher — top right */}
      <div
        ref={langRef}
        className={`absolute top-4 right-4 z-50 transition-all duration-700 ${
          show ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={() => setLangOpen(!langOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all text-xs"
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{currentLocale?.flag} {locale.toUpperCase()}</span>
        </button>

        {langOpen && (
          <div className="absolute right-0 mt-1 w-44 rounded-xl bg-slate-800 border border-white/10 shadow-2xl py-1.5 max-h-80 overflow-y-auto">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc.code}
                onClick={() => {
                  setLocale(loc.code);
                  setLangOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  loc.code === locale
                    ? "text-white bg-white/10"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-base">{loc.flag}</span>
                <span>{loc.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

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
        {/* CTA — route to /app if already logged in, /signup if not */}
        <Link
          href={isAuthed ? "/app" : "/signup"}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-bold text-slate-900 hover:bg-gray-100 transition-colors min-h-[48px] shadow-lg"
        >
          {isAuthed ? t("landing_open_app") || "Open App" : t("landing_cta")}
          <ArrowRight className="h-4 w-4" />
        </Link>

        {/* Login link — only show when not authenticated */}
        {!isAuthed && (
          <p className="mt-3 text-xs text-white/35 text-center">
            {t("landing_login")}{" "}
            <Link href="/login" className="font-semibold text-white/60 hover:text-white transition-colors">
              {t("landing_login_link")}
            </Link>
          </p>
        )}

        {/* Footer trust */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-white/25">
          <Shield className="h-3 w-3" />
          {t("landing_footer")}
        </div>
      </div>
    </div>
  );
}
