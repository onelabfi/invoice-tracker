import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { institutionId, institutionName, country, provider } = body as {
      institutionId: string;
      institutionName: string;
      country: string;
      provider: "nordigen" | "plaid" | "csv";
    };

    if (!institutionName || !country) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // For Nordigen (European Open Banking)
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

    // Demo / CSV fallback mode — create connection immediately as "connected"
    const connection = await prisma.bankConnection.create({
      data: {
        bankName: institutionName,
        accountName: provider === "csv" ? "CSV Import" : null,
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
