import { getAuthIdentity, getAuthUser, getClientIp, getUserAgent } from "@/lib/auth";
import { handleApiError, ConflictError, ValidationError, PermissionError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { DEFAULT_STORE_ITEMS } from "@/lib/default-items";
import { z } from "zod";

const createWarehouseSchema = z.object({
  name: z.string().min(2).max(100),
  adminName: z.string().min(2).max(100).optional(),
});

/**
 * POST /api/warehouses
 * First-time onboarding: create a warehouse and assign the caller as admin.
 */
export async function POST(request: Request) {
  try {
    const identity = await getAuthIdentity(request);
    if (!identity) {
      throw new PermissionError("Not authenticated. Please sign in again.");
    }

    const body = await request.json();
    const parsed = createWarehouseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("name", parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const warehouseName = parsed.data.name.trim();
    const adminName = (parsed.data.adminName ?? identity.name).trim();

    const supabase = createServiceClient();

    // Already belongs to a warehouse?
    const { data: existing } = await supabase
      .from("app_users")
      .select("user_id, warehouse_id, role")
      .eq("user_id", identity.userId)
      .maybeSingle();

    if (existing) {
      throw new ConflictError(
        "You already belong to a store. Ask an admin to invite you to another one.",
      );
    }

    // Create warehouse
    const { data: warehouse, error: whError } = await supabase
      .from("warehouses")
      .insert({ name: warehouseName })
      .select("warehouse_id, name")
      .single();

    if (whError || !warehouse) {
      throw whError ?? new Error("Failed to create store");
    }

    // Assign creator as admin
    const { data: appUser, error: userError } = await supabase
      .from("app_users")
      .insert({
        user_id: identity.userId,
        warehouse_id: warehouse.warehouse_id,
        name: adminName,
        email: identity.email,
        role: "admin",
        invite_status: "accepted",
        last_seen_at: new Date().toISOString(),
      })
      .select("user_id, email, name, role, warehouse_id")
      .single();

    if (userError || !appUser) {
      // Compensating rollback
      await supabase.from("warehouses").delete().eq("warehouse_id", warehouse.warehouse_id);
      throw userError ?? new Error("Failed to create admin membership");
    }

    // Seed default items
    await supabase.from("items").insert(
      DEFAULT_STORE_ITEMS.map((item) => ({
        warehouse_id: warehouse.warehouse_id,
        name: item.name,
        bag_size: item.bag_size,
        unit: item.unit,
      })),
    );

    // Seed default parties
    const DEFAULT_PARTIES = [
      "ABC Suppliers",
      "XYZ Traders",
      "Quick Transport",
      "Local Distributors",
    ];

    await supabase.from("parties").insert(
      DEFAULT_PARTIES.map((name) => ({
        warehouse_id: warehouse.warehouse_id,
        name,
      })),
    );

    await writeAudit(supabase, {
      warehouseId: warehouse.warehouse_id,
      userId: identity.userId,
      entity: "warehouse",
      entityId: warehouse.warehouse_id,
      action: "create_warehouse",
      newData: {
        name: warehouse.name,
        admin: adminName,
        email: identity.email,
      },
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return Response.json(
      {
        data: {
          warehouseId: warehouse.warehouse_id,
          warehouseName: warehouse.name,
          user: {
            id: appUser.user_id,
            email: appUser.email,
            name: appUser.name,
            role: appUser.role,
            warehouseId: appUser.warehouse_id,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/warehouses
 * Returns the current user's warehouse (if any).
 */
export async function GET(request: Request) {
  try {
    const identity = await getAuthIdentity(request);
    if (!identity) {
      throw new PermissionError("Not authenticated. Please sign in again.");
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ data: null, needsOnboarding: true });
    }

    return Response.json({
      data: {
        warehouseId: user.warehouseId,
        warehouseName: user.warehouseName,
        role: user.role,
      },
      needsOnboarding: false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
