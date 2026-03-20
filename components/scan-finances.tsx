"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import {
  ScanSearch,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  RefreshCw,
  Repeat,
  TrendingDown,
  ShoppingBag,
  Landmark,
  ArrowRight,
  Shield,
  FileCheck,
  FileX,
  FileQuestion,
  CircleCheck,
  Clock,
} from "lucide-react";

interface MatchedInvoice {
  invoiceId: string;
  vendor: string;
  invoiceAmount: number;
  transactionMerchant: string;
  transactionAmount: number;
  transactionDate: string;
  confidence: number;
  autoMarkedPaid: boolean;
}

interface PossibleMatch {
  invoiceId: string;
  vendor: string;
  invoiceAmount: number;
  transactionMerchant: string;
  transactionAmount: number;
  transactionDate: string;
  confidence: number;
}

interface UnmatchedInvoice {
  invoiceId: string;
  vendor: string;
  amount: number;
  dueDate: string | null;
  status: string;
}

interface RecurringPayment {
  name: string;
  count: number;
  total: number;
}

interface TopMerchant {
  name: string;
  total: number;
  count: number;
}

interface ScanResult {
  connected: boolean;
  accounts: { id: string; name: string; bank: string }[];
  transaction_count: number;
  new_transactions: number;
  reconciliation: {
    matched: MatchedInvoice[];
    possible: PossibleMatch[];
    unmatched: UnmatchedInvoice[];
    auto_marked_paid: number;
    total_invoices_checked: number;
  };
  summary: {
    total_spend: number;
    recurring_spend: number;
    recurring_payments: RecurringPayment[];
    top_merchants: TopMerchant[];
    account_count: number;
  };
}

type ScanStep = "idle" | "connecting" | "analyzing" | "done" | "error";
type ResultTab = "reconciliation" | "spending";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

const STEPS = [
  { key: "connecting", label: "Connecting to your bank…" },
  { key: "analyzing", label: "Matching invoices to payments…" },
  { key: "done", label: "Reconciliation complete" },
] as const;

