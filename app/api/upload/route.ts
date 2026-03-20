export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractInvoiceData, checkForDuplicates } from "@/lib/claude";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "upload";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save file to uploads directory
    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const uniqueName = `${Date.now()}-${file.name}`;
    const filePath = path.join(uploadsDir, uniqueName);
    await writeFile(filePath, buffer);

    // Prepare content for Claude
    let fileContent: string;
    let mimeType: string | undefined;

    if (file.type.startsWith("image/")) {
      fileContent = buffer.toString("base64");
      mimeType = file.type;
    } else if (file.type === "application/pdf") {
      // For PDFs, extract readable text
      fileContent =
        `[PDF file: ${file.name}. Raw content may contain binary data. Please extract any readable text and invoice information from the following content.]\n\n` +
        buffer
          .toString("latin1")
          .replace(/[^\x20-\x7E\n\r\t]/g, " ");
    } else {
      fileContent = buffer.toString("utf-8");
    }

    // Extract invoice data using Claude
    const extracted = await extractInvoiceData(fileContent, mimeType);

    // Check for duplicates against existing invoices
    const existingInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["unpaid", "overdue", "paid"] },
      },
      select: {
        id: true,
        vendor: true,
        amount: true,
        currency: true,
        invoiceNumber: true,
        description: true,
        dueDate: true,
      },
    });

    const duplicateCheck = await checkForDuplicates(
      extracted,
      existingInvoices.map((inv) => ({
        ...inv,
        dueDate: inv.dueDate?.toISOString() || null,
      }))
    );

    // Determine status
    let status = "unpaid";
    if (duplicateCheck.isDuplicate || duplicateCheck.isReminder) {
      status = "duplicate";
    }

    // Save to database
    const invoice = await prisma.invoice.create({
      data: {
        vendor: extracted.vendor,
        amount: extracted.amount,
        currency: extracted.currency,
        invoiceNumber: extracted.invoiceNumber,
        description: extracted.description,
        dueDate: extracted.dueDate ? new Date(extracted.dueDate) : null,
        iban: extracted.iban,
        reference: extracted.reference,
        status,
        isReminder: duplicateCheck.isReminder,
        originalInvoiceId: duplicateCheck.originalInvoiceId,
        source,
        fileName: file.name,
        fileUrl: `/uploads/${uniqueName}`,
        rawText: fileContent.substring(0, 10000),
        confidence: extracted.confidence,
      },
    });

    return NextResponse.json({
      invoice,
      extracted,
      duplicateCheck,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
