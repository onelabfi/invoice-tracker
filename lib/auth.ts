import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type AuthSuccess = { ok: true; userId: string; supabaseId: string; email: string };
export type AuthFailure = { ok: false; response: NextResponse };
export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Validates the Supabase session JWT from cookies and returns the Prisma user ID.
 * Upserts the Prisma User record on first call so it always exists.
 *
 * Usage in a route handler:
 *   const auth = await requireAuth();
 *   if (!auth.ok) return auth.response;
 *   // auth.userId is now safe to use
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Upsert so any valid Supabase auth user always has a Prisma record
  const prismaUser = await prisma.user.upsert({
    where: { email: user.email },
    update: { supabaseId: user.id },
    create: {
      email: user.email,
      name: user.email.split("@")[0],
      supabaseId: user.id,
    },
    select: { id: true, email: true },
  });

  return { ok: true, userId: prismaUser.id, supabaseId: user.id, email: prismaUser.email };
}
