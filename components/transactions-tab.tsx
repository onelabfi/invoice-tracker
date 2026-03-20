"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  RefreshCcw,
  Loader2,
  AlertTriangle,
  Search,
  TrendingDown,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  description: string | null;
  reference: string | null;
  bankAccount: string | null;
}

type TxFilter = "all" | "subscriptions" | "one-time" | "suspicious";

// Simple category detection from merchant/description
function categorize(tx: Transaction): string {
  const text = `${tx.merchant} ${tx.description || ""}`.toLowerCase();
  if (/netflix|spotify|youtube|hbo|disney|apple\s*(music|tv)|amazon\s*prime|hulu/i.test(text)) return "Entertainment";
  if (/uber|lyft|bolt|taxi|bus|train|rail|flight|airline|sas|finnair/i.test(text)) return "Transport";
  if (/aws|google\s*cloud|azure|heroku|vercel|digital\s*ocean|github|slack|notion|figma|adobe/i.test(text)) return "Software";
  if (/restaurant|cafe|starbucks|mcdonald|burger|pizza|food|eat|lunch|dinner/i.test(text)) return "Food & Drink";
  if (/insurance|health|doctor|pharmacy|medical|gym|fitness/i.test(text)) return "Health";
  if (/rent|mortgage|electricity|gas|water|heating|internet|phone|mobile|telia|elisa/i.test(text)) return "Utilities";
  if (/salary|wage|payroll/i.test(text)) return "Income";
  return "Business";
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "Entertainment": return "bg-purple-100 text-purple-700";
    case "Transport": return "bg-blue-100 text-blue-700";
    case "Software": return "bg-indigo-100 text-indigo-700";
    case "Food & Drink": return "bg-orange-100 text-orange-700";
    case "Health": return "bg-pink-100 text-pink-700";
    case "Utilities": return "bg-teal-100 text-teal-700";
    case "Income": return "bg-emerald-100 text-emerald-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export function TransactionsTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TxFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(15);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, []);

  // Compute stats
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const thisMonthTx = transactions.filter((tx) => {
    const d = new Date(tx.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const totalSpent = thisMonthTx.reduce((s, tx) => s + tx.amount, 0);

  // Recurring detection (merchant appears 3+ times)
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
  const subscriptionCount = recurringMerchants.size;

  // Suspicious: duplicate charges (same merchant + same amount within 7 days)
  const suspicious = new Set<string>();
  const sortedTx = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (let i = 0; i < sortedTx.length; i++) {
    for (let j = i + 1; j < Math.min(i + 50, sortedTx.length); j++) {
      if (
        sortedTx[i].merchant.toLowerCase() === sortedTx[j].merchant.toLowerCase() &&
        sortedTx[i].amount === sortedTx[j].amount
      ) {
        const daysDiff = Math.abs(new Date(sortedTx[i].date).getTime() - new Date(sortedTx[j].date).getTime()) / 86400000;
        if (daysDiff > 0 && daysDiff < 7) {
          suspicious.add(sortedTx[i].id);
          suspicious.add(sortedTx[j].id);
        }
      }
    }
  }

  // Filter transactions
  let filtered = thisMonthTx;
  if (filter === "subscriptions") {
    filtered = thisMonthTx.filter((tx) => recurringMerchants.has(tx.merchant.toLowerCase()));
  } else if (filter === "one-time") {
    filtered = thisMonthTx.filter((tx) => !recurringMerchants.has(tx.merchant.toLowerCase()));
  } else if (filter === "suspicious") {
    filtered = thisMonthTx.filter((tx) => suspicious.has(tx.id));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (tx) => tx.merchant.toLowerCase().includes(q) || (tx.description && tx.description.toLowerCase().includes(q))
    );
  }

  // Sort by date desc
  filtered = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-lg border-b border-gray-100 px-4 pt-5 pb-3">
        <h1 className="text-xl font-extrabold text-gray-900 mb-3">Transactions</h1>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="rounded-xl bg-gray-50 p-2.5 text-center">
            <CreditCard className="h-3.5 w-3.5 text-gray-400 mx-auto mb-1" />
            <p className="text-xs font-extrabold text-gray-900">
              {loading ? "..." : formatCurrency(totalSpent)}
            </p>
            <p className="text-[9px] text-gray-400 uppercase font-semibold">Spent</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5 text-center">
            <RefreshCcw className="h-3.5 w-3.5 text-gray-400 mx-auto mb-1" />
            <p className="text-xs font-extrabold text-gray-900">
              {loading ? "..." : formatCurrency(recurringSpent)}
            </p>
            <p className="text-[9px] text-gray-400 uppercase font-semibold">Recurring</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5 text-center">
            <TrendingDown className="h-3.5 w-3.5 text-gray-400 mx-auto mb-1" />
            <p className="text-xs font-extrabold text-gray-900">
              {loading ? "..." : subscriptionCount}
            </p>
            <p className="text-[9px] text-gray-400 uppercase font-semibold">Subs</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-2.5 text-center">
            <AlertTriangle className="h-3.5 w-3.5 text-gray-400 mx-auto mb-1" />
            <p className="text-xs font-extrabold text-gray-900">
              {loading ? "..." : suspicious.size}
            </p>
            <p className="text-[9px] text-gray-400 uppercase font-semibold">Flagged</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions..."
            className="w-full rounded-xl bg-gray-100 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:bg-white focus:border-[#1e3a5f] border border-transparent transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(
            [
              { key: "all" as TxFilter, label: "All", count: thisMonthTx.length },
              { key: "subscriptions" as TxFilter, label: "Subscriptions", count: thisMonthTx.filter((tx) => recurringMerchants.has(tx.merchant.toLowerCase())).length },
              { key: "one-time" as TxFilter, label: "One-time", count: thisMonthTx.filter((tx) => !recurringMerchants.has(tx.merchant.toLowerCase())).length },
              { key: "suspicious" as TxFilter, label: "Suspicious", count: thisMonthTx.filter((tx) => suspicious.has(tx.id)).length },
            ]
          ).map((pill) => (
            <button
              key={pill.key}
              onClick={() => setFilter(pill.key)}
              className={`pill whitespace-nowrap min-h-[36px] ${
                filter === pill.key
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {pill.label}
              {pill.count > 0 && (
                <span className={`ml-1.5 text-[10px] ${filter === pill.key ? "text-gray-400" : "text-gray-400"}`}>
                  {pill.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] mb-3" />
            <p className="text-sm text-gray-500">Loading transactions...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 mb-4">
              <CreditCard className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No transactions</h3>
            <p className="text-sm text-gray-500 text-center">
              {filter !== "all"
                ? "No transactions match this filter."
                : "Connect a bank account in Settings to see transactions."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, visibleCount).map((tx) => {
              const cat = categorize(tx);
              const isSuspicious = suspicious.has(tx.id);
              const isRecurring = recurringMerchants.has(tx.merchant.toLowerCase());
              return (
                <div
                  key={tx.id}
                  className={`card p-3 flex items-center gap-3 ${isSuspicious ? "border-orange-200 bg-orange-50/50" : ""}`}
                >
                  {/* Merchant initial */}
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isSuspicious ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {tx.merchant.charAt(0).toUpperCase()}
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{tx.merchant}</p>
                      {isSuspicious && (
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${categoryColor(cat)}`}>
                        {cat}
                      </span>
                      {isRecurring && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                          Subscription
                        </span>
                      )}
                      {isSuspicious && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">
                          Suspicious
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {formatDate(tx.date)}
                      </span>
                    </div>
                  </div>
                  {/* Amount */}
                  <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                    {formatCurrency(tx.amount)}
                  </p>
                </div>
              );
            })}
            {/* Load more */}
            {filtered.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((c) => c + 15)}
                className="w-full py-3 text-sm font-semibold text-[#1e3a5f] bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
