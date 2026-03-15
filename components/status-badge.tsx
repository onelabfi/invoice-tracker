"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

const statusConfig: Record<string, { label: string; className: string }> = {
  unpaid: {
    label: "Unpaid",
    className: "bg-blue-500 text-white",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-500 text-white",
  },
  "possibly-paid": {
    label: "Possibly Paid",
    className: "bg-amber-100 text-amber-800 border border-amber-300",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-500 text-white",
  },
  duplicate: {
    label: "Duplicate",
    className: "bg-orange-500 text-white",
  },
  reminder: {
    label: "Reminder",
    className: "bg-amber-400 text-amber-900",
  },
  "due-soon": {
    label: "Due Soon",
    className: "border-2 border-red-400 text-red-600 bg-white",
  },
  predicted: {
    label: "Expected",
    className: "bg-purple-100 text-purple-700 border border-purple-200",
  },
  matched: {
    label: "Matched",
    className: "bg-teal-500 text-white",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const config = statusConfig[status] || statusConfig.unpaid;

  const labelKeys: Record<string, string> = {
    unpaid: "status_unpaid",
    paid: "status_paid",
    "possibly-paid": "status_possibly_paid",
    overdue: "status_overdue",
    duplicate: "status_duplicate",
    reminder: "status_reminder",
    "due-soon": "status_due_soon",
    predicted: "status_predicted",
    matched: "status_matched",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        config.className
      )}
    >
      {labelKeys[status] ? t(labelKeys[status] as any) : config.label}
    </span>
  );
}
