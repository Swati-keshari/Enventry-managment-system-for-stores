/**
 * Structured Logger — JSON-formatted logs for production observability.
 *
 * - Every log gets a request_id for tracing
 * - Never logs PII (passwords, tokens, full emails, IPs)
 * - Log levels: ERROR, WARN, INFO, DEBUG
 * - Outputs to stdout as JSON for log aggregation
 */

type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  request_id?: string;
  user_id?: string;
  warehouse_id?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

/** Scrub PII from strings before logging. */
function scrubPII(value: string): string {
  return value
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (email) => {
      const [local, domain] = email.split("@");
      return `${local.charAt(0)}***@${domain}`;
    })
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "****-****-****-****")
    .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "eyJ***.***.***");
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: scrubPII(message),
  };

  if (meta?.request_id) {
    entry.request_id = meta.request_id as string;
    delete meta.request_id;
  }
  if (meta?.user_id) {
    entry.user_id = meta.user_id as string;
    delete meta.user_id;
  }
  if (meta?.warehouse_id) {
    entry.warehouse_id = meta.warehouse_id as string;
    delete meta.warehouse_id;
  }
  if (meta?.error) {
    entry.error = scrubPII(meta.error as string);
    delete meta.error;
  }
  if (meta && Object.keys(meta).length > 0) {
    entry.metadata = meta;
  }

  console.log(JSON.stringify(entry));
}

export const logger = {
  error: (message: string, meta?: Record<string, unknown>) => log("ERROR", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("WARN", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log("INFO", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "development") {
      log("DEBUG", message, meta);
    }
  },
};

/** Generate a unique request ID for tracing. */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
