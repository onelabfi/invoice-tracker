"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  TrendingDown,
  Zap,
  ShieldAlert,
  Clock,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
  originalInvoice?: { id: string; vendor: string; invoiceNumber: string | null } | null;
  reminders?: { id: string; amount: number }[];
  matches?: { id: string; confidenceScore: number; matchType: string; transaction: { merchant: string; amount: number; date: string } }[];
}

interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  description: string | null;
}

interface AlertItem {
  id: string;
  type: "duplicate" | "spike" | "unpaid" | "overdue";
  title: string;
  detail: string;
  amount?: number;
  invoiceId?: string;
}

interface HomeTabProps {
  invoices: Invoice[];
  onSelectInvoice: (invoice: Invoice) => void;
  onNavigateTab: (tab: string) => void;
  greeting: string;
}

export function HomeTab({ invoices, onSelectInvoice, onNavigateTab, greeting }: HomeTabProps) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => setTransactions([]))
      .finally(() => setLoadingTx(false));
  }, []);

  // Compute alerts/insights
  const alerts: AlertItem[] = [];

  // Check for duplicate charges (same merchant, same amount, within 7 days)
  const recentTx = transactions.slice(0, 200);
  const seen = new Map<string, Transaction>();
  for (const tx of recentTx) {
    const key = `${tx.merchant.toLowerCase()}|${tx.amount}`;
    const prev = seen.get(key);
    if (prev) {
      const daysDiff = Math.abs(new Date(tx.date).getTime() - new Date(prev.date).getTime()) / 86400000;
      if (daysDiff < 7 && daysDiff > 0) {
        alerts.push({
          id: `dup-${tx.id}`,
          type: "duplicate",
          title: `${formatCurrency(tx.amount)} duplicate charge detected`,
          detail: `${tx.merchant} charged twice in ${Math.round(daysDiff)} days`,
          amount: tx.amount,
        });
        break;
      }
    }
    seen.set(key, tx);
  }

  // Check for unpaid/overdue invoices
  const overdueInvoices = invoices.filter(
    (i) => (i.status === "unpaid" || i.status === "overdue") && i.dueDate && new Date(i.dueDate) < new Date()
  );
  const unpaidInvoices = invoices.filter((i) => i.status === "unpaid" || i.status === "overdue");

  if (overdueInvoices.length > 0) {
    const topOverdue = overdueInvoices[0];
    const daysOverdue = Math.round((Date.now() - new Date(topOverdue.dueDate!).getTime()) / 86400000);
    alerts.push({
      id: "overdue",
      type: "overdue",
      title: overdueInvoices.length === 1
        ? `${formatCurrency(topOverdue.amount)} overdue to ${topOverdue.vendor}`
        : `${overdueInvoices.length} invoices overdue (${formatCurrency(overdueInvoices.reduce((s, i) => s + i.amount, 0))})`,
      detail: overdueInvoices.length === 1
        ? `Due ${daysOverdue} days ago \u2014 no matching payment found`
        : `Oldest is ${daysOverdue} days past due`,
      amount: overdueInvoices.reduce((s, i) => s + i.amount, 0),
      invoiceId: overdueInvoices.length === 1 ? topOverdue.id : undefined,
    });
  } else if (unpaidInvoices.length > 0) {
    const unmatched = unpaidInvoices.filter((i) => !i.matches || i.matches.length === 0);
    if (unmatched.length > 0) {
      alerts.push({
        id: "unpaid",
        type: "unpaid",
        title: unmatched.length === 1
          ? `${formatCurrency(unmatched[0].amount)} to ${unmatched[0].vendor} likely unpaid`
          : `${unmatched.length} invoices likely unpaid`,
        detail: "No matching bank transaction detected",
        amount: unmatched.reduce((s, i) => s + i.amount, 0),
        invoiceId: unmatched.length === 1 ? unmatched[0].id : undefined,
      });
    }
  }

  // Subscription spike detection
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const merchantMonthly = new Map<string, { current: number; previous: number; name: string }>();
  for (const tx of transactions) {
    const d = new Date(tx.date);
    const m = d.getMonth();
    const y = d.getFullYear();
    const key = tx.merchant.toLowerCase();
    const entry = merchantMonthly.get(key) || { current: 0, previous: 0, name: tx.merchant };
    if (m === thisMonth && y === thisYear) entry.current += tx.amount;
    if (m === lastMonth && y === lastMonthYear) entry.previous += tx.amount;
    merchantMonthly.set(key, entry);
  }

  let spikeCount = 0;
  let spikeTotal = 0;
  let spikeName = "";
  merchantMonthly.forEach((val) => {
    if (val.previous > 0 && val.current > val.previous * 1.3 && val.current - val.previous > 5) {
      spikeCount++;
      spikeTotal += val.current - val.previous;
      if (!spikeName) spikeName = val.name;
    }
  });
  if (spikeCount > 0) {
    alerts.push({
      id: "spike",
      type: "spike",
      title: `${formatCurrency(spikeTotal)} subscription increase`,
      detail: spikeCount === 1
        ? `${spikeName} price changed this month`
        : `${spikeCount} subscriptions increased this month`,
      amount: spikeTotal,
    });
  }

  // Spending summary
  const thisMonthTx = transactions.filter((tx) => {
    const d = new Date(tx.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const totalSpent = thisMonthTx.reduce((s, tx) => s + tx.amount, 0);

  // Recurring detection
  const merchantCount = new Map<string, number>();
  for (const tx of transactions) {
    const key = tx.merchant.toLowerCase();
    merchantCount.set(key, (merchantCount.get(key) || 0) + 1);
  }
  const recurringMerchants = new Set<string>();
  merchantCount.forEach((count, key) => {
    if (count >= 3) recurringMerchants.add(key);
  });
  const recurringSpent = thisMonthTx
    .filter((tx) => recurringMerchants.has(tx.merchant.toLowerCase()))
    .reduce((s, tx) => s + tx.amount, 0);

  // Potential savings estimate
  const potentialSavings = Math.round(recurringSpent * 0.12);

  // Monthly chart (last 6 months)
  const monthlyData: { month: string; amount: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(thisYear, thisMonth - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const label = d.toLocaleString("en", { month: "short" });
    const total = transactions
      .filter((tx) => {
        const td = new Date(tx.date);
        return td.getMonth() === m && td.getFullYear() === y;
      })
      .reduce((s, tx) => s + tx.amount, 0);
    monthlyData.push({ month: label, amount: total });
  }
  const maxMonth = Math.max(...monthlyData.map((m) => m.amount), 1);

  const alertIcon = (type: string) => {
    switch (type) {
      case "duplicate": return <ShieldAlert className="h-4 w-4 text-orange-500" />;
      case "spike": return <TrendingDown className="h-4 w-4 text-amber-500" />;
      case "overdue": return <Clock className="h-4 w-4 text-red-500" />;
      case "unpaid": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Zap className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="safe-bottom px-4 pt-6 pb-4">
      {/* Greeting */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <img src="/ricordo-logo1.png" alt="Ricordo" className="h-6 w-auto" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">{greeting}, Max</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {alerts.length > 0
            ? "Here\u2019s what needs your attention"
            : "Your finances look healthy"}
        </p>
      </div>

      {/* AI Alerts Card */}
      {alerts.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <span className="text-xs font-bold text-red-800 uppercase tracking-wide">
              Needs attention
            </span>
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <button
                key={alert.id}
                onClick={() => {
                  if (alert.invoiceId && (alert.type === "unpaid" || alert.type === "overdue")) {
                    router.push(`/resolve/${alert.invoiceId}`);
                  } else if (alert.invoiceId) {
                    const inv = invoices.find((i) => i.id === alert.invoiceId);
                    if (inv) onSelectInvoice(inv);
                  } else if (alert.type === "unpaid" || alert.type === "overdue") {
                    onNavigateTab("invoices");
                  } else {
                    onNavigateTab("transactions");
                  }
                }}
                className="w-full flex items-start gap-3 text-left"
              >
                <div className="mt-0.5">{alertIcon(alert.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
                  <p className="text-xs text-gray-500">{alert.detail}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No alerts — all good */}
      {alerts.length === 0 && !loadingTx && (
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">All clear</p>
              <p className="text-xs text-gray-500">No issues detected. Everything is on track.</p>
            </div>
          </div>
        </div>
      )}

      {/* AI Savings Card */}
      {potentialSavings > 50 && !loadingTx && (
        <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 flex-shrink-0">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">
                You can save ~{formatCurrency(potentialSavings)}/month
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Based on {recurringMerchants.size} recurring subscriptions
              </p>
              <button
                onClick={() => onNavigateTab("transactions")}
                className="mt-2 text-xs font-semibold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors inline-flex items-center gap-1"
              >
                Review savings
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spending Summary — compact */}
      <div className="mb-4">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          This month
        </h2>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl bg-gray-50 p-2.5 text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Spent</p>
            <p className="text-sm font-extrabold text-gray-900">
              {loadingTx ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300 mx-auto" /> : formatCurrency(totalSpent)}
            </p>
          </div>
          <div className="flex-1 rounded-xl bg-gray-50 p-2.5 text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Recurring</p>
            <p className="text-sm font-extrabold text-gray-900">
              {loadingTx ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300 mx-auto" /> : formatCurrency(recurringSpent)}
            </p>
          </div>
          <div className="flex-1 rounded-xl bg-gray-50 p-2.5 text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Unpaid</p>
            <p className="text-sm font-extrabold text-gray-900">
              {formatCurrency(unpaidInvoices.reduce((s, i) => s + i.amount, 0))}
            </p>
          </div>
        </div>
      </div>

      {/* Mini Chart */}
      {!loadingTx && totalSpent > 0 && (
        <div className="rounded-xl bg-gray-50 p-3 mb-4">
          <div className="flex items-end gap-1.5 h-16">
            {monthlyData.map((m, idx) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-md transition-all duration-500 min-h-[2px] ${
                    idx === monthlyData.length - 1 ? "bg-[#1e3a5f]" : "bg-gray-200"
                  }`}
                  style={{ height: `${Math.max((m.amount / maxMonth) * 100, 2)}%` }}
                />
                <span className="text-[8px] font-medium text-gray-400">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Predictive insight */}
      {!loadingTx && unpaidInvoices.length > 0 && totalSpent > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-gray-600">
              <span className="font-semibold">Prediction:</span>{" "}
              {formatCurrency(unpaidInvoices.reduce((s, i) => s + i.amount, 0))} in upcoming invoices may impact your balance this week
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
