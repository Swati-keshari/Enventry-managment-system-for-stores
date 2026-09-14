import { Redis } from "@upstash/redis";

// ─── Idempotency Key Store (Prompt 09) ────────────────────────────────
//
// Prevents duplicate operations by caching responses keyed by
// an Idempotency-Key header. Critical for offline queue retry.

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  redis = new Redis({ url, token });
  return redis;
}

// ─── In-Memory Fallback ───────────────────────────────────────────────

const memoryStore = new Map<string, { response: unknown; status: number; timestamp: number }>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      memoryStore.delete(key);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────

export interface StoredResponse {
  status: number;
  body: unknown;
}

/**
 * Get a stored idempotency response.
 * Returns null if no response exists for this key.
 */
export async function getIdempotencyResponse(
  key: string,
): Promise<StoredResponse | null> {
  const redisClient = getRedis();

  if (!redisClient) {
    // In-memory fallback
    cleanupMemoryStore();
    const entry = memoryStore.get(key);
    if (!entry) return null;
    return { status: entry.status, body: entry.response };
  }

  const stored = await redisClient.get<StoredResponse>(`idempotency:${key}`);
  return stored;
}

/**
 * Store an idempotency response.
 * @param key - The Idempotency-Key header value
 * @param status - HTTP status code
 * @param body - Response body
 */
export async function storeIdempotencyResponse(
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  const redisClient = getRedis();
  const ttlSeconds = 24 * 60 * 60; // 24 hours

  const data: StoredResponse = { status, body };

  if (!redisClient) {
    // In-memory fallback
    cleanupMemoryStore();
    memoryStore.set(key, { response: body, status, timestamp: Date.now() });
    return;
  }

  await redisClient.set(`idempotency:${key}`, data, { ex: ttlSeconds });
}

/**
 * Extract idempotency key from request headers.
 * Returns null if not present.
 */
export function getIdempotencyKey(request: Request): string | null {
  return request.headers.get("idempotency-key");
}

/**
 * Higher-order wrapper for route handlers.
 * Wraps a POST handler with idempotency support.
 */
export async function withIdempotency(
  key: string | null,
  handler: () => Promise<Response>,
): Promise<Response> {
  if (!key) return handler();

  // Check for existing response
  const existing = await getIdempotencyResponse(key);
  if (existing) {
    return Response.json(existing.body, { status: existing.status });
  }

  // Execute handler
  const response = await handler();
  const body = await response.json().catch(() => ({}));

  // Store response (only for success responses)
  if (response.status >= 200 && response.status < 300) {
    await storeIdempotencyResponse(key, response.status, body);
  }

  return Response.json(body, { status: response.status });
}
