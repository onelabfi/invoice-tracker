"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { InvoiceCard } from "./invoice-card";
import { formatCurrency, isDueSoon, isOverdue, formatRelativeDate } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

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

type FilterStatus = "all" | "unpaid" | "paid" | "due-soon" | "duplicate" | "ignored";

interface InvoicesTabProps {
  invoices: Invoice[];
  loading: boolean;
  onSelectInvoice: (invoice: Invoice) => void;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
  onUpload: (tab: "camera" | "file" | "manual") => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function InvoicesTab({
  invoices,
  loading,
  onSelectInvoice,
  onMarkPaid,
  onDelete,
  onUpload,
  onRefresh,
  refreshing,
}: InvoicesTabProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const unpaidInvoices = invoices.filter((i) => i.status === "unpaid" || i.status === "overdue");
  const dueThisWeek = invoices.filter(
    (i) => (i.status === "unpaid" || i.status === "overdue") && isDueSoon(i.dueDate)
  );
  const overdueInvoices = invoices.filter(
    (i) => (i.status === "unpaid" || i.status === "overdue") && isOverdue(i.dueDate, i.status)
  );
  const duplicates = invoices.filter((i) => i.status === "duplicate");

  const ignoredInvoices = invoices.filter((i) => i.status === "ignored");

  // Filter — "all" excludes ignored by default
  let filteredInvoices = invoices.filter((i) => i.status !== "ignored");
  if (filter === "due-soon") {
    filteredInvoices = invoices.filter(
      (i) =>
        (i.status === "unpaid" || i.status === "overdue") &&
        (isDueSoon(i.dueDate) || isOverdue(i.dueDate, i.status))
    );
  } else if (filter === "ignored") {
    filteredInvoices = ignoredInvoices;
  } else if (filter !== "all") {
    filteredInvoices = invoices.filter((i) => i.status === filter);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredInvoices = filteredInvoices.filter(
      (i) =>
        i.vendor.toLowerCase().includes(q) ||
        (i.invoiceNumber && i.invoiceNumber.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q))
    );
  }

  return (
    <div className="safe-bottom">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-lg border-b border-gray-100 px-4 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-extrabold text-gray-900">Invoices</h1>
          <button
            onClick={() => onUpload("file")}
            className="flex items-center gap-1.5 rounded-xl bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#152d4a] transition-colors min-h-[36px]"
          >
            <Plus className="h-4 w-4" />
            Add invoice
          </button>
        </div>

        {/* Smart Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ask Ricordo... &quot;Show unpaid invoices&quot;"
            className="w-full rounded-xl bg-gray-100 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:bg-white focus:border-[#1e3a5f] border border-transparent transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(
            [
              { key: "all" as FilterStatus, label: t("filter_all"), count: invoices.filter((i) => i.status !== "ignored").length },
              { key: "unpaid" as FilterStatus, label: t("filter_unpaid"), count: unpaidInvoices.length },
              { key: "paid" as FilterStatus, label: t("filter_paid"), count: invoices.filter((i) => i.status === "paid").length },
              { key: "due-soon" as FilterStatus, label: t("filter_due_soon"), count: dueThisWeek.length + overdueInvoices.length },
              { key: "duplicate" as FilterStatus, label: t("filter_duplicates"), count: duplicates.length },
              ...(ignoredInvoices.length > 0 ? [{ key: "ignored" as FilterStatus, label: "Ignored", count: ignoredInvoices.length }] : []),
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

      {/* Refresh */}
      <div className="flex justify-center py-2">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors py-2 px-3"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? t("refreshing") : t("pull_to_refresh")}
        </button>
      </div>

      {/* Invoice list */}
      <div className="px-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] mb-3" />
            <p className="text-sm text-gray-500">{t("loading_invoices")}</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 mb-4">
              <Inbox className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {filter === "all" && !searchQuery ? t("no_invoices_yet") : t("no_results")}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              {filter === "all" && !searchQuery
                ? t("upload_first_invoice")
                : t("no_invoices_found", { filter: filter === "all" ? "" : filter, query: searchQuery ? ` "${searchQuery}"` : "" })}
            </p>
            {filter === "all" && !searchQuery && (
              <button onClick={() => onUpload("file")} className="btn-primary">
                <Plus className="h-4 w-4" />
                Add invoice
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {filteredInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onMarkPaid={onMarkPaid}
                onDelete={onDelete}
                onTap={() => onSelectInvoice(invoice)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
