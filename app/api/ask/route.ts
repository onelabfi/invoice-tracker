import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT =
  "You are Ricordo, an AI payment memory assistant. You help users track their invoices and bills. Answer questions about their financial data clearly and concisely. Always mention specific amounts, dates, and payment statuses. Format currency in EUR. Keep responses short — 2-3 sentences max. If you find related invoices, include their IDs in a JSON block at the end of your response like: [INVOICES: id1, id2]";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question } = body as { question: string };

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "A question is required." },
        { status: 400 }
      );
    }

    const [invoices, transactions] = await Promise.all([
      prisma.invoice.findMany({
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
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
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
    console.error("Ask Ricordo error:", error);
    return NextResponse.json(
      { error: "Failed to process your question." },
      { status: 500 }
    );
  }
}
