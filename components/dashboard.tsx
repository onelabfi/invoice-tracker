"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Bell,
  Camera,
  Upload,
  Edit3,
  Inbox,
  BarChart3,
  Calendar,
  Settings,
  LogOut,
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ChevronRight,
  Search,
  RefreshCw,
  Loader2,
  Building2,
  Shield,
  Globe,
} from "lucide-react";
import { InvoiceCard } from "./invoice-card";
import { InvoiceDetail } from "./invoice-detail";
import { UploadDialog } from "./upload-dialog";
import { ExportDialog } from "./export-dialog";
import { Timeline } from "./timeline";
import { BankConnections } from "./bank-connections";
import { Notifications } from "./notifications";
import { AskRicordo } from "./ask-ricordo";
import {
  formatCurrency,
  isDueSoon,
  isOverdue,
} from "@/lib/utils";
import { useTranslation, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

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
  originalInvoice?: {
    id: string;
    vendor: string;
    invoiceNumber: string | null;
  } | null;
  reminders?: { id: string; amount: number }[];
  matches?: { id: string; confidenceScore: number; matchType: string; transaction: { merchant: string; amount: number; date: string } }[];
}

type TabId = "inbox" | "dashboard" | "timeline" | "settings";
type FilterStatus = "all" | "unpaid" | "paid" | "due-soon" | "duplicate";

