"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  Plus,
  Upload,
  Zap,
  RefreshCw,
  CheckCircle,
  Loader2,
  X,
  CreditCard,
} from "lucide-react";

interface BankConnection {
  id: string;
  bankName: string;
  accountName: string;
  status: string;
  lastSynced: string;
}

interface MatchResults {
  matched: number;
  possiblyMatched: number;
}

export function BankConnections() {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResults | null>(null);
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
    if (!bankName.trim() || !accountName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/bank-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankName: bankName.trim(), accountName: accountName.trim() }),
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

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportedCount(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());
      // Skip header row if present
      const startIndex = lines[0]?.toLowerCase().includes("date") ? 1 : 0;

      const transactions = lines.slice(startIndex).map((line) => {
        const [date, merchant, amount, reference, description] = line
          .split(",")
          .map((field) => field.trim().replace(/^"|"$/g, ""));

        return {
          date,
          merchant,
          amount: parseFloat(amount),
          reference,
          description,
        };
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRunMatching() {
    setMatching(true);
    setMatchResults(null);

    try {
      const res = await fetch("/api/match", { method: "POST" });
      if (res.ok) {
        const data: MatchResults = await res.json();
        setMatchResults(data);
      }
    } catch (err) {
      console.error("Failed to run AI matching:", err);
    } finally {
      setMatching(false);
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-emerald-400" />
          <h1 className="text-xl font-semibold">Bank Connections</h1>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddForm ? "Cancel" : "Add Bank"}
        </button>
      </div>

      {/* Add Bank Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddConnection}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3"
        >
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bank Name</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Chase, Bank of America"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Account Name</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Business Checking"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !bankName.trim() || !accountName.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            {submitting ? "Connecting..." : "Connect Bank"}
          </button>
        </form>
      )}

      {/* Connected Banks */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Connected Accounts
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : connections.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
            <Building2 className="h-10 w-10 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No bank connections yet.</p>
            <p className="text-xs text-gray-600 mt-1">
              Add a bank to start importing transactions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-gray-800 rounded-lg p-2">
                    <Building2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{conn.bankName}</p>
                    <p className="text-xs text-gray-500">{conn.accountName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                      conn.status === "connected"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {conn.status}
                  </span>
                  <p className="text-xs text-gray-600 mt-1">
                    Synced {formatDate(conn.lastSynced)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Import Transactions */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          Import Transactions
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-3">
            Upload a CSV file with columns: date, merchant, amount, reference, description
          </p>
          <label className="flex items-center justify-center gap-2 w-full bg-gray-800 hover:bg-gray-750 border border-dashed border-gray-600 rounded-lg py-4 cursor-pointer transition-colors">
            {importing ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <Upload className="h-5 w-5 text-gray-400" />
            )}
            <span className="text-sm text-gray-400">
              {importing ? "Importing..." : "Choose CSV file"}
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
            <div className="flex items-center gap-2 mt-3 text-sm text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              <span>{importedCount} transactions imported successfully</span>
            </div>
          )}
        </div>
      </section>

      {/* AI Matching */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
          AI Matching
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-3">
            Match imported bank transactions with your invoices using AI.
          </p>
          <button
            onClick={handleRunMatching}
            disabled={matching}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {matching ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Matching...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Run AI Matching
              </>
            )}
          </button>
          {matchResults && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                <span>{matchResults.matched} invoices matched</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <RefreshCw className="h-4 w-4" />
                <span>{matchResults.possiblyMatched} possibly matched</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
