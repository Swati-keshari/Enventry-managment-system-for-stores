import { requireAuth } from "@/lib/auth";
import { checkRouteAccess } from "@/lib/rbac";
import { handleApiError, ValidationError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const ROUTE_KEY_GET = "GET /api/profile";
const ROUTE_KEY_PATCH = "PATCH /api/profile";

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100),
});

/**
 * GET /api/profile
 * Current user's profile, DO summary, and recent activity (own only).
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_GET, user, request);

    const supabase = createServiceClient();

    const { data: profile, error: profileError } = await supabase
      .from("app_users")
      .select("user_id, name, email, role, created_at, warehouse_id")
      .eq("user_id", user.userId)
      .eq("warehouse_id", user.warehouseId)
      .single();

    if (profileError || !profile) {
      throw new ValidationError("user", "Profile not found");
    }

    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("name")
      .eq("warehouse_id", user.warehouseId)
      .maybeSingle();

    const { data: dos, error: doError } = await supabase
      .from("delivery_orders")
      .select(`
        do_id,
        do_number,
        direction,
        date,
        item_count,
        party_id,
        parties(name),
        created_at,
        do_items(bags, total_weight)
      `)
      .eq("warehouse_id", user.warehouseId)
      .eq("user_id", user.userId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (doError) throw doError;

    const { data: logs, error: logError } = await supabase
      .from("audit_log")
      .select("log_id, entity, entity_id, action, ip_address, timestamp")
      .eq("warehouse_id", user.warehouseId)
      .eq("user_id", user.userId)
      .order("timestamp", { ascending: false })
      .limit(50);

    if (logError) throw logError;

    const doRows = dos ?? [];
    let totalBags = 0;
    let totalWeight = 0;
    let inCount = 0;
    let outCount = 0;

    for (const row of doRows) {
      if (row.direction === "IN") inCount += 1;
      else outCount += 1;
      for (const item of (row.do_items as Array<{ bags: number; total_weight: number }> | null) ?? []) {
        totalBags += item.bags ?? 0;
        totalWeight += item.total_weight ?? 0;
      }
    }

    const logRows = logs ?? [];
    const loginCount = logRows.filter((l) => l.action === "login").length;

    return Response.json({
      profile: {
        user_id: profile.user_id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        created_at: profile.created_at,
        warehouse_id: profile.warehouse_id,
        warehouse_name: warehouse?.name ?? user.warehouseName ?? "Warehouse",
      },
      stats: {
        do_count: doRows.length,
        in_count: inCount,
        out_count: outCount,
        bags: totalBags,
        weight: totalWeight,
        login_count: loginCount,
        last_activity: logRows[0]?.timestamp ?? profile.created_at,
      },
      dos: doRows.map((row) => ({
        do_id: row.do_id,
        do_number: row.do_number,
        direction: row.direction,
        date: row.date,
        item_count: row.item_count,
        party_name: (row.parties as { name: string } | null)?.name ?? null,
        do_items: row.do_items,
        created_at: row.created_at,
      })),
      logs: logRows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/profile
 * Update current user's display name.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_PATCH, user, request);

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      throw new ValidationError(firstError.path.join("."), firstError.message);
    }

    const { name } = parsed.data;
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("app_users")
      .select("user_id, name")
      .eq("user_id", user.userId)
      .eq("warehouse_id", user.warehouseId)
      .single();

    if (!existing) throw new ValidationError("user", "Profile not found");

    const { error } = await supabase
      .from("app_users")
      .update({ name })
      .eq("user_id", user.userId)
      .eq("warehouse_id", user.warehouseId);

    if (error) throw error;

    await writeAudit(supabase, {
      warehouseId: user.warehouseId,
      userId: user.userId,
      entity: "user",
      entityId: user.userId,
      action: "update",
      oldData: { name: existing.name },
      newData: { name },
    }, request);

    return Response.json({ name, message: "Profile updated." });
  } catch (error) {
    return handleApiError(error);
  }
}
