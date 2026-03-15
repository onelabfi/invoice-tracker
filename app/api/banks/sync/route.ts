import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Always get a fresh Nordigen token using env credentials */
async function getNordigenToken(): Promise<string | null> {
  if (!process.env.NORDIGEN_SECRET_ID || !process.env.NORDIGEN_SECRET_KEY) {
    return null;
  }
  const res = await fetch(
    "https://bankaccountdata.gocardless.com/api/v2/token/new/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret_id: process.env.NORDIGEN_SECRET_ID,
        secret_key: process.env.NORDIGEN_SECRET_KEY,
      }),
    }
  );
  if (!res.ok) {
    console.error(`[sync] Nordigen token refresh failed: ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.access ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { connectionId } = body as { connectionId?: string };

    // Only sync real, connected accounts with valid account IDs
    const realAccountFilter = {
      status: "connected" as const,
      OR: [
        { provider: { in: ["csv", "manual", "plaid"] as string[] } },
        {
          provider: "nordigen",
          accountName:       { not: null as null },
          accountExternalId: { not: null as null },
        },
      ],
    };

    const connections = connectionId
      ? await prisma.bankConnection.findMany({ where: { id: connectionId, ...realAccountFilter } })
      : await prisma.bankConnection.findMany({ where: realAccountFilter });

    if (connections.length === 0) {
      return NextResponse.json({ synced: 0, message: "No connected banks to sync" });
    }

    console.log(`[sync] Syncing ${connections.length} connection(s)`);

    // Single fresh Nordigen token covers all Nordigen accounts
    const hasNordigen = connections.some((c) => c.provider === "nordigen");
    const nordigenToken = hasNordigen ? await getNordigenToken() : null;

    if (hasNordigen && !nordigenToken) {
      console.error("[sync] Could not obtain Nordigen token — check NORDIGEN_SECRET_ID / NORDIGEN_SECRET_KEY");
    }

    let totalSynced = 0;
    const results: Record<string, { status: string; newTransactions: number; error?: string }> = {};

    for (const conn of connections) {
      let transactionCount = 0;

      // ── Nordigen ────────────────────────────────────────────────────
      if (conn.provider === "nordigen") {
        if (!nordigenToken || !conn.accountExternalId) {
          const reason = !nordigenToken ? "no_token" : "missing_accountExternalId";
          console.warn(`[sync] Skipping "${conn.bankName}" (${conn.id}) — ${reason}`);
          results[conn.id] = { status: "skipped", newTransactions: 0, error: reason };
          continue;
        }

        console.log(`[sync] → "${conn.bankName}" accountId=${conn.accountExternalId} IBAN=${conn.accountName ?? "—"}`);

        try {
          const txnRes = await fetch(
            `https://bankaccountdata.gocardless.com/api/v2/accounts/${conn.accountExternalId}/transactions/`,
            { headers: { Authorization: `Bearer ${nordigenToken}` } }
          );

          if (!txnRes.ok) {
            const errText = await txnRes.text();
            console.error(`[sync] ✗ ${conn.accountExternalId}: HTTP ${txnRes.status} — ${errText}`);
            results[conn.id] = { status: "error", newTransactions: 0, error: `HTTP ${txnRes.status}` };
            continue;
          }

          const txnData = await txnRes.json();
          const booked: unknown[]  = txnData.transactions?.booked  ?? [];
          const pending: unknown[] = txnData.transactions?.pending ?? [];
          const allTxns = [...booked, ...pending];

          console.log(
            `[sync]   ${booked.length} booked + ${pending.length} pending = ${allTxns.length} total transactions`
          );

          for (const rawTxn of allTxns) {
            const txn = rawTxn as Record<string, unknown>;

            const amount = Math.abs(
              parseFloat((txn.transactionAmount as Record<string, string>)?.amount ?? "0")
            );
            const dateStr =
              (txn.bookingDate as string) ??
              (txn.valueDate as string) ??
              new Date().toISOString().split("T")[0];
            const merchant =
              (txn.creditorName as string) ??
              (txn.debtorName as string) ??
              (txn.remittanceInformationUnstructured as string) ??
              "Unknown";
            const reference =
              (txn.remittanceInformationUnstructured as string) ??
              (txn.endToEndId as string) ??
              null;

            // Dedup by connection + amount + date + merchant
            const existing = await prisma.transaction.findFirst({
              where: { connectionId: conn.id, amount, date: new Date(dateStr), merchant },
            });

            if (!existing) {
              await prisma.transaction.create({
                data: {
                  merchant,
                  amount,
                  reference,
                  description:
                    (txn.remittanceInformationUnstructuredArray as string[] | undefined)?.join("; ") ??
                    (txn.additionalInformation as string | undefined) ??
                    null,
                  date:         new Date(dateStr),
                  bankAccount:  conn.accountName ?? conn.bankName,
                  connectionId: conn.id,
                  rawData:      JSON.stringify(txn),
                },
              });
              transactionCount++;
            }
          }

          // Persist fresh token
          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { accessToken: nordigenToken, lastSynced: new Date() },
          });

          console.log(
            `[sync] ✓ "${conn.bankName}" (${conn.accountExternalId}): ${transactionCount} new transaction(s) inserted`
          );
          results[conn.id] = { status: "ok", newTransactions: transactionCount };

        } catch (err) {
          console.error(`[sync] ✗ Nordigen error for "${conn.bankName}":`, err);
          results[conn.id] = { status: "error", newTransactions: 0, error: String(err) };
          continue;
        }
      }

      // ── Plaid ───────────────────────────────────────────────────────
      if (conn.provider === "plaid" && conn.accessToken) {
        try {
          const plaidEnv  = process.env.PLAID_ENV ?? "sandbox";
          const plaidBase =
            plaidEnv === "production"   ? "https://production.plaid.com"   :
            plaidEnv === "development"  ? "https://development.plaid.com"  :
                                          "https://sandbox.plaid.com";

          const now          = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          const res = await fetch(`${plaidBase}/transactions/get`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id:    process.env.PLAID_CLIENT_ID,
              secret:       process.env.PLAID_SECRET,
              access_token: conn.accessToken,
              start_date:   thirtyDaysAgo.toISOString().split("T")[0],
              end_date:     now.toISOString().split("T")[0],
            }),
          });

          if (res.ok) {
            const data = await res.json();
            for (const txn of (data.transactions ?? []) as Record<string, unknown>[]) {
              const amount   = Math.abs(txn.amount as number);
              const date     = new Date(txn.date as string);
              const merchant = ((txn.name ?? txn.merchant_name ?? "Unknown") as string);

              const existing = await prisma.transaction.findFirst({
                where: { connectionId: conn.id, amount, date, merchant },
              });

              if (!existing) {
                await prisma.transaction.create({
                  data: {
                    merchant,
                    amount,
                    reference:   (txn.payment_meta as Record<string, string> | undefined)?.reference_number ?? null,
                    description: (txn.category as string[] | undefined)?.join(", ") ?? null,
                    date,
                    bankAccount:  conn.bankName,
                    connectionId: conn.id,
                    rawData:      JSON.stringify(txn),
                  },
                });
                transactionCount++;
              }
            }
          }

          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { lastSynced: new Date() },
          });

          console.log(`[sync] ✓ Plaid "${conn.bankName}": ${transactionCount} new transaction(s)`);
          results[conn.id] = { status: "ok", newTransactions: transactionCount };

        } catch (err) {
          console.error(`[sync] ✗ Plaid error for "${conn.bankName}":`, err);
          results[conn.id] = { status: "error", newTransactions: 0, error: String(err) };
        }
      }

      totalSynced += transactionCount;
    }

    console.log(`[sync] Complete — ${totalSynced} new transaction(s) across ${connections.length} account(s)`);
    console.log("[sync] Per-account results:", JSON.stringify(results, null, 2));

    return NextResponse.json({
      synced:      totalSynced,
      connections: connections.length,
      results,
      message: `Synced ${totalSynced} new transaction${totalSynced !== 1 ? "s" : ""} from ${connections.length} account${connections.length !== 1 ? "s" : ""}`,
    });

  } catch (error) {
    console.error("[sync] Fatal error:", error);
    return NextResponse.json({ error: "Failed to sync transactions" }, { status: 500 });
  }
}
