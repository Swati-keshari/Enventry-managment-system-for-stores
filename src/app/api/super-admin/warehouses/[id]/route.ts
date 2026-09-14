import { requireSuperAdmin } from "@/lib/auth";
import { handleApiError, NotFoundError, ValidationError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";

/**
 * GET /api/super-admin/warehouses/[id]
 * Full warehouse overview + optional entity data via ?entity=
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await context.params;
    if (!id) throw new ValidationError("id", "Warehouse id required");

    const url = new URL(request.url);
    const entity = url.searchParams.get("entity");
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10), 1),
      500,
    );

    const supabase = createServiceClient();
    const { data: warehouse, error } = await supabase
      .from("warehouses")
      .select("warehouse_id, name, is_deleted, created_at, updated_at")
      .eq("warehouse_id", id)
      .maybeSingle();

    if (error) throw error;
    if (!warehouse) throw new NotFoundError("Warehouse");

    if (!entity) {
      const [users, items, parties, dos, files, audit] = await Promise.all([
        supabase
          .from("app_users")
          .select(
            "user_id, name, email, role, invite_status, last_seen_at, created_at",
          )
          .eq("warehouse_id", id)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("items")
          .select("item_id, name, bag_size, created_at")
          .eq("warehouse_id", id)
          .order("name"),
        supabase
          .from("parties")
          .select("party_id, name, created_at")
          .eq("warehouse_id", id)
          .order("name"),
        supabase
          .from("delivery_orders")
          .select(
            `do_id, do_number, direction, date, item_count, created_at,
             parties(name),
             app_users(name),
             do_items(bags, total_weight, vehicle_number, items(name))`,
          )
          .eq("warehouse_id", id)
          .order("date", { ascending: false })
          .limit(limit),
        supabase
          .from("files")
          .select(
            "file_id, file_name, file_type, file_size, category, created_at, do_id",
          )
          .eq("warehouse_id", id)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("audit_log")
          .select(
            "log_id, entity, entity_id, action, timestamp, user_id, actor_name, ip_address, app_users(name)",
          )
          .eq("warehouse_id", id)
          .order("timestamp", { ascending: false })
          .order("log_id", { ascending: false })
          .limit(limit),
      ]);

      // Surface query failures instead of silently returning empty arrays
      for (const result of [users, items, parties, dos, files, audit]) {
        if (result.error) throw result.error;
      }

      const auditRows = (audit.data ?? []).map((row) => ({
        log_id: row.log_id,
        entity: row.entity,
        entity_id: row.entity_id,
        action: row.action,
        timestamp: row.timestamp,
        user_id: row.user_id,
        user_name:
          row.actor_name ??
          (row.app_users as { name: string } | null)?.name ??
          null,
        ip_address: row.ip_address,
      }));

      return Response.json({
        data: {
          warehouse,
          users: users.data ?? [],
          items: items.data ?? [],
          parties: parties.data ?? [],
          dos: dos.data ?? [],
          files: files.data ?? [],
          audit: auditRows,
          counts: {
            users: users.data?.length ?? 0,
            items: items.data?.length ?? 0,
            parties: parties.data?.length ?? 0,
            dos: dos.count ?? dos.data?.length ?? 0,
            files: files.data?.length ?? 0,
            audit: auditRows.length,
          },
        },
      });
    }

    switch (entity) {
      case "users": {
        const { data, error: qError } = await supabase
          .from("app_users")
          .select(
            "user_id, name, email, role, invite_status, last_seen_at, invited_at, created_at",
          )
          .eq("warehouse_id", id)
          .is("deleted_at", null)
          .order("name");
        if (qError) throw qError;
        return Response.json({ data: data ?? [] });
      }
      case "items": {
        const { data, error: qError } = await supabase
          .from("items")
          .select("item_id, name, bag_size, created_at, updated_at")
          .eq("warehouse_id", id)
          .order("name");
        if (qError) throw qError;
        return Response.json({ data: data ?? [] });
      }
      case "parties": {
        const { data, error: qError } = await supabase
          .from("parties")
          .select("party_id, name, created_at")
          .eq("warehouse_id", id)
          .order("name");
        if (qError) throw qError;
        return Response.json({ data: data ?? [] });
      }
      case "dos": {
        const { data, error: qError } = await supabase
          .from("delivery_orders")
          .select(
            `do_id, do_number, direction, date, item_count, created_at, updated_at,
             parties(name),
             app_users(name, email),
             do_items(bags, total_weight, vehicle_number, items(name))`,
          )
          .eq("warehouse_id", id)
          .order("date", { ascending: false })
          .limit(limit);
        if (qError) throw qError;
        return Response.json({ data: data ?? [] });
      }
      case "files": {
        const { data, error: qError } = await supabase
          .from("files")
          .select(
            "file_id, file_name, file_type, file_size, category, description, drive_url, created_at, do_id",
          )
          .eq("warehouse_id", id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (qError) throw qError;
        return Response.json({ data: data ?? [] });
      }
      case "audit": {
        const { data, error: qError } = await supabase
          .from("audit_log")
          .select(
            "log_id, entity, entity_id, action, timestamp, user_id, actor_name, ip_address, new_data, old_data, app_users(name)",
          )
          .eq("warehouse_id", id)
          .order("timestamp", { ascending: false })
          .order("log_id", { ascending: false })
          .limit(limit);
        if (qError) throw qError;
        return Response.json({
          data:
            data?.map((row) => ({
              log_id: row.log_id,
              entity: row.entity,
              entity_id: row.entity_id,
              action: row.action,
              timestamp: row.timestamp,
              user_id: row.user_id,
              user_name:
                row.actor_name ??
                (row.app_users as { name: string } | null)?.name ??
                null,
              ip_address: row.ip_address,
              new_data: row.new_data,
              old_data: row.old_data,
            })) ?? [],
        });
      }
      default:
        throw new ValidationError(
          "entity",
          "Must be one of: users, items, parties, dos, files, audit",
        );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
