import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

const TTL = 60 * 60 * 24; // 24 hours — idempotency window

/**
 * Check and lock an idempotency key for a given user.
 *
 * Returns:
 *   { ok: true }              — first time this key is seen, proceed normally
 *   { ok: false, response }   — duplicate request, return the cached response
 *   { ok: true }              — Redis not configured, skip silently (safe default)
 *
 * Usage:
 *   const idem = await checkIdempotency(auth.userId, request.headers.get("Idempotency-Key"));
 *   if (!idem.ok) return idem.response;
 *   // ... do the operation ...
 *   await setIdempotencyResult(auth.userId, key, result);
 */
export async function checkIdempotency(
  userId: string,
  key: string | null
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!key) return { ok: true }; // no key provided — skip idempotency (backward compat)
  const r = getRedis();
  if (!r) return { ok: true }; // no Redis — skip silently

  const cacheKey = `idem:${userId}:${key}`;
  const existing = await r.get<string>(cacheKey);

  if (existing) {
    // Return the original response from cache
    try {
      const cached = JSON.parse(existing) as { status: number; body: unknown };
      return {
        ok: false,
        response: NextResponse.json(cached.body, { status: cached.status }),
      };
    } catch {
      // Corrupt cache entry — let the request proceed
      return { ok: true };
    }
  }

  // Reserve the key immediately to prevent concurrent duplicate requests
  await r.set(cacheKey, JSON.stringify({ status: 202, body: { pending: true } }), { ex: TTL });
  return { ok: true };
}

/**
 * Store the final response body against the idempotency key.
 * Call this AFTER the operation succeeds.
 * Fire-and-forget — never throws.
 */
export function setIdempotencyResult(
  userId: string,
  key: string | null,
  body: unknown,
  status = 201
): void {
  if (!key) return;
  const r = getRedis();
  if (!r) return;

  const cacheKey = `idem:${userId}:${key}`;
  r.set(cacheKey, JSON.stringify({ status, body }), { ex: TTL }).catch(() => {});
}
