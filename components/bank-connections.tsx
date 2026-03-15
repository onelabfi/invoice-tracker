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
} from "lucide-react";

interface BankConnection {
  id: string;
  bankName: string;
  accountName: string;
  status: string;
  lastSynced: string | null;
}

export function BankConnections() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<{
    matchesFound: number;
    invoicesUpdated: number;
    possibleMatches: number;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleAddConnection(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/bank-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: bankName.trim(),
          accountName: accountName.trim() || null,
        }),
      });

      if (res.ok) {
        setBankName("");
        setAccountName("");
        setShowAddForm(false);
        await fetchConnections();
      }
    } catch (err) {
      console.error("Failed to add bank connection:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSyncTransactions() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      // Simulate sync (in production this would call Open Banking API)
      await new Promise((r) => setTimeout(r, 1500));
      setSyncMessage(t("sync_success"));
      await fetchConnections();
    } catch {
      setSyncMessage(t("sync_failed"));
    } finally {
      setSyncing(false);
    }
  }

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
      console.error("Failed to import transactions:", err);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  function timeAgo(dateString: string | null): string {
    if (!dateString) return "Never";
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-4 p-4">
      {/* Sync Button */}
      <button
        onClick={handleSyncTransactions}
        disabled={syncing}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-50 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors min-h-[48px]"
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
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100">
                  <Building2 className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{conn.bankName}</p>
                  <p className="text-xs text-gray-500">{conn.accountName || t("main_account")}</p>
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

      {/* Add Bank */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors min-h-[48px]"
        >
          <Plus className="h-4 w-4" />
          {t("add_bank_connection")}
        </button>
      ) : (
        <form onSubmit={handleAddConnection} className="rounded-xl bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">{t("new_connection")}</p>
            <button type="button" onClick={() => setShowAddForm(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder={t("bank_name")}
            className="input-field"
            required
          />
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder={t("account_name_optional")}
            className="input-field"
          />
          <button
            type="submit"
            disabled={submitting || !bankName.trim()}
            className="btn-primary w-full"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {submitting ? t("connecting") : t("connect")}
          </button>
        </form>
      )}

      {/* Upload Bank Statement */}
      <div className="rounded-xl bg-gray-50 p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          {t("upload_bank_statement")}
        </p>
        <p className="text-xs text-gray-400 mb-3">
          {t("csv_format_hint")}
        </p>
        <label className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-gray-200 py-4 cursor-pointer hover:border-teal-300 transition-colors min-h-[48px]">
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
              <div className="flex items-center gap-2 text-sm text-teal-600">
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
