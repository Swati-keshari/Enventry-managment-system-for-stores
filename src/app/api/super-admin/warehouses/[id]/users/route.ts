import { z } from "zod";
import {
  getClientIp,
  getUserAgent,
  requireSuperAdmin,
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  ConflictError,
  handleApiError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";

const mutateUserSchema = z.object({
  action: z.enum(["update_role", "remove"]),
  user_id: z.string().uuid(),
  role: z.enum(["admin", "manager", "staff"]).optional(),
});

/**
 * PATCH /api/super-admin/warehouses/[id]/users
 * Update role or remove a user in any warehouse.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireSuperAdmin(request);
    const { id: warehouseId } = await context.params;
    const body = await request.json();
    const parsed = mutateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "body",
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    }

    const supabase = createServiceClient();
    const { data: target, error: targetError } = await supabase
      .from("app_users")
      .select("user_id, name, email, role, warehouse_id")
      .eq("user_id", parsed.data.user_id)
      .eq("warehouse_id", warehouseId)
      .is("deleted_at", null)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) throw new NotFoundError("User");

    if (parsed.data.action === "update_role") {
      if (!parsed.data.role) {
        throw new ValidationError("role", "Role is required");
      }
      const { data: updated, error } = await supabase
        .from("app_users")
        .update({ role: parsed.data.role })
        .eq("user_id", target.user_id)
        .is("deleted_at", null)
        .select("user_id, name, email, role")
        .single();
      if (error || !updated) throw error ?? new Error("Update failed");

      await writeAudit(supabase, {
        warehouseId,
        userId: admin.userId,
        actorName: admin.name,
        entity: "user",
        entityId: target.user_id,
        action: "super_admin_update_user_role",
        oldData: { role: target.role },
        newData: { role: updated.role },
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return Response.json({ data: updated });
    }

    // Soft-remove — never delete audit_log or the app_users row used by history.
    const { count: adminCount } = await supabase
      .from("app_users")
      .select("user_id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)
      .eq("role", "admin")
      .is("deleted_at", null);

    if (target.role === "admin" && (adminCount ?? 0) <= 1) {
      throw new ConflictError("Cannot remove the last admin of a warehouse.");
    }

    const deletedAt = new Date().toISOString();
    const { error: deleteError } = await supabase
      .from("app_users")
      .update({ deleted_at: deletedAt })
      .eq("user_id", target.user_id)
      .is("deleted_at", null);
    if (deleteError) throw deleteError;

    try {
      await supabase.auth.admin.updateUserById(target.user_id, {
        ban_duration: "876000h",
      });
    } catch {
      // Ban is best-effort
    }

    await writeAudit(supabase, {
      warehouseId,
      userId: admin.userId,
      actorName: admin.name,
      entity: "user",
      entityId: target.user_id,
      action: "super_admin_remove_user",
      oldData: target as unknown as Record<string, unknown>,
      newData: { deleted_at: deletedAt },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return Response.json({
      message: "User removed. Their audit history is preserved.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
