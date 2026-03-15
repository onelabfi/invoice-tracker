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
import fi from "@/locales/fi.json";
import sv from "@/locales/sv.json";
import de from "@/locales/de.json";

export type Locale = "en" | "fi" | "sv" | "de";

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fi", label: "Suomi", flag: "🇫🇮" },
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

const translations: Record<Locale, Record<string, string>> = { en, fi, sv, de };

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

  if (prefix === "fi") return "fi";
  if (prefix === "sv") return "sv";
  if (prefix === "de") return "de";
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
