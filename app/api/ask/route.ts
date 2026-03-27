export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { checkAiBudget, recordAiUsage } from "@/lib/ai-budget";
import { logAudit, requestMeta } from "@/lib/audit";
import { apiError } from "@/lib/errors";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  fi: "Finnish",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  nl: "Dutch",
  pl: "Polish",
};

function getSystemPrompt(locale: string): string {
  const lang = LOCALE_NAMES[locale] || "English";
  return `You are Ricordo, an AI payment memory assistant. You help users track their invoices and bills. Answer questions about their financial data clearly and concisely. Always mention specific amounts, dates, and payment statuses. Format currency in EUR. Keep responses short — 2-3 sentences max. If you find related invoices, include their IDs in a JSON block at the end of your response like: [INVOICES: id1, id2]. IMPORTANT: Always respond in ${lang}.`;
}

export async function POST(request: NextRequest) {
  // Emergency kill switch — set AI_DISABLED=true in env to block all AI requests instantly
  if (process.env.AI_DISABLED === "true") {
    return NextResponse.json({ error: "AI features are temporarily unavailable." }, { status: 503 });
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { ip, userAgent } = requestMeta(request);

  // Per-minute rate limit (Upstash sliding window)
  const rl = await rateLimit(`ask:${auth.userId}:${ip}`);
  if (!rl.ok) {
    logAudit({ userId: auth.userId, action: "RATE_LIMIT_HIT", ip, userAgent, metadata: { route: "/api/ask" } });
    return rl.response;
  }

  // Per-day AI budget (requests + tokens)
  const budget = await checkAiBudget(auth.userId);
  if (!budget.ok) {
    logAudit({ userId: auth.userId, action: "RATE_LIMIT_HIT", ip, userAgent, metadata: { route: "/api/ask", reason: "daily_budget" } });
    return budget.response;
  }

  try {
    const body = await request.json();
    const { question, locale } = body as { question: string; locale?: string };

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "A question is required." },
        { status: 400 }
      );
    }

    const [invoices, transactions] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId: auth.userId },
        include: {
          matches: {
            include: {
              transaction: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.transaction.findMany({
        where: { userId: auth.userId },
        orderBy: { date: "desc" },
      }),
    ]);

    const invoiceContext = invoices.map((inv) => ({
      id: inv.id,
      vendor: inv.vendor,
      amount: inv.amount,
      currency: inv.currency,
      invoiceNumber: inv.invoiceNumber,
      description: inv.description,
      dueDate: inv.dueDate?.toISOString() ?? null,
      status: inv.status,
      paidAt: inv.paidAt?.toISOString() ?? null,
      isReminder: inv.isReminder,
      reminderFee: inv.reminderFee,
      source: inv.source,
      createdAt: inv.createdAt.toISOString(),
      matchedTransactions: inv.matches.map((m) => ({
        transactionId: m.transactionId,
        confidenceScore: m.confidenceScore,
        matchType: m.matchType,
        merchant: m.transaction.merchant,
        amount: m.transaction.amount,
        date: m.transaction.date.toISOString(),
      })),
    }));

    const transactionContext = transactions.map((tx) => ({
      id: tx.id,
      merchant: tx.merchant,
      amount: tx.amount,
      reference: tx.reference,
      description: tx.description,
      date: tx.date.toISOString(),
      bankAccount: tx.bankAccount,
    }));

    const userMessage = `Here is the user's financial data:

INVOICES:
${JSON.stringify(invoiceContext, null, 2)}

TRANSACTIONS:
${JSON.stringify(transactionContext, null, 2)}

USER QUESTION: ${question}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: getSystemPrompt(locale || "en"),
      messages: [{ role: "user", content: userMessage }],
    });

    // Record token usage (fire-and-forget — never blocks response)
    recordAiUsage(auth.userId, message.usage.input_tokens, message.usage.output_tokens);
    logAudit({
      userId: auth.userId,
      action: "ASK_AI",
      ip,
      userAgent,
      metadata: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        model: message.model,
      },
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const answer = textBlock ? textBlock.text : "I could not generate a response.";

    // Extract related invoice IDs from the [INVOICES: ...] marker
    const invoiceIdPattern = /\[INVOICES:\s*([^\]]+)\]/;
    const match = answer.match(invoiceIdPattern);

    let relatedInvoiceIds: string[] = [];
    if (match) {
      relatedInvoiceIds = match[1]
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }

    const relatedInvoices = invoices
      .filter((inv) => relatedInvoiceIds.includes(inv.id))
      .map((inv) => ({
        id: inv.id,
        vendor: inv.vendor,
        amount: inv.amount,
        status: inv.status,
        dueDate: inv.dueDate?.toISOString() ?? null,
      }));

    // Remove the [INVOICES: ...] marker from the user-facing answer
    const cleanAnswer = answer.replace(invoiceIdPattern, "").trim();

    return NextResponse.json({
      answer: cleanAnswer,
      relatedInvoices,
    });
  } catch (error) {
    return apiError(error, "ask");
  }
}
