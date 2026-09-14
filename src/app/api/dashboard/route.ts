import { requireAuth } from "@/lib/auth";
import { checkRouteAccess } from "@/lib/rbac";
import { handleApiError, ValidationError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase";

const ROUTE_KEY = "GET /api/dashboard";

/**
 * GET /api/dashboard?startDate=<date>&endDate=<date>
 * Admin/Manager dashboard: inventory matrix + operational insights.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    await checkRouteAccess(ROUTE_KEY, user, request);

    const url = new URL(request.url);
    const startDate =
      url.searchParams.get("startDate") ?? url.searchParams.get("from");
    const endDate =
      url.searchParams.get("endDate") ?? url.searchParams.get("to");

    if (!startDate || !endDate) {
      throw new ValidationError("dates", "startDate and endDate are required");
    }
    if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
      throw new ValidationError("dates", "Invalid date format");
    }

    const supabase = createServiceClient();

    const { data: products, error: productsError } = await supabase
      .from("items")
      .select("item_id, name, bag_size, warehouse_id")
      .eq("warehouse_id", user.warehouseId)
      .order("name");

    if (productsError) throw productsError;

    const { data: summaries } = await supabase
      .from("product_summary")
      .select("item_id, total_in, total_out, remaining")
      .eq("warehouse_id", user.warehouseId);

    const summaryMap = new Map(
      summaries?.map((s) => [s.item_id, s]) ?? [],
    );

    const { data: filteredDoItems } = await supabase
      .from("do_items")
      .select(`
        item_id,
        bags,
        total_weight,
        delivery_orders!inner(direction, date, warehouse_id, do_id, party_id, user_id)
      `)
      .eq("delivery_orders.warehouse_id", user.warehouseId)
      .gte("delivery_orders.date", startDate)
      .lte("delivery_orders.date", endDate);

    const filteredAgg = new Map<string, { in_bags: number; in_kg: number; out_bags: number; out_kg: number }>();

    if (filteredDoItems) {
      for (const row of filteredDoItems) {
        const doRef = row.delivery_orders as unknown as { direction: string };
        const existing = filteredAgg.get(row.item_id) ?? { in_bags: 0, in_kg: 0, out_bags: 0, out_kg: 0 };

        if (doRef.direction === "IN") {
          existing.in_bags += row.bags;
          existing.in_kg += Number(row.total_weight);
        } else {
          existing.out_bags += row.bags;
          existing.out_kg += Number(row.total_weight);
        }
        filteredAgg.set(row.item_id, existing);
      }
    }

    const matrix = (products ?? []).map((item) => {
      const filtered = filteredAgg.get(item.item_id) ?? { in_bags: 0, in_kg: 0, out_bags: 0, out_kg: 0 };
      const summary = summaryMap.get(item.item_id);
      const remaining = Number(summary?.remaining ?? 0);
      const remainingBags = item.bag_size > 0 ? Math.floor(remaining / item.bag_size) : 0;

      return {
        item_id: item.item_id,
        product: item.name,
        bag_size: item.bag_size,
        in_bags: filtered.in_bags,
        in_kg: Math.round(filtered.in_kg * 100) / 100,
        out_bags: filtered.out_bags,
        out_kg: Math.round(filtered.out_kg * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        remaining_bags: remainingBags,
      };
    });

    // ─── DO-level insights for the period ─────────────────────────────
    const { data: dosInPeriod } = await supabase
      .from("delivery_orders")
      .select(`
        do_id,
        do_number,
        direction,
        date,
        party_id,
        user_id,
        parties(name),
        app_users(name),
        do_items(bags, total_weight, vehicle_number, item_id)
      `)
      .eq("warehouse_id", user.warehouseId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    const doList = dosInPeriod ?? [];
    let inDoCount = 0;
    let outDoCount = 0;
    const partyVolume = new Map<string, { name: string; bags: number; weight: number; dos: number; in_bags: number; out_bags: number }>();
    const staffVolume = new Map<string, { name: string; dos: number; bags: number }>();
    const dailyMap = new Map<string, { date: string; in_dos: number; out_dos: number; in_bags: number; out_bags: number }>();

    type VehicleDoAgg = {
      do_id: string;
      do_number: string;
      direction: string;
      date: string;
      party: string;
      item_count: number;
      bags: number;
      total_weight: number;
    };
    type VehicleAgg = {
      vehicle_number: string;
      do_count: number;
      item_count: number;
      bags: number;
      total_weight: number;
      in_bags: number;
      out_bags: number;
      in_weight: number;
      out_weight: number;
      dos: Map<string, VehicleDoAgg>;
    };
    const vehicleVolume = new Map<string, VehicleAgg>();

    for (const d of doList) {
      const items = (d.do_items as Array<{
        bags: number;
        total_weight: number;
        vehicle_number?: string | null;
        item_id?: string;
      }> | null) ?? [];
      const bags = items.reduce((s, i) => s + (i.bags ?? 0), 0);
      const weight = items.reduce((s, i) => s + Number(i.total_weight ?? 0), 0);

      if (d.direction === "IN") inDoCount += 1;
      else outDoCount += 1;

      const day = dailyMap.get(d.date) ?? {
        date: d.date,
        in_dos: 0,
        out_dos: 0,
        in_bags: 0,
        out_bags: 0,
      };
      if (d.direction === "IN") {
        day.in_dos += 1;
        day.in_bags += bags;
      } else {
        day.out_dos += 1;
        day.out_bags += bags;
      }
      dailyMap.set(d.date, day);

      const partyName = (d.parties as { name: string } | null)?.name ?? "No party / बिना पार्टी";
      const partyKey = d.party_id ?? "none";
      const party = partyVolume.get(partyKey) ?? {
        name: partyName,
        bags: 0,
        weight: 0,
        dos: 0,
        in_bags: 0,
        out_bags: 0,
      };
      party.bags += bags;
      party.weight += weight;
      party.dos += 1;
      if (d.direction === "IN") party.in_bags += bags;
      else party.out_bags += bags;
      partyVolume.set(partyKey, party);

      const staffName = (d.app_users as { name: string } | null)?.name ?? "Unknown";
      const staff = staffVolume.get(d.user_id) ?? { name: staffName, dos: 0, bags: 0 };
      staff.dos += 1;
      staff.bags += bags;
      staffVolume.set(d.user_id, staff);

      // Group line items by vehicle within this DO
      const byVehicle = new Map<string, { bags: number; weight: number; item_count: number }>();
      for (const item of items) {
        const raw = item.vehicle_number?.trim() ?? "";
        const vehicleKey = raw ? raw.toUpperCase() : "__none__";
        const current = byVehicle.get(vehicleKey) ?? { bags: 0, weight: 0, item_count: 0 };
        current.bags += item.bags ?? 0;
        current.weight += Number(item.total_weight ?? 0);
        current.item_count += 1;
        byVehicle.set(vehicleKey, current);
      }

      for (const [vehicleKey, line] of byVehicle) {
        const displayName =
          vehicleKey === "__none__" ? "No vehicle / बिना गाड़ी" : vehicleKey;
        const vehicle = vehicleVolume.get(vehicleKey) ?? {
          vehicle_number: displayName,
          do_count: 0,
          item_count: 0,
          bags: 0,
          total_weight: 0,
          in_bags: 0,
          out_bags: 0,
          in_weight: 0,
          out_weight: 0,
          dos: new Map<string, VehicleDoAgg>(),
        };

        vehicle.item_count += line.item_count;
        vehicle.bags += line.bags;
        vehicle.total_weight += line.weight;
        if (d.direction === "IN") {
          vehicle.in_bags += line.bags;
          vehicle.in_weight += line.weight;
        } else {
          vehicle.out_bags += line.bags;
          vehicle.out_weight += line.weight;
        }

        const existingDo = vehicle.dos.get(d.do_id);
        if (existingDo) {
          existingDo.item_count += line.item_count;
          existingDo.bags += line.bags;
          existingDo.total_weight += line.weight;
        } else {
          vehicle.dos.set(d.do_id, {
            do_id: d.do_id,
            do_number: d.do_number,
            direction: d.direction,
            date: d.date,
            party: partyName,
            item_count: line.item_count,
            bags: line.bags,
            total_weight: line.weight,
          });
          vehicle.do_count += 1;
        }

        vehicleVolume.set(vehicleKey, vehicle);
      }
    }

    const vehicles = [...vehicleVolume.values()]
      .map((v) => ({
        vehicle_number: v.vehicle_number,
        do_count: v.do_count,
        item_count: v.item_count,
        bags: v.bags,
        total_weight: Math.round(v.total_weight * 100) / 100,
        in_bags: v.in_bags,
        out_bags: v.out_bags,
        in_weight: Math.round(v.in_weight * 100) / 100,
        out_weight: Math.round(v.out_weight * 100) / 100,
        dos: [...v.dos.values()]
          .map((row) => ({
            ...row,
            total_weight: Math.round(row.total_weight * 100) / 100,
          }))
          .sort((a, b) => b.date.localeCompare(a.date) || a.do_number.localeCompare(b.do_number)),
      }))
      .sort((a, b) => {
        if (a.vehicle_number.startsWith("No vehicle")) return 1;
        if (b.vehicle_number.startsWith("No vehicle")) return -1;
        return b.do_count - a.do_count || b.bags - a.bags || a.vehicle_number.localeCompare(b.vehicle_number);
      });

    const topParties = [...partyVolume.values()]
      .sort((a, b) => b.bags - a.bags)
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        dos: p.dos,
        bags: p.bags,
        weight: Math.round(p.weight * 100) / 100,
        in_bags: p.in_bags,
        out_bags: p.out_bags,
      }));

    const topStaff = [...staffVolume.values()]
      .sort((a, b) => b.dos - a.dos)
      .slice(0, 5);

    const dailyTrend = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    const activeProducts = matrix.filter((r) => r.in_bags > 0 || r.out_bags > 0);
    const idleProducts = matrix.filter((r) => r.in_bags === 0 && r.out_bags === 0);
    const zeroStock = matrix.filter((r) => r.remaining <= 0);
    const lowStock = matrix.filter((r) => r.remaining > 0 && r.remaining_bags > 0 && r.remaining_bags <= 10);
    const topStock = [...matrix].sort((a, b) => b.remaining - a.remaining).slice(0, 5);
    const mostMoved = [...activeProducts]
      .sort((a, b) => (b.in_bags + b.out_bags) - (a.in_bags + a.out_bags))
      .slice(0, 5);

    const totalInBags = matrix.reduce((s, r) => s + r.in_bags, 0);
    const totalOutBags = matrix.reduce((s, r) => s + r.out_bags, 0);
    const totalInKg = matrix.reduce((s, r) => s + r.in_kg, 0);
    const totalOutKg = matrix.reduce((s, r) => s + r.out_kg, 0);
    const totalRemaining = matrix.reduce((s, r) => s + r.remaining, 0);
    const netBags = totalInBags - totalOutBags;
    const netKg = Math.round((totalInKg - totalOutKg) * 100) / 100;

    const periodDays = Math.max(
      1,
      Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000,
      ) + 1,
    );

    const insights = {
      period: { from: startDate, to: endDate, days: periodDays },
      do_summary: {
        total_dos: doList.length,
        in_dos: inDoCount,
        out_dos: outDoCount,
        avg_dos_per_day: Math.round((doList.length / periodDays) * 10) / 10,
        working_days_with_activity: dailyTrend.filter((d) => d.in_dos + d.out_dos > 0).length,
      },
      movement: {
        net_bags: netBags,
        net_kg: netKg,
        stock_build_up: netBags > 0,
        turnover_pct:
          totalRemaining > 0
            ? Math.round((totalOutKg / totalRemaining) * 1000) / 10
            : 0,
      },
      stock_alerts: {
        zero_or_negative: zeroStock.map((r) => ({
          product: r.product,
          remaining: r.remaining,
          remaining_bags: r.remaining_bags,
        })),
        low_stock: lowStock.map((r) => ({
          product: r.product,
          remaining: r.remaining,
          remaining_bags: r.remaining_bags,
        })),
        idle_products: idleProducts.map((r) => r.product),
        active_products: activeProducts.length,
        total_products: matrix.length,
      },
      top_parties: topParties,
      top_staff: topStaff,
      top_stock: topStock.map((r) => ({
        product: r.product,
        remaining: r.remaining,
        remaining_bags: r.remaining_bags,
      })),
      most_moved: mostMoved.map((r) => ({
        product: r.product,
        in_bags: r.in_bags,
        out_bags: r.out_bags,
        total_bags: r.in_bags + r.out_bags,
      })),
      daily_trend: dailyTrend,
      vehicles,
      recent_dos: doList.slice(0, 8).map((d) => ({
        do_id: d.do_id,
        do_number: d.do_number,
        direction: d.direction,
        date: d.date,
        party: (d.parties as { name: string } | null)?.name ?? "—",
        created_by: (d.app_users as { name: string } | null)?.name ?? "—",
        bags: ((d.do_items as Array<{ bags: number }> | null) ?? []).reduce((s, i) => s + (i.bags ?? 0), 0),
      })),
    };

    return Response.json({
      startDate,
      endDate,
      data: matrix,
      products: matrix,
      insights,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
