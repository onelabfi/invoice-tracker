import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isAfter, isBefore, addDays, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "\u2014";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "dd.MM.yyyy");
}

export function formatRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return "\u2014";
  const d = typeof date === "string" ? parseISO(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

  return formatDistanceToNow(d, { addSuffix: true });
}

export function isOverdue(dueDate: Date | string | null | undefined, status?: string): boolean {
  if (!dueDate) return false;
  if (status === "paid" || status === "duplicate") return false;
  const d = typeof dueDate === "string" ? parseISO(dueDate) : dueDate;
  return isBefore(d, new Date()) && d.toDateString() !== new Date().toDateString();
}

export function isDueSoon(dueDate: Date | string | null | undefined): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === "string" ? parseISO(dueDate) : dueDate;
  const now = new Date();
  const weekFromNow = addDays(now, 7);
  return isAfter(d, now) && isBefore(d, weekFromNow);
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function getStatusColor(status: string): {
  bg: string;
  text: string;
  border: string;
  bar: string;
} {
  switch (status) {
    case "unpaid":
      return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", bar: "bg-blue-500" };
    case "paid":
      return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", bar: "bg-emerald-500" };
    case "overdue":
      return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", bar: "bg-red-500" };
    case "duplicate":
      return { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", bar: "bg-orange-500" };
    case "reminder":
      return { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", bar: "bg-amber-500" };
    default:
      return { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", bar: "bg-gray-400" };
  }
}

export function generateCSV(invoices: Array<{
  createdAt: string | Date;
  vendor: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  status: string;
  paidAt: string | Date | null;
  dueDate: string | Date | null;
  iban: string | null;
  reference: string | null;
  description: string | null;
}>): string {
  const headers = ["Date", "Vendor", "Amount", "Currency", "Invoice #", "Status", "Due Date", "Paid Date", "IBAN", "Reference", "Description"];
  const rows = invoices.map((inv) => [
    formatDate(inv.createdAt),
    `"${(inv.vendor || "").replace(/"/g, '""')}"`,
    inv.amount.toFixed(2),
    inv.currency,
    inv.invoiceNumber || "",
    inv.status,
    formatDate(inv.dueDate),
    formatDate(inv.paidAt),
    inv.iban || "",
    inv.reference || "",
    `"${(inv.description || "").replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
