import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    const transactions = await prisma.transaction.findMany({
      where: { userId: auth.userId },
      orderBy: { date: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = transactions.length > limit;
    const page = hasNextPage ? transactions.slice(0, limit) : transactions;
    const nextCursor = hasNextPage ? page[page.length - 1].id : null;

    return NextResponse.json({ data: page, nextCursor, hasNextPage });
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

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
          userId: auth.userId,
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
