import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Failed to update invoice:", error);
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete invoice:", error);
    return NextResponse.json(
      { error: "Failed to delete invoice" },
      { status: 500 }
    );
  }
}
