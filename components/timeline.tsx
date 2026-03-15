"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { formatCurrency, formatDate, formatRelativeDate } from "@/lib/utils";

interface TimelineEntry {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  status: string;
  isPrediction: boolean;
  confidence: number;
  pattern: string | null;
}

export function Timeline() {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const res = await fetch("/api/timeline");
        if (res.ok) {
          const data = await res.json();
          setEntries(data);
        }
      } catch (err) {
        console.error("Failed to fetch timeline:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTimeline();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
        <p className="text-sm text-gray-500">Loading timeline...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 mb-4">
          <Sparkles className="h-8 w-8 text-purple-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">No timeline data</h3>
        <p className="text-sm text-gray-500 text-center">
          Add more invoices and the AI will detect recurring bills and predict upcoming payments.
        </p>
      </div>
    );
  }

  // Group entries by month
  const grouped: Record<string, TimelineEntry[]> = {};
  entries.forEach((entry) => {
    const d = new Date(entry.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="px-4 pb-4">
      {Object.entries(grouped).map(([monthKey, monthEntries]) => {
        const [year, month] = monthKey.split("-");
        const monthName = monthNames[parseInt(month) - 1];

        return (
          <div key={monthKey} className="mb-6">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">
              {monthName} {year}
            </h3>

            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-gray-200" />

              <div className="space-y-3">
                {monthEntries.map((entry) => {
                  const vendorInitial = entry.vendor.charAt(0).toUpperCase();
                  const now = new Date();
                  const entryDate = new Date(entry.date);
                  const isPast = entryDate < now;

                  return (
                    <div
                      key={entry.id}
                      className={`relative flex items-start gap-3 pl-0 ${
                        entry.isPrediction ? "opacity-80" : ""
                      }`}
                    >
                      {/* Dot / avatar */}
                      <div
                        className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          entry.isPrediction
                            ? "bg-purple-100 text-purple-600 border-2 border-dashed border-purple-300"
                            : entry.status === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : entry.status === "overdue"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {vendorInitial}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 card p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {entry.vendor}
                          </p>
                          <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                            {formatCurrency(entry.amount, entry.currency)}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {formatDate(entry.date)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {isPast ? "" : formatRelativeDate(entry.date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {entry.isPrediction && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-600 border border-purple-200">
                                <Sparkles className="h-2.5 w-2.5" />
                                AI
                              </span>
                            )}
                            <StatusBadge
                              status={
                                entry.isPrediction
                                  ? "predicted"
                                  : entry.status
                              }
                            />
                          </div>
                        </div>

                        {entry.pattern && (
                          <p className="text-[11px] text-purple-500 mt-1 capitalize">
                            {entry.pattern} pattern
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