export function Dashboard() {
  const { t, locale, setLocale } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("inbox");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadInitialTab, setUploadInitialTab] = useState<
    "camera" | "file" | "manual"
  >("file");
  const [exportOpen, setExportOpen] = useState(false);
  const [autoPay, setAutoPay] = useState(false);
  const [autoPayMode, setAutoPayMode] = useState<"approval" | "auto">("approval");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const router = useRouter();

  const fetchInvoices = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.filter((n: { read: boolean }) => !n.read).length);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchUnreadCount();
  }, [fetchInvoices, fetchUnreadCount]);

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
    // Always redirect regardless of signOut result
    window.location.href = "/login";
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });

      if (res.ok) {
        fetchInvoices();
        if (selectedInvoice?.id === id) {
          setSelectedInvoice(null);
        }
      }
    } catch (err) {
      console.error("Failed to mark paid:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("delete_invoice_confirm"))) return;

    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchInvoices();
        if (selectedInvoice?.id === id) {
          setSelectedInvoice(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const openUpload = (tab: "camera" | "file" | "manual") => {
    setUploadInitialTab(tab);
    setUploadOpen(true);
  };

  const handleNotificationAction = (notification: { id: string; invoiceId?: string; actionType?: string }) => {
    setNotificationsOpen(false);
    if (notification.invoiceId) {
      const inv = invoices.find(i => i.id === notification.invoiceId);
      if (inv) {
        if (notification.actionType === "mark_paid") {
          handleMarkPaid(inv.id);
        } else {
          setSelectedInvoice(inv);
        }
      }
    }
  };

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return t("greeting_morning");
    if (hour < 18) return t("greeting_afternoon");
    return t("greeting_evening");
  }

  // -- Invoice detail view --
  if (selectedInvoice) {
    return (
      <div className="min-h-screen bg-gray-50">
        <InvoiceDetail
          invoice={selectedInvoice}
          onBack={() => setSelectedInvoice(null)}
          onMarkPaid={handleMarkPaid}
          onDelete={handleDelete}
          onRefresh={() => {
            fetchInvoices();
            setSelectedInvoice(null);
          }}
        />
      </div>
    );
  }

  // -- Compute stats --
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const unpaidInvoices = invoices.filter(
    (i) => i.status === "unpaid" || i.status === "overdue"
  );
  const paidThisMonth = invoices.filter((i) => {
    if (i.status !== "paid" || !i.paidAt) return false;
    const d = new Date(i.paidAt);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const dueThisWeek = invoices.filter(
    (i) => (i.status === "unpaid" || i.status === "overdue") && isDueSoon(i.dueDate)
  );
  const overdueInvoices = invoices.filter(
    (i) =>
      (i.status === "unpaid" || i.status === "overdue") &&
      isOverdue(i.dueDate, i.status)
  );
  const duplicates = invoices.filter((i) => i.status === "duplicate");
  const totalUnpaid = unpaidInvoices.reduce((sum, i) => sum + i.amount, 0);
  const savedByDuplicates = duplicates.reduce((sum, i) => sum + i.amount, 0);
  const reminderFeesAvoided = invoices
    .filter(i => i.isReminder && i.status === "duplicate")
    .reduce((sum, i) => sum + (i.reminderFee || 5), 0);

  // Filter invoices for inbox
  let filteredInvoices = invoices;
  if (filter === "due-soon") {
    filteredInvoices = invoices.filter(
      (i) =>
        (i.status === "unpaid" || i.status === "overdue") &&
        (isDueSoon(i.dueDate) || isOverdue(i.dueDate, i.status))
    );
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

  // Monthly spending for chart (last 6 months)
  const monthlySpending: { month: string; amount: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(thisYear, thisMonth - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const monthLabel = d.toLocaleString("en", { month: "short" });
    const total = invoices
      .filter((inv) => {
        const created = new Date(inv.createdAt);
        return created.getMonth() === m && created.getFullYear() === y;
      })
      .reduce((sum, inv) => sum + inv.amount, 0);
    monthlySpending.push({ month: monthLabel, amount: total });
  }
  const maxSpending = Math.max(...monthlySpending.map((m) => m.amount), 1);

  // Recent activity for dashboard tab
  const recentInvoices = invoices.slice(0, 5);

  // -- Tab content renderers --

  const renderInbox = () => (
    <div className="safe-bottom">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-lg border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img src="/ricordo-logo1.png" alt="Ricordo" className="h-8 w-auto" />
          </div>
          <button
            onClick={() => setNotificationsOpen(true)}
            className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <Bell className="h-5 w-5 text-gray-600" />
            {(overdueInvoices.length > 0 || unreadCount > 0) && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount || overdueInvoices.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("search_invoices")}
            className="w-full rounded-xl bg-gray-100 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:bg-white focus:border-[#1e3a5f] border border-transparent transition-all"
          />
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => openUpload("camera")}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2.5 text-sm font-semibold text-[#152d4a] hover:bg-blue-100 transition-colors min-h-[44px]"
          >
            <Camera className="h-4 w-4" />
            {t("scan")}
          </button>
          <button
            onClick={() => openUpload("file")}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2.5 text-sm font-semibold text-[#152d4a] hover:bg-blue-100 transition-colors min-h-[44px]"
          >
            <Upload className="h-4 w-4" />
            {t("upload")}
          </button>
          <button
            onClick={() => openUpload("manual")}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2.5 text-sm font-semibold text-[#152d4a] hover:bg-blue-100 transition-colors min-h-[44px]"
          >
            <Edit3 className="h-4 w-4" />
            {t("manual")}
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(
            [
              { key: "all", label: t("filter_all"), count: invoices.length },
              {
                key: "unpaid",
                label: t("filter_unpaid"),
                count: invoices.filter((i) => i.status === "unpaid").length,
              },
              {
                key: "paid",
                label: t("filter_paid"),
                count: invoices.filter((i) => i.status === "paid").length,
              },
              {
                key: "due-soon",
                label: t("filter_due_soon"),
                count: dueThisWeek.length + overdueInvoices.length,
              },
              {
                key: "duplicate",
                label: t("filter_duplicates"),
                count: duplicates.length,
              },
            ] as { key: FilterStatus; label: string; count: number }[]
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
                <span
                  className={`ml-1.5 text-[10px] ${
                    filter === pill.key ? "text-gray-400" : "text-gray-400"
                  }`}
                >
                  {pill.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Refresh button */}
      <div className="flex justify-center py-2">
        <button
          onClick={() => fetchInvoices(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors py-2 px-3"
        >
          <RefreshCw
            className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
          />
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
              {filter === "all" && !searchQuery
                ? t("no_invoices_yet")
                : t("no_results")}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              {filter === "all" && !searchQuery
                ? t("upload_first_invoice")
                : t("no_invoices_found", {
                    filter: filter === "all" ? "" : filter,
                    query: searchQuery ? ` "${searchQuery}"` : "",
                  })}
            </p>
            {filter === "all" && !searchQuery && (
              <button
                onClick={() => openUpload("file")}
                className="btn-primary"
              >
                <Upload className="h-4 w-4" />
                {t("upload_invoice")}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {filteredInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onMarkPaid={handleMarkPaid}
                onDelete={handleDelete}
                onTap={() => setSelectedInvoice(invoice)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="safe-bottom px-4 pt-6 pb-4">
      {/* Greeting */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <img src="/ricordo-logo1.png" alt="Ricordo" className="h-6 w-auto" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">
          {getGreeting()}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t("app_tagline")}
        </p>
      </div>

      {/* Ask Ricordo */}
      <div className="mb-6">
        <AskRicordo
          onSelectInvoice={(id) => {
            const inv = invoices.find(i => i.id === id);
            if (inv) setSelectedInvoice(inv);
          }}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("card_unpaid")}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">
            {formatCurrency(totalUnpaid)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {unpaidInvoices.length} {unpaidInvoices.length !== 1 ? t("invoices") : t("invoice")}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("card_paid")}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">
            {paidThisMonth.length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{t("this_month")}</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
              <Shield className="h-4 w-4 text-orange-600" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("card_duplicates")}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-gray-900">
            {duplicates.length}
          </p>
          {savedByDuplicates > 0 ? (
            <p className="text-xs text-emerald-600 font-semibold mt-0.5">
              {formatCurrency(savedByDuplicates)} {t("saved")}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">{t("prevented")}</p>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <TrendingUp className="h-4 w-4 text-[#1e3a5f]" />
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("card_fees_saved")}
            </span>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">
            {formatCurrency(reminderFeesAvoided)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{t("reminder_fees")}</p>
        </div>
      </div>

      {/* Due soon alert */}
      {dueThisWeek.length > 0 && (
        <div className="card p-4 mb-4 border-l-4 border-l-red-500">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-bold text-gray-900">{t("due_soon")}</span>
          </div>
          <div className="space-y-2">
            {dueThisWeek.slice(0, 3).map(inv => (
              <button
                key={inv.id}
                onClick={() => setSelectedInvoice(inv)}
                className="w-full flex items-center justify-between text-left hover:bg-gray-50 rounded-lg p-1 -mx-1 transition-colors"
              >
                <span className="text-sm text-gray-700">{inv.vendor}</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(inv.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly spending chart */}
      <div className="card p-4 mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-4">
          {t("monthly_spending")}
        </h2>
        <div className="flex items-end gap-2 h-32">
          {monthlySpending.map((m) => (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] font-semibold text-gray-500">
                {m.amount > 0 ? formatCurrency(m.amount) : ""}
              </span>
              <div
                className="w-full bg-gradient-to-t from-[#1e3a5f] to-[#2a4a72] rounded-t-lg transition-all duration-500 min-h-[4px]"
                style={{
                  height: `${Math.max(
                    (m.amount / maxSpending) * 100,
                    4
                  )}%`,
                }}
              />
              <span className="text-[10px] font-medium text-gray-400">
                {m.month}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">{t("recent_activity")}</h2>
          <button
            onClick={() => setActiveTab("inbox")}
            className="text-xs font-medium text-[#1e3a5f] flex items-center gap-0.5"
          >
            {t("view_all")} <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {recentInvoices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            {t("no_activity_yet")}
          </p>
        ) : (
          <div className="space-y-3">
            {recentInvoices.map((inv) => (
              <button
                key={inv.id}
                onClick={() => setSelectedInvoice(inv)}
                className="w-full flex items-center justify-between gap-3 hover:bg-gray-50 rounded-lg p-1 -mx-1 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      inv.status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : inv.status === "overdue"
                        ? "bg-red-100 text-red-700"
                        : inv.status === "duplicate"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {inv.vendor.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {inv.vendor}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {inv.status}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                  {formatCurrency(inv.amount, inv.currency)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderTimeline = () => (
    <div className="safe-bottom pt-6">
      <div className="px-4 mb-4">
        <h1 className="text-xl font-extrabold text-gray-900">
          {t("bill_timeline")}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t("timeline_subtitle")}
        </p>
      </div>
      <Timeline />
    </div>
  );

  const renderSettings = () => (
    <div className="safe-bottom px-4 pt-6 pb-4">
      <h1 className="text-xl font-extrabold text-gray-900 mb-6">{t("settings")}</h1>

      {/* Account */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("account")}
          </h2>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {t("app_name")}
            </p>
            <p className="text-xs text-gray-500">
              {invoices.length} {t("invoices_tracked")}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden">
            <img src="/icon-192.png" alt="Ricordo" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>

      {/* Bank Connections */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("bank_connections")}
          </h2>
        </div>
        <button
          onClick={() => setActiveTab("inbox")}
          className="hidden"
        />
        <BankConnections />
      </div>

      {/* Language */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("language")}
          </h2>
        </div>
        <div className="px-4 py-3">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <option key={loc.code} value={loc.code}>
                {loc.flag} {loc.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-2 px-1">
            {t("language_helper")}
          </p>
        </div>
      </div>

      {/* Data */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("data")}
          </h2>
        </div>
        <button
          onClick={() => setExportOpen(true)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors min-h-[52px]"
        >
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-900">
              {t("export_data_csv")}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* AI Auto-Pay */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("ai_auto_pay")}
          </h2>
        </div>
        <div className="px-4 py-3 flex items-center justify-between min-h-[52px]">
          <div>
            <p className="text-sm font-medium text-gray-900">{t("enable_auto_pay")}</p>
            <p className="text-xs text-gray-500">
              {t("auto_pay_desc")}
            </p>
          </div>
          <button
            onClick={() => setAutoPay(!autoPay)}
            className={`relative h-7 w-12 rounded-full transition-colors ${
              autoPay ? "bg-[#1e3a5f]" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                autoPay ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {autoPay && (
          <div className="px-4 pb-3 space-y-2">
            <button
              onClick={() => setAutoPayMode("approval")}
              className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors ${
                autoPayMode === "approval"
                  ? "bg-blue-50 border-2 border-[#1e3a5f]"
                  : "bg-gray-50 border-2 border-transparent"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                autoPayMode === "approval" ? "border-[#1e3a5f]" : "border-gray-300"
              }`}>
                {autoPayMode === "approval" && <div className="w-2 h-2 rounded-full bg-[#1e3a5f]" />}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t("approval_mode")}</p>
                <p className="text-xs text-gray-500">{t("approval_mode_desc")}</p>
              </div>
            </button>
            <button
              onClick={() => setAutoPayMode("auto")}
              className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors ${
                autoPayMode === "auto"
                  ? "bg-blue-50 border-2 border-[#1e3a5f]"
                  : "bg-gray-50 border-2 border-transparent"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                autoPayMode === "auto" ? "border-[#1e3a5f]" : "border-gray-300"
              }`}>
                {autoPayMode === "auto" && <div className="w-2 h-2 rounded-full bg-[#1e3a5f]" />}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t("auto_mode")}</p>
                <p className="text-xs text-gray-500">{t("auto_mode_desc")}</p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* About */}
      <div className="card mb-6">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t("about")}
          </h2>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t("app")}</span>
            <span className="font-medium text-gray-900">{t("app_name")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t("version")}</span>
            <span className="font-medium text-gray-900">2.0.0</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t("built_with")}</span>
            <span className="font-medium text-gray-900">Next.js + Claude AI</span>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors min-h-[48px]"
      >
        <LogOut className="h-4 w-4" />
        {t("log_out")}
      </button>
    </div>
  );

  // -- Main layout --
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tab content */}
      <div className="pb-20">
        {activeTab === "inbox" && renderInbox()}
        {activeTab === "dashboard" && renderDashboard()}
        {activeTab === "timeline" && renderTimeline()}
        {activeTab === "settings" && renderSettings()}
      </div>

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <div className="flex items-center justify-around px-2 pt-2 pb-2">
          {(
            [
              {
                id: "inbox" as TabId,
                icon: Inbox,
                label: t("tab_inbox"),
                badge: unpaidInvoices.length,
              },
              {
                id: "dashboard" as TabId,
                icon: BarChart3,
                label: t("tab_dashboard"),
                badge: 0,
              },
              {
                id: "timeline" as TabId,
                icon: Calendar,
                label: t("tab_timeline"),
                badge: 0,
              },
              {
                id: "settings" as TabId,
                icon: Settings,
                label: t("tab_settings"),
                badge: 0,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center gap-0.5 py-1 px-3 min-h-[44px] min-w-[64px] transition-colors ${
                  isActive ? "tab-active" : "tab-inactive"
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold">{item.label}</span>
                {isActive && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-[#1e3a5f]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Dialogs */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => fetchInvoices()}
        initialTab={uploadInitialTab}
      />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <Notifications
        open={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          fetchUnreadCount();
        }}
        onAction={handleNotificationAction}
      />
    </div>
  );
}
