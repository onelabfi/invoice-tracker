"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import {
  Building2,
  Plus,
  Upload,
  Zap,
  RefreshCw,
  CheckCircle,
  Loader2,
  X,
  Search,
  ChevronRight,
  Globe,
  ArrowLeft,
  Shield,
} from "lucide-react";

interface BankConnection {
  id: string;
  bankName: string;
  accountName: string | null;
  status: string;
  provider: string;
  country: string | null;
  lastSynced: string | null;
}

interface Institution {
  id: string;
  name: string;
  logo?: string;
}

const COUNTRIES = [
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "US", name: "United States", flag: "🇺🇸" },
];

type WizardStep = "idle" | "country" | "bank" | "connecting" | "done";

export function BankConnections() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>("idle");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<Institution | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isHolvi, setIsHolvi] = useState(false);
  const [iban, setIban] = useState("");

  // CSV upload
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync & Match
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<{
    matchesFound: number;
    invoicesUpdated: number;
    possibleMatches: number;
  } | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/bank-connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch (err) {
      console.error("Failed to fetch bank connections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Fetch institutions when country is selected
  async function handleCountrySelect(countryCode: string) {
    setSelectedCountry(countryCode);
    setWizardStep("bank");
    setLoadingBanks(true);
    setInstitutions([]);
    setBankSearch("");
    setSelectedBank(null);
    setIsHolvi(false);

    try {
      const res = await fetch(`/api/banks/institutions?country=${countryCode}`);
      if (res.ok) {
        const data = await res.json();
        setInstitutions(data.institutions || []);
      }
    } catch (err) {
      console.error("Failed to fetch institutions:", err);
    } finally {
      setLoadingBanks(false);
    }
  }

  // Connect to selected bank
  async function handleConnect() {
    if (!selectedBank || !selectedCountry) return;

    const holviSelected = selectedBank.id.includes("holvi");
    if (holviSelected) {
      setIsHolvi(true);
      return;
    }

    setConnecting(true);
    setWizardStep("connecting");

    try {
      const provider = selectedCountry === "US" ? "plaid" : "nordigen";
      const res = await fetch("/api/banks/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId: selectedBank.id,
          institutionName: selectedBank.name,
          country: selectedCountry,
          provider,
          iban: iban || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // If we got an auth URL, open it
        if (data.authUrl) {
          window.open(data.authUrl, "_blank");
        }

        setWizardStep("done");
        await fetchConnections();
      }
    } catch (err) {
      console.error("Failed to connect bank:", err);
    } finally {
      setConnecting(false);
    }
  }

  // CSV upload for Holvi
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

      // Create the Holvi connection if not exists
      if (isHolvi && selectedBank) {
        await fetch("/api/banks/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            institutionId: selectedBank.id,
            institutionName: "Holvi",
            country: selectedCountry || "FI",
            provider: "csv",
          }),
        });
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportedCount(data.count ?? transactions.length);
        await fetchConnections();
        if (isHolvi) {
          setWizardStep("done");
        }
      }
    } catch (err) {
      console.error("Failed to import transactions:", err);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSyncTransactions() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/banks/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSyncMessage(data.message || t("sync_success"));
        await fetchConnections();
      } else {
        setSyncMessage(t("sync_failed"));
      }
    } catch {
      setSyncMessage(t("sync_failed"));
    } finally {
      setSyncing(false);
    }
  }

  async function handleRunMatching() {
    setMatching(true);
    setMatchResults(null);
    try {
      const res = await fetch("/api/match", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setMatchResults(data);
      }
    } catch (err) {
      console.error("Failed to run AI matching:", err);
    } finally {
      setMatching(false);
    }
  }

  function resetWizard() {
    setWizardStep("idle");
    setSelectedCountry(null);
    setSelectedBank(null);
    setInstitutions([]);
    setBankSearch("");
    setIsHolvi(false);
    setIban("");
    setImportedCount(null);
  }

  function timeAgo(dateString: string | null): string {
    if (!dateString) return "—";
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const filteredInstitutions = bankSearch.trim()
    ? institutions.filter((b) => b.name.toLowerCase().includes(bankSearch.toLowerCase()))
    : institutions;

  // -- WIZARD VIEWS --

  // Step 1: Select Country
  if (wizardStep === "country") {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={resetWizard} className="p-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gray-900">{t("bank_select_country")}</p>
        </div>
        <p className="text-xs text-gray-400 ml-6">{t("bank_country_hint")}</p>

        <div className="space-y-1.5 mt-3">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              onClick={() => handleCountrySelect(c.code)}
              className="w-full flex items-center gap-3 rounded-xl bg-gray-50 p-3 text-left hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[48px]"
            >
              <span className="text-lg">{c.flag}</span>
              <span className="text-sm font-medium text-gray-900 flex-1">{c.name}</span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Select Bank
  if (wizardStep === "bank") {
    const countryObj = COUNTRIES.find((c) => c.code === selectedCountry);

    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => setWizardStep("country")} className="p-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gray-900">
            {countryObj?.flag} {t("bank_select_bank")}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={bankSearch}
            onChange={(e) => setBankSearch(e.target.value)}
            placeholder={t("bank_search_placeholder")}
            className="w-full rounded-xl bg-gray-100 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 border border-transparent"
            autoFocus
          />
        </div>

        {/* Bank list */}
        {loadingBanks ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#1e3a5f]" />
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {filteredInstitutions.map((bank) => {
              const isSelected = selectedBank?.id === bank.id;
              const isHolviBank = bank.id.includes("holvi");
              return (
                <button
                  key={bank.id}
                  onClick={() => { setSelectedBank(bank); setIsHolvi(false); }}
                  className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all min-h-[48px] ${
                    isSelected
                      ? "bg-blue-50 ring-2 ring-[#1e3a5f]"
                      : "bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-200">
                    <Building2 className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{bank.name}</p>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                      <CheckCircle className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
            {filteredInstitutions.length === 0 && !loadingBanks && (
              <p className="text-xs text-gray-400 text-center py-4">{t("bank_no_results")}</p>
            )}
          </div>
        )}

        {/* IBAN / Account Number */}
        {selectedBank && !selectedBank.id.includes("holvi") && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 px-1">{t("bank_iban_label")}</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder={selectedCountry === "US" ? "Account number" : "FI21 1234 5600 0007 85"}
              className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 border border-transparent font-mono tracking-wider"
            />
            <p className="text-[10px] text-gray-400 px-1">{t("bank_iban_hint")}</p>
          </div>
        )}

        {/* Connect button */}
        {selectedBank && (
          <button
            onClick={handleConnect}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#1e3a5f] py-3 text-sm font-semibold text-white hover:bg-[#152d4a] transition-colors min-h-[48px]"
          >
            <Shield className="h-4 w-4" />
            {t("bank_connect_button")}
          </button>
        )}

        {/* Holvi CSV fallback */}
        {isHolvi && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">{t("bank_holvi_title")}</p>
            <p className="text-xs text-amber-700">{t("bank_holvi_desc")}</p>
            <p className="text-xs text-gray-400">{t("csv_format_hint")}</p>
            <label className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-amber-300 py-4 cursor-pointer hover:border-amber-400 transition-colors min-h-[48px] bg-white">
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              ) : (
                <Upload className="h-4 w-4 text-amber-500" />
              )}
              <span className="text-sm text-amber-700 font-medium">
                {importing ? t("importing") : t("choose_csv_file")}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
                disabled={importing}
              />
            </label>
            {importedCount !== null && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle className="h-4 w-4" />
                {importedCount} {t("transactions_imported")}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Step 3: Connecting
  if (wizardStep === "connecting") {
    return (
      <div className="p-4 flex flex-col items-center justify-center py-12">
        <div className="relative mb-4">
          <div className="h-16 w-16 rounded-full border-4 border-blue-200 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-[#1e3a5f] animate-spin" />
          </div>
        </div>
        <p className="text-sm font-semibold text-gray-900">{t("bank_authenticating")}</p>
        <p className="text-xs text-gray-500 mt-1 text-center">{t("bank_auth_desc")}</p>
      </div>
    );
  }

  // Done
  if (wizardStep === "done") {
    return (
      <div className="p-4 flex flex-col items-center justify-center py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
          <CheckCircle className="h-8 w-8 text-emerald-600" />
        </div>
        <p className="text-base font-semibold text-gray-900">{t("bank_connected_title")}</p>
        <p className="text-sm text-gray-500 mt-1">{t("bank_connected_desc")}</p>
        <button
          onClick={resetWizard}
          className="mt-6 btn-primary px-8"
        >
          {t("done")}
        </button>
      </div>
    );
  }

  // -- DEFAULT VIEW (idle) --
  return (
    <div className="space-y-4 p-4">
      {/* Sync Button */}
      <button
        onClick={handleSyncTransactions}
        disabled={syncing || connections.length === 0}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-sm font-semibold text-[#152d4a] hover:bg-blue-100 transition-colors min-h-[48px] disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? t("syncing") : t("sync_transactions")}
      </button>

      {syncMessage && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg p-3">
          <CheckCircle className="h-4 w-4" />
          {syncMessage}
        </div>
      )}

      {/* Connected Banks */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : connections.length > 0 ? (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                  <Building2 className="h-4 w-4 text-[#1e3a5f]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{conn.bankName}</p>
                  <p className="text-xs text-gray-500">
                    {conn.accountName || t("main_account")}
                    {conn.provider && conn.provider !== "manual" && (
                      <span className="ml-1.5 text-[10px] text-gray-400 uppercase">{conn.provider}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  {conn.status}
                </span>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {t("last_synced")} {timeAgo(conn.lastSynced)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-2">{t("no_banks_connected")}</p>
      )}

      {/* Add Bank Connection */}
      <button
        onClick={() => setWizardStep("country")}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors min-h-[48px]"
      >
        <Plus className="h-4 w-4" />
        {t("add_bank_connection")}
      </button>

      {/* Upload Bank Statement (general CSV) */}
      <div className="rounded-xl bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          {t("upload_bank_statement")}
        </p>
        <p className="text-xs text-gray-400 mb-3">
          {t("csv_format_hint")}
        </p>
        <label className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-gray-200 py-4 cursor-pointer hover:border-[#1e3a5f] transition-colors min-h-[48px]">
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <Upload className="h-4 w-4 text-gray-400" />
          )}
          <span className="text-sm text-gray-500">
            {importing ? t("importing") : t("choose_csv_file")}
          </span>
          <input
            ref={fileInputRef}
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
            {importedCount} {t("transactions_imported")}
          </div>
        )}
      </div>

      {/* Match Payments */}
      <div className="rounded-xl bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          {t("match_payments")}
        </p>
        <p className="text-xs text-gray-400 mb-3">
          {t("match_payments_desc")}
        </p>
        <button
          onClick={handleRunMatching}
          disabled={matching}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors min-h-[48px] disabled:opacity-50"
        >
          {matching ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t("matching")}
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              {t("match_payments")}
            </>
          )}
        </button>
        {matchResults && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle className="h-3.5 w-3.5" />
              {matchResults.matchesFound} {t("invoices_matched")}
            </div>
            {matchResults.invoicesUpdated > 0 && (
              <div className="flex items-center gap-2 text-sm text-[#1e3a5f]">
                <CheckCircle className="h-3.5 w-3.5" />
                {matchResults.invoicesUpdated} {t("auto_marked_paid")}
              </div>
            )}
            {matchResults.possibleMatches > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <RefreshCw className="h-3.5 w-3.5" />
                {matchResults.possibleMatches} {t("possibly_matched")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
