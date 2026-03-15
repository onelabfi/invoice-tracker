import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { connectionId } = body as { connectionId?: string };

    // Get connections to sync
    const connections = connectionId
      ? await prisma.bankConnection.findMany({ where: { id: connectionId, status: "connected" } })
      : await prisma.bankConnection.findMany({ where: { status: "connected" } });

    if (connections.length === 0) {
      return NextResponse.json({ synced: 0, message: "No connected banks to sync" });
    }

    let totalSynced = 0;

    for (const conn of connections) {
      let transactionCount = 0;

      // Nordigen sync
      if (conn.provider === "nordigen" && conn.accessToken && conn.accountExternalId) {
        try {
          // Fetch transactions from Nordigen
          const res = await fetch(
            `https://bankaccountdata.gocardless.com/api/v2/accounts/${conn.accountExternalId}/transactions/`,
            { headers: { Authorization: `Bearer ${conn.accessToken}` } }
          );

          if (res.ok) {
            const data = await res.json();
            const txns = data.transactions?.booked || [];

            for (const txn of txns) {
              // Check if transaction already exists (by reference + amount + date)
              const existing = await prisma.transaction.findFirst({
                where: {
                  connectionId: conn.id,
                  amount: Math.abs(parseFloat(txn.transactionAmount?.amount || "0")),
                  date: new Date(txn.bookingDate || txn.valueDate),
                  merchant: txn.creditorName || txn.debtorName || txn.remittanceInformationUnstructured || "Unknown",
                },
              });

              if (!existing) {
                await prisma.transaction.create({
                  data: {
                    merchant: txn.creditorName || txn.debtorName || txn.remittanceInformationUnstructured || "Unknown",
                    amount: Math.abs(parseFloat(txn.transactionAmount?.amount || "0")),
                    reference: txn.remittanceInformationUnstructured || txn.endToEndId || null,
                    description: txn.remittanceInformationUnstructuredArray?.join("; ") || txn.additionalInformation || null,
                    date: new Date(txn.bookingDate || txn.valueDate),
                    bankAccount: conn.bankName,
                    connectionId: conn.id,
                    rawData: JSON.stringify(txn),
                  },
                });
                transactionCount++;
              }
            }
          }
        } catch (err) {
          console.error(`Nordigen sync error for ${conn.bankName}:`, err);
        }
      }

      // Plaid sync
      if (conn.provider === "plaid" && conn.accessToken) {
        try {
          const plaidEnv = process.env.PLAID_ENV || "sandbox";
          const plaidUrl = plaidEnv === "production"
            ? "https://production.plaid.com"
            : plaidEnv === "development"
            ? "https://development.plaid.com"
            : "https://sandbox.plaid.com";

          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          const res = await fetch(`${plaidUrl}/transactions/get`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: process.env.PLAID_CLIENT_ID,
              secret: process.env.PLAID_SECRET,
              access_token: conn.accessToken,
              start_date: thirtyDaysAgo.toISOString().split("T")[0],
              end_date: now.toISOString().split("T")[0],
            }),
          });

          if (res.ok) {
            const data = await res.json();
            for (const txn of data.transactions || []) {
              const existing = await prisma.transaction.findFirst({
                where: {
                  connectionId: conn.id,
                  amount: Math.abs(txn.amount),
                  date: new Date(txn.date),
                  merchant: txn.name || "Unknown",
                },
              });

              if (!existing) {
                await prisma.transaction.create({
                  data: {
                    merchant: txn.name || txn.merchant_name || "Unknown",
                    amount: Math.abs(txn.amount),
                    reference: txn.payment_meta?.reference_number || null,
                    description: txn.category?.join(", ") || null,
                    date: new Date(txn.date),
                    bankAccount: conn.bankName,
                    connectionId: conn.id,
                    rawData: JSON.stringify(txn),
                  },
                });
                transactionCount++;
              }
            }
          }
        } catch (err) {
          console.error(`Plaid sync error for ${conn.bankName}:`, err);
        }
      }

      // Update last synced timestamp
      await prisma.bankConnection.update({
        where: { id: conn.id },
        data: { lastSynced: new Date() },
      });

      totalSynced += transactionCount;
    }

    return NextResponse.json({
      synced: totalSynced,
      connections: connections.length,
      message: `Synced ${totalSynced} new transactions from ${connections.length} bank(s)`,
    });
  } catch (error) {
    console.error("Bank sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync transactions" },
      { status: 500 }
    );
  }
}
