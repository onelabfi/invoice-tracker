"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home,
  FileText,
  CreditCard,
  Settings,
} from "lucide-react";
import { InvoiceDetail } from "./invoice-detail";
import { UploadDialog } from "./upload-dialog";
import { ExportDialog } from "./export-dialog";
import { Notifications } from "./notifications";
import { Toast } from "./toast";
import { HomeTab } from "./home-tab";
import { InvoicesTab } from "./invoices-tab";
import { TransactionsTab } from "./transactions-tab";
import { SettingsTab } from "./settings-tab";
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
  originalInvoice?: {
    id: string;
    vendor: string;
    invoiceNumber: string | null;
  } | null;
  reminders?: { id: string; amount: number }[];
  matches?: { id: string; confidenceScore: number; matchType: string; transaction: { merchant: string; amount: number; date: string } }[];
}

type TabId = "home" | "invoices" | "transactions" | "settings";

export function Dashboard() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadInitialTab, setUploadInitialTab] = useState<"camera" | "file" | "manual">("file");
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "neutral" } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // Handle resolve return toast
  useEffect(() => {
    const resolved = searchParams.get("resolved");
    if (resolved) {
      if (resolved === "paid") {
        setToast({ message: t("toast_resolved_paid"), type: "success" });
      } else if (resolved === "initiated") {
        setToast({ message: t("toast_resolved_initiated"), type: "info" });
      } else if (resolved === "ignored") {
        setToast({ message: t("toast_resolved_ignored"), type: "neutral" });
      }
      // Clean URL
      router.replace("/app", { scroll: false });
      // Refresh data
      fetchInvoices();
    }
  }, [searchParams, router, fetchInvoices]);

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
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
        if (selectedInvoice?.id === id) setSelectedInvoice(null);
      }
    } catch (err) {
      console.error("Failed to mark paid:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("delete_invoice_confirm"))) return;
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchInvoices();
        if (selectedInvoice?.id === id) setSelectedInvoice(null);
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
      const inv = invoices.find((i) => i.id === notification.invoiceId);
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

  // Invoice detail view
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

  // Tab navigation items
  const tabs = [
    { id: "home" as TabId, icon: Home, label: t("tab_home") },
    { id: "invoices" as TabId, icon: FileText, label: t("tab_invoices") },
    { id: "transactions" as TabId, icon: CreditCard, label: t("tab_transactions") },
    { id: "settings" as TabId, icon: Settings, label: t("tab_settings") },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tab content */}
      <div className="pb-20">
        <>
          {activeTab === "home" && (
              <HomeTab
                invoices={invoices}
                onSelectInvoice={setSelectedInvoice}
                onNavigateTab={(tab) => setActiveTab(tab as TabId)}
                greeting={getGreeting()}
              />
            )}
            {activeTab === "invoices" && (
              <InvoicesTab
                invoices={invoices}
                loading={loading}
                onSelectInvoice={setSelectedInvoice}
                onMarkPaid={handleMarkPaid}
                onDelete={handleDelete}
                onUpload={openUpload}
                onRefresh={() => fetchInvoices(true)}
                refreshing={refreshing}
              />
            )}
          {activeTab === "transactions" && <TransactionsTab />}
          {activeTab === "settings" && (
            <SettingsTab
              invoiceCount={invoices.length}
              onLogout={handleLogout}
              onExport={() => setExportOpen(true)}
            />
          )}
        </>
      </div>

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <div className="flex items-center justify-around px-2 pt-2 pb-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                }}
                className={`relative flex flex-col items-center gap-0.5 py-1 px-3 min-h-[44px] min-w-[64px] transition-colors ${
                  isActive ? "tab-active" : "tab-inactive"
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
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
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

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
