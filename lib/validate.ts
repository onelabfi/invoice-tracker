import { z } from "zod";
import { NextResponse } from "next/server";

export function validate<T extends z.ZodType>(
  schema: T,
  data: unknown
): { ok: true; data: z.infer<T> } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation failed", issues: result.error.flatten().fieldErrors },
        { status: 422 }
      ),
    };
  }
  return { ok: true, data: result.data };
}
