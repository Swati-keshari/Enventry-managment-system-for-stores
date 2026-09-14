import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, createServiceClient } from "./supabase";
import { PermissionError } from "./errors";
import { isSuperAdminEmail } from "./super-admin";

// ─── Types ────────────────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "staff";
  warehouseId: string;
  warehouseName: string;
}

export interface AuthIdentity {
  userId: string;
  email: string;
  name: string;
}

export interface SuperAdminIdentity extends AuthIdentity {
  isSuperAdmin: true;
}

// ─── Auth Helpers ─────────────────────────────────────────────────────

/**
 * Verify JWT and return the Supabase Auth identity (no app_users required).
 * Used for onboarding (create warehouse) before the user has a warehouse.
 */
export async function getAuthIdentity(request: Request): Promise<AuthIdentity | null> {
  const supabase = createServerClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  const metaName =
    typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";

  return {
    userId: user.id,
    email: user.email,
    name: metaName || user.email.split("@")[0] || "User",
  };
}

/**
 * Get the authenticated app user (JWT + app_users row).
 */
export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const identity = await getAuthIdentity(request);
  if (!identity) return null;

  const service = createServiceClient();
  const { data: appUser, error: appError } = await service
    .from("app_users")
    .select("user_id, email, name, role, warehouse_id, deleted_at")
    .eq("user_id", identity.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (appError || !appUser) return null;

  const { data: warehouse } = await service
    .from("warehouses")
    .select("name, is_deleted")
    .eq("warehouse_id", appUser.warehouse_id)
    .single();

  if (!warehouse || warehouse.is_deleted) return null;

  return {
    userId: appUser.user_id,
    email: appUser.email,
    name: appUser.name,
    role: appUser.role as "admin" | "manager" | "staff",
    warehouseId: appUser.warehouse_id,
    warehouseName: warehouse.name ?? "Warehouse",
  };
}

/**
 * Require an authenticated user with a warehouse membership.
 */
export async function requireAuth(request: Request): Promise<AuthUser> {
  const identity = await getAuthIdentity(request);
  if (!identity) {
    throw new PermissionError("Not authenticated. Please sign in again.");
  }

  const user = await getAuthUser(request);
  if (!user) {
    throw new PermissionError(
      "No store yet. Create a store to continue.",
    );
  }
  return user;
}

/**
 * Require a specific role.
 */
export async function requireRole(
  request: Request,
  allowedRoles: Array<"admin" | "manager" | "staff">,
): Promise<AuthUser> {
  const user = await requireAuth(request);
  if (!allowedRoles.includes(user.role)) {
    throw new PermissionError(
      `This action requires one of: ${allowedRoles.join(", ")}.`,
    );
  }
  return user;
}

/**
 * Require a platform super-admin (email allowlist).
 * Does not require warehouse membership — identity JWT is enough.
 */
export async function requireSuperAdmin(
  request: Request,
): Promise<SuperAdminIdentity> {
  const identity = await getAuthIdentity(request);
  if (!identity) {
    throw new PermissionError("Not authenticated. Please sign in again.");
  }
  if (!isSuperAdminEmail(identity.email)) {
    throw new PermissionError("Super admin access required.");
  }
  return { ...identity, isSuperAdmin: true };
}

export function createUserClient(request: Request): SupabaseClient {
  return createServerClient(request);
}

export function getServiceClient(): SupabaseClient {
  return createServiceClient();
}

export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    null
  );
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get("user-agent") ?? null;
}
