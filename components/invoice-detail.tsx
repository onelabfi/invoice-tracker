"use client";

import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CreditCard,
  Bell,
  Trash2,
  Copy,
  FileText,
  Calendar,
  Banknote,
  Shield,
  Info,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { StatusBadge } from "./status-badge";
import {
  formatCurrency,
  formatDate,
  formatRelativeDate,
} from "@/lib/utils";

interface InvoiceDetailProps {
  invoice: {
    id: string;
    vendor: string;
    amount: number;
    currency: string;
    invoiceNumber: string | null;
    description: string | null;
    dueDate: string | null;
    iban: string | null;
    reference: string | null;
    status: string;
    paidAt: string | null;
    isReminder: boolean;
    reminderFee: number | null;
    source: string;
    fileName: string | null;
    confidence: number | null;
    createdAt: string;
    originalInvoice?: {
      id: string;
      vendor: string;
      invoiceNumber: string | null;
    } | null;
    reminders?: { id: string; amount: number }[];
    matches?: {
      id: string;
      confidenceScore: number;
      matchType: string;
      transaction: { merchant: string; amount: number; date: string };
    }[];
  };
  onBack: () => void;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

export function InvoiceDetail({
  invoice,
  onBack,
  onMarkPaid,
  onDelete,
  onRefresh,
}: InvoiceDetailProps) {
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  };

  const hasDuplicateWarning =
    invoice.matches &&
    invoice.matches.some(
      (m) => m.matchType === "duplicate" || m.confidenceScore >= 0.8
    );

  const bestMatch =
    invoice.matches && invoice.matches.length > 0
      ? invoice.matches.reduce((best, m) =>
          m.confidenceScore > best.confidenceScore ? m : best
        )
      : null;

  const handlePayClick = () => {
    setShowPayConfirm(true);
  };

