import { prisma } from "@/lib/prisma";
import { Redis } from "@upstash/redis";

// All valid audit actions — extend as needed
export type AuditAction =
  | "CREATE_INVOICE"
  | "UPDATE_INVOICE"
  | "DELETE_INVOICE"
  | "UPLOAD_FILE"
  | "CONNECT_BANK"
  | "DISCONNECT_BANK"
  | "SYNC_BANK"
  | "OAUTH_CALLBACK_SUCCESS"
  | "OAUTH_CALLBACK_INVALID_STATE"
  | "ASK_AI"
  | "EXPORT_DATA"
  | "RATE_LIMIT_HIT"
  | "AUTH_FAILURE"
  | "SUSPICIOUS_ACTIVITY";

interface AuditPayload {
  userId?: string;
  action: AuditAction;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// Reuse existing Upstash Redis for pattern detection — no new infrastructure
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

// Actions that emit an immediate console.warn alert
const ALERT_ACTIONS = new Set<AuditAction>([
  "RATE_LIMIT_HIT",
  "DELETE_INVOICE",
  "AUTH_FAILURE",
  "OAUTH_CALLBACK_INVALID_STATE",
  "SUSPICIOUS_ACTIVITY",
]);

// Token threshold above which an ASK_AI call triggers an alert
const HIGH_TOKEN_THRESHOLD = 5_000;

/**
 * Emit a structured alert to stderr. Never throws.
 */
function emitAlert(payload: AuditPayload, reason?: string): void {
  try {
    console.warn(
      JSON.stringify({
        type: "ALERT",
        action: payload.action,
        reason: reason ?? payload.action,
        userId: payload.userId ?? null,
        ip: payload.ip ?? null,
        ts: new Date().toISOString(),
        metadata: payload.metadata ?? null,
      })
    );
  } catch {
    // never throws
  }
}

/**
 * Detect repeated RATE_LIMIT_HIT from the same IP within 60 seconds.
 * Uses Redis incr — silently skipped if Redis is not configured.
 */
function detectSuspiciousPattern(payload: AuditPayload): void {
  if (payload.action !== "RATE_LIMIT_HIT" || !payload.ip) return;
  const r = getRedis();
  if (!r) return;

  const key = `suspect:ip:${payload.ip}`;
  r.incr(key)
    .then((count) => {
      if (count === 1) r.expire(key, 60); // TTL only set on first hit
      if (count >= 5) {
        emitAlert(payload, `IP hit rate limit ${count}x in 60s`);
        // Log a SUSPICIOUS_ACTIVITY record (separate write, still fire-and-forget)
        prisma.auditLog
          .create({
            data: {
              userId: payload.userId ?? null,
              action: "SUSPICIOUS_ACTIVITY",
              ip: payload.ip ?? null,
              metadata: JSON.stringify({ trigger: "RATE_LIMIT_HIT", count }),
            },
          })
          .catch(() => {});
      }
    })
    .catch(() => {}); // never throws
}

/**
 * Fire-and-forget audit log write.
 * Never awaited — never blocks the response.
 * Never throws — a logging failure must not break the request.
 */
export function logAudit(payload: AuditPayload): void {
  // Immediate alert for high-signal actions
  if (ALERT_ACTIONS.has(payload.action)) {
    emitAlert(payload);
  }

  // Alert on abnormally high AI token usage
  if (payload.action === "ASK_AI" && payload.metadata) {
    const tokens =
      ((payload.metadata.inputTokens as number) ?? 0) +
      ((payload.metadata.outputTokens as number) ?? 0);
    if (tokens > HIGH_TOKEN_THRESHOLD) {
      emitAlert(payload, `High token usage: ${tokens}`);
    }
  }

  // Suspicious pattern detection (async, never blocks)
  detectSuspiciousPattern(payload);

  // Persist to DB
  prisma.auditLog
    .create({
      data: {
        userId: payload.userId ?? null,
        action: payload.action,
        resourceId: payload.resourceId ?? null,
        ip: payload.ip ?? null,
        userAgent: payload.userAgent ?? null,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      },
    })
    .catch((err) => {
      console.error(
        JSON.stringify({ type: "audit_write_failed", action: payload.action, err: String(err) })
      );
    });
}

/** Pull IP + UA from a NextRequest for audit logging */
export function requestMeta(request: Request): { ip: string; userAgent: string } {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? "unknown",
  };
}
