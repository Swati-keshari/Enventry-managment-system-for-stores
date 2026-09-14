import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";

/**
 * POST /api/users/presence
 * Heartbeat for the signed-in user: mark Active and accept pending invite.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("app_users")
      .update({
        last_seen_at: now,
        invite_status: "accepted",
      })
      .eq("user_id", user.userId)
      .eq("warehouse_id", user.warehouseId);

    if (error) throw error;

    return Response.json({
      ok: true,
      last_seen_at: now,
      invite_status: "accepted",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
