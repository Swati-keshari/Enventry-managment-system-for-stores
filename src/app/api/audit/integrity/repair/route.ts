import { requireAuth } from "@/lib/auth";
import { checkRouteAccess } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";
import { repairAuditChainWithHashBackfill } from "@/lib/audit";

const ROUTE_KEY_INTEGRITY = "GET /api/audit/integrity";

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_INTEGRITY, user, request);

    const supabase = createServiceClient();
    const result = await repairAuditChainWithHashBackfill(
      supabase,
      user.warehouseId,
    );

    return Response.json({
      ok: result.ok,
      repairedCount: result.repairedCount,
      backfilledCount: result.backfilledCount,
      message: result.message,
      verify: result.verify,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
