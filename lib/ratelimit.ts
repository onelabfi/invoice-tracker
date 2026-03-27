import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

let limiter: Ratelimit | null = null;

function getLimiter() {
  if (
    !limiter &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    limiter = new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(10, "1 m"),
    });
  }
  return limiter;
}

export async function rateLimit(
  key: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const l = getLimiter();
  if (!l) return { ok: true }; // no Redis configured — skip silently

  const { success, reset } = await l.limit(key);
  if (!success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
          },
        }
      ),
    };
  }
  return { ok: true };
}
