import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * TrueLayer OAuth callback.
 *
 * After the user authorises in TrueLayer they are redirected here:
 *   GET /api/banks/truelayer/callback?code=xxx
 *
 * Flow:
 *  1. Exchange code for access token
 *  2. Fetch accounts from TrueLayer Data API
 *  3. Update BankConnection(s) with account info
 *  4. Redirect to /?bank_connected=1
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const origin = request.nextUrl.origin;

  if (error) {
    console.error("[truelayer-callback] Auth error:", error);
    return NextResponse.redirect(`${origin}/?bank_error=${error}`);
  }

  if (!code) {
    console.error("[truelayer-callback] Missing code parameter");
    return NextResponse.redirect(`${origin}/?bank_error=missing_code`);
  }

  try {
    const clientId = process.env.TRUELAYER_CLIENT_ID;
    const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("[truelayer-callback] Missing TRUELAYER_CLIENT_ID or TRUELAYER_CLIENT_SECRET");
      return NextResponse.redirect(`${origin}/?bank_error=missing_truelayer_config`);
    }

    // Find the most recent pending TrueLayer connection
    const parentConn = await prisma.bankConnection.findFirst({
      where: { provider: "truelayer", status: "pending" },
      orderBy: { createdAt: "desc" },
    });

    if (!parentConn) {
      console.error("[truelayer-callback] No pending TrueLayer BankConnection found");
      return NextResponse.redirect(`${origin}/?bank_error=connection_not_found`);
    }

    // 1. Exchange code for access token
    const redirectUri = `${origin}/api/banks/truelayer/callback`;
    const tokenRes = await fetch("https://auth.truelayer-sandbox.com/connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[truelayer-callback] Token exchange error: ${tokenRes.status} ${errText}`);
      return NextResponse.redirect(`${origin}/?bank_error=token_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;
    const refreshToken: string | null = tokenData.refresh_token ?? null;

    // 2. Fetch accounts
    const accountsRes = await fetch("https://api.truelayer-sandbox.com/data/v1/accounts", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!accountsRes.ok) {
      const errText = await accountsRes.text();
      console.error(`[truelayer-callback] Accounts fetch error: ${accountsRes.status} ${errText}`);
      return NextResponse.redirect(`${origin}/?bank_error=accounts_failed`);
    }

    const accountsData = await accountsRes.json();
    const accounts: Array<Record<string, unknown>> = accountsData.results ?? [];

    console.log(`[truelayer-callback] Found ${accounts.length} account(s)`);

    if (accounts.length === 0) {
      await prisma.bankConnection.update({
        where: { id: parentConn.id },
        data: { status: "error" },
      });
      return NextResponse.redirect(`${origin}/?bank_error=no_accounts`);
    }

    // 3. Update/create BankConnection for each account
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const accountId = account.account_id as string;
      const accountName =
        (account.display_name as string) ??
        (account.account_number as Record<string, string> | undefined)?.iban ??
        `Account ${i + 1}`;

      if (i === 0) {
        await prisma.bankConnection.update({
          where: { id: parentConn.id },
          data: {
            accountName,
            accountExternalId: accountId,
            accessToken,
            externalId: refreshToken,
            status: "connected",
            lastSynced: new Date(),
          },
        });
      } else {
        await prisma.bankConnection.create({
          data: {
            bankName: parentConn.bankName,
            accountName,
            country: parentConn.country,
            provider: "truelayer",
            institutionId: parentConn.institutionId,
            accountExternalId: accountId,
            accessToken,
            externalId: refreshToken,
            status: "connected",
            lastSynced: new Date(),
          },
        });
      }
    }

    console.log(`[truelayer-callback] Done — ${accounts.length} account(s) saved`);
    return NextResponse.redirect(`${origin}/?bank_connected=1`);
  } catch (err) {
    console.error("[truelayer-callback] Unexpected error:", err);
    return NextResponse.redirect(`${origin}/?bank_error=internal`);
  }
}
