import type { AuthUser } from "./auth";
import { PermissionError } from "./errors";
import { createServiceClient } from "./supabase";
import { writeAudit } from "./audit";

// ─── RBAC Policy Module (Prompt 02) ──────────────────────────────────
//
// Maps routes/actions to allowed roles. Defense-in-depth on top of RLS.
// RLS handles warehouse isolation; RBAC handles role-based access within
// a warehouse.

export type Role = "admin" | "manager" | "staff";

// ─── Route → Role Mapping ─────────────────────────────────────────────

interface RoutePolicy {
  allowedRoles: Role[];
  staffOwnOnly?: boolean;
}

const ROUTE_POLICIES: Record<string, RoutePolicy> = {
  "GET /api/do": { allowedRoles: ["admin", "manager", "staff"], staffOwnOnly: true },
  "POST /api/do": { allowedRoles: ["admin", "manager", "staff"] },
  "PATCH /api/do": { allowedRoles: ["admin", "manager", "staff"] },
  "DELETE /api/do": { allowedRoles: ["admin", "manager", "staff"] },
  "GET /api/items": { allowedRoles: ["admin", "manager", "staff"] },
  "POST /api/items": { allowedRoles: ["admin", "manager", "staff"] },
  "PATCH /api/items": { allowedRoles: ["admin", "manager", "staff"] },
  "DELETE /api/items": { allowedRoles: ["admin", "manager", "staff"] },
  "GET /api/parties": { allowedRoles: ["admin", "manager", "staff"] },
  "POST /api/parties": { allowedRoles: ["admin", "manager", "staff"] },
  "PATCH /api/parties": { allowedRoles: ["admin", "manager", "staff"] },
  "DELETE /api/parties": { allowedRoles: ["admin", "manager", "staff"] },
  "GET /api/dashboard": { allowedRoles: ["admin", "manager"] },
  "GET /api/users": { allowedRoles: ["admin"] },
  "POST /api/users/invite": { allowedRoles: ["admin"] },
  "POST /api/users/presence": { allowedRoles: ["admin", "manager", "staff"] },
  "PATCH /api/users": { allowedRoles: ["admin"] },
  "DELETE /api/users": { allowedRoles: ["admin"] },
  "GET /api/profile": { allowedRoles: ["admin", "manager", "staff"] },
  "PATCH /api/profile": { allowedRoles: ["admin", "manager", "staff"] },
  "GET /api/audit": { allowedRoles: ["admin", "manager"] },
  "GET /api/audit/integrity": { allowedRoles: ["admin"] },
  "GET /api/files": { allowedRoles: ["admin", "manager", "staff"] },
  "POST /api/files/upload": { allowedRoles: ["admin", "manager", "staff"] },
  "DELETE /api/files": { allowedRoles: ["admin", "manager"] },
};

// ─── Guard Functions ──────────────────────────────────────────────────

/**
 * Check if the user's role is allowed for the given route key.
 * Logs denied attempts to audit_log.
 */
export async function checkRouteAccess(
  routeKey: string,
  user: AuthUser,
  request?: Request | null,
): Promise<void> {
  const policy = ROUTE_POLICIES[routeKey];
  if (!policy) return;

  if (!policy.allowedRoles.includes(user.role)) {
    // Log denied attempt to audit
    try {
      const supabase = createServiceClient();
      await writeAudit(
        supabase,
        {
          warehouseId: user.warehouseId,
          userId: user.userId,
          entity: "security",
          entityId: null,
          action: "permission_denied",
          newData: {
            route: routeKey,
            role: user.role,
            required_roles: policy.allowedRoles,
          },
        },
        request,
      );
    } catch {
      // Audit log failure should not block the request
    }

    throw new PermissionError("You don't have permission to access this resource.");
  }
}

export function isStaffOwnOnly(routeKey: string, user: AuthUser): boolean {
  const policy = ROUTE_POLICIES[routeKey];
  return policy?.staffOwnOnly === true && user.role === "staff";
}

export function assertDoOwnership(doCreatorUserId: string, user: AuthUser): void {
  if (user.role === "admin" || user.role === "manager") return;
  if (doCreatorUserId !== user.userId) {
    throw new PermissionError("You can only modify your own entries.");
  }
}

export function assertNotLastAdmin(
  targetUserId: string,
  currentUser: AuthUser,
  adminCount: number,
): void {
  if (targetUserId === currentUser.userId && currentUser.role === "admin" && adminCount <= 1) {
    throw new PermissionError("You cannot change your own role — you are the last admin.");
  }
}
