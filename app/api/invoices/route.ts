import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { vendor: { contains: search, mode: "insensitive" } },
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        originalInvoice: {
          select: { id: true, vendor: true, invoiceNumber: true },
        },
        reminders: {
          select: { id: true, vendor: true, invoiceNumber: true, amount: true },
        },
      },
    });

    // Auto-detect overdue invoices
    const now = new Date();
    const updated = invoices.map((inv) => {
      if (
        inv.status === "unpaid" &&
        inv.dueDate &&
        new Date(inv.dueDate) < now
      ) {
        return { ...inv, status: "overdue" };
      }
      return inv;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to fetch invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const invoice = await prisma.invoice.create({
      data: {
        vendor: data.vendor,
        amount: parseFloat(data.amount),
        currency: data.currency || "EUR",
        invoiceNumber: data.invoiceNumber || null,
        description: data.description || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        iban: data.iban || null,
        reference: data.reference || null,
        status: data.status || "unpaid",
        isReminder: data.isReminder || false,
        reminderFee: data.reminderFee ? parseFloat(data.reminderFee) : null,
        originalInvoiceId: data.originalInvoiceId || null,
        source: data.source || "manual",
        fileName: data.fileName || null,
        fileUrl: data.fileUrl || null,
        rawText: data.rawText || null,
        confidence: data.confidence || null,
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}
