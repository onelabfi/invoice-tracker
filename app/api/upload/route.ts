import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractInvoiceData, checkForDuplicates } from "@/lib/claude";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

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
    } else {
      // For PDFs and text, send as text (basic extraction)
      // For real PDF parsing you'd use a library like pdf-parse
      fileContent = buffer.toString("utf-8");
      // If it looks like binary (PDF), send base64 as image won't work,
      // so we tell Claude it's a PDF and include what we can
      if (file.type === "application/pdf") {
        fileContent = `[PDF file: ${file.name}. Raw content may contain binary data. Please extract any readable text and invoice information from the following content.]\n\n` + buffer.toString("latin1").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      }
    }

    // Extract invoice data using Claude
    const extracted = await extractInvoiceData(fileContent, mimeType);

    // Check for duplicates against existing invoices
    const existingInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["pending", "overdue", "paid"] },
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
    let status = "pending";
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
        status,
        isReminder: duplicateCheck.isReminder,
        originalInvoiceId: duplicateCheck.originalInvoiceId,
        fileName: file.name,
        fileUrl: `/uploads/${uniqueName}`,
        rawText: fileContent.substring(0, 10000),
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
