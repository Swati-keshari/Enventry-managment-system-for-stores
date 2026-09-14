import { requireAuth } from "@/lib/auth";
import { checkRouteAccess } from "@/lib/rbac";
import { handleApiError, ValidationError, ConflictError, NotFoundError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const ROUTE_KEY_GET = "GET /api/parties";
const ROUTE_KEY_POST = "POST /api/parties";
const ROUTE_KEY_PATCH = "PATCH /api/parties";
const ROUTE_KEY_DELETE = "DELETE /api/parties";

const createPartySchema = z.object({
  name: z.string().min(1).max(100),
});

const updatePartySchema = z.object({
  party_id: z.string().uuid(),
  name: z.string().min(1).max(100),
});

/**
 * GET /api/parties
 * List all parties in the warehouse, or fetch one with ?id=.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_GET, user, request);

    const url = new URL(request.url);
    const partyId = url.searchParams.get("id");
    const supabase = createServiceClient();

    if (partyId) {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("party_id", partyId)
        .eq("warehouse_id", user.warehouseId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new NotFoundError("Party");

      return Response.json({ party: data, data });
    }

    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 100);
    const q = url.searchParams.get("q") ?? url.searchParams.get("search");

    let query = supabase
      .from("parties")
      .select("*")
      .eq("warehouse_id", user.warehouseId)
      .order("name")
      .limit(limit + 1);

    if (cursor) query = query.gt("name", cursor);
    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    const hasMore = data.length > limit;
    const items = hasMore ? data.slice(0, limit) : data;
    const nextCursor = hasMore ? items[items.length - 1]?.name ?? null : null;

    return Response.json({ parties: items, data: items, nextCursor, hasMore });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/parties
 * Create a new party.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_POST, user, request);

    const body = await request.json();
    const parsed = createPartySchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      throw new ValidationError(firstError.path.join("."), firstError.message);
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("parties")
      .insert({
        warehouse_id: user.warehouseId,
        name: parsed.data.name,
      })
      .select("party_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new ConflictError("Party name already exists in this warehouse.");
      }
      throw error;
    }

    await writeAudit(supabase, {
      warehouseId: user.warehouseId,
      userId: user.userId,
      actorName: user.name,
      entity: "party",
      entityId: data.party_id,
      action: "create",
      newData: { party_id: data.party_id, name: parsed.data.name },
    }, request);

    return Response.json(
      { party_id: data.party_id, message: "Party created." },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/parties
 * Update a party's name.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_PATCH, user, request);

    const body = await request.json();
    const parsed = updatePartySchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      throw new ValidationError(firstError.path.join("."), firstError.message);
    }

    const { party_id, name } = parsed.data;
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("parties")
      .select("*")
      .eq("party_id", party_id)
      .single();

    if (!existing) throw new ValidationError("party_id", "Party not found");

    const { error } = await supabase
      .from("parties")
      .update({ name })
      .eq("party_id", party_id);

    if (error) {
      if (error.code === "23505") {
        throw new ConflictError("Party name already exists in this warehouse.");
      }
      throw error;
    }

    await writeAudit(supabase, {
      warehouseId: user.warehouseId,
      userId: user.userId,
      actorName: user.name,
      entity: "party",
      entityId: party_id,
      action: "update",
      oldData: existing as unknown as Record<string, unknown>,
      newData: { ...existing, name },
    }, request);

    return Response.json({ message: "Party updated." });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/parties?id=<uuid>
 * Delete a party.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY_DELETE, user, request);

    const url = new URL(request.url);
    const partyId = url.searchParams.get("id");
    if (!partyId) throw new ValidationError("id", "Party ID required");

    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("parties")
      .select("*")
      .eq("party_id", partyId)
      .single();

    if (!existing) throw new ValidationError("id", "Party not found");

    const { error } = await supabase.from("parties").delete().eq("party_id", partyId);

    if (error) {
      if (error.code === "23503") {
        throw new ConflictError("Cannot delete party — it is referenced by entries.");
      }
      throw error;
    }

    await writeAudit(supabase, {
      warehouseId: user.warehouseId,
      userId: user.userId,
      actorName: user.name,
      entity: "party",
      entityId: partyId,
      action: "delete",
      oldData: existing as unknown as Record<string, unknown>,
    }, request);

    return Response.json({ message: "Party deleted." });
  } catch (error) {
    return handleApiError(error);
  }
}
