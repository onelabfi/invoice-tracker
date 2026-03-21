"use client";

import { useState } from "react";
import {
  LogOut,
  Download,
  ChevronRight,
  Globe,
  Upload,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { BankConnections } from "./bank-connections";
import { useTranslation, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { AppHeader } from "./app-header";

interface SettingsTabProps {
  invoiceCount: number;
  onLogout: () => void;
  onExport: () => void;
}

export function SettingsTab({ invoiceCount, onLogout, onExport }: SettingsTabProps) {
  const { t, locale, setLocale } = useTranslation();
  const [autoScan, setAutoScan] = useState(true);
  const [detectAnomalies, setDetectAnomalies] = useState(true);
  const [identifySavings, setIdentifySavings] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportedCount(null);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());
      const startIndex = lines[0]?.toLowerCase().includes("date") ? 1 : 0;
      const transactions = lines.slice(startIndex).map((line) => {
        const [date, merchant, amount, reference, description] = line
          .split(",")
          .map((field) => field.trim().replace(/^"|"$/g, ""));
        return { date, merchant, amount: parseFloat(amount), reference, description };
      });
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });
      if (res.ok) {
        const data = await res.json();
        setImportedCount(data.count ?? transactions.length);
      }
    } catch (err) {
      console.error("Failed to import:", err);
    } finally {
      setImporting(false);
    }
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-7 w-12 rounded-full transition-colors flex-shrink-0 ${
        value ? "bg-[#1e3a5f]" : "bg-gray-300"
      }`}
    >
      <div
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );

  return (
    <div className="safe-bottom px-4 pt-6 pb-4">
      <div className="mb-1"><AppHeader /></div>
      <h1 className="text-xl font-extrabold text-gray-900 mb-6">{t("settings")}</h1>

      {/* Connected Accounts */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("settings_connected_accounts")}
          </h2>
        </div>
        <BankConnections />
      </div>

      {/* AI Behavior — right after accounts */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("settings_ai_behavior")}
          </h2>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="px-4 py-3 flex items-center justify-between min-h-[52px]">
            <div>
              <p className="text-sm font-medium text-gray-900">{t("settings_auto_scanning")}</p>
              <p className="text-xs text-gray-500">{t("settings_auto_scanning_desc")}</p>
            </div>
            <Toggle value={autoScan} onChange={setAutoScan} />
          </div>
          <div className="px-4 py-3 flex items-center justify-between min-h-[52px]">
            <div>
              <p className="text-sm font-medium text-gray-900">{t("settings_detect_anomalies")}</p>
              <p className="text-xs text-gray-500">{t("settings_detect_anomalies_desc")}</p>
            </div>
            <Toggle value={detectAnomalies} onChange={setDetectAnomalies} />
          </div>
          <div className="px-4 py-3 flex items-center justify-between min-h-[52px]">
            <div>
              <p className="text-sm font-medium text-gray-900">{t("settings_identify_savings")}</p>
              <p className="text-xs text-gray-500">{t("settings_identify_savings_desc")}</p>
            </div>
            <Toggle value={identifySavings} onChange={setIdentifySavings} />
          </div>
        </div>
      </div>

      {/* Data Import */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("settings_data_import")}
          </h2>
        </div>
        <div className="px-4 py-3">
          <label className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-gray-200 py-4 cursor-pointer hover:border-[#1e3a5f] transition-colors min-h-[48px]">
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <Upload className="h-4 w-4 text-gray-400" />
            )}
            <span className="text-sm text-gray-500">
              {importing ? t("importing") : t("settings_upload_csv")}
            </span>
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
              disabled={importing}
            />
          </label>
          {importedCount !== null && (
            <div className="flex items-center gap-2 mt-3 text-sm text-emerald-600">
              <CheckCircle className="h-4 w-4" />
              {t("settings_tx_imported", { count: String(importedCount) })}
            </div>
          )}
        </div>
      </div>

      {/* Preferences */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("settings_preferences")}
          </h2>
        </div>
        <div className="px-4 py-3">
          <label className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <Globe className="h-3.5 w-3.5" />
            {t("language")}
          </label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 16px center",
            }}
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <option key={loc.code} value={loc.code}>
                {loc.flag} {loc.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Export */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("settings_data")}
          </h2>
        </div>
        <button
          onClick={onExport}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors min-h-[52px]"
        >
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-900">{t("export_data_csv")}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
        <div className="px-4 py-2 border-t border-gray-50">
          <p className="text-xs text-gray-400">{t("settings_invoices_tracked", { count: String(invoiceCount) })}</p>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors min-h-[48px]"
      >
        <LogOut className="h-4 w-4" />
        {t("log_out")}
      </button>
    </div>
  );
}
