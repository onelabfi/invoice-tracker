import { NextRequest, NextResponse } from "next/server";

// Country → Provider mapping
const COUNTRY_PROVIDERS: Record<string, "nordigen" | "plaid"> = {
  FI: "nordigen", SE: "nordigen", NO: "nordigen", DK: "nordigen",
  GB: "nordigen", IE: "nordigen",
  DE: "nordigen", FR: "nordigen", ES: "nordigen", IT: "nordigen",
  NL: "nordigen", US: "plaid",
};

// Well-known banks per country (used as fallback when API keys are not configured)
const KNOWN_BANKS: Record<string, { id: string; name: string; logo?: string }[]> = {
  FI: [
    { id: "nordea_fi", name: "Nordea" },
    { id: "op_fi", name: "OP" },
    { id: "danske_fi", name: "Danske Bank" },
    { id: "spankki_fi", name: "S-Pankki" },
    { id: "handelsbanken_fi", name: "Handelsbanken" },
    { id: "alandsbanken_fi", name: "Ålandsbanken" },
    { id: "aktia_fi", name: "Aktia" },
    { id: "saastopankki_fi", name: "Säästöpankki" },
    { id: "holvi_fi", name: "Holvi", logo: "holvi" },
  ],
  SE: [
    { id: "nordea_se", name: "Nordea" },
    { id: "seb_se", name: "SEB" },
    { id: "handelsbanken_se", name: "Handelsbanken" },
    { id: "swedbank_se", name: "Swedbank" },
    { id: "danskebank_se", name: "Danske Bank" },
    { id: "lansforsakringar_se", name: "Länsförsäkringar" },
  ],
  NO: [
    { id: "dnb_no", name: "DNB" },
    { id: "nordea_no", name: "Nordea" },
    { id: "sparebank1_no", name: "SpareBank 1" },
    { id: "handelsbanken_no", name: "Handelsbanken" },
    { id: "sbanken_no", name: "Sbanken" },
  ],
  DK: [
    { id: "danskebank_dk", name: "Danske Bank" },
    { id: "nordea_dk", name: "Nordea" },
    { id: "jyskebank_dk", name: "Jyske Bank" },
    { id: "nykredit_dk", name: "Nykredit" },
    { id: "sydbank_dk", name: "Sydbank" },
  ],
  GB: [
    { id: "hsbc_gb", name: "HSBC" },
    { id: "barclays_gb", name: "Barclays" },
    { id: "lloyds_gb", name: "Lloyds Bank" },
    { id: "natwest_gb", name: "NatWest" },
    { id: "santander_gb", name: "Santander UK" },
    { id: "nationwide_gb", name: "Nationwide" },
    { id: "monzo_gb", name: "Monzo" },
    { id: "revolut_gb", name: "Revolut" },
    { id: "starling_gb", name: "Starling Bank" },
  ],
  IE: [
    { id: "aib_ie", name: "AIB" },
    { id: "boi_ie", name: "Bank of Ireland" },
    { id: "ptsb_ie", name: "Permanent TSB" },
    { id: "ulsterbank_ie", name: "Ulster Bank" },
    { id: "revolut_ie", name: "Revolut" },
    { id: "n26_ie", name: "N26" },
  ],
  DE: [
    { id: "deutsche_de", name: "Deutsche Bank" },
    { id: "commerzbank_de", name: "Commerzbank" },
    { id: "sparkasse_de", name: "Sparkasse" },
    { id: "ing_de", name: "ING" },
    { id: "n26_de", name: "N26" },
    { id: "dkb_de", name: "DKB" },
    { id: "comdirect_de", name: "Comdirect" },
  ],
  FR: [
    { id: "bnpparibas_fr", name: "BNP Paribas" },
    { id: "creditagricole_fr", name: "Crédit Agricole" },
    { id: "societegenerale_fr", name: "Société Générale" },
    { id: "creditlyonnais_fr", name: "LCL" },
    { id: "banquepostale_fr", name: "La Banque Postale" },
  ],
  ES: [
    { id: "santander_es", name: "Santander" },
    { id: "bbva_es", name: "BBVA" },
    { id: "caixabank_es", name: "CaixaBank" },
    { id: "sabadell_es", name: "Banco Sabadell" },
    { id: "bankinter_es", name: "Bankinter" },
  ],
  IT: [
    { id: "intesasanpaolo_it", name: "Intesa Sanpaolo" },
    { id: "unicredit_it", name: "UniCredit" },
    { id: "bnl_it", name: "BNL" },
    { id: "mediobanca_it", name: "Mediobanca" },
    { id: "fineco_it", name: "FinecoBank" },
  ],
  NL: [
    { id: "ing_nl", name: "ING" },
    { id: "rabobank_nl", name: "Rabobank" },
    { id: "abnamro_nl", name: "ABN AMRO" },
    { id: "sns_nl", name: "SNS Bank" },
    { id: "bunq_nl", name: "bunq" },
  ],
  US: [
    { id: "chase_us", name: "Chase" },
    { id: "bankofamerica_us", name: "Bank of America" },
    { id: "wellsfargo_us", name: "Wells Fargo" },
    { id: "citi_us", name: "Citi" },
    { id: "usbank_us", name: "U.S. Bank" },
    { id: "capitalone_us", name: "Capital One" },
    { id: "pnc_us", name: "PNC" },
    { id: "tdbank_us", name: "TD Bank" },
  ],
};

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.toUpperCase();

  if (!country) {
    return NextResponse.json({ error: "country parameter required" }, { status: 400 });
  }

  const provider = COUNTRY_PROVIDERS[country];
  if (!provider) {
    return NextResponse.json({ error: "Unsupported country" }, { status: 400 });
  }

  // Try Tink provider API if configured (preferred over Nordigen)
  if (provider === "nordigen" && process.env.TINK_CLIENT_ID && process.env.TINK_CLIENT_SECRET) {
    try {
      // Get client access token
      const tokenRes = await fetch("https://api.tink.com/api/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: process.env.TINK_CLIENT_ID,
          client_secret: process.env.TINK_CLIENT_SECRET,
          scope: "authorization:grant",
        }),
      });

      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json();

        // Fetch providers (institutions) for country from Tink
        const provRes = await fetch(
          `https://api.tink.com/api/v1/providers/${country}?includeTestProviders=true`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );

        if (provRes.ok) {
          const provData = await provRes.json();
          const providers: Array<Record<string, unknown>> = provData.providers ?? [];

          if (providers.length > 0) {
            return NextResponse.json({
              provider: "nordigen", // keep the same provider key for the frontend
              country,
              institutions: providers.map((p) => ({
                id: p.name as string,
                name: p.displayName as string,
                logo: (p.images as Record<string, string> | undefined)?.icon ?? undefined,
              })),
            });
          }
        }
      }
    } catch (err) {
      console.error("Tink API error, falling back:", err);
    }
  }

  // Try live GoCardless/Nordigen API if configured (fallback)
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

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access;

        // Fetch institutions for country
        const instRes = await fetch(
          `https://bankaccountdata.gocardless.com/api/v2/institutions/?country=${country}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (instRes.ok) {
          const institutions = await instRes.json();
          return NextResponse.json({
            provider,
            country,
            institutions: institutions.map((inst: { id: string; name: string; logo: string }) => ({
              id: inst.id,
              name: inst.name,
              logo: inst.logo,
            })),
          });
        }
      }
    } catch (err) {
      console.error("Nordigen API error, falling back to known banks:", err);
    }
  }

  // Fallback to known banks list
  const banks = KNOWN_BANKS[country] || [];
  return NextResponse.json({
    provider,
    country,
    institutions: banks,
  });
}
