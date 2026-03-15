"use client";

import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  unpaid: {
    label: "Unpaid",
    className: "bg-blue-500 text-white",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-500 text-white",
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
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.unpaid;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
