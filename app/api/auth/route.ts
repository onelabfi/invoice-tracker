import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password === process.env.APP_PASSWORD) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Wrong password" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
