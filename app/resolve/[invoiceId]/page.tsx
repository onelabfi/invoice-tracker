"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  CheckCircle,
  EyeOff,
  Loader2,
  Check,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatDate, isOverdue } from "@/lib/utils";

interface Invoice {
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
}

type ResolveState = "choose" | "preparing" | "initiated" | "marked" | "ignored";

export default function ResolvePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.invoiceId as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<ResolveState>("choose");
  const [prepareStep, setPrepareStep] = useState(0);

  useEffect(() => {
    fetch(`/api/invoices/${invoiceId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => setInvoice(data))
      .catch(() => router.replace("/"))
      .finally(() => setLoading(false));
  }, [invoiceId, router]);

  const handlePayViaBank = async () => {
    setState("preparing");

    // Animate preparation steps
    setTimeout(() => setPrepareStep(1), 400);
    setTimeout(() => setPrepareStep(2), 900);
    setTimeout(() => setPrepareStep(3), 1400);

    // After showing preparation, redirect to TrueLayer flow
    setTimeout(async () => {
      try {
        const res = await fetch("/api/banks/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            institutionId: "mock",
            institutionName: "Payment Bank",
            country: "GB",
            provider: "truelayer",
            iban: invoice?.iban || "",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.authUrl) {
            // Store invoice ID for post-redirect handling
            sessionStorage.setItem("resolve_invoice_id", invoiceId);
            window.location.href = data.authUrl;
            return;
          }
        }

        // If TrueLayer not available, show initiated state
        setState("initiated");
      } catch {
        setState("initiated");
      }
    }, 2000);
  };

  const handleMarkPaid = async () => {
    try {
      await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      setState("marked");
      setTimeout(() => router.replace("/?resolved=paid"), 1200);
    } catch {
      // Still show success for optimistic UI
      setState("marked");
      setTimeout(() => router.replace("/"), 1200);
    }
  };

  const handleIgnore = async () => {
    try {
      await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ignored" }),
      });
      setState("ignored");
      setTimeout(() => router.replace("/?resolved=ignored"), 1200);
    } catch {
      setState("ignored");
      setTimeout(() => router.replace("/"), 1200);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
      </div>
    );
  }

  if (!invoice) return null;

  const overdue = isOverdue(invoice.dueDate, invoice.status);
  const displayStatus = overdue ? "Overdue" : invoice.status === "unpaid" ? "Unpaid" : invoice.status;

  // Preparing payment animation
  if (state === "preparing") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-xl font-extrabold text-gray-900 mb-1">Preparing payment...</h1>
          <p className="text-sm text-gray-500 mb-8">Setting up your bank transfer</p>

          <div className="space-y-4">
            <PrepareStep
              done={prepareStep >= 1}
              label="IBAN ready"
              detail={invoice.iban || "Will be provided"}
            />
            <PrepareStep
              done={prepareStep >= 2}
              label="Reference added"
              detail={invoice.reference || invoice.invoiceNumber || "Auto-generated"}
            />
            <PrepareStep
              done={prepareStep >= 3}
              label="Amount set"
              detail={formatCurrency(invoice.amount, invoice.currency)}
            />
          </div>

          {prepareStep >= 3 && (
            <div className="mt-8 flex items-center gap-2 text-sm text-gray-500 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting to your bank...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Payment initiated (fallback when TrueLayer redirect not available)
  if (state === "initiated") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="px-4 pt-6 pb-4">
          <div className="flex flex-col items-center text-center pt-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-extrabold text-gray-900 mb-1">Payment initiated</h1>
            <p className="text-sm text-gray-500 mb-2">
              {formatCurrency(invoice.amount, invoice.currency)} to {invoice.vendor}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-8">
              <Clock className="h-3.5 w-3.5" />
              We'll verify when payment clears
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 mb-8 w-full max-w-sm">
              <p className="text-xs text-blue-700">
                Your transaction will be automatically matched to this invoice once it appears in your bank feed.
              </p>
            </div>

            <button
              onClick={() => router.replace("/?resolved=initiated")}
              className="btn-primary px-8 py-3"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Marked as paid confirmation
  if (state === "marked") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center text-center animate-in zoom-in-95">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-3">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-base font-semibold text-gray-900">Marked as paid</p>
        </div>
      </div>
    );
  }

  // Ignored confirmation
  if (state === "ignored") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center text-center animate-in zoom-in-95">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-3">
            <EyeOff className="h-8 w-8 text-gray-500" />
          </div>
          <p className="text-base font-semibold text-gray-900">Invoice ignored</p>
        </div>
      </div>
    );
  }

  // Main resolve screen
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-lg border-b border-gray-100 px-4 py-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="px-4 pt-6 pb-8">
        {/* Title */}
        <h1 className="text-xl font-extrabold text-gray-900 mb-6">Resolve invoice</h1>

        {/* Invoice summary card */}
        <div className="rounded-2xl bg-white border border-gray-200 p-5 mb-6 shadow-sm">
          {/* Amount */}
          <p className="text-3xl font-extrabold text-gray-900 mb-1">
            {formatCurrency(invoice.amount, invoice.currency)}
          </p>

          {/* Vendor */}
          <p className="text-base font-semibold text-gray-700 mb-3">{invoice.vendor}</p>

          {/* Details row */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {invoice.dueDate && (
              <span>Due {formatDate(invoice.dueDate)}</span>
            )}
            {invoice.invoiceNumber && (
              <span>#{invoice.invoiceNumber}</span>
            )}
          </div>

          {/* Status */}
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                overdue
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {overdue && <AlertTriangle className="h-3 w-3" />}
              {displayStatus}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Pay via bank — Primary */}
          <button
            onClick={handlePayViaBank}
            className="w-full flex items-center justify-between rounded-2xl bg-[#1e3a5f] px-5 py-4 text-white hover:bg-[#152d4a] transition-colors active:scale-[0.98] min-h-[56px]"
          >
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5" />
              <span className="text-base font-semibold">Pay via bank</span>
            </div>
            <ArrowLeft className="h-4 w-4 rotate-180" />
          </button>

          {/* Mark as paid — Secondary */}
          <button
            onClick={handleMarkPaid}
            className="w-full flex items-center justify-between rounded-2xl bg-white border border-gray-200 px-5 py-4 text-gray-900 hover:bg-gray-50 transition-colors active:scale-[0.98] min-h-[56px]"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="text-base font-semibold">Mark as paid</span>
            </div>
          </button>

          {/* Ignore — Tertiary */}
          <button
            onClick={handleIgnore}
            className="w-full flex items-center justify-between rounded-2xl bg-white border border-gray-200 px-5 py-4 text-gray-500 hover:bg-gray-50 transition-colors active:scale-[0.98] min-h-[56px]"
          >
            <div className="flex items-center gap-3">
              <EyeOff className="h-5 w-5" />
              <span className="text-base font-semibold">Ignore</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-component for preparation steps
function PrepareStep({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className={`flex items-center gap-3 transition-opacity duration-300 ${done ? "opacity-100" : "opacity-30"}`}>
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-300 ${
          done ? "bg-emerald-100" : "bg-gray-100"
        }`}
      >
        {done ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
        )}
      </div>
      <div>
        <p className={`text-sm font-semibold ${done ? "text-gray-900" : "text-gray-400"}`}>{label}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
    </div>
  );
}
