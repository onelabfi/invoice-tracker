"use client";

import { useState } from "react";
import {
  Brain,
  Send,
  Loader2,
  Sparkles,
  X,
  MessageCircle,
} from "lucide-react";

interface RelatedInvoice {
  id: string;
  vendor: string;
  amount: number;
  status: string;
}

interface AskResponse {
  answer: string;
  relatedInvoices?: RelatedInvoice[];
}

interface AskRicordoProps {
  onSelectInvoice?: (invoiceId: string) => void;
}

const SUGGESTED_QUESTIONS = [
  "Did I pay the electricity bill?",
  "What bills are coming next?",
  "Show unpaid invoices",
  "How much did I spend this month?",
];

export function AskRicordo({ onSelectInvoice }: AskRicordoProps) {
  const [query, setQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setQuery(trimmed);
    setIsLoading(true);
    setResponse(null);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data: AskResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(query);
    }
  }

  function handleReset() {
    setQuery("");
    setResponse(null);
    setError(null);
    setIsLoading(false);
  }

  function handleClose() {
    handleReset();
    setIsExpanded(false);
  }

  const hasResult = response !== null || error !== null;

  return (
    <div className="w-full">
      {/* Search / Assistant Bar */}
      <div
        className={`
          relative rounded-2xl transition-all duration-300
          ${
            isExpanded
              ? "bg-white shadow-lg ring-1 ring-teal-200"
              : "bg-white shadow-sm ring-1 ring-gray-200 hover:ring-teal-300 hover:shadow-md"
          }
        `}
      >
        {/* Gradient border effect when expanded */}
        {isExpanded && (
          <div
            className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 -z-10"
            aria-hidden="true"
          />
        )}

        {/* Input Row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Brain
            className={`h-5 w-5 flex-shrink-0 transition-colors ${
              isExpanded ? "text-teal-600" : "text-gray-400"
            }`}
          />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsExpanded(true)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Ricordo..."
            disabled={isLoading}
            className="min-h-[44px] flex-1 bg-transparent text-gray-900 placeholder:text-gray-400 text-base outline-none disabled:opacity-60"
          />

          {isExpanded && (
            <div className="flex items-center gap-1">
              {query.trim() && !isLoading && (
                <button
                  type="button"
                  onClick={() => handleSubmit(query)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600 active:scale-95 transition-all"
                  aria-label="Send question"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-4 pb-4">
            {/* Suggested Questions */}
            {!hasResult && !isLoading && !query.trim() && (
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5 mb-3">
                  <Sparkles className="h-3.5 w-3.5 text-teal-500" />
                  <span className="text-xs font-medium text-gray-500">
                    Try asking
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setQuery(q);
                        handleSubmit(q);
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-full bg-teal-50 text-teal-700 text-sm font-medium hover:bg-teal-100 active:scale-95 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-3 py-4">
                  <Loader2 className="h-5 w-5 text-teal-500 animate-spin flex-shrink-0" />
                  <span className="text-sm text-gray-500 font-medium">
                    Ricordo is thinking...
                  </span>
                </div>
              </div>
            )}

            {/* Response */}
            {response && (
              <div className="pt-3 border-t border-gray-100 space-y-3">
                {/* User question echo */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-500 px-4 py-3 text-sm text-white">
                    {query}
                  </div>
                </div>

                {/* AI answer */}
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-50">
                    <MessageCircle className="h-3.5 w-3.5 text-teal-600" />
                  </div>
                  <div className="flex-1 rounded-2xl rounded-tl-md border-l-2 border-teal-400 bg-gray-50 px-4 py-3">
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {response.answer}
                    </p>
                  </div>
                </div>

                {/* Related Invoices */}
                {response.relatedInvoices &&
                  response.relatedInvoices.length > 0 && (
                    <div className="pl-9">
                      <span className="text-xs font-medium text-gray-500 mb-2 block">
                        Related invoices
                      </span>
                      <div className="flex flex-col gap-2">
                        {response.relatedInvoices.map((inv) => (
                          <button
                            key={inv.id}
                            type="button"
                            onClick={() => onSelectInvoice?.(inv.id)}
                            className="min-h-[44px] flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-teal-300 hover:shadow-sm active:scale-[0.98] transition-all"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {inv.vendor}
                              </p>
                              <p className="text-xs text-gray-500">
                                {inv.status}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                              {typeof inv.amount === "number"
                                ? new Intl.NumberFormat("it-IT", {
                                    style: "currency",
                                    currency: "EUR",
                                  }).format(inv.amount)
                                : inv.amount}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Reset / Ask Another */}
                <div className="pl-9 pt-1">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-teal-600 hover:bg-teal-50 active:scale-95 transition-all"
                  >
                    Ask another question
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-teal-600 hover:bg-teal-50 active:scale-95 transition-all"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
