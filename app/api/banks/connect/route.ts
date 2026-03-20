import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TINK_BASE = "https://api.tink.com";
const TINK_LINK_ACTOR_CLIENT_ID = "df05e4b379934cd09963197cc855bfe9";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { institutionId, institutionName, country, provider, iban } = body as {
      institutionId: string;
      institutionName: string;
      country: string;
      provider: "nordigen" | "tink" | "plaid" | "csv" | "truelayer";
      iban?: string;
    };

    if (!institutionName || !country) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // For Tink (European Open Banking) — preferred over Nordigen when credentials exist
    if (
      (provider === "nordigen" || provider === "tink") &&
      process.env.TINK_CLIENT_ID &&
      process.env.TINK_CLIENT_SECRET
    ) {
      try {
        const origin = request.nextUrl.origin;

        // 1. Get client access token
        const tokenRes = await fetch(`${TINK_BASE}/api/v1/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.TINK_CLIENT_ID,
            client_secret: process.env.TINK_CLIENT_SECRET,
            scope: "authorization:grant,user:create,user:read,credentials:read,credentials:write",
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          throw new Error(`Tink token error ${tokenRes.status}: ${errText}`);
        }
        const { access_token: clientToken } = await tokenRes.json();

        // 2. Create a unique Tink user
        const externalUserId = `ricordo-${Date.now()}`;
        const userRes = await fetch(`${TINK_BASE}/api/v1/user/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${clientToken}`,
          },
          body: JSON.stringify({
            external_user_id: externalUserId,
            market: country,
            locale: "en_US",
          }),
        });

        if (!userRes.ok) {
          const errText = await userRes.text();
          throw new Error(`Tink user create error ${userRes.status}: ${errText}`);
        }
        const { user_id: tinkUserId } = await userRes.json();

        // 3. Generate authorization code for Tink Link
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
                "user:read,identity:read,authorization:read,credentials:read,credentials:write,providers:read,accounts:read,balances:read,transactions:read",
            }),
          }
        );

        if (!authGrantRes.ok) {
          const errText = await authGrantRes.text();
          throw new Error(`Tink auth grant error ${authGrantRes.status}: ${errText}`);
        }
        const { code: authCode } = await authGrantRes.json();

        // 4. Build Tink Link URL
        // Use account-check for sandbox compatibility; works for production too
        const tinkLinkUrl =
          `https://link.tink.com/1.0/account-check/one-time` +
          `?client_id=${process.env.TINK_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(`${origin}/api/banks/tink/callback`)}` +
          `&authorization_code=${authCode}` +
          `&market=${country}`;

        // 5. Save BankConnection with provider="tink"
        const connection = await prisma.bankConnection.create({
          data: {
            bankName: institutionName,
            accountName: iban || null,
            country,
            provider: "tink",
            institutionId: institutionId || null,
            externalId: tinkUserId,
            accessToken: clientToken,
            status: "pending",
          },
        });

        return NextResponse.json({
          connection,
          authUrl: tinkLinkUrl,
          provider: "tink",
        });
      } catch (err) {
        console.error("Tink connection error:", err);
        // Fall through to Nordigen or demo mode
      }
    }

    // For Nordigen (European Open Banking) — fallback if Tink not configured
    if (provider === "nordigen" && process.env.NORDIGEN_SECRET_ID && process.env.NORDIGEN_SECRET_KEY) {
      try {
        // Get access token
        const tokenRes = await fetch("https://bankaccountdata.gocardless.com/api/v2/token/new/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret_id: process.env.NORDIGEN_SECRET_ID,
            secret_key: process.env.NORDIGEN_SECRET_KEY,
          }),
        });

        if (!tokenRes.ok) throw new Error("Failed to get Nordigen token");
        const { access } = await tokenRes.json();

        // Create end-user agreement
        const agreementRes = await fetch(
          "https://bankaccountdata.gocardless.com/api/v2/agreements/enduser/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access}`,
            },
            body: JSON.stringify({
              institution_id: institutionId,
              max_historical_days: 90,
              access_valid_for_days: 90,
              access_scope: ["balances", "details", "transactions"],
            }),
          }
        );

        const agreement = agreementRes.ok ? await agreementRes.json() : null;

        // Create requisition (bank connection link)
        const reqRes = await fetch(
          "https://bankaccountdata.gocardless.com/api/v2/requisitions/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access}`,
            },
            body: JSON.stringify({
              redirect: `${request.nextUrl.origin}/api/banks/callback`,
              institution_id: institutionId,
              agreement: agreement?.id,
              user_language: country.toLowerCase(),
            }),
          }
        );

        if (!reqRes.ok) throw new Error("Failed to create requisition");
        const requisition = await reqRes.json();

        // Save connection (pending auth)
        const connection = await prisma.bankConnection.create({
          data: {
            bankName: institutionName,
            accountName: iban || null,
            country,
            provider: "nordigen",
            institutionId,
            externalId: requisition.id,
            accessToken: access,
            status: "pending",
          },
        });

        return NextResponse.json({
          connection,
          authUrl: requisition.link,
          provider: "nordigen",
        });
      } catch (err) {
        console.error("Nordigen connection error:", err);
        // Fall through to demo mode
      }
    }

    // For Plaid (US banks)
    if (provider === "plaid" && process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
      try {
        const plaidEnv = process.env.PLAID_ENV || "sandbox";
        const plaidUrl = plaidEnv === "production"
          ? "https://production.plaid.com"
          : plaidEnv === "development"
          ? "https://development.plaid.com"
          : "https://sandbox.plaid.com";

        // Create link token
        const linkRes = await fetch(`${plaidUrl}/link/token/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: process.env.PLAID_CLIENT_ID,
            secret: process.env.PLAID_SECRET,
            user: { client_user_id: "ricordo-user" },
            client_name: "Ricordo",
            products: ["transactions"],
            country_codes: ["US"],
            language: "en",
          }),
        });

        if (!linkRes.ok) throw new Error("Failed to create Plaid link token");
        const { link_token } = await linkRes.json();

        const connection = await prisma.bankConnection.create({
          data: {
            bankName: institutionName,
            country: "US",
            provider: "plaid",
            institutionId,
            status: "pending",
          },
        });

        return NextResponse.json({
          connection,
          linkToken: link_token,
          provider: "plaid",
        });
      } catch (err) {
        console.error("Plaid connection error:", err);
        // Fall through to demo mode
      }
    }

    // For TrueLayer (European Open Banking — Data API only)
    if (
      provider === "truelayer" &&
      process.env.TRUELAYER_CLIENT_ID
    ) {
      try {
        const origin = request.nextUrl.origin;
        const redirectUri = `${origin}/api/banks/truelayer/callback`;

        const params = new URLSearchParams({
          response_type: "code",
          client_id: process.env.TRUELAYER_CLIENT_ID,
          scope: "info accounts balance transactions",
          redirect_uri: redirectUri,
          providers: "mock",
        });

        const authUrl = `https://auth.truelayer-sandbox.com/?${params}`;

        const connection = await prisma.bankConnection.create({
          data: {
            bankName: institutionName,
            accountName: iban || null,
            country,
            provider: "truelayer",
            institutionId: institutionId || null,
            status: "pending",
          },
        });

        return NextResponse.json({
          connection,
          authUrl,
          provider: "truelayer",
        });
      } catch (err) {
        console.error("TrueLayer connection error:", err);
        // Fall through to demo mode
      }
    }

    // Demo / CSV fallback mode — create connection immediately as "connected"
    const connection = await prisma.bankConnection.create({
      data: {
        bankName: institutionName,
        accountName: provider === "csv" ? "CSV Import" : iban || null,
        country,
        provider: provider || "manual",
        institutionId: institutionId || null,
        status: "connected",
      },
    });

    return NextResponse.json({
      connection,
      provider: provider || "manual",
      // No authUrl = direct connection (demo mode or CSV)
    });
  } catch (error) {
    console.error("Bank connect error:", error);
    return NextResponse.json(
      { error: "Failed to connect bank" },
      { status: 500 }
    );
  }
}
