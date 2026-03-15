import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: "desc" },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { transactions } = await request.json();

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty transactions array" },
        { status: 400 }
      );
    }

    const created = await prisma.transaction.createMany({
      data: transactions.map(
        (tx: {
          merchant: string;
          amount: number;
          date: string;
          reference?: string;
          description?: string;
          bankAccount?: string;
        }) => ({
          merchant: tx.merchant,
          amount: tx.amount,
          date: new Date(tx.date),
          reference: tx.reference || null,
          description: tx.description || null,
          bankAccount: tx.bankAccount || null,
        })
      ),
    });

    return NextResponse.json(
      { count: created.count, message: `Created ${created.count} transactions` },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create transactions:", error);
    return NextResponse.json(
      { error: "Failed to create transactions" },
      { status: 500 }
    );
  }
}
