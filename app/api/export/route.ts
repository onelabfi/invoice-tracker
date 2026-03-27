import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { generateCSV } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { userId: auth.userId };

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.createdAt = dateFilter;
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const csvData = invoices.map((inv) => ({
      createdAt: inv.createdAt.toISOString(),
      vendor: inv.vendor,
      amount: inv.amount,
      currency: inv.currency,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      paidAt: inv.paidAt?.toISOString() || null,
      dueDate: inv.dueDate?.toISOString() || null,
      iban: inv.iban,
      reference: inv.reference,
      description: inv.description,
    }));

    const csv = generateCSV(csvData);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="invoices-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export failed:", error);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
