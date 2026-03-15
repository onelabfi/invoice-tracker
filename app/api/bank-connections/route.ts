import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const connections = await prisma.bankConnection.findMany({
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

export async function POST(request: NextRequest) {
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
