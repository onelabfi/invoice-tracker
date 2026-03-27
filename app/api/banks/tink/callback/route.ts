import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const TINK_BASE = "https://api.tink.com";
const TINK_LINK_ACTOR_CLIENT_ID = "df05e4b379934cd09963197cc855bfe9";

/**
 * Tink Link callback.
 *
 * After the user authorises in Tink Link they are redirected here:
 *   GET /api/banks/tink/callback?credentialsId=xxx
 *
 * Flow:
 *  1. Get a fresh client access token
 *  2. Find the pending BankConnection (most recent tink pending)
 *  3. Generate a user authorization code via delegate grant
 *  4. Exchange code for user access token
 *  5. Fetch accounts
 *  6. Update BankConnection(s) with account info
 *  7. Redirect to /?bank_connected=1
 */
export async function GET(request: NextRequest) {
  const credentialsId = request.nextUrl.searchParams.get("credentialsId");
  const state = request.nextUrl.searchParams.get("state");  // connection.id set in connect/route.ts
  const origin = request.nextUrl.origin;

  // Verify user session — callback arrives via browser redirect so cookies are present
  const auth = await requireAuth();
  if (!auth.ok) {
    console.error("[tink-callback] Unauthenticated callback — session expired");
    return NextResponse.redirect(`${origin}/?bank_error=session_expired`);
  }

  if (!credentialsId) {
    console.error("[tink-callback] Missing credentialsId parameter");
    return NextResponse.redirect(`${origin}/?bank_error=missing_credentials_id`);
  }

  if (!state) {
    console.error("[tink-callback] Missing state parameter");
    return NextResponse.redirect(`${origin}/?bank_error=missing_state`);
  }

  console.log(`[tink-callback] Processing credentialsId: ${credentialsId} state: ${state}`);

  try {
    const clientId = process.env.TINK_CLIENT_ID;
    const clientSecret = process.env.TINK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("[tink-callback] Missing TINK_CLIENT_ID or TINK_CLIENT_SECRET");
      return NextResponse.redirect(`${origin}/?bank_error=missing_tink_config`);
    }

    // Find connection by id (state param) scoped to this user — eliminates race condition
    const parentConn = await prisma.bankConnection.findFirst({
      where: { id: state, provider: "tink", userId: auth.userId, status: "pending" },
    });

    // Idempotency: if already connected, redirect as success
    if (!parentConn) {
      const alreadyConnected = await prisma.bankConnection.findFirst({
        where: { id: state, provider: "tink", userId: auth.userId, status: "connected" },
      });
      if (alreadyConnected) return NextResponse.redirect(`${origin}/?bank_connected=1`);
      console.error("[tink-callback] No matching pending Tink BankConnection found");
      return NextResponse.redirect(`${origin}/?bank_error=connection_not_found`);
    }

    const tinkUserId = parentConn.externalId;
    if (!tinkUserId) {
      console.error("[tink-callback] BankConnection has no externalId (tink user_id)");
      return NextResponse.redirect(`${origin}/?bank_error=missing_user_id`);
    }

    // 1. Get client access token
    const tokenRes = await fetch(`${TINK_BASE}/api/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "authorization:grant",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[tink-callback] Client token error: ${tokenRes.status} ${errText}`);
      return NextResponse.redirect(`${origin}/?bank_error=token_failed`);
    }
    const { access_token: clientToken } = await tokenRes.json();

    // 2. Generate user authorization code via delegate grant
    const authGrantRes = await fetch(
      `${TINK_BASE}/api/v1/oauth/authorization-grant/delegate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${clientToken}`,
        },
        body: new URLSearchParams({
          response_type: "code",
          actor_client_id: TINK_LINK_ACTOR_CLIENT_ID,
          user_id: tinkUserId,
          scope:
            "accounts:read,balances:read,transactions:read,credentials:read",
        }),
      }
    );

    if (!authGrantRes.ok) {
      const errText = await authGrantRes.text();
      console.error(`[tink-callback] Auth grant error: ${authGrantRes.status} ${errText}`);
      return NextResponse.redirect(`${origin}/?bank_error=auth_grant_failed`);
    }
    const { code: userAuthCode } = await authGrantRes.json();

    // 3. Exchange code for user access token
    const userTokenRes = await fetch(`${TINK_BASE}/api/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: userAuthCode,
      }),
    });

    if (!userTokenRes.ok) {
      const errText = await userTokenRes.text();
      console.error(`[tink-callback] User token exchange error: ${userTokenRes.status} ${errText}`);
      return NextResponse.redirect(`${origin}/?bank_error=user_token_failed`);
    }
    const { access_token: userToken } = await userTokenRes.json();

    // 4. Fetch accounts
    const accountsRes = await fetch(`${TINK_BASE}/api/v1/accounts`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    if (!accountsRes.ok) {
      const errText = await accountsRes.text();
      console.error(`[tink-callback] Accounts fetch error: ${accountsRes.status} ${errText}`);
      return NextResponse.redirect(`${origin}/?bank_error=accounts_failed`);
    }

    const accountsData = await accountsRes.json();
    const accounts: Array<Record<string, unknown>> = accountsData.accounts ?? [];

    console.log(`[tink-callback] Found ${accounts.length} account(s) for user ${tinkUserId}`);

    if (accounts.length === 0) {
      await prisma.bankConnection.update({
        where: { id: parentConn.id },
        data: { status: "error" },
      });
      return NextResponse.redirect(`${origin}/?bank_error=no_accounts`);
    }

    // 5. Update/create BankConnection for each account
    let realAccountsCreated = 0;

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const accountId = account.id as string;
      const accountNumber =
        (account.accountNumber as string) ??
        (account.iban as string) ??
        ((account.identifiers as Record<string, unknown>)?.iban as string) ??
        null;
      const accountName =
        (account.name as string) ??
        accountNumber ??
        `Account ${i + 1}`;

      console.log(
        `[tink-callback] Account ${accountId}: number=${accountNumber ?? "---"} name=${accountName}`
      );

      if (i === 0) {
        // Update parent connection for the first account
        await prisma.bankConnection.update({
          where: { id: parentConn.id },
          data: {
            accountName: accountNumber || accountName,
            accountExternalId: accountId,
            accessToken: userToken,
            status: "connected",
            lastSynced: new Date(),
          },
        });
        console.log(`[tink-callback] Updated parent connection ${parentConn.id}`);
      } else {
        // Create a new row for additional accounts — inherit userId from parent
        await prisma.bankConnection.create({
          data: {
            bankName: parentConn.bankName,
            accountName: accountNumber || accountName,
            country: parentConn.country,
            provider: "tink",
            institutionId: parentConn.institutionId,
            externalId: tinkUserId,
            accessToken: userToken,
            accountExternalId: accountId,
            status: "connected",
            lastSynced: new Date(),
            userId: auth.userId,
          },
        });
        console.log(`[tink-callback] Created new connection for additional account ${accountId}`);
      }

      realAccountsCreated++;
    }

    if (realAccountsCreated === 0) {
      await prisma.bankConnection.update({
        where: { id: parentConn.id },
        data: { status: "error" },
      });
      return NextResponse.redirect(`${origin}/?bank_error=no_valid_accounts`);
    }

    console.log(`[tink-callback] Done -- ${realAccountsCreated} account(s) saved`);
    return NextResponse.redirect(`${origin}/?bank_connected=1`);
  } catch (err) {
    console.error("[tink-callback] Unexpected error:", err);
    return NextResponse.redirect(`${origin}/?bank_error=internal`);
  }
}
