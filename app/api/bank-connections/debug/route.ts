import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/bank-connections/debug — list ALL connections (including pending/error) */
export async function GET() {
  const connections = await prisma.bankConnection.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(connections);
}
