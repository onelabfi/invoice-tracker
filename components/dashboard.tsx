"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  LogOut,
  Lock,
} from "lucide-react";
import { InvoiceCard } from "./invoice-card";
import { UploadDialog } from "./upload-dialog";
import { formatCurrency } from "@/lib/utils";

interface Invoice {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  description: string | null;
  dueDate: string | null;
  status: string;
  paidAt: string | null;
  isReminder: boolean;
  fileName: string;
  createdAt: string;
  originalInvoice?: { id: string; vendor: string; invoiceNumber: string | null } | null;
  reminders?: { id: string; amount: number }[];
}

type FilterStatus = "all" | "pending" | "paid" | "overdue" | "duplicate";

export function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const fetchInvoices = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("invoice-tracker-auth");
    if (saved === "true") {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchInvoices();
    }
  }, [authenticated, fetchInvoices]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setAuthenticated(true);
        sessionStorage.setItem("invoice-tracker-auth", "true");
      } else {
        setAuthError("Wrong password. Try again.");
      }
    } catch {
      setAuthError("Connection error.");
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    sessionStorage.removeItem("invoice-tracker-auth");
    setPassword("");
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
      }
    } catch (err) {
      console.error("Failed to mark paid:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this invoice?")) return;

    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchInvoices();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  // Login screen
  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <div className="flex flex-col items-center mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 mb-3">
                <Lock className="h-6 w-6 text-blue-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                Invoice Tracker
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Enter household password
              </p>
            </div>

            <form onSubmit={handleLogin}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              {authError && (
                <p className="mt-2 text-sm text-red-600">{authError}</p>
              )}
              <button
                type="submit"
                className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Log In
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Compute stats
  const stats = {
    pending: invoices.filter((i) => i.status === "pending").length,
    paid: invoices.filter((i) => i.status === "paid").length,
    overdue: invoices.filter((i) => i.status === "overdue").length,
    duplicates: invoices.filter((i) => i.status === "duplicate").length,
    totalPending: invoices
      .filter((i) => i.status === "pending" || i.status === "overdue")
      .reduce((sum, i) => sum + i.amount, 0),
    savedByDuplicateDetection: invoices
      .filter((i) => i.status === "duplicate")
      .reduce((sum, i) => sum + i.amount, 0),
  };

  const filteredInvoices =
    filter === "all"
      ? invoices
      : invoices.filter((i) => i.status === filter);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-7 w-7 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">
                Invoice Tracker
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Upload Invoice
              </button>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 transition-colors"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Pending</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(stats.totalPending)} total
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Paid</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.paid}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertOctagon className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Overdue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.overdue}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Duplicates Caught</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.duplicates}</p>
            {stats.savedByDuplicateDetection > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {formatCurrency(stats.savedByDuplicateDetection)} saved
              </p>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-4 rounded-lg bg-gray-100 p-1 overflow-x-auto">
          {(
            [
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "paid", label: "Paid" },
              { key: "overdue", label: "Overdue" },
              { key: "duplicate", label: "Duplicates" },
            ] as { key: FilterStatus; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Invoice List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-3 text-sm font-medium text-gray-900">
              No invoices
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {filter === "all"
                ? "Upload your first invoice to get started."
                : `No ${filter} invoices found.`}
            </p>
            {filter === "all" && (
              <button
                onClick={() => setUploadOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Upload Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onMarkPaid={handleMarkPaid}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={fetchInvoices}
      />
    </div>
  );
}
