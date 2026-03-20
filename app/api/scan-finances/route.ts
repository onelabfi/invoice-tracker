import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ------------------------------------------------------------------ */
/*  Matching helpers (shared with /api/match)                          */
/* ------------------------------------------------------------------ */

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
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

function referenceScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 1;
  const lcs = longestCommonSubstring(al, bl);
  if (lcs.length < 3) return 0;
  return lcs.length / Math.max(al.length, bl.length);
}

function merchantScore(vendor: string | null, merchant: string | null): number {
  if (!vendor || !merchant) return 0;
  const tokenise = (s: string) =>
    new Set(
      s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1),
    );
  const a = tokenise(vendor);
  const b = tokenise(merchant);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  Array.from(a).forEach((w) => { if (b.has(w)) overlap++; });
  return overlap / Math.max(a.size, b.size);
}

function dateScore(transactionDate: Date, dueDate: Date | null): number {
  if (!dueDate) return 0;
  const diffDays = (transactionDate.getTime() - dueDate.getTime()) / 86_400_000;
  return diffDays >= -30 && diffDays <= 7 ? 1 : 0;
}

function matchConfidence(signals: {
  amountMatch: boolean;
  referenceMatch: number;
  merchantMatch: number;
  dateMatch: number;
}): number {
  return Math.min(
    (signals.amountMatch ? 1 : 0) * 0.4 +
    signals.referenceMatch * 0.3 +
    signals.merchantMatch * 0.2 +
    signals.dateMatch * 0.1,
    1,
  );
}

