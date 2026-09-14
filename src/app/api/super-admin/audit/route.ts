import { z } from "zod";
import { getClientIp, getUserAgent, requireSuperAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleApiError, ValidationError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";

const deleteSchema = z
  .object({
    warehouseId: z.union([z.literal("all"), z.string().uuid()]).optional(),
    logIds: z.array(z.number().int().positive()).max(500).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    confirm: z.literal("DELETE"),
  })
  .superRefine((val, ctx) => {
    const hasIds = (val.logIds?.length ?? 0) > 0;
    const hasRange = Boolean(val.from || val.to);
    if (!hasIds && !hasRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide logIds and/or a from/to date range.",
      });
    }
    if (!hasIds && !val.warehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "warehouseId is required for date-range deletes (use a warehouse id or \"all\").",
      });
    }
  });

function dayStartIso(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  return new Date(value).toISOString();
}

function dayEndIso(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59:59.999Z`;
  return new Date(value).toISOString();
}

/**
 * GET /api/super-admin/audit
 * List audit rows across one warehouse or all warehouses.
 */
export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const url = new URL(request.url);
    const warehouseId = url.searchParams.get("warehouseId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10), 1),
      500,
    );
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

    const supabase = createServiceClient();
    let query = supabase
      .from("audit_log")
      .select(
        "log_id, warehouse_id, user_id, actor_name, entity, entity_id, action, old_data, new_data, ip_address, timestamp, app_users(name), warehouses(name)",
        { count: "exact" },
      )
      .order("timestamp", { ascending: false })
      .order("log_id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (warehouseId && warehouseId !== "all") {
      query = query.eq("warehouse_id", warehouseId);
    }
    if (from) query = query.gte("timestamp", dayStartIso(from));
    if (to) query = query.lte("timestamp", dayEndIso(to));

    const { data, error, count } = await query;
    if (error) throw error;

    return Response.json({
      data:
        data?.map((row) => ({
          log_id: row.log_id,
          warehouse_id: row.warehouse_id,
          warehouse_name:
            (row.warehouses as { name: string } | null)?.name ?? null,
          user_id: row.user_id,
          actor_name:
            row.actor_name ??
            (row.app_users as { name: string } | null)?.name ??
            null,
          entity: row.entity,
          entity_id: row.entity_id,
          action: row.action,
          old_data: row.old_data,
          new_data: row.new_data,
          ip_address: row.ip_address,
          timestamp: row.timestamp,
        })) ?? [],
      total: count ?? 0,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + limit,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/super-admin/audit
 * Delete audit rows by log IDs and/or date range, for one warehouse or all.
 */
export async function DELETE(request: Request) {
  try {
    const admin = await requireSuperAdmin(request);
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "body",
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    }

    const { warehouseId, logIds, from, to } = parsed.data;
    const supabase = createServiceClient();

    let query = supabase.from("audit_log").delete().select("log_id, warehouse_id");

    if (logIds && logIds.length > 0) {
      query = query.in("log_id", logIds);
    }
    if (warehouseId && warehouseId !== "all") {
      query = query.eq("warehouse_id", warehouseId);
    }
    if (from) query = query.gte("timestamp", dayStartIso(from));
    if (to) query = query.lte("timestamp", dayEndIso(to));

    const { data: deleted, error } = await query;
    if (error) throw error;

    const deletedRows = deleted ?? [];
    const deletedCount = deletedRows.length;
    const affectedWarehouseIds = [
      ...new Set(deletedRows.map((r) => r.warehouse_id)),
    ];

    // Re-link hash chains for warehouses that lost rows mid-chain.
    for (const whId of affectedWarehouseIds) {
      try {
        await supabase.rpc("repair_audit_chain", { p_warehouse_id: whId });
      } catch (repairErr) {
        console.warn("repair_audit_chain after purge failed:", repairErr);
      }
    }

    // Record the purge itself (after deletes) so history of admin cleanup remains.
    const summaryWarehouses =
      warehouseId && warehouseId !== "all"
        ? [warehouseId]
        : affectedWarehouseIds.slice(0, 20);

    for (const whId of summaryWarehouses) {
      try {
        await writeAudit(
          supabase,
          {
            warehouseId: whId,
            userId: null,
            actorName: admin.name,
            entity: "audit_log",
            entityId: null,
            action: "super_admin_purge_audit",
            newData: {
              deleted_count: deletedCount,
              scope_warehouse: warehouseId ?? "mixed",
              log_ids: logIds ?? null,
              from: from ?? null,
              to: to ?? null,
              by_email: admin.email,
            },
            ipAddress: getClientIp(request),
            userAgent: getUserAgent(request),
          },
          request,
        );
      } catch (auditErr) {
        console.warn("Failed to write purge audit summary:", auditErr);
      }
    }

    return Response.json({
      deleted: deletedCount,
      warehouses: affectedWarehouseIds.length,
      warehouse_ids: affectedWarehouseIds,
      message: `Deleted ${deletedCount} audit log(s) across ${affectedWarehouseIds.length} warehouse(s).`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
