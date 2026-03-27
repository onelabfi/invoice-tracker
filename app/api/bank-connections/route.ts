import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    /**
     * Only return connections that are genuinely usable:
     *  - status = "connected"  (not pending/error/disconnected)
     *  - Nordigen: must have accountName (IBAN/BBAN) AND accountExternalId
     *    so we never surface dummy/pending requisitions in the UI
     *  - CSV / manual / plaid: always show when connected
     */
    const connections = await prisma.bankConnection.findMany({
      where: {
        userId: auth.userId,
        status: "connected",
        OR: [
          { provider: { in: ["csv", "manual", "plaid"] } },
          {
            provider: "nordigen",
            accountName:       { not: null },
            accountExternalId: { not: null },
          },
          {
            provider: "tink",
            accountName:       { not: null },
            accountExternalId: { not: null },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(connections);
  } catch (error) {
    console.error("Failed to fetch bank connections:", error);
    return NextResponse.json(
      { error: "Failed to fetch bank connections" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bank-connections?id=xxx  — delete one connection
 * DELETE /api/bank-connections?all=demo — delete all demo/orphan connections
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const id = request.nextUrl.searchParams.get("id");
    const all = request.nextUrl.searchParams.get("all");

    if (id) {
      // Verify ownership before deleting
      const conn = await prisma.bankConnection.findFirst({
        where: { id, userId: auth.userId },
        select: { id: true },
      });
      if (!conn) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      await prisma.transaction.deleteMany({ where: { connectionId: id } });
      await prisma.bankConnection.delete({ where: { id } });
      return NextResponse.json({ deleted: id });
    }

    if (all === "demo") {
      // Delete this user's orphan connections
      const orphans = await prisma.bankConnection.findMany({
        where: {
          userId: auth.userId,
          OR: [
            { status: { not: "connected" } },
            { provider: "nordigen", accountExternalId: null },
            { provider: "tink", accountExternalId: null },
          ],
        },
      });
      for (const o of orphans) {
        await prisma.transaction.deleteMany({ where: { connectionId: o.id } });
        await prisma.bankConnection.delete({ where: { id: o.id } });
      }
      return NextResponse.json({ deleted: orphans.length, ids: orphans.map((o) => o.id) });
    }

    return NextResponse.json({ error: "Provide ?id=xxx or ?all=demo" }, { status: 400 });
  } catch (error) {
    console.error("Failed to delete bank connection:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { bankName, accountName } = body;

    if (!bankName || !accountName) {
      return NextResponse.json(
        { error: "bankName and accountName are required" },
        { status: 400 }
      );
    }

    const connection = await prisma.bankConnection.create({
      data: {
        bankName,
        accountName,
        status: "connected",
        lastSynced: new Date(),
        userId: auth.userId,
      },
    });

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error("Failed to create bank connection:", error);
    return NextResponse.json(
      { error: "Failed to create bank connection" },
      { status: 500 }
    );
  }
}