/**
 * POST /api/scan-finances
 *
 * Triggers a full TrueLayer "Scan my finances" flow:
 *  1. Returns auth URL if no connected TrueLayer account exists
 *  2. If connected, fetches transactions, runs invoice matching, returns:
 *     - Reconciliation results (matched, possible, unmatched invoices)
 *     - Spending summary (total spend, recurring, top merchants)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: "init" | "analyze" };

    // ── INIT: generate auth URL ────────────────────────────────────
    if (action === "init") {
      const clientId = process.env.TRUELAYER_CLIENT_ID;
      if (!clientId) {
        return NextResponse.json({ error: "TrueLayer not configured" }, { status: 500 });
      }

      const origin = request.nextUrl.origin;
      const redirectUri = `${origin}/api/banks/truelayer/callback`;

      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        scope: "info accounts balance transactions",
        redirect_uri: redirectUri,
        providers: "mock",
      });

      // Create pending connection
      const { country, bankName } = body as { country?: string; bankName?: string };
      await prisma.bankConnection.create({
        data: {
          bankName: bankName || "TrueLayer Bank",
          country: country || "GB",
          provider: "truelayer",
          status: "pending",
        },
      });

      return NextResponse.json({
        auth_url: `https://auth.truelayer-sandbox.com/?${params}`,
      });
    }

    // ── ANALYZE: fetch transactions and build summary ──────────────
    // Find all connected TrueLayer accounts
    const connections = await prisma.bankConnection.findMany({
      where: {
        provider: "truelayer",
        status: "connected",
        accessToken: { not: null },
        accountExternalId: { not: null },
      },
    });

    if (connections.length === 0) {
      return NextResponse.json({
        connected: false,
        message: "No TrueLayer accounts connected",
      });
    }

    // Skip TrueLayer sync if all accounts were synced within the last 5 minutes
    const FIVE_MIN = 5 * 60_000;
    const now = Date.now();
    const needsSync = connections.some(
      (c) => !c.lastSynced || now - c.lastSynced.getTime() > FIVE_MIN,
    );

    let totalNewTxns = 0;

    if (needsSync) {
      // Sync transactions in parallel with 3s timeout per account
      await Promise.allSettled(
        connections.map(async (conn) => {
          // Skip if this account was synced recently
          if (conn.lastSynced && now - conn.lastSynced.getTime() < FIVE_MIN) return;

          try {
            const headers = { Authorization: `Bearer ${conn.accessToken}` };
            const txnRes = await fetch(
              `https://api.truelayer-sandbox.com/data/v1/accounts/${conn.accountExternalId}/transactions`,
              { headers, signal: AbortSignal.timeout(3_000) }
            );

            if (!txnRes.ok) return;

            const txnData = await txnRes.json();
            const transactions: Array<Record<string, unknown>> = txnData.results ?? [];

            // Get existing transaction signatures for this connection to avoid N+1 queries
            const existingTxns = await prisma.transaction.findMany({
              where: { connectionId: conn.id },
              select: { amount: true, date: true, merchant: true },
            });
            const existingSet = new Set(
              existingTxns.map((t) => `${t.amount}|${t.date.toISOString()}|${t.merchant}`),
            );

            // Batch-create new transactions
            const newTxns = transactions
              .map((txn) => {
                const amount = Math.abs(txn.amount as number);
                const dateStr = (txn.timestamp as string) ?? new Date().toISOString();
                const merchant =
                  (txn.merchant_name as string) ??
                  (txn.description as string) ??
                  "Unknown";
                const key = `${amount}|${new Date(dateStr).toISOString()}|${merchant}`;
                if (existingSet.has(key)) return null;
                return {
                  merchant,
                  amount,
                  reference: (txn.transaction_id as string) ?? null,
                  description: (txn.description as string) ?? null,
                  date: new Date(dateStr),
                  bankAccount: conn.accountName ?? conn.bankName,
                  connectionId: conn.id,
                  rawData: JSON.stringify(txn),
                };
              })
              .filter((t): t is NonNullable<typeof t> => t !== null);

            if (newTxns.length > 0) {
              await prisma.transaction.createMany({ data: newTxns });
              totalNewTxns += newTxns.length;
            }

            await prisma.bankConnection.update({
              where: { id: conn.id },
              data: { lastSynced: new Date() },
            });
          } catch (err) {
            console.error(`[scan-finances] Error syncing ${conn.bankName}:`, err);
          }
        })
      );
    }

    // Now build summary from all TrueLayer transactions in DB
    const connectionIds = connections.map((c) => c.id);
    const allTxns = await prisma.transaction.findMany({
      where: { connectionId: { in: connectionIds } },
      orderBy: { date: "desc" },
    });

    const totalSpend = allTxns.reduce((sum, t) => sum + t.amount, 0);

    // Group by merchant
    const merchantMap = new Map<string, { total: number; count: number }>();
    for (const t of allTxns) {
      const name = t.merchant || "Unknown";
      const existing = merchantMap.get(name) ?? { total: 0, count: 0 };
      merchantMap.set(name, {
        total: existing.total + t.amount,
        count: existing.count + 1,
      });
    }

    const merchantEntries = Array.from(merchantMap.entries());

    const topMerchants = merchantEntries
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([name, data]) => ({
        name,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
      }));

    // Recurring: 3+ transactions to same merchant
    const recurring = merchantEntries
      .filter(([, data]) => data.count >= 3)
      .map(([name, data]) => ({
        name,
        count: data.count,
        total: Math.round(data.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    const recurringSpend = recurring.reduce((s, r) => s + r.total, 0);

    // ── RECONCILIATION: match invoices to transactions ───────────
    const unpaidInvoices = await prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "overdue"] } },
    });

    const allTransactions = await prisma.transaction.findMany();

    // Get existing matches to avoid duplicates
    const existingMatches = await prisma.match.findMany({
      select: { invoiceId: true, transactionId: true },
    });
    const existingMatchSet = new Set(
      existingMatches.map((m) => `${m.invoiceId}:${m.transactionId}`),
    );

    const matched: Array<{
      invoiceId: string;
      vendor: string;
      invoiceAmount: number;
      transactionMerchant: string;
      transactionAmount: number;
      transactionDate: string;
      confidence: number;
      autoMarkedPaid: boolean;
    }> = [];

    const possible: Array<{
      invoiceId: string;
      vendor: string;
      invoiceAmount: number;
      transactionMerchant: string;
      transactionAmount: number;
      transactionDate: string;
      confidence: number;
    }> = [];

    let autoMarkedPaid = 0;

    for (const invoice of unpaidInvoices) {
      let bestScore = 0;
      let bestTx: (typeof allTransactions)[0] | null = null;

      for (const tx of allTransactions) {
        // Skip if already matched
        if (existingMatchSet.has(`${invoice.id}:${tx.id}`)) continue;

        const score = matchConfidence({
          amountMatch: amountsMatch(invoice.amount, tx.amount),
          referenceMatch: referenceScore(invoice.reference ?? null, tx.reference ?? null),
          merchantMatch: merchantScore(invoice.vendor ?? null, tx.merchant ?? null),
          dateMatch: dateScore(tx.date, invoice.dueDate ?? null),
        });

        if (score > bestScore) {
          bestScore = score;
          bestTx = tx;
        }
      }

      if (bestTx && bestScore >= 0.7) {
        // Create match record
        await prisma.match.create({
          data: {
            invoiceId: invoice.id,
            transactionId: bestTx.id,
            confidenceScore: bestScore,
            matchType: "combined",
          },
        });

        const didAutoPay = bestScore >= 0.9;
        if (didAutoPay) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: "paid", paidAt: new Date() },
          });
          autoMarkedPaid++;
        }

        await prisma.notification.create({
          data: {
            title: didAutoPay ? "Invoice paid" : "Payment matched",
            message: `${invoice.vendor} — ${didAutoPay ? "auto-confirmed" : "matched"} via bank scan`,
            type: "success",
            invoiceId: invoice.id,
            actionType: "view",
          },
        });

        matched.push({
          invoiceId: invoice.id,
          vendor: invoice.vendor,
          invoiceAmount: invoice.amount,
          transactionMerchant: bestTx.merchant,
          transactionAmount: bestTx.amount,
          transactionDate: bestTx.date.toISOString(),
          confidence: Math.round(bestScore * 100) / 100,
          autoMarkedPaid: didAutoPay,
        });
      } else if (bestTx && bestScore >= 0.5) {
        await prisma.match.create({
          data: {
            invoiceId: invoice.id,
            transactionId: bestTx.id,
            confidenceScore: bestScore,
            matchType: "combined",
          },
        });

        await prisma.notification.create({
          data: {
            title: "Possible payment found",
            message: `Possible match for ${invoice.vendor} invoice`,
            type: "warning",
            invoiceId: invoice.id,
            actionType: "view",
          },
        });

        possible.push({
          invoiceId: invoice.id,
          vendor: invoice.vendor,
          invoiceAmount: invoice.amount,
          transactionMerchant: bestTx.merchant,
          transactionAmount: bestTx.amount,
          transactionDate: bestTx.date.toISOString(),
          confidence: Math.round(bestScore * 100) / 100,
        });
      }
    }

    // Unmatched invoices = unpaid invoices that didn't match anything
    const matchedIds = new Set([...matched, ...possible].map((m) => m.invoiceId));
    const unmatched = unpaidInvoices
      .filter((inv) => !matchedIds.has(inv.id))
      .map((inv) => ({
        invoiceId: inv.id,
        vendor: inv.vendor,
        amount: inv.amount,
        dueDate: inv.dueDate?.toISOString() ?? null,
        status: inv.status,
      }));

    return NextResponse.json({
      connected: true,
      accounts: connections.map((c) => ({
        id: c.accountExternalId,
        name: c.accountName ?? c.bankName,
        bank: c.bankName,
      })),
      transaction_count: allTxns.length,
      new_transactions: totalNewTxns,
      reconciliation: {
        matched,
        possible,
        unmatched,
        auto_marked_paid: autoMarkedPaid,
        total_invoices_checked: unpaidInvoices.length,
      },
      summary: {
        total_spend: Math.round(totalSpend * 100) / 100,
        recurring_spend: Math.round(recurringSpend * 100) / 100,
        recurring_payments: recurring,
        top_merchants: topMerchants,
        account_count: connections.length,
      },
    });
  } catch (error) {
    console.error("[scan-finances] Error:", error);
    return NextResponse.json({ error: "Failed to scan finances" }, { status: 500 });
  }
}
