"use client";

import {
  CheckCircle,
  Trash2,
  AlertTriangle,
  Calendar,
  FileText,
  Building2,
} from "lucide-react";
import { StatusBadge } from "./status-badge";
import { formatCurrency, formatDate } from "@/lib/utils";

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

interface InvoiceCardProps {
  invoice: Invoice;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
}

export function InvoiceCard({ invoice, onMarkPaid, onDelete }: InvoiceCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 truncate">
              {invoice.vendor}
            </h3>
            <StatusBadge status={invoice.status} />
          </div>

          {invoice.isReminder && invoice.originalInvoice && (
            <div className="flex items-center gap-1.5 mt-1 mb-2 text-sm text-orange-700 bg-orange-50 rounded px-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                Reminder for invoice{" "}
                {invoice.originalInvoice.invoiceNumber || invoice.originalInvoice.vendor}
                {" "}-- do NOT pay this separately!
              </span>
            </div>
          )}

          {invoice.reminders && invoice.reminders.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 mb-2 text-sm text-orange-700 bg-orange-50 rounded px-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {invoice.reminders.length} reminder(s) detected for this invoice
              </span>
            </div>
          )}

          <div className="mt-2 space-y-1 text-sm text-gray-600">
            {invoice.invoiceNumber && (
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                <span>#{invoice.invoiceNumber}</span>
              </div>
            )}
            {invoice.description && (
              <p className="text-gray-500 truncate">{invoice.description}</p>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Due: {formatDate(invoice.dueDate)}
                {invoice.paidAt && ` | Paid: ${formatDate(invoice.paidAt)}`}
              </span>
            </div>
            <p className="text-xs text-gray-400">File: {invoice.fileName}</p>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(invoice.amount, invoice.currency)}
          </p>
          <div className="mt-3 flex gap-2 justify-end">
            {invoice.status !== "paid" && (
              <button
                onClick={() => onMarkPaid(invoice.id)}
                className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Mark Paid
              </button>
            )}
            <button
              onClick={() => onDelete(invoice.id)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
