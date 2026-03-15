"use client";

import { useState } from "react";
import {
  CheckCircle,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Bell,
  Copy,
  FileText,
  Calendar,
  Banknote,
} from "lucide-react";
import { StatusBadge } from "./status-badge";
import {
  formatCurrency,
  formatDate,
  formatRelativeDate,
  getStatusColor,
  isDueSoon,
  isOverdue,
} from "@/lib/utils";

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
}

interface InvoiceCardProps {
  invoice: Invoice;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
}

export function InvoiceCard({
  invoice,
  onMarkPaid,
  onDelete,
}: InvoiceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const displayStatus =
    invoice.status === "unpaid" && isOverdue(invoice.dueDate, invoice.status)
      ? "overdue"
      : invoice.status === "unpaid" && isDueSoon(invoice.dueDate)
      ? "due-soon"
      : invoice.status;

  const colors = getStatusColor(
    displayStatus === "due-soon" ? "overdue" : displayStatus
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="card-hover overflow-hidden">
      {/* Reminder banner */}
      {invoice.isReminder && invoice.originalInvoice && (
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-800 border-b border-amber-100">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="font-medium">
            Reminder -- Original invoice may be paid
          </span>
        </div>
      )}

      {/* Duplicate warning banner */}
      {invoice.status === "duplicate" && !invoice.isReminder && (
        <div className="flex items-center gap-2 bg-orange-50 px-4 py-2 text-sm text-orange-800 border-b border-orange-100">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="font-medium">
            Possible duplicate detected
          </span>
        </div>
      )}

      <div className="flex">
        {/* Status indicator bar */}
        <div className={`w-1 flex-shrink-0 ${colors.bar}`} />

        {/* Main content */}
        <div className="flex-1 p-4">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-base font-bold text-gray-900 truncate">
                  {invoice.vendor}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                {invoice.invoiceNumber && (
                  <span className="flex items-center gap-0.5">
                    <FileText className="h-3 w-3" />#{invoice.invoiceNumber}
                  </span>
                )}
                {invoice.dueDate && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="h-3 w-3" />
                    {formatRelativeDate(invoice.dueDate)}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <p className="text-xl font-extrabold text-gray-900">
                {formatCurrency(invoice.amount, invoice.currency)}
              </p>
              <StatusBadge status={displayStatus} />
            </div>
          </div>

          {/* Reminders count */}
          {invoice.reminders && invoice.reminders.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-2.5 py-1.5">
              <AlertTriangle className="h-3 w-3" />
              <span className="font-medium">
                {invoice.reminders.length} reminder(s) received
              </span>
            </div>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-3 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] -mb-2"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Less details
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                More details
              </>
            )}
          </button>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-2 space-y-3 animate-in slide-in-from-top-2">
              {/* Details grid */}
              <div className="rounded-xl bg-gray-50 p-3 space-y-2">
                {invoice.description && (
                  <div className="text-sm">
                    <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                      Description
                    </span>
                    <p className="text-gray-900 mt-0.5">{invoice.description}</p>
                  </div>
                )}

                {invoice.dueDate && (
                  <div className="text-sm">
                    <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                      Due Date
                    </span>
                    <p className="text-gray-900 mt-0.5">
                      {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                )}

                {invoice.paidAt && (
                  <div className="text-sm">
                    <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                      Paid Date
                    </span>
                    <p className="text-emerald-700 font-medium mt-0.5">
                      {formatDate(invoice.paidAt)}
                    </p>
                  </div>
                )}

                {invoice.iban && (
                  <div className="text-sm">
                    <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                      IBAN
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-gray-900 font-mono text-xs">
                        {invoice.iban}
                      </p>
                      <button
                        onClick={() => copyToClipboard(invoice.iban!)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}

                {invoice.reference && (
                  <div className="text-sm">
                    <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                      Reference
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-gray-900 font-mono text-xs">
                        {invoice.reference}
                      </p>
                      <button
                        onClick={() => copyToClipboard(invoice.reference!)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-400 pt-1 border-t border-gray-200">
                  {invoice.source && (
                    <span className="capitalize">Source: {invoice.source}</span>
                  )}
                  {invoice.confidence !== null && invoice.confidence !== undefined && (
                    <span>
                      Confidence: {Math.round(invoice.confidence * 100)}%
                    </span>
                  )}
                  {invoice.fileName && (
                    <span className="truncate">File: {invoice.fileName}</span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {invoice.status !== "paid" && (
                  <>
                    <button
                      onClick={() =>
                        window.open(
                          `https://pay.example.com?iban=${invoice.iban || ""}&amount=${invoice.amount}&ref=${invoice.reference || ""}`,
                          "_blank"
                        )
                      }
                      className="btn-primary flex-1 py-2.5 text-xs"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Pay
                    </button>
                    <button
                      onClick={() => onMarkPaid(invoice.id)}
                      className="btn-success flex-1 py-2.5 text-xs"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Mark Paid
                    </button>
                    <button
                      onClick={() => {}}
                      className="btn-secondary py-2.5 text-xs px-3"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {invoice.status === "paid" && (
                  <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium py-2">
                    <Banknote className="h-4 w-4" />
                    Paid on {formatDate(invoice.paidAt)}
                  </div>
                )}
                <button
                  onClick={() => onDelete(invoice.id)}
                  className="btn-secondary py-2.5 text-xs px-3 text-red-500 hover:text-red-700 hover:border-red-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
