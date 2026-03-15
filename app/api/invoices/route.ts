import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
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

    // Auto-mark overdue invoices
    const now = new Date();
    const updated = invoices.map((inv) => {
      if (
        inv.status === "pending" &&
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
        amount: data.amount,
        currency: data.currency || "EUR",
        invoiceNumber: data.invoiceNumber || null,
        description: data.description || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: data.status || "pending",
        isReminder: data.isReminder || false,
        originalInvoiceId: data.originalInvoiceId || null,
        fileName: data.fileName,
        fileUrl: data.fileUrl || null,
        rawText: data.rawText || null,
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
