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
        {
          provider: "tink",
          accountName:       { not: null as null },
          accountExternalId: { not: null as null },
        },
        {
          provider: "truelayer",
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

    // Tink: get a fresh client token if needed, then per-user tokens via delegate grant
    const hasTink = connections.some((c) => c.provider === "tink");
    let tinkClientToken: string | null = null;
    if (hasTink && process.env.TINK_CLIENT_ID && process.env.TINK_CLIENT_SECRET) {
      try {
        const res = await fetch("https://api.tink.com/api/v1/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.TINK_CLIENT_ID,
            client_secret: process.env.TINK_CLIENT_SECRET,
            scope: "authorization:grant",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          tinkClientToken = data.access_token;
        } else {
          console.error("[sync] Tink client token failed:", res.status);
        }
      } catch (err) {
        console.error("[sync] Tink client token error:", err);
      }
    }

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

      // ── Tink ────────────────────────────────────────────────────────
      if (conn.provider === "tink") {
        if (!tinkClientToken || !conn.accountExternalId || !conn.externalId) {
          const reason = !tinkClientToken
            ? "no_tink_token"
            : !conn.externalId
            ? "missing_externalId"
            : "missing_accountExternalId";
          console.warn(`[sync] Skipping Tink "${conn.bankName}" (${conn.id}) -- ${reason}`);
          results[conn.id] = { status: "skipped", newTransactions: 0, error: reason };
          continue;
        }

        console.log(
          `[sync] -> Tink "${conn.bankName}" accountId=${conn.accountExternalId} user=${conn.externalId}`
        );

        try {
          // Get a user-scoped token via delegate grant
          const authGrantRes = await fetch(
            "https://api.tink.com/api/v1/oauth/authorization-grant/delegate",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Bearer ${tinkClientToken}`,
              },
              body: new URLSearchParams({
                response_type: "code",
                actor_client_id: "df05e4b379934cd09963197cc855bfe9",
                user_id: conn.externalId,
                scope: "accounts:read,balances:read,transactions:read",
              }),
            }
          );

          if (!authGrantRes.ok) {
            const errText = await authGrantRes.text();
            console.error(`[sync] Tink auth grant failed: ${authGrantRes.status} ${errText}`);
            results[conn.id] = { status: "error", newTransactions: 0, error: `auth_grant ${authGrantRes.status}` };
            continue;
          }
          const { code: userAuthCode } = await authGrantRes.json();

          const userTokenRes = await fetch("https://api.tink.com/api/v1/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              client_id: process.env.TINK_CLIENT_ID!,
              client_secret: process.env.TINK_CLIENT_SECRET!,
              code: userAuthCode,
            }),
          });

          if (!userTokenRes.ok) {
            const errText = await userTokenRes.text();
            console.error(`[sync] Tink user token failed: ${userTokenRes.status} ${errText}`);
            results[conn.id] = { status: "error", newTransactions: 0, error: `user_token ${userTokenRes.status}` };
            continue;
          }
          const { access_token: userToken } = await userTokenRes.json();

          // Fetch transactions for the specific account
          const txnRes = await fetch(
            `https://api.tink.com/api/v1/transactions?accountId=${conn.accountExternalId}`,
            { headers: { Authorization: `Bearer ${userToken}` } }
          );

          if (!txnRes.ok) {
            const errText = await txnRes.text();
            console.error(`[sync] Tink transactions failed: ${txnRes.status} ${errText}`);
            results[conn.id] = { status: "error", newTransactions: 0, error: `transactions ${txnRes.status}` };
            continue;
          }

          const txnData = await txnRes.json();
          const transactions: Array<Record<string, unknown>> =
            txnData.transactions ?? txnData.results ?? [];

          console.log(`[sync]   ${transactions.length} transaction(s) from Tink`);

          for (const txn of transactions) {
            const amountObj = txn.amount as Record<string, unknown> | undefined;
            const amount = Math.abs(
              parseFloat(
                (amountObj?.value as string) ??
                  (amountObj?.unscaledValue as string) ??
                  String(txn.amount ?? "0")
              )
            );
            // Tink may use unscaledValue + scale
            const scale = parseInt(String(amountObj?.scale ?? "0"), 10);
            const finalAmount = scale > 0 ? amount / Math.pow(10, scale) : amount;

            const dateStr =
              (txn.dates as Record<string, string> | undefined)?.booked ??
              (txn.date as string) ??
              new Date().toISOString().split("T")[0];

            const merchant =
              (txn.descriptions as Record<string, string> | undefined)?.display ??
              (txn.description as string) ??
              (txn.merchantName as string) ??
              "Unknown";

            const reference =
              (txn.descriptions as Record<string, string> | undefined)?.original ??
              (txn.reference as string) ??
              null;

            // Dedup
            const existing = await prisma.transaction.findFirst({
              where: {
                connectionId: conn.id,
                amount: finalAmount,
                date: new Date(dateStr),
                merchant,
              },
            });

            if (!existing) {
              await prisma.transaction.create({
                data: {
                  merchant,
                  amount: finalAmount,
                  reference,
                  description:
                    (txn.descriptions as Record<string, string> | undefined)?.original ?? null,
                  date: new Date(dateStr),
                  bankAccount: conn.accountName ?? conn.bankName,
                  connectionId: conn.id,
                  rawData: JSON.stringify(txn),
                },
              });
              transactionCount++;
            }
          }

          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { accessToken: userToken, lastSynced: new Date() },
          });

          console.log(
            `[sync] Done Tink "${conn.bankName}": ${transactionCount} new transaction(s)`
          );
          results[conn.id] = { status: "ok", newTransactions: transactionCount };
        } catch (err) {
          console.error(`[sync] Tink error for "${conn.bankName}":`, err);
          results[conn.id] = { status: "error", newTransactions: 0, error: String(err) };
          continue;
        }
      }

      // ── TrueLayer ────────────────────────────────────────────────────
      if (conn.provider === "truelayer" && conn.accessToken && conn.accountExternalId) {
        try {
          const headers = { Authorization: `Bearer ${conn.accessToken}` };

          const txnRes = await fetch(
            `https://api.truelayer-sandbox.com/data/v1/accounts/${conn.accountExternalId}/transactions`,
            { headers }
          );

          if (!txnRes.ok) {
            const errText = await txnRes.text();
            console.error(`[sync] TrueLayer transactions failed: ${txnRes.status} ${errText}`);
            results[conn.id] = { status: "error", newTransactions: 0, error: `transactions ${txnRes.status}` };
            continue;
          }

          const txnData = await txnRes.json();
          const transactions: Array<Record<string, unknown>> = txnData.results ?? [];

          console.log(`[sync]   ${transactions.length} transaction(s) from TrueLayer`);

          for (const txn of transactions) {
            const amount = Math.abs(txn.amount as number);
            const dateStr = (txn.timestamp as string) ?? new Date().toISOString();
            const merchant =
              (txn.merchant_name as string) ??
              (txn.description as string) ??
              "Unknown";
            const reference = (txn.transaction_id as string) ?? null;

            // Dedup
            const existing = await prisma.transaction.findFirst({
              where: {
                connectionId: conn.id,
                amount,
                date: new Date(dateStr),
                merchant,
              },
            });

            if (!existing) {
              await prisma.transaction.create({
                data: {
                  merchant,
                  amount,
                  reference,
                  description: (txn.description as string) ?? null,
                  date: new Date(dateStr),
                  bankAccount: conn.accountName ?? conn.bankName,
                  connectionId: conn.id,
                  rawData: JSON.stringify(txn),
                },
              });
              transactionCount++;
            }
          }

          await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { lastSynced: new Date() },
          });

          console.log(
            `[sync] Done TrueLayer "${conn.bankName}": ${transactionCount} new transaction(s)`
          );
          results[conn.id] = { status: "ok", newTransactions: transactionCount };
        } catch (err) {
          console.error(`[sync] TrueLayer error for "${conn.bankName}":`, err);
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
