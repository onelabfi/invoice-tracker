import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { logAudit, requestMeta } from "@/lib/audit";
import { apiError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    // Compound where clause prevents IDOR
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, userId: auth.userId },
      include: {
        originalInvoice: { select: { id: true, vendor: true, invoiceNumber: true } },
        reminders: { select: { id: true, amount: true } },
        matches: {
          include: {
            transaction: { select: { id: true, merchant: true, amount: true, date: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to fetch invoice:", error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    // Verify ownership before updating
    const existing = await prisma.invoice.findFirst({
      where: { id: params.id, userId: auth.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const data = await request.json();
    const updateData: Record<string, unknown> = {};

    if (data.status === "paid") {
      updateData.status = "paid";
      updateData.paidAt = new Date();
    } else if (data.status) {
      updateData.status = data.status;
    }

    if (data.vendor !== undefined) updateData.vendor = data.vendor;
    if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.invoiceNumber !== undefined) updateData.invoiceNumber = data.invoiceNumber;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.iban !== undefined) updateData.iban = data.iban;
    if (data.reference !== undefined) updateData.reference = data.reference;

    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: updateData,
    });

    const { ip, userAgent } = requestMeta(request);
    logAudit({
      userId: auth.userId,
      action: "UPDATE_INVOICE",
      resourceId: params.id,
      ip,
      userAgent,
      metadata: { fields: Object.keys(updateData) },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    return apiError(error, "invoice.update");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    // Verify ownership before deleting
    const existing = await prisma.invoice.findFirst({
      where: { id: params.id, userId: auth.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // First unlink any reminders pointing to this invoice
    await prisma.invoice.updateMany({
      where: { originalInvoiceId: params.id },
      data: { originalInvoiceId: null },
    });

    // Delete any matches
    await prisma.match.deleteMany({
      where: { invoiceId: params.id },
    });

    await prisma.invoice.delete({
      where: { id: params.id },
    });

    const { ip, userAgent } = requestMeta(request);
    logAudit({
      userId: auth.userId,
      action: "DELETE_INVOICE",
      resourceId: params.id,
      ip,
      userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "invoice.delete");
  }
}
