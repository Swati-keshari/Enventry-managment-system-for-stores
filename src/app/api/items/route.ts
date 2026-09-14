import { requireAuth } from "@/lib/auth";
import { checkRouteAccess } from "@/lib/rbac";
import { handleApiError, ValidationError, ConflictError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const ROUTE_KEY_GET = "GET /api/items";
const ROUTE_KEY_POST = "POST /api/items";
const ROUTE_KEY_PATCH = "PATCH /api/items";
const ROUTE_KEY_DELETE = "DELETE /api/items";

const createItemSchema = z.object({
  name: z.string().min(1).max(100),
  bag_size: z.number().positive().default(50),
  unit: z.string().min(1).max(50).default("kg"),
});

const updateItemSchema = z.object({
  item_id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  bag_size: z.number().positive().optional(),
  unit: z.string().min(1).max(50).optional(),
});

/**
 * GET /api/items
 * List all items in the warehouse with optional totals join.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_GET, user, request);

    const url = new URL(request.url);
    const withTotals = url.searchParams.get("totals") === "true";
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 100);
    const q = url.searchParams.get("q");

    const supabase = createServiceClient();

    let query = supabase
      .from("items")
      .select("*")
      .eq("warehouse_id", user.warehouseId)
      .order("name")
      .limit(limit + 1);

    if (cursor) query = query.gt("name", cursor);
    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    let items = data ?? [];

    if (withTotals) {
      const { data: totals } = await supabase
        .from("item_totals")
        .select("item_id, total_weight");

      const totalMap = new Map(totals?.map((t) => [t.item_id, t.total_weight]) ?? []);
      items = items.map((item) => ({
        ...item,
        total_weight: totalMap.get(item.item_id) ?? 0,
      }));
    }

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.name ?? null : null;

    return Response.json({ items: pageItems, data: pageItems, nextCursor, hasMore });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/items
 * Create a new item in the warehouse.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_POST, user, request);

    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      throw new ValidationError(firstError.path.join("."), firstError.message);
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("items")
      .insert({
        warehouse_id: user.warehouseId,
        name: parsed.data.name,
        bag_size: parsed.data.bag_size,
        unit: parsed.data.unit,
      })
      .select("item_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new ConflictError("Item name already exists in this store.");
      }
      throw error;
    }

    await writeAudit(supabase, {
      warehouseId: user.warehouseId,
      userId: user.userId,
      actorName: user.name,
      entity: "item",
      entityId: data.item_id,
      action: "create",
      newData: {
        item_id: data.item_id,
        name: parsed.data.name,
        bag_size: parsed.data.bag_size,
        unit: parsed.data.unit,
      },
    }, request);

    return Response.json(
      { item_id: data.item_id, message: "Item created." },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/items
 * Update an item's name or bag_size.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_PATCH, user, request);

    const body = await request.json();
    const parsed = updateItemSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      throw new ValidationError(firstError.path.join("."), firstError.message);
    }

    const { item_id, ...updates } = parsed.data;
    const supabase = createServiceClient();

    // Fetch existing for audit
    const { data: existing } = await supabase
      .from("items")
      .select("*")
      .eq("item_id", item_id)
      .single();

    if (!existing) throw new ValidationError("item_id", "Item not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateFields: any = {};
    if (updates.name !== undefined) updateFields.name = updates.name;
    if (updates.bag_size !== undefined) updateFields.bag_size = updates.bag_size;
    if (updates.unit !== undefined) updateFields.unit = updates.unit;

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ message: "No changes." });
    }

    const { error } = await supabase
      .from("items")
      .update(updateFields)
      .eq("item_id", item_id);

    if (error) {
      if (error.code === "23505") {
        throw new ConflictError("Item name already exists in this store.");
      }
      throw error;
    }

    // Always log as update so Audit filters (Create / Update / Delete) stay consistent
    await writeAudit(supabase, {
      warehouseId: user.warehouseId,
      userId: user.userId,
      actorName: user.name,
      entity: "item",
      entityId: item_id,
      action: "update",
      oldData: existing as unknown as Record<string, unknown>,
      newData: { ...existing, ...updateFields } as Record<string, unknown>,
    }, request);

    return Response.json({ message: "Item updated." });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/items?id=<uuid>
 * Delete an item (blocked by FK if in use by do_items).
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_DELETE, user, request);

    const url = new URL(request.url);
    const itemId = url.searchParams.get("id");
    if (!itemId) throw new ValidationError("id", "Item ID required");

    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("items")
      .select("*")
      .eq("item_id", itemId)
      .single();

    if (!existing) throw new ValidationError("id", "Item not found");

    const { error } = await supabase.from("items").delete().eq("item_id", itemId);

    if (error) {
      if (error.code === "23503") {
        throw new ConflictError("Cannot delete item — it is in use by entries.");
      }
      throw error;
    }

    await writeAudit(supabase, {
      warehouseId: user.warehouseId,
      userId: user.userId,
      actorName: user.name,
      entity: "item",
      entityId: itemId,
      action: "delete",
      oldData: existing as unknown as Record<string, unknown>,
    }, request);

    return Response.json({ message: "Item deleted." });
  } catch (error) {
    return handleApiError(error);
  }
}
