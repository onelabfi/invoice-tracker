export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { logAudit, requestMeta } from "@/lib/audit";
import { apiError } from "@/lib/errors";
import { extractInvoiceData, checkForDuplicates } from "@/lib/claude";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const rl = await rateLimit(`upload:${auth.userId}`);
    if (!rl.ok) return rl.response;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "upload";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, JPEG, PNG, WEBP" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large. Maximum: 10 MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Supabase Storage using user's JWT (no service role needed)
    const supabase = await createClient();
    const storagePath = `invoices/${auth.supabaseId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("invoice-files")
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
    // Do NOT call getPublicUrl — bucket must be private. File URL is generated on demand via
    // GET /api/invoices/[id]/file-url which returns a short-lived signed URL.

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

    // Check for duplicates against this user's existing invoices only
    const existingInvoices = await prisma.invoice.findMany({
      where: {
        userId: auth.userId,
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

    // Save to database — store storagePath, not a public URL
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
        storagePath,           // private path — access via /api/invoices/[id]/file-url
        rawText: fileContent.substring(0, 10000),
        confidence: extracted.confidence,
        userId: auth.userId,
      },
    });

    const { ip, userAgent } = requestMeta(request);
    logAudit({
      userId: auth.userId,
      action: "UPLOAD_FILE",
      resourceId: invoice.id,
      ip,
      userAgent,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        isDuplicate: duplicateCheck.isDuplicate,
        confidence: extracted.confidence,
      },
    });

    return NextResponse.json({ invoice, extracted, duplicateCheck });
  } catch (error) {
    return apiError(error, "upload");
  }
}