  const handleConfirmPay = async () => {
    window.open(
      `https://pay.example.com?iban=${invoice.iban || ""}&amount=${invoice.amount}&ref=${invoice.reference || ""}`,
      "_blank"
    );
    setShowPayConfirm(false);

    // Quick sync: trigger payment matching after a short delay
    setSyncing(true);
    try {
      await new Promise((r) => setTimeout(r, 2000));
      await fetch("/api/match", { method: "POST" });
      onRefresh();
    } catch {
      // silently fail — user can manually sync later
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {invoice.vendor}
          </h1>
        </div>
        <button
          onClick={() => onDelete(invoice.id)}
          className="flex items-center justify-center w-10 h-10 -mr-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          aria-label="Delete invoice"
        >
          <Trash2 className="h-4.5 w-4.5" />
        </button>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-32">
        {/* Amount hero */}
        <div className="px-6 pt-8 pb-6 text-center">
          <p className="text-4xl font-extrabold text-gray-900 tracking-tight">
            {formatCurrency(invoice.amount, invoice.currency)}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <StatusBadge status={invoice.status} />
          </div>
        </div>

        {/* Payment status section */}
        <div className="px-4 mb-4">
          <PaymentStatusIndicator
            status={invoice.status}
            paidAt={invoice.paidAt}
            matches={invoice.matches}
          />
        </div>

        {/* Reminder banner */}
        {invoice.isReminder && invoice.originalInvoice && (
          <div className="mx-4 mb-4 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">
                This is a reminder
              </p>
              <p className="text-amber-700 mt-0.5">
                Original invoice from {invoice.originalInvoice.vendor}
                {invoice.originalInvoice.invoiceNumber
                  ? ` (#${invoice.originalInvoice.invoiceNumber})`
                  : ""}
              </p>
              {invoice.reminderFee !== null && invoice.reminderFee > 0 && (
                <p className="text-amber-800 font-medium mt-1">
                  Includes {formatCurrency(invoice.reminderFee, invoice.currency)} reminder fee
                </p>
              )}
            </div>
          </div>
        )}

        {/* Reminders count */}
        {invoice.reminders && invoice.reminders.length > 0 && (
          <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-sm text-orange-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">
              {invoice.reminders.length} reminder{invoice.reminders.length !== 1 ? "s" : ""} received for this invoice
            </span>
          </div>
        )}

        {/* Details */}
        <div className="px-4 space-y-1">
          <DetailRow
            label="Due date"
            icon={<Calendar className="h-4 w-4" />}
            value={
              invoice.dueDate ? (
                <span>
                  {formatDate(invoice.dueDate)}{" "}
                  <span className="text-gray-400">
                    ({formatRelativeDate(invoice.dueDate)})
                  </span>
                </span>
              ) : null
            }
          />

          <DetailRow
            label="Invoice number"
            icon={<FileText className="h-4 w-4" />}
            value={invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : null}
          />

          <DetailRow
            label="Description"
            icon={<Info className="h-4 w-4" />}
            value={invoice.description}
          />

          <DetailRow
            label="IBAN"
            icon={<Banknote className="h-4 w-4" />}
            value={
              invoice.iban ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{invoice.iban}</span>
                  <button
                    onClick={() => copyToClipboard(invoice.iban!, "iban")}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 transition-colors"
                    aria-label="Copy IBAN"
                  >
                    {copied === "iban" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ) : null
            }
          />

          <DetailRow
            label="Reference"
            icon={<FileText className="h-4 w-4" />}
            value={
              invoice.reference ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{invoice.reference}</span>
                  <button
                    onClick={() => copyToClipboard(invoice.reference!, "ref")}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 transition-colors"
                    aria-label="Copy reference"
                  >
                    {copied === "ref" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ) : null
            }
          />
        </div>

        {/* Confidence & source */}
        <div className="mx-4 mt-6 rounded-xl bg-gray-50 border border-gray-100 p-4">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {invoice.confidence !== null && invoice.confidence !== undefined && (
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                <span>
                  Confidence:{" "}
                  <span className="font-semibold text-gray-700">
                    {Math.round(invoice.confidence * 100)}%
                  </span>
                </span>
              </div>
            )}
            {invoice.source && (
              <span className="capitalize">
                Source: {invoice.source}
              </span>
            )}
            {invoice.fileName && (
              <span className="truncate">
                {invoice.fileName}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Added {formatDate(invoice.createdAt)}
          </p>
        </div>
      </div>

      {/* Fixed action bar at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {syncing && (
          <div className="flex items-center justify-center gap-2 text-teal-600 text-sm font-medium py-2 mb-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Checking for payment...
          </div>
        )}
        {invoice.status === "paid" ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600 font-medium py-2">
            <CheckCircle className="h-5 w-5" />
            <span>Paid on {formatDate(invoice.paidAt)}</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handlePayClick}
              className="btn-primary flex-1 py-3 text-sm font-semibold"
            >
              <CreditCard className="h-4 w-4" />
              Pay
            </button>
            <button
              onClick={() => onMarkPaid(invoice.id)}
              className="btn-success flex-1 py-3 text-sm font-semibold"
            >
              <CheckCircle className="h-4 w-4" />
              Mark as Paid
            </button>
            <button
              onClick={() => {}}
              className="btn-secondary py-3 px-4 text-sm"
              aria-label="Remind later"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Payment confirmation overlay */}
      {showPayConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowPayConfirm(false)}
          />
          <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 bg-white rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-200 overflow-hidden">
            {/* Overlay header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h2 className="text-lg font-bold text-gray-900">
                Confirm payment
              </h2>
              <button
                onClick={() => setShowPayConfirm(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Duplicate warning */}
            {hasDuplicateWarning && bestMatch && (
              <div className="mx-5 mt-2 flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-red-900">
                    Possible duplicate payment
                  </p>
                  <p className="text-red-700 mt-0.5">
                    A similar payment of{" "}
                    {formatCurrency(bestMatch.transaction.amount, invoice.currency)}{" "}
                    to {bestMatch.transaction.merchant} was made on{" "}
                    {formatDate(bestMatch.transaction.date)}.
                  </p>
                </div>
              </div>
            )}

            {/* Payment details */}
            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">To</span>
                <span className="text-sm font-semibold text-gray-900">
                  {invoice.vendor}
                </span>
              </div>
              <div className="border-t border-gray-100" />

              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">Amount</span>
                <span className="text-lg font-extrabold text-gray-900">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </span>
              </div>
              <div className="border-t border-gray-100" />

              {invoice.iban && (
                <>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-500">IBAN</span>
                    <span className="text-sm font-mono text-gray-900">
                      {invoice.iban}
                    </span>
                  </div>
                  <div className="border-t border-gray-100" />
                </>
              )}

              {invoice.reference && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-500">Reference</span>
                  <span className="text-sm font-mono text-gray-900">
                    {invoice.reference}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm buttons */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setShowPayConfirm(false)}
                className="btn-secondary flex-1 py-3 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPay}
                className="btn-primary flex-1 py-3 text-sm font-semibold"
              >
                <CreditCard className="h-4 w-4" />
                Confirm &amp; Pay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function PaymentStatusIndicator({
  status,
  paidAt,
  matches,
}: {
  status: string;
  paidAt: string | null;
  matches?: {
    id: string;
    confidenceScore: number;
    matchType: string;
    transaction: { merchant: string; amount: number; date: string };
  }[];
}) {
  const bestMatch =
    matches && matches.length > 0
      ? matches.reduce((best, m) =>
          m.confidenceScore > best.confidenceScore ? m : best
        )
      : null;

  if (status === "paid") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
        <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
        <div className="text-sm flex-1">
          <p className="font-semibold text-emerald-900">
            Paid {paidAt ? formatDate(paidAt) : ""}
          </p>
          {bestMatch && (
            <>
              <p className="text-emerald-700 mt-0.5">
                Matched to bank transaction &middot;{" "}
                {bestMatch.transaction.merchant} on{" "}
                {formatDate(bestMatch.transaction.date)}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.round(bestMatch.confidenceScore * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  {Math.round(bestMatch.confidenceScore * 100)}% match
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (
    bestMatch &&
    bestMatch.confidenceScore >= 0.5 &&
    bestMatch.confidenceScore < 0.8
  ) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
        <div className="text-sm flex-1">
          <p className="font-semibold text-amber-900">Possibly paid</p>
          <p className="text-amber-700 mt-0.5">
            {formatCurrency(bestMatch.transaction.amount, "EUR")} to{" "}
            {bestMatch.transaction.merchant} on{" "}
            {formatDate(bestMatch.transaction.date)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-amber-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${Math.round(bestMatch.confidenceScore * 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-amber-700">
              {Math.round(bestMatch.confidenceScore * 100)}% match
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unpaid" || status === "overdue") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
        <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
        <p className="text-sm font-semibold text-red-900">Not paid</p>
      </div>
    );
  }

  return null;
}

function DetailRow({
  label,
  icon,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
}) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 text-gray-400 flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {label}
        </p>
        <div className="text-sm text-gray-900 mt-0.5">{value}</div>
      </div>
    </div>
  );
}
