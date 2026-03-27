export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/invoices/[id]/file-url
 *
 * Returns a short-lived (60s) signed URL for the invoice's private storage file.
 * Ownership is enforced: the authenticated user must own the invoice.
 * The bucket must be private — this is the only way to access files.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // Verify ownership and fetch storagePath
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, userId: auth.userId },
    select: { storagePath: true, fileName: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!invoice.storagePath) {
    return NextResponse.json({ error: "No file attached to this invoice" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("invoice-files")
    .createSignedUrl(invoice.storagePath, 60); // 60-second expiry

  if (error || !data?.signedUrl) {
    console.error("[file-url] Failed to generate signed URL:", error);
    return NextResponse.json({ error: "Could not generate file URL" }, { status: 500 });
  }

  return NextResponse.json({
    url: data.signedUrl,
    fileName: invoice.fileName,
    expiresIn: 60,
  });
}
