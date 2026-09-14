// ─── Centralized Error Handling (Prompt 11) ───────────────────────────

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(field: string, issue: string) {
    super("validation_error", `${field}: ${issue}`, 400);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("not_found", `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", message, 409);
    this.name = "ConflictError";
  }
}

export class PermissionError extends AppError {
  constructor(message = "You don't have permission for this action.") {
    super("permission_denied", message, 403);
    this.name = "PermissionError";
  }
}

// ─── Database Error Mapping ───────────────────────────────────────────

export function mapDbError(error: { code?: string; message?: string }): AppError {
  const code = error.code ?? "";

  // Connection / timeout errors (retryable)
  if (code === "57P01" || code === "57P02" || code === "57P03" || code === "08006" || code === "08001" || code === "08003") {
    return new AppError(
      "connection_error",
      "Data save slow, please wait...",
      503,
      true,
    );
  }

  // Unique violation
  if (code === "23505") {
    const msg = error.message ?? "";
    if (msg.includes("do_number")) {
      return new ConflictError("Entry number already exists. Use a different number.");
    }
    if (msg.includes("email")) {
      return new ConflictError("Email already registered.");
    }
    if (msg.includes("items") || msg.includes("name")) {
      return new ConflictError("Name already exists in this store.");
    }
    return new ConflictError("A record with this value already exists.");
  }

  // Foreign key violation
  if (code === "23503") {
    if (error.message?.includes("do_items")) {
      return new ConflictError("Cannot delete item — it is in use by entries.");
    }
    return new NotFoundError("Referenced record");
  }

  // Check constraint violation
  if (code === "23514") {
    return new ValidationError("field", "Invalid value");
  }

  // RLS policy violation
  if (code === "42501" || error.message?.includes("row-level security")) {
    return new PermissionError();
  }

  return new AppError("database_error", error.message ?? "Database error", 500);
}

// ─── Retry Logic ──────────────────────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (e instanceof AppError && e.retryable && i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// ─── API Response Helpers ─────────────────────────────────────────────

export function jsonError(message: string, status: number, code?: string) {
  return Response.json(
    { error: code ?? "error", message },
    { status },
  );
}

function summarizeUnknownError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";

  const withResponse = error as Error & {
    response?: { data?: { error?: string; error_description?: string }; status?: number };
    code?: string | number;
    status?: number;
  };
  const data = withResponse.response?.data;
  return [
    withResponse.message,
    data?.error,
    data?.error_description,
    withResponse.code != null ? `code=${withResponse.code}` : null,
    withResponse.status != null ? `status=${withResponse.status}` : null,
    data ? null : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function isPostgrestLike(error: unknown): error is { code?: string; message?: string } {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error ? error.message : undefined;
  if (typeof message !== "string" || !message) return false;
  const code = "code" in error ? error.code : undefined;
  if (typeof code === "string" && (/^\d{5}$/.test(code) || code.startsWith("PGRST"))) {
    return true;
  }
  return (
    message.includes("row-level security") ||
    message.includes("violates foreign key") ||
    message.includes("duplicate key")
  );
}

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    const body = {
      error: error.code,
      message: error.message,
    };
    return Response.json(body, { status: error.statusCode });
  }

  if (isPostgrestLike(error)) {
    return handleApiError(mapDbError(error));
  }

  // Avoid logging full Google client payloads (can include refresh tokens).
  console.error("Unhandled API error:", summarizeUnknownError(error));
  return Response.json(
    { error: "internal_error", message: "Something went wrong." },
    { status: 500 },
  );
}
