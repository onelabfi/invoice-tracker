import { NextResponse } from "next/server";

/**
 * Centralized API error handler.
 *
 * - Logs full error internally (Vercel captures console output)
 * - Returns a safe generic message to the client (no stack traces, no internals)
 *
 * Usage:
 *   } catch (error) {
 *     return apiError(error, "invoice.create");
 *   }
 */
export function apiError(
  error: unknown,
  context: string,
  status = 500
): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(
    JSON.stringify({
      type: "api_error",
      context,
      message,
      stack,
      ts: new Date().toISOString(),
    })
  );

  return NextResponse.json(
    { error: "An unexpected error occurred. Please try again." },
    { status }
  );
}
