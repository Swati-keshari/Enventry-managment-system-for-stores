/**
 * Get the correct app URL for redirects and callbacks.
 * Works in both development and production environments.
 */
const PRODUCTION_ORIGIN = "https://enventry-managment-system-for-store.vercel.app";

function firstHeader(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  return raw.split(",")[0]?.trim() || null;
}

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_ORIGIN;
  }
  return "http://localhost:3000";
}

/**
 * Origin Google OAuth must see. Ignore Vercel aliases and request.url
 * (`http://` / `*.vercel.app`) so the redirect always matches the
 * Enventry Web client.
 */
export function getOAuthOrigin(request: Request): string {
  const host =
    firstHeader(request, "x-forwarded-host") ?? firstHeader(request, "host") ?? "";
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  if (isLocal) {
    const proto = firstHeader(request, "x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  }
  return PRODUCTION_ORIGIN;
}

export function getRedirectUrl(path: string = "/auth/callback"): string {
  const baseUrl = getAppUrl();
  return `${baseUrl}${path}`;
}

export function getAppUrlFromRequest(request: Request): string {
  return getOAuthOrigin(request);
}

export function getRedirectUrlFromRequest(request: Request, path: string = "/auth/callback"): string {
  const baseUrl = getAppUrlFromRequest(request);
  return `${baseUrl}${path}`;
}
