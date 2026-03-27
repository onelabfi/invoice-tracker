import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validate } from "@/lib/validate";
import { validateIban } from "@/lib/iban";
import { logAudit, requestMeta } from "@/lib/audit";
import { apiError } from "@/lib/errors";
import { checkIdempotency, setIdempotencyResult } from "@/lib/idempotency";

const createInvoiceSchema = z.object({
  vendor: z.string().min(1).max(200),
  amount: z.number().positive().max(1_000_000).multipleOf(0.01),
  currency: z.string().length(3).default("EUR"),
  invoiceNumber: z.string().max(100).nullish(),
  description: z.string().max(1000).nullish(),
  dueDate: z.string().datetime().nullish(),
  iban: z
    .string()
    .max(34)
    .nullish()
    .refine((v) => !v || validateIban(v), { message: "Invalid IBAN" }),
  reference: z.string().max(200).nullish(),
  status: z.enum(["unpaid", "overdue", "paid", "duplicate"]).default("unpaid"),
  isReminder: z.boolean().default(false),
  reminderFee: z.number().positive().max(1_000_000).multipleOf(0.01).nullish(),
  originalInvoiceId: z.string().nullish(),
  source: z.string().max(50).default("manual"),
  fileName: z.string().max(255).nullish(),
  fileUrl: z.string().url().max(2000).nullish(),
  rawText: z.string().max(10000).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const cursor = searchParams.get("cursor") ?? undefined;          // last invoice id from previous page
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100); // max 100 per page

    const where: Record<string, unknown> = { userId: auth.userId };

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
      take: limit + 1,                                               // fetch one extra to detect next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        originalInvoice: {
          select: { id: true, vendor: true, invoiceNumber: true },
        },
        reminders: {
          select: { id: true, vendor: true, invoiceNumber: true, amount: true },
        },
      },
    });

    const hasNextPage = invoices.length > limit;
    const page = hasNextPage ? invoices.slice(0, limit) : invoices;
    const nextCursor = hasNextPage ? page[page.length - 1].id : null;

    // Auto-detect overdue invoices
    const now = new Date();
    const updated = page.map((inv) => {
      if (inv.status === "unpaid" && inv.dueDate && new Date(inv.dueDate) < now) {
        return { ...inv, status: "overdue" };
      }
      return inv;
    });

    return NextResponse.json({ data: updated, nextCursor, hasNextPage });
  } catch (error) {
    console.error("Failed to fetch invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    // Idempotency — client sends `Idempotency-Key: <uuid>` header to deduplicate retries
    const idempKey = request.headers.get("Idempotency-Key");
    const idem = await checkIdempotency(auth.userId, idempKey);
    if (!idem.ok) return idem.response;

    const body = await request.json();
    const v = validate(createInvoiceSchema, body);
    if (!v.ok) return v.response;
    const data = v.data;

    const invoice = await prisma.invoice.create({
      data: {
        vendor: data.vendor,
        amount: data.amount,
        currency: data.currency,
        invoiceNumber: data.invoiceNumber ?? null,
        description: data.description ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        iban: data.iban ?? null,
        reference: data.reference ?? null,
        status: data.status,
        isReminder: data.isReminder,
        reminderFee: data.reminderFee ?? null,
        originalInvoiceId: data.originalInvoiceId ?? null,
        source: data.source,
        fileName: data.fileName ?? null,
        fileUrl: data.fileUrl ?? null,
        rawText: data.rawText ?? null,
        confidence: data.confidence ?? null,
        userId: auth.userId,
      },
    });

    const { ip, userAgent } = requestMeta(request);
    logAudit({
      userId: auth.userId,
      action: "CREATE_INVOICE",
      resourceId: invoice.id,
      ip,
      userAgent,
      metadata: { vendor: invoice.vendor, amount: invoice.amount, source: invoice.source },
    });

    // Cache result so retries with same Idempotency-Key get the same response
    setIdempotencyResult(auth.userId, idempKey, invoice, 201);

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return apiError(error, "invoice.create");
  }
}
