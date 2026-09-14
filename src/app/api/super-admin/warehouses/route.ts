import { z } from "zod";
import {
  getClientIp,
  getUserAgent,
  requireSuperAdmin,
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { DEFAULT_STORE_ITEMS } from "@/lib/default-items";
import {
  ConflictError,
  handleApiError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

const updateSchema = z.object({
  warehouse_id: z.string().uuid(),
  name: z.string().trim().min(2).max(100).optional(),
  is_deleted: z.boolean().optional(),
});

async function warehouseCounts(
  supabase: ReturnType<typeof createServiceClient>,
  warehouseId: string,
) {
  const [users, items, parties, dos, files] = await Promise.all([
    supabase
      .from("app_users")
      .select("user_id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)
      .is("deleted_at", null),
    supabase
      .from("items")
      .select("item_id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId),
    supabase
      .from("parties")
      .select("party_id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId),
    supabase
      .from("delivery_orders")
      .select("do_id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId),
    supabase
      .from("files")
      .select("file_id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId),
  ]);

  return {
    users: users.count ?? 0,
    items: items.count ?? 0,
    parties: parties.count ?? 0,
    dos: dos.count ?? 0,
    files: files.count ?? 0,
  };
}

/**
 * GET /api/super-admin/warehouses
 * List every warehouse with aggregate counts.
 */
export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const supabase = createServiceClient();
    const url = new URL(request.url);
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";

    let query = supabase
      .from("warehouses")
      .select("warehouse_id, name, is_deleted, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (!includeDeleted) {
      query = query.eq("is_deleted", false);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = await Promise.all(
      (data ?? []).map(async (wh) => ({
        ...wh,
        counts: await warehouseCounts(supabase, wh.warehouse_id),
      })),
    );

    return Response.json({ data: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/super-admin/warehouses
 * Create an empty warehouse (seeded defaults, no owner yet).
 */
export async function POST(request: Request) {
  try {
    const admin = await requireSuperAdmin(request);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "name",
        parsed.error.issues[0]?.message ?? "Invalid name",
      );
    }

    const supabase = createServiceClient();
    const { data: warehouse, error } = await supabase
      .from("warehouses")
      .insert({ name: parsed.data.name })
      .select("warehouse_id, name, is_deleted, created_at, updated_at")
      .single();

    if (error || !warehouse) throw error ?? new Error("Create failed");

    const { data: existingMembership } = await supabase
      .from("app_users")
      .select("user_id")
      .eq("user_id", admin.userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existingMembership) {
      const { error: membershipError } = await supabase.from("app_users").insert({
        user_id: admin.userId,
        warehouse_id: warehouse.warehouse_id,
        name: admin.name,
        email: admin.email,
        role: "admin",
        invite_status: "accepted",
        last_seen_at: new Date().toISOString(),
      });
      if (membershipError) throw membershipError;
    }

    await supabase.from("items").insert(
      DEFAULT_STORE_ITEMS.map((item) => ({
        warehouse_id: warehouse.warehouse_id,
        name: item.name,
        bag_size: item.bag_size,
        unit: item.unit,
      })),
    );

    await supabase.from("parties").insert(
      [
        "ABC Suppliers",
        "XYZ Traders",
        "Quick Transport",
        "Local Distributors",
      ].map((name) => ({
        warehouse_id: warehouse.warehouse_id,
        name,
      })),
    );

    await writeAudit(supabase, {
      warehouseId: warehouse.warehouse_id,
      userId: admin.userId,
      actorName: admin.name || admin.email,
      entity: "warehouse",
      entityId: warehouse.warehouse_id,
      action: "super_admin_create_warehouse",
      newData: { name: warehouse.name },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return Response.json(
      {
        data: {
          ...warehouse,
          counts: await warehouseCounts(supabase, warehouse.warehouse_id),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/super-admin/warehouses
 * Rename or soft-delete / restore a warehouse.
 */
export async function PATCH(request: Request) {
  try {
    const admin = await requireSuperAdmin(request);
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "warehouse_id",
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    }

    const { warehouse_id, name, is_deleted } = parsed.data;
    if (name === undefined && is_deleted === undefined) {
      throw new ValidationError("body", "Provide name and/or is_deleted");
    }

    const supabase = createServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("warehouses")
      .select("warehouse_id, name, is_deleted")
      .eq("warehouse_id", warehouse_id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw new NotFoundError("Warehouse");

    const patch: { name?: string; is_deleted?: boolean; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) patch.name = name;
    if (is_deleted !== undefined) patch.is_deleted = is_deleted;

    const { data: updated, error } = await supabase
      .from("warehouses")
      .update(patch)
      .eq("warehouse_id", warehouse_id)
      .select("warehouse_id, name, is_deleted, created_at, updated_at")
      .single();

    if (error || !updated) throw error ?? new Error("Update failed");

    await writeAudit(supabase, {
      warehouseId: warehouse_id,
      userId: admin.userId,
      entity: "warehouse",
      entityId: warehouse_id,
      action:
        is_deleted === true
          ? "super_admin_soft_delete_warehouse"
          : is_deleted === false
            ? "super_admin_restore_warehouse"
            : "super_admin_update_warehouse",
      oldData: existing as unknown as Record<string, unknown>,
      newData: updated as unknown as Record<string, unknown>,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return Response.json({
      data: {
        ...updated,
        counts: await warehouseCounts(supabase, warehouse_id),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/super-admin/warehouses?id=&mode=soft|hard
 * soft (default): mark is_deleted
 * hard: permanently remove warehouse and related rows
 */
export async function DELETE(request: Request) {
  try {
    const admin = await requireSuperAdmin(request);
    const url = new URL(request.url);
    const warehouseId = url.searchParams.get("id");
    const mode = url.searchParams.get("mode") === "hard" ? "hard" : "soft";

    if (!warehouseId) throw new ValidationError("id", "Warehouse id required");

    const supabase = createServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("warehouses")
      .select("warehouse_id, name, is_deleted")
      .eq("warehouse_id", warehouseId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw new NotFoundError("Warehouse");

    if (mode === "soft") {
      const { data: updated, error } = await supabase
        .from("warehouses")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("warehouse_id", warehouseId)
        .select("warehouse_id, name, is_deleted, created_at, updated_at")
        .single();
      if (error || !updated) throw error ?? new Error("Soft delete failed");

      await writeAudit(supabase, {
        warehouseId,
        userId: admin.userId,
        entity: "warehouse",
        entityId: warehouseId,
        action: "super_admin_soft_delete_warehouse",
        oldData: existing as unknown as Record<string, unknown>,
        newData: updated as unknown as Record<string, unknown>,
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return Response.json({ data: updated, mode: "soft" });
    }

    // Hard delete: clear RESTRICT dependents, then warehouse (cascades children).
    const { data: members } = await supabase
      .from("app_users")
      .select("user_id")
      .eq("warehouse_id", warehouseId);

    const memberIds = (members ?? []).map((m) => m.user_id);

    // Clear DO ownership RESTRICT before removing users.
    if (memberIds.length > 0) {
      const { data: dos } = await supabase
        .from("delivery_orders")
        .select("do_id")
        .eq("warehouse_id", warehouseId);

      const doIds = (dos ?? []).map((d) => d.do_id);
      if (doIds.length > 0) {
        await supabase.from("do_items").delete().in("do_id", doIds);
        await supabase.from("files").delete().in("do_id", doIds);
      }
      await supabase.from("delivery_orders").delete().eq("warehouse_id", warehouseId);
    } else {
      await supabase.from("delivery_orders").delete().eq("warehouse_id", warehouseId);
    }

    await supabase.from("files").delete().eq("warehouse_id", warehouseId);
    await supabase.from("drive_integrations").delete().eq("warehouse_id", warehouseId);
    await supabase.from("audit_log").delete().eq("warehouse_id", warehouseId);
    await supabase.from("items").delete().eq("warehouse_id", warehouseId);
    await supabase.from("parties").delete().eq("warehouse_id", warehouseId);

    if (memberIds.length > 0) {
      const { error: usersError } = await supabase
        .from("app_users")
        .delete()
        .eq("warehouse_id", warehouseId);
      if (usersError) {
        if (usersError.code === "23503") {
          throw new ConflictError(
            "Cannot hard-delete warehouse: users still referenced by other records.",
          );
        }
        throw usersError;
      }

      // Best-effort auth cleanup — never delete the acting super-admin's login.
      for (const userId of memberIds) {
        if (userId === admin.userId) continue;
        try {
          await supabase.auth.admin.deleteUser(userId);
        } catch {
          // ignore — auth user may be already gone
        }
      }
    }

    const { error: deleteError } = await supabase
      .from("warehouses")
      .delete()
      .eq("warehouse_id", warehouseId);

    if (deleteError) {
      if (deleteError.code === "23503") {
        throw new ConflictError(
          "Cannot hard-delete warehouse: related records still exist.",
        );
      }
      throw deleteError;
    }

    // Audit into a surviving warehouse if possible is skipped — warehouse gone.
    // Log to console for ops visibility.
    console.info("super_admin_hard_delete_warehouse", {
      warehouseId,
      name: existing.name,
      by: admin.email,
    });

    return Response.json({
      data: { warehouse_id: warehouseId, deleted: true },
      mode: "hard",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
