import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * GoCardless/Nordigen OAuth callback.
 *
 * After the user authorises in the GoCardless UI they are redirected here:
 *   GET /api/banks/callback?ref={requisition_id}
 *
 * We:
 *  1. Fetch the requisition → get the list of authorised account IDs
 *  2. For each account fetch /accounts/{id}/details/ → IBAN, owner, currency
 *  3. Skip accounts with no IBAN (dummy / virtual accounts)
 *  4. Persist real accounts as BankConnection rows (status = "connected")
 *  5. Redirect the user back to the app
 */

async function getNordigenToken(): Promise<string> {
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
    const text = await res.text();
    throw new Error(`Nordigen token error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.access as string;
}

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");   // requisition_id
  const origin = request.nextUrl.origin;

  // Verify user session — callback arrives via browser redirect so cookies are present
  const auth = await requireAuth();
  if (!auth.ok) {
    console.error("[bank-callback] Unauthenticated callback — session expired");
    return NextResponse.redirect(`${origin}/?bank_error=session_expired`);
  }

  if (!ref) {
    console.error("[bank-callback] Missing ref parameter");
    return NextResponse.redirect(`${origin}/?bank_error=missing_ref`);
  }

  console.log(`[bank-callback] Processing requisition: ${ref}`);

  try {
    // ── 1. Fresh Nordigen token ────────────────────────────────────────
    const token = await getNordigenToken();

    // ── 2. Fetch requisition → account IDs ────────────────────────────
    const reqRes = await fetch(
      `https://bankaccountdata.gocardless.com/api/v2/requisitions/${ref}/`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!reqRes.ok) {
      console.error(`[bank-callback] Requisition fetch failed: ${reqRes.status}`);
      return NextResponse.redirect(`${origin}/?bank_error=requisition_failed`);
    }

    const requisition = await reqRes.json();
    const accountIds: string[] = requisition.accounts ?? [];

    console.log(`[bank-callback] Requisition ${ref} has ${accountIds.length} account(s): ${accountIds.join(", ")}`);

    if (accountIds.length === 0) {
      console.warn(`[bank-callback] No accounts in requisition — user may not have completed auth`);
      return NextResponse.redirect(`${origin}/?bank_error=no_accounts`);
    }

    // ── 3. Find parent BankConnection — scoped to this user's connection only ──
    const parentConn = await prisma.bankConnection.findFirst({
      where: { externalId: ref, userId: auth.userId, status: "pending" },
    });

    // Idempotency: if already connected, redirect as success rather than error
    if (!parentConn) {
      const alreadyConnected = await prisma.bankConnection.findFirst({
        where: { externalId: ref, userId: auth.userId, status: "connected" },
      });
      if (alreadyConnected) {
        return NextResponse.redirect(`${origin}/?bank_connected=1`);
      }
    }

    if (!parentConn) {
      console.error(`[bank-callback] No BankConnection found for requisition ${ref}`);
      return NextResponse.redirect(`${origin}/?bank_error=connection_not_found`);
    }

    // ── 4. Fetch details for each account ─────────────────────────────
    let realAccountsCreated = 0;

    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];

      const detailsRes = await fetch(
        `https://bankaccountdata.gocardless.com/api/v2/accounts/${accountId}/details/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!detailsRes.ok) {
        console.warn(`[bank-callback] Account ${accountId} details fetch failed: ${detailsRes.status}`);
        continue;
      }

      const detailsData = await detailsRes.json();
      const account = detailsData.account ?? {};

      const iban: string | null = account.iban ?? null;
      const ownerName: string | null = account.ownerName ?? account.name ?? null;
      const currency: string | null = account.currency ?? null;
      const bban: string | null = account.bban ?? null;

      // Skip accounts that have neither IBAN nor BBAN — these are dummy/virtual
      if (!iban && !bban) {
        console.log(`[bank-callback] Skipping account ${accountId} — no IBAN or BBAN`);
        continue;
      }

      const accountLabel = iban || bban!;

      console.log(
        `[bank-callback] Account ${accountId}: IBAN=${iban ?? "—"} BBAN=${bban ?? "—"} owner=${ownerName ?? "—"} currency=${currency ?? "—"}`
      );

      if (i === 0) {
        // Update the parent connection in-place for the first real account
        await prisma.bankConnection.update({
          where: { id: parentConn.id },
          data: {
            accountName:      accountLabel,
            accountExternalId: accountId,
            accessToken:      token,   // store fresh token
            status:           "connected",
          },
        });
        console.log(`[bank-callback] Updated parent connection ${parentConn.id} with account ${accountId}`);
      } else {
        // Create a new row for each additional account — inherit userId from parent
        await prisma.bankConnection.create({
          data: {
            bankName:          parentConn.bankName,
            accountName:       accountLabel,
            country:           parentConn.country,
            provider:          "nordigen",
            institutionId:     parentConn.institutionId,
            externalId:        ref,             // same requisition
            accessToken:       token,
            accountExternalId: accountId,
            status:            "connected",
            userId:            auth.userId,
          },
        });
        console.log(`[bank-callback] Created new connection for additional account ${accountId}`);
      }

      realAccountsCreated++;
    }

    // If no real accounts were found, mark parent as errored
    if (realAccountsCreated === 0) {
      await prisma.bankConnection.update({
        where: { id: parentConn.id },
        data: { status: "error" },
      });
      console.warn(`[bank-callback] All accounts lacked IBAN/BBAN — connection marked as error`);
      return NextResponse.redirect(`${origin}/?bank_error=no_valid_accounts`);
    }

    console.log(`[bank-callback] Done — ${realAccountsCreated} real account(s) saved`);
    return NextResponse.redirect(`${origin}/?bank_connected=1`);

  } catch (err) {
    console.error("[bank-callback] Unexpected error:", err);
    return NextResponse.redirect(`${origin}/?bank_error=internal`);
  }
}
