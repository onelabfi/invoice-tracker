import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ExtractedInvoice {
  vendor: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  dueDate: string | null;
  description: string | null;
  iban: string | null;
  reference: string | null;
  confidence: number;
}

export interface DuplicateCheck {
  isDuplicate: boolean;
  isReminder: boolean;
  originalInvoiceId: string | null;
  confidence: number;
  reason: string;
}

interface ExistingInvoice {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  invoiceNumber: string | null;
  description: string | null;
  dueDate: string | null;
}

export interface BillPrediction {
  vendor: string;
  expectedAmount: number;
  expectedDate: string;
  confidence: number;
  pattern: string;
}

export async function extractInvoiceData(
  fileContent: string,
  mimeType?: string
): Promise<ExtractedInvoice> {
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  if (mimeType && mimeType.startsWith("image/")) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: fileContent,
      },
    });
    contentBlocks.push({
      type: "text",
      text: `Extract the following information from this invoice image. Return ONLY valid JSON, no other text.

{
  "vendor": "company/person name",
  "amount": 123.45,
  "currency": "EUR",
  "invoiceNumber": "INV-001 or null",
  "dueDate": "YYYY-MM-DD or null",
  "description": "brief description of what this invoice is for",
  "iban": "bank IBAN or null",
  "reference": "payment reference or null",
  "confidence": 0.95
}

The confidence score should reflect how certain you are about the extracted data overall (0.0 to 1.0).`,
    });
  } else {
    contentBlocks.push({
      type: "text",
      text: `Extract the following information from this invoice text. Return ONLY valid JSON, no other text.

Invoice text:
"""
${fileContent}
"""

{
  "vendor": "company/person name",
  "amount": 123.45,
  "currency": "EUR",
  "invoiceNumber": "INV-001 or null",
  "dueDate": "YYYY-MM-DD or null",
  "description": "brief description of what this invoice is for",
  "iban": "bank IBAN or null",
  "reference": "payment reference or null",
  "confidence": 0.95
}

The confidence score should reflect how certain you are about the extracted data overall (0.0 to 1.0).`,
    });
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: contentBlocks,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract invoice data from AI response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    vendor: parsed.vendor || "Unknown",
    amount: typeof parsed.amount === "number" ? parsed.amount : parseFloat(parsed.amount) || 0,
    currency: parsed.currency || "EUR",
    invoiceNumber: parsed.invoiceNumber || null,
    dueDate: parsed.dueDate || null,
    description: parsed.description || null,
    iban: parsed.iban || null,
    reference: parsed.reference || null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}

export async function checkForDuplicates(
  extracted: ExtractedInvoice,
  existingInvoices: ExistingInvoice[]
): Promise<DuplicateCheck> {
  if (existingInvoices.length === 0) {
    return {
      isDuplicate: false,
      isReminder: false,
      originalInvoiceId: null,
      confidence: 0,
      reason: "No existing invoices to compare against.",
    };
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are checking if a new invoice is a duplicate or reminder of an existing invoice.

A "reminder" (Mahnung) is a follow-up notice for an unpaid invoice, typically with a small fee added (often around 5 EUR).

New invoice:
${JSON.stringify(extracted, null, 2)}

Existing invoices:
${JSON.stringify(existingInvoices, null, 2)}

Check if the new invoice matches any existing invoice. Consider:
- Same or similar vendor name
- Same or very similar amount (reminders may add ~5 EUR fee)
- Same invoice number
- Similar description

Return ONLY valid JSON:
{
  "isDuplicate": true/false,
  "isReminder": true/false,
  "originalInvoiceId": "id of matching invoice or null",
  "confidence": 0.0 to 1.0,
  "reason": "explanation"
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      isDuplicate: false,
      isReminder: false,
      originalInvoiceId: null,
      confidence: 0,
      reason: "Could not parse AI response for duplicate check.",
    };
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    isDuplicate: !!parsed.isDuplicate,
    isReminder: !!parsed.isReminder,
    originalInvoiceId: parsed.originalInvoiceId || null,
    confidence: parsed.confidence || 0,
    reason: parsed.reason || "",
  };
}

export async function predictRecurringBills(
  invoices: Array<{
    vendor: string;
    amount: number;
    currency: string;
    dueDate: string | null;
    createdAt: string;
    status: string;
  }>
): Promise<BillPrediction[]> {
  if (invoices.length < 2) {
    return [];
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Analyze these historical invoices and predict upcoming recurring bills.

Historical invoices:
${JSON.stringify(invoices, null, 2)}

Group by vendor and look for patterns:
- Monthly bills (similar vendor, regular ~30 day intervals)
- Quarterly bills (~90 day intervals)
- Annual bills (~365 day intervals)
- Similar amounts from the same vendor

For each detected pattern, predict the next expected bill.

Return ONLY a valid JSON array:
[
  {
    "vendor": "Company Name",
    "expectedAmount": 123.45,
    "expectedDate": "YYYY-MM-DD",
    "confidence": 0.8,
    "pattern": "monthly" or "quarterly" or "annual" or "irregular"
  }
]

If no patterns are detected, return an empty array [].`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
