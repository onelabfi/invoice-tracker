export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { predictRecurringBills } from "@/lib/claude";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        vendor: true,
        amount: true,
        currency: true,
        dueDate: true,
        status: true,
        paidAt: true,
        createdAt: true,
      },
    });

    // Past timeline entries from actual invoices
    const pastEntries = invoices.map((inv) => ({
      id: inv.id,
      vendor: inv.vendor,
      amount: inv.amount,
      currency: inv.currency,
      date: (inv.dueDate || inv.createdAt).toISOString(),
      status: inv.status,
      isPrediction: false,
      confidence: 1,
      pattern: null as string | null,
    }));

    // Get predictions from Claude
    let predictions: Array<{
      id: string;
      vendor: string;
      amount: number;
      currency: string;
      date: string;
      status: string;
      isPrediction: boolean;
      confidence: number;
      pattern: string | null;
    }> = [];

    if (invoices.length >= 2) {
      try {
        const billPredictions = await predictRecurringBills(
          invoices.map((inv) => ({
            vendor: inv.vendor,
            amount: inv.amount,
            currency: inv.currency,
            dueDate: inv.dueDate?.toISOString() || null,
            createdAt: inv.createdAt.toISOString(),
            status: inv.status,
          }))
        );

        predictions = billPredictions.map((pred, i) => ({
          id: `prediction-${i}`,
          vendor: pred.vendor,
          amount: pred.expectedAmount,
          currency: "EUR",
          date: pred.expectedDate,
          status: "predicted",
          isPrediction: true,
          confidence: pred.confidence,
          pattern: pred.pattern,
        }));
      } catch (err) {
        console.error("Failed to get predictions:", err);
      }
    }

    // Combine and sort by date
    const timeline = [...pastEntries, ...predictions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return NextResponse.json(timeline);
  } catch (error) {
    console.error("Failed to build timeline:", error);
    return NextResponse.json(
      { error: "Failed to build timeline" },
      { status: 500 }
    );
  }
}