function StepIndicator({ current }: { current: string }) {
  const stepIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="space-y-3">
      {STEPS.map((step, i) => {
        const isActive = step.key === current;
        const isDone = i < stepIndex || current === "done";

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                isDone
                  ? "bg-emerald-100 text-emerald-600"
                  : isActive
                    ? "bg-blue-100 text-[#1e3a5f]"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {isDone ? (
                <CheckCircle className="h-4 w-4" />
              ) : isActive && current !== "done" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
              )}
            </div>
            <span
              className={`text-sm ${
                isActive
                  ? "text-gray-900 font-medium"
                  : isDone
                    ? "text-emerald-600"
                    : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 90
      ? "bg-emerald-100 text-emerald-700"
      : pct >= 70
        ? "bg-blue-100 text-blue-700"
        : "bg-amber-100 text-amber-700";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${color}`}>
      {pct}%
    </span>
  );
}

export function ScanFinances({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<ScanStep>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("reconciliation");

  // Detect bank_connected callback from TrueLayer redirect
  useEffect(() => {
    if (searchParams.get("bank_connected") === "1") {
      handleAnalyze();
      window.history.replaceState({}, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleStartScan() {
    setStep("connecting");
    setError(null);

    try {
      // Quick check: do we have a connected TrueLayer account?
      const checkRes = await fetch("/api/scan-finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      const checkData = await checkRes.json();

      if (checkData.connected) {
        // Already connected — show results
        setStep("analyzing");
        await new Promise((r) => setTimeout(r, 600));
        setResult(checkData);
        setStep("done");
        return;
      }

      // Not connected — redirect to TrueLayer auth
      const res = await fetch("/api/scan-finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });
      const data = await res.json();

      if (data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error(data.error ?? "Failed to start scan");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStep("error");
    }
  }

  async function handleAnalyze() {
    setStep("analyzing");
    setError(null);

    try {
      const res = await fetch("/api/scan-finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);
      if (!data.connected) throw new Error("No connected accounts found");

      setResult(data);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStep("error");
    }
  }

  function handleReset() {
    setStep("idle");
    setResult(null);
    setError(null);
    setActiveTab("reconciliation");
  }

  // ── IDLE: CTA ─────────────────────────────────────────────
  if (step === "idle") {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={onBack} className="p-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gray-900">Scan Finances</p>
        </div>

        <div className="flex flex-col items-center py-8 gap-5">
          <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
            <ScanSearch className="h-7 w-7 text-[#1e3a5f]" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Scan my finances
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Connect your bank to automatically match payments to invoices,
              detect what&apos;s paid, and find what&apos;s still outstanding.
            </p>
          </div>
          <button
            onClick={handleStartScan}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#1e3a5f] py-3 px-8 text-sm font-semibold text-white hover:bg-[#152d4a] transition-colors min-h-[48px]"
          >
            <ScanSearch className="h-4 w-4" />
            Start scan
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Shield className="h-3 w-3" />
            Secured by TrueLayer · PSD2 compliant · Read-only access
          </div>
        </div>
      </div>
    );
  }

  // ── CONNECTING / ANALYZING: stepper ───────────────────────
  if (step === "connecting" || step === "analyzing") {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-6">
          <p className="text-sm font-semibold text-gray-900">Scanning…</p>
        </div>
        <div className="flex flex-col items-center py-10 gap-6">
          <StepIndicator current={step} />
        </div>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} className="p-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gray-900">Scan Finances</p>
        </div>
        <div className="flex flex-col items-center py-8 gap-4">
          <div className="h-14 w-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-gray-900 mb-1">Scan failed</p>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl bg-gray-100 py-2.5 px-6 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors min-h-[44px]"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── DONE: results ─────────────────────────────────────────
  const recon = result?.reconciliation;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gray-900">Scan Results</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          <RefreshCw className="h-3 w-3" />
          Rescan
        </button>
      </div>

      {result && (
        <>
          {/* Hero stats */}
          <div className="text-center py-2">
            <StepIndicator current="done" />
            <p className="text-lg font-bold text-gray-900 mt-4">
              {result.transaction_count} transactions scanned
            </p>
            {recon && recon.total_invoices_checked > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {recon.matched.length} matched · {recon.possible.length} possible · {recon.unmatched.length} unmatched
              </p>
            )}
            {recon && recon.total_invoices_checked === 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                No unpaid invoices to reconcile
              </p>
            )}
          </div>

          {/* Reconciliation summary cards */}
          {recon && recon.total_invoices_checked > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-emerald-50 p-3 text-center">
                <FileCheck className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                <p className="text-[10px] text-gray-500 uppercase">Paid</p>
                <p className="text-sm font-bold text-gray-900">
                  {recon.matched.length}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 text-center">
                <FileQuestion className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                <p className="text-[10px] text-gray-500 uppercase">Maybe</p>
                <p className="text-sm font-bold text-gray-900">
                  {recon.possible.length}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 p-3 text-center">
                <FileX className="h-4 w-4 text-red-400 mx-auto mb-1" />
                <p className="text-[10px] text-gray-500 uppercase">Unpaid</p>
                <p className="text-sm font-bold text-gray-900">
                  {recon.unmatched.length}
                </p>
              </div>
            </div>
          )}

          {/* Auto-paid banner */}
          {recon && recon.auto_marked_paid > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
              <CircleCheck className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-700">
                <span className="font-semibold">{recon.auto_marked_paid}</span> invoice{recon.auto_marked_paid !== 1 ? "s" : ""} auto-marked
                as paid (high-confidence match)
              </p>
            </div>
          )}

          {/* Tab toggle */}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setActiveTab("reconciliation")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                activeTab === "reconciliation"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Invoices
            </button>
            <button
              onClick={() => setActiveTab("spending")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                activeTab === "spending"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              Spending
            </button>
          </div>

          {/* ── RECONCILIATION TAB ──────────────────────────── */}
          {activeTab === "reconciliation" && recon && (
            <>
              {/* Matched invoices (confirmed paid) */}
              {recon.matched.length > 0 && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-3">
                    Confirmed Paid
                  </p>
                  <div className="space-y-3">
                    {recon.matched.map((m) => (
                      <div key={m.invoiceId} className="flex items-start justify-between">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <FileCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{m.vendor}</p>
                            <p className="text-[10px] text-gray-400">
                              Matched to {m.transactionMerchant} · {formatDate(m.transactionDate)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <ConfidenceBadge score={m.confidence} />
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(m.invoiceAmount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Possible matches (needs review) */}
              {recon.possible.length > 0 && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-3">
                    Needs Review
                  </p>
                  <div className="space-y-3">
                    {recon.possible.map((m) => (
                      <div key={m.invoiceId} className="flex items-start justify-between">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <FileQuestion className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{m.vendor}</p>
                            <p className="text-[10px] text-gray-400">
                              Possible: {m.transactionMerchant} · {formatDate(m.transactionDate)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <ConfidenceBadge score={m.confidence} />
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(m.invoiceAmount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched invoices (still unpaid) */}
              {recon.unmatched.length > 0 && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-3">
                    No Payment Found
                  </p>
                  <div className="space-y-3">
                    {recon.unmatched.map((inv) => (
                      <div key={inv.invoiceId} className="flex items-start justify-between">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <FileX className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{inv.vendor}</p>
                            <p className="text-[10px] text-gray-400">
                              {inv.dueDate ? (
                                <>
                                  <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                                  Due {formatDate(inv.dueDate)}
                                </>
                              ) : (
                                inv.status === "overdue" ? "Overdue" : "No due date"
                              )}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 shrink-0 ml-2">
                          {formatCurrency(inv.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {recon.total_invoices_checked === 0 && (
                <div className="flex flex-col items-center py-6 gap-2">
                  <CheckCircle className="h-8 w-8 text-emerald-400" />
                  <p className="text-sm text-gray-500">All invoices are already paid</p>
                </div>
              )}
            </>
          )}

          {/* ── SPENDING TAB ────────────────────────────────── */}
          {activeTab === "spending" && (
            <>
              {/* Spend summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <TrendingDown className="h-4 w-4 text-red-400 mx-auto mb-1" />
                  <p className="text-[10px] text-gray-500 uppercase">Spend</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatCurrency(result.summary.total_spend)}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <Repeat className="h-4 w-4 text-amber-400 mx-auto mb-1" />
                  <p className="text-[10px] text-gray-500 uppercase">Recurring</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatCurrency(result.summary.recurring_spend)}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <Repeat className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                  <p className="text-[10px] text-gray-500 uppercase">Subs</p>
                  <p className="text-sm font-bold text-gray-900">
                    {result.summary.recurring_payments.length}
                  </p>
                </div>
              </div>

              {/* Recurring payments */}
              {result.summary.recurring_payments.length > 0 && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Recurring Payments
                  </p>
                  <div className="space-y-2.5">
                    {result.summary.recurring_payments.map((r) => (
                      <div key={r.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Repeat className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span className="text-sm text-gray-900">{r.name}</span>
                          <span className="text-[10px] text-gray-400">{r.count}x</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(r.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top merchants */}
              {result.summary.top_merchants.length > 0 && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Top Merchants
                  </p>
                  <div className="space-y-2.5">
                    {result.summary.top_merchants.map((m) => (
                      <div key={m.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-3.5 w-3.5 text-[#1e3a5f] shrink-0" />
                          <span className="text-sm text-gray-900">{m.name}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(m.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Connected accounts (always visible) */}
          {result.accounts.length > 0 && (
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                Connected Accounts
              </p>
              <div className="space-y-2">
                {result.accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-gray-100"
                  >
                    <Landmark className="h-4 w-4 text-[#1e3a5f] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.name}</p>
                      <p className="text-[10px] text-gray-400">{a.bank}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
