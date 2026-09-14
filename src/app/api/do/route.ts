import { requireAuth } from "@/lib/auth";
import { assertDoOwnership, checkRouteAccess, isStaffOwnOnly } from "@/lib/rbac";
import { handleApiError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { getIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { z } from "zod";

const ROUTE_KEY_GET = "GET /api/do";
const ROUTE_KEY_POST = "POST /api/do";
const ROUTE_KEY_PATCH = "PATCH /api/do";
const ROUTE_KEY_DELETE = "DELETE /api/do";

// ─── Validation Schemas ───────────────────────────────────────────────

const doItemSchema = z.object({
  item_id: z.string().uuid(),
  bags: z.number().int().min(1).max(10000),
  bag_size: z.number().positive(),
  unit: z.string().min(1).max(50).default("kg"),
  vehicle_number: z.string().trim().max(50).optional().nullable(),
});

const createDoSchema = z.object({
  do_number: z.string().min(1).max(50),
  direction: z.enum(["IN", "OUT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  party_id: z.string().uuid().nullable().optional(),
  items: z.array(doItemSchema).min(1, "At least one item required"),
});

const updateDoSchema = z.object({
  do_id: z.string().uuid(),
  do_number: z.string().min(1).max(50).optional(),
  direction: z.enum(["IN", "OUT"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  party_id: z.string().uuid().nullable().optional(),
  items: z.array(doItemSchema).optional(),
});

// ─── GET /api/do ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_GET, user, request);

    const url = new URL(request.url);
    const requestedId = url.searchParams.get("id");
    const supabase = createServiceClient();

    if (requestedId) {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select(`
          *,
          parties(name),
          app_users(name),
          do_items(*, items(name)),
          files(
            file_id,
            file_name,
            file_type,
            file_size,
            drive_url,
            category,
            description,
            created_at
          )
        `)
        .eq("do_id", requestedId)
        .eq("warehouse_id", user.warehouseId)
        .single();

      if (error || !data) throw new NotFoundError("Delivery order");
      assertDoOwnership(data.user_id, user);
      return Response.json({ data });
    }

    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10), 1), 50);
    // Accept startDate/endDate and from/to; q and search
    const startDate = url.searchParams.get("startDate") ?? url.searchParams.get("from");
    const endDate = url.searchParams.get("endDate") ?? url.searchParams.get("to");
    const direction = url.searchParams.get("direction");
    const partyId = url.searchParams.get("partyId");
    const q = url.searchParams.get("q") ?? url.searchParams.get("search");
    const userId = url.searchParams.get("userId");

    if (direction && direction !== "IN" && direction !== "OUT") {
      throw new ValidationError("direction", "Must be IN or OUT");
    }
    if (startDate && isNaN(Date.parse(startDate))) {
      throw new ValidationError("startDate", "Invalid date format");
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      throw new ValidationError("endDate", "Invalid date format");
    }

    let query = supabase
      .from("delivery_orders")
      .select(`
        do_id,
        do_number,
        direction,
        date,
        item_count,
        party_id,
        parties(name),
        user_id,
        app_users(name),
        created_at,
        updated_at,
        do_items(bags, total_weight, item_id, vehicle_number, items(name, bag_size))
      `)
      .eq("warehouse_id", user.warehouseId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    // Staff can only see their own DOs
    if (isStaffOwnOnly(ROUTE_KEY_GET, user)) {
      query = query.eq("user_id", user.userId);
    } else if (userId) {
      query = query.eq("user_id", userId);
    }

    if (startDate) query = query.gte("date", startDate);
    if (endDate) query = query.lte("date", endDate);
    if (direction) query = query.eq("direction", direction);
    if (partyId) query = query.eq("party_id", partyId);
    if (q) query = query.ilike("do_number", `%${q}%`);

    if (cursor) {
      query = query.or(`date.lt.${cursor},and(date.eq.${cursor},created_at.lt.${cursor})`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const hasMore = data.length > limit;
    const items = hasMore ? data.slice(0, limit) : data;
    const nextCursor = hasMore ? items[items.length - 1]?.date ?? null : null;

    return Response.json({
      data: items.map((row) => ({
        do_id: row.do_id,
        do_number: row.do_number,
        direction: row.direction,
        date: row.date,
        item_count: row.item_count,
        party_id: row.party_id,
        party_name: (row.parties as { name: string } | null)?.name ?? null,
        parties: row.parties,
        user_id: row.user_id,
        creator_name: (row.app_users as { name: string } | null)?.name ?? null,
        app_users: row.app_users,
        do_items: row.do_items,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      items: items.map((row) => ({
        do_id: row.do_id,
        do_number: row.do_number,
        direction: row.direction,
        date: row.date,
        item_count: row.item_count,
        party_id: row.party_id,
        party_name: (row.parties as { name: string } | null)?.name ?? null,
        user_id: row.user_id,
        creator_name: (row.app_users as { name: string } | null)?.name ?? null,
        do_items: row.do_items,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      nextCursor,
      cursor: nextCursor,
      hasMore,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── POST /api/do ─────────────────────────────────────────────────────

async function createDoHandler(request: Request): Promise<Response> {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_POST, user, request);

    const body = await request.json();
    const parsed = createDoSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      throw new ValidationError(firstError.path.join("."), firstError.message);
    }

    const { do_number, direction, date, party_id, items } = parsed.data;

    // Validate date
    const doDate = new Date(date);
    const now = new Date();
    if (doDate > now) throw new ValidationError("date", "Date cannot be in the future");
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (doDate < oneYearAgo) throw new ValidationError("date", "Date cannot be older than 365 days");

    // Validate party exists
    if (party_id) {
      const supabaseCheck = createServiceClient();
      const { data: party } = await supabaseCheck.from("parties").select("party_id").eq("party_id", party_id).single();
      if (!party) throw new ValidationError("party_id", "Party not found");
    }

    // Validate items exist
    const supabaseCheck = createServiceClient();
    const itemIds = items.map((i) => i.item_id);
    const { data: existingItems } = await supabaseCheck.from("items").select("item_id, bag_size, name").in("item_id", itemIds);

    if (!existingItems || existingItems.length !== itemIds.length) {
      const foundIds = new Set(existingItems?.map((i) => i.item_id) ?? []);
      const missing = itemIds.filter((id) => !foundIds.has(id));
      throw new ValidationError("items", `Item not found: ${missing.join(", ")}`);
    }

    const doItems = items.map((item, idx) => ({
      item_id: item.item_id,
      sequence_num: idx + 1,
      bags: item.bags,
      bag_size: item.bag_size,
      unit: item.unit,
      total_weight: Math.round(item.bags * item.bag_size * 100) / 100,
      total_quantity: Math.round(item.bags * item.bag_size * 100) / 100,
      vehicle_number: item.vehicle_number?.trim() || null,
    }));

    const supabase = createServiceClient();
    const requestId = crypto.randomUUID();

    const { data: doRow, error: doError } = await supabase
      .from("delivery_orders")
      .insert({ warehouse_id: user.warehouseId, user_id: user.userId, party_id: party_id ?? null, do_number, direction, date })
      .select("do_id")
      .single();

    if (doError) {
      if (doError.code === "23505") throw new ConflictError("Entry number already exists. Use a different number.");
      throw doError;
    }

    const doItemRows = doItems.map((item) => ({ do_id: doRow.do_id, ...item }));
    const { error: itemsError } = await supabase.from("do_items").insert(doItemRows);

    if (itemsError) {
      await supabase.from("delivery_orders").delete().eq("do_id", doRow.do_id);
      throw itemsError;
    }

    // Audit: DO creation + each item
    await writeAudit(supabase, {
      warehouseId: user.warehouseId, userId: user.userId,
      actorName: user.name,
      entity: "do", entityId: doRow.do_id, action: "create",
      newData: {
        do_id: doRow.do_id,
        do_number,
        direction,
        date,
        party_id,
        item_count: doItems.length,
        items: doItems,
      },
      requestId,
    }, request);

    for (const item of doItems) {
      await writeAudit(supabase, {
        warehouseId: user.warehouseId, userId: user.userId,
        actorName: user.name,
        entity: "do_item", entityId: null, action: "create",
        newData: { do_id: doRow.do_id, do_number, ...item },
        requestId,
      }, request);
    }

    return Response.json({ do_id: doRow.do_id, message: "Entry created." }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const idempotencyKey = getIdempotencyKey(request);
  return withIdempotency(idempotencyKey, () => createDoHandler(request));
}

// ─── PATCH /api/do ────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_PATCH, user, request);

    const body = await request.json();
    const parsed = updateDoSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      throw new ValidationError(firstError.path.join("."), firstError.message);
    }

    const { do_id, ...updates } = parsed.data;
    const supabase = createServiceClient();

    const { data: existingDo, error: fetchError } = await supabase
      .from("delivery_orders").select("*").eq("do_id", do_id).single();

    if (fetchError || !existingDo) throw new ValidationError("do_id", "Entry not found");
    if (existingDo.warehouse_id !== user.warehouseId) {
      throw new NotFoundError("Delivery order");
    }
    assertDoOwnership(existingDo.user_id, user);

    // Concurrent edit conflict check: verify updated_at matches expected
    if (updates.date !== undefined || updates.do_number !== undefined) {
      const clientTimestamp = request.headers.get("x-record-updated-at");
      if (clientTimestamp && existingDo.updated_at !== clientTimestamp) {
        throw new ConflictError("This record was modified. Please refresh and try again.");
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headerUpdates: any = {};
    if (updates.do_number !== undefined) headerUpdates.do_number = updates.do_number;
    if (updates.direction !== undefined) headerUpdates.direction = updates.direction;
    if (updates.date !== undefined) headerUpdates.date = updates.date;
    if (updates.party_id !== undefined) headerUpdates.party_id = updates.party_id;

    if (Object.keys(headerUpdates).length > 0) {
      const { error: updateError } = await supabase.from("delivery_orders").update(headerUpdates).eq("do_id", do_id);
      if (updateError) {
        if (updateError.code === "23505") throw new ConflictError("Entry number already exists. Use a different number.");
        throw updateError;
      }
    }

    if (updates.items) {
      await supabase.from("do_items").delete().eq("do_id", do_id);
      const doItems = updates.items.map((item, idx) => ({
        do_id, item_id: item.item_id, sequence_num: idx + 1,
        bags: item.bags, bag_size: item.bag_size,
        unit: item.unit,
        total_weight: Math.round(item.bags * item.bag_size * 100) / 100,
        total_quantity: Math.round(item.bags * item.bag_size * 100) / 100,
        vehicle_number: item.vehicle_number?.trim() || null,
      }));
      const { error: itemsError } = await supabase.from("do_items").insert(doItems);
      if (itemsError) throw itemsError;
    }

    const { data: updatedDo } = await supabase.from("delivery_orders").select("*").eq("do_id", do_id).single();

    await writeAudit(supabase, {
      warehouseId: user.warehouseId, userId: user.userId,
      actorName: user.name,
      entity: "do", entityId: do_id, action: "update",
      oldData: existingDo as unknown as Record<string, unknown>,
      newData: updatedDo as unknown as Record<string, unknown>,
    }, request);

    return Response.json({ do_id, message: "Entry updated." });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── DELETE /api/do ───────────────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_DELETE, user, request);

    const url = new URL(request.url);
    const doId = url.searchParams.get("id");
    if (!doId) throw new ValidationError("id", "Entry ID required");

    const supabase = createServiceClient();

    const { data: existingDo, error: fetchError } = await supabase
      .from("delivery_orders").select("*").eq("do_id", doId).single();

    if (fetchError || !existingDo) throw new ValidationError("id", "Entry not found");
    if (existingDo.warehouse_id !== user.warehouseId) {
      throw new NotFoundError("Delivery order");
    }
    assertDoOwnership(existingDo.user_id, user);

    const { data: existingItems } = await supabase.from("do_items").select("*").eq("do_id", doId);

    const { error: deleteError } = await supabase.from("delivery_orders").delete().eq("do_id", doId);
    if (deleteError) throw deleteError;

    await writeAudit(supabase, {
      warehouseId: user.warehouseId, userId: user.userId,
      actorName: user.name,
      entity: "do", entityId: doId, action: "delete",
      oldData: { ...(existingDo as unknown as Record<string, unknown>), items: existingItems },
    }, request);

    return Response.json({ message: "Entry deleted." });
  } catch (error) {
    return handleApiError(error);
  }
}
