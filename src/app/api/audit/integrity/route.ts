import { requireAuth } from "@/lib/auth";
import { checkRouteAccess } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";

const ROUTE_KEY_INTEGRITY = "GET /api/audit/integrity";

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_INTEGRITY, user, request);

    const { verifyAuditIntegrity } = await import("@/lib/audit");
    const supabase = createServiceClient();
    const result = await verifyAuditIntegrity(supabase, user.warehouseId);

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
