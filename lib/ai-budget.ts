import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Hard limits per user per UTC calendar day
const DAILY_REQUEST_LIMIT = 50;
const DAILY_TOKEN_LIMIT = 100_000; // ~$0.30 at claude-sonnet pricing

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

function dateKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function reqKey(userId: string): string {
  return `ai:req:${userId}:${dateKey()}`;
}

function tokKey(userId: string): string {
  return `ai:tok:${userId}:${dateKey()}`;
}

const TTL_SECONDS = 60 * 60 * 26; // 26 hours — covers end-of-day timezone edge cases

/**
 * Check whether this user can make another AI request today.
 * Returns ok:true when Redis is not configured (graceful degradation).
 */
export async function checkAiBudget(
  userId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const r = getRedis();
  if (!r) return { ok: true }; // no Redis — allow through silently

  const [reqCount, tokCount] = await Promise.all([
    r.get<number>(reqKey(userId)),
    r.get<number>(tokKey(userId)),
  ]);

  if ((reqCount ?? 0) >= DAILY_REQUEST_LIMIT) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Daily AI limit reached (${DAILY_REQUEST_LIMIT} questions/day). Resets at midnight UTC.`,
          code: "AI_DAILY_LIMIT",
        },
        { status: 429 }
      ),
    };
  }

  if ((tokCount ?? 0) >= DAILY_TOKEN_LIMIT) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Daily AI token limit reached. Resets at midnight UTC.",
          code: "AI_TOKEN_LIMIT",
        },
        { status: 429 }
      ),
    };
  }

  return { ok: true };
}

/**
 * Record a completed AI request's token usage.
 * Called AFTER the Claude response — fire and forget, never throws.
 */
export function recordAiUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number
): void {
  const r = getRedis();
  if (!r) return;

  const total = inputTokens + outputTokens;

  Promise.all([
    r.incr(reqKey(userId)).then((count) => {
      if (count === 1) r.expire(reqKey(userId), TTL_SECONDS);
    }),
    r.incrby(tokKey(userId), total).then((count) => {
      if (count === total) r.expire(tokKey(userId), TTL_SECONDS); // first write → set TTL
    }),
  ]).catch((err) => {
    console.error(JSON.stringify({ type: "ai_budget_write_failed", err: String(err) }));
  });
}

/**
 * Return current usage for a user (for debugging / admin queries).
 */
export async function getAiUsage(
  userId: string
): Promise<{ requests: number; tokens: number }> {
  const r = getRedis();
  if (!r) return { requests: 0, tokens: 0 };

  const [req, tok] = await Promise.all([
    r.get<number>(reqKey(userId)),
    r.get<number>(tokKey(userId)),
  ]);

  return { requests: req ?? 0, tokens: tok ?? 0 };
}
