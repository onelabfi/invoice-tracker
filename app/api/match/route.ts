import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  Helper utilities                                                   */
/* ------------------------------------------------------------------ */

/** Check whether two amounts are effectively equal (< 1 cent diff). */
function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/**
 * Return a 0-1 score indicating how much two reference strings overlap.
 * Uses longest-common-substring ratio.
 */
function referenceScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 1;

  const lcs = longestCommonSubstring(al, bl);
  if (lcs.length < 3) return 0; // ignore trivial overlaps
  return lcs.length / Math.max(al.length, bl.length);
}

function longestCommonSubstring(s1: string, s2: string): string {
  const m = s1.length;
  const n = s2.length;
  let maxLen = 0;
  let endIdx = 0;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) {
          maxLen = dp[i][j];
          endIdx = i;
        }
      }
    }
  }
  return s1.slice(endIdx - maxLen, endIdx);
}

/**
 * Word-overlap similarity between two names (0-1).
 * Tokenises on non-alphanumeric chars, computes Jaccard-like overlap.
 */
function merchantScore(vendor: string | null, merchant: string | null): number {
  if (!vendor || !merchant) return 0;

  const tokenise = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1),
    );

  const a = tokenise(vendor);
  const b = tokenise(merchant);
  if (a.size === 0 || b.size === 0) return 0;

  let overlap = 0;
  Array.from(a).forEach(w => {
    if (b.has(w)) overlap++;
  });
  return overlap / Math.max(a.size, b.size);
}

/**
 * Return 1 if the transaction date falls within [dueDate - 30d, dueDate + 7d],
 * else 0.
 */
function dateScore(
  transactionDate: Date,
  dueDate: Date | null,
): number {
  if (!dueDate) return 0;
  const txMs = transactionDate.getTime();
  const dueMs = dueDate.getTime();
  const msPerDay = 86_400_000;
  const diffDays = (txMs - dueMs) / msPerDay;
  // within 30 days before or 7 days after due date
  return diffDays >= -30 && diffDays <= 7 ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/*  Confidence calculation                                             */
/* ------------------------------------------------------------------ */

interface MatchSignals {
  amountMatch: boolean;
  referenceMatch: number; // 0-1
  merchantMatch: number;  // 0-1
  dateMatch: number;      // 0 or 1
}

function confidence(signals: MatchSignals): number {
  const score =
    (signals.amountMatch ? 1 : 0) * 0.4 +
    signals.referenceMatch * 0.3 +
    signals.merchantMatch * 0.2 +
    signals.dateMatch * 0.1;
  return Math.min(score, 1);
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST() {
  try {
    // 1. Fetch unpaid / overdue invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["unpaid", "overdue"] },
      },
    });

    // 2. Fetch unmatched transactions
    const matchedTxIds = (
      await prisma.match.findMany({ select: { transactionId: true } })
    ).map((m: { transactionId: string }) => m.transactionId);

    const transactions = await prisma.transaction.findMany({
      where: {
        id: { notIn: matchedTxIds.length > 0 ? matchedTxIds : undefined },
      },
    });

    let matchesFound = 0;
    let invoicesUpdated = 0;
    let possibleMatches = 0;

    // 3-6. Compare every invoice against every transaction
    for (const invoice of invoices) {
      for (const tx of transactions) {
        const signals: MatchSignals = {
          amountMatch: amountsMatch(invoice.amount, tx.amount),
          referenceMatch: referenceScore(
            invoice.reference ?? null,
            tx.reference ?? null,
          ),
          merchantMatch: merchantScore(
            invoice.vendor ?? null,
            tx.merchant ?? null,
          ),
          dateMatch: dateScore(tx.date, invoice.dueDate ?? null),
        };

        const score = confidence(signals);

        if (score >= 0.7) {
          // High-confidence match
          await prisma.match.create({
            data: {
              invoiceId: invoice.id,
              transactionId: tx.id,
              confidenceScore: score,
              matchType: "combined",
            },
          });
          matchesFound++;

          // Auto-pay if very high confidence
          if (score >= 0.9) {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: { status: "paid" },
            });
            invoicesUpdated++;
          }

          // Notification for high-confidence match
          await prisma.notification.create({
            data: {
              title: "Payment matched",
              message: `Invoice ${invoice.vendor ?? invoice.id} appears paid via bank transaction`,
              type: "success",
              invoiceId: invoice.id,
              actionType: "view",
            },
          });
        } else if (score >= 0.5) {
          // Possible match
          await prisma.match.create({
            data: {
              invoiceId: invoice.id,
              transactionId: tx.id,
              confidenceScore: score,
              matchType: "combined",
            },
          });
          possibleMatches++;

          // Notification for possible match
          await prisma.notification.create({
            data: {
              title: "Possible payment found",
              message: `Possible payment found for ${invoice.vendor ?? invoice.id} invoice`,
              type: "warning",
              invoiceId: invoice.id,
              actionType: "view",
            },
          });
        }
      }
    }

    return NextResponse.json({
      matchesFound,
      invoicesUpdated,
      possibleMatches,
    });
  } catch (error) {
    console.error("Match API error:", error);
    return NextResponse.json(
      { error: "Failed to run payment matching" },
      { status: 500 },
    );
  }
}
