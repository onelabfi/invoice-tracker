"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

import en from "@/locales/en.json";
import de from "@/locales/de.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";
import it from "@/locales/it.json";
import fi from "@/locales/fi.json";
import sv from "@/locales/sv.json";
import no from "@/locales/no.json";
import da from "@/locales/da.json";
import nl from "@/locales/nl.json";
import pl from "@/locales/pl.json";

export type Locale = "en" | "de" | "fr" | "es" | "it" | "fi" | "sv" | "no" | "da" | "nl" | "pl";

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "fi", label: "Suomi", flag: "🇫🇮" },
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "no", label: "Norsk", flag: "🇳🇴" },
  { code: "da", label: "Dansk", flag: "🇩🇰" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
];

const translations: Record<Locale, Record<string, string>> = { en, de, fr, es, it, fi, sv, no, da, nl, pl };

type TranslationKey = keyof typeof en;

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = "ricordo-lang";

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";

  const lang = navigator.language || "";
  const prefix = lang.split("-")[0].toLowerCase();

  if (prefix === "de") return "de";
  if (prefix === "fr") return "fr";
  if (prefix === "es") return "es";
  if (prefix === "it") return "it";
  if (prefix === "fi") return "fi";
  if (prefix === "sv") return "sv";
  if (prefix === "no" || prefix === "nb" || prefix === "nn") return "no";
  if (prefix === "da") return "da";
  if (prefix === "nl") return "nl";
  if (prefix === "pl") return "pl";
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && translations[saved]) {
      setLocaleState(saved);
    } else {
      setLocaleState(detectBrowserLocale());
    }
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let text = translations[locale]?.[key] || translations.en[key] || key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{{${k}}}`, String(v));
        });
      }
      return text;
    },
    [locale]
  );

  // Prevent hydration mismatch by rendering with "en" on server, then updating
  if (!mounted) {
    const serverT = (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let text = translations.en[key] || key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{{${k}}}`, String(v));
        });
      }
      return text;
    };
    return (
      <I18nContext.Provider value={{ locale: "en", setLocale, t: serverT }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
