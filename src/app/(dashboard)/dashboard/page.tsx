"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getDashboard } from "@/lib/api-client";
import { formatDate, formatWeight } from "@/lib/utils";
import ExportMenu from "@/components/ExportMenu";

interface ProductRow {
  item_id: string;
  product: string;
  bag_size: number;
  in_bags: number;
  in_kg: number;
  out_bags: number;
  out_kg: number;
  remaining: number;
  remaining_bags: number;
}

interface VehicleDoRow {
  do_id: string;
  do_number: string;
  direction: string;
  date: string;
  party: string;
  item_count: number;
  bags: number;
  total_weight: number;
}

interface VehicleRow {
  vehicle_number: string;
  do_count: number;
  item_count: number;
  bags: number;
  total_weight: number;
  in_bags: number;
  out_bags: number;
  in_weight: number;
  out_weight: number;
  dos: VehicleDoRow[];
}

interface Insights {
  period: { from: string; to: string; days: number };
  do_summary: {
    total_dos: number;
    in_dos: number;
    out_dos: number;
    avg_dos_per_day: number;
    working_days_with_activity: number;
  };
  movement: {
    net_bags: number;
    net_kg: number;
    stock_build_up: boolean;
    turnover_pct: number;
  };
  stock_alerts: {
    zero_or_negative: Array<{ product: string; remaining: number; remaining_bags: number }>;
    low_stock: Array<{ product: string; remaining: number; remaining_bags: number }>;
    idle_products: string[];
    active_products: number;
    total_products: number;
  };
  top_parties: Array<{
    name: string;
    dos: number;
    bags: number;
    weight: number;
    in_bags: number;
    out_bags: number;
  }>;
  top_staff: Array<{ name: string; dos: number; bags: number }>;
  top_stock: Array<{ product: string; remaining: number; remaining_bags: number }>;
  most_moved: Array<{ product: string; in_bags: number; out_bags: number; total_bags: number }>;
  daily_trend: Array<{
    date: string;
    in_dos: number;
    out_dos: number;
    in_bags: number;
    out_bags: number;
  }>;
  vehicles: VehicleRow[];
  recent_dos: Array<{
    do_id: string;
    do_number: string;
    direction: string;
    date: string;
    party: string;
    created_by: string;
    bags: number;
  }>;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
  const defaultTo = now.toISOString().split("T")[0];

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [preset, setPreset] = useState("30d");
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [vehicleSearch, setVehicleSearch] = useState("");

  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      router.replace("/challans");
      return;
    }
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, from, to]);

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const result = await getDashboard(from, to);
      setRows(result.data ?? []);
      setInsights(result.insights ?? null);
      setExpandedVehicles(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  const applyPreset = (p: string) => {
    setPreset(p);
    const t = new Date();
    const toStr = t.toISOString().split("T")[0];
    let fromStr: string;
    switch (p) {
      case "7d":
        fromStr = new Date(t.getTime() - 7 * 86400000).toISOString().split("T")[0];
        break;
      case "30d":
        fromStr = new Date(t.getTime() - 30 * 86400000).toISOString().split("T")[0];
        break;
      case "mtd":
        fromStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`;
        break;
      case "ytd":
        fromStr = `${t.getFullYear()}-01-01`;
        break;
      default:
        fromStr = defaultFrom;
    }
    setFrom(fromStr);
    setTo(toStr);
  };

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        totalInBags: acc.totalInBags + r.in_bags,
        totalInKg: acc.totalInKg + r.in_kg,
        totalOutBags: acc.totalOutBags + r.out_bags,
        totalOutKg: acc.totalOutKg + r.out_kg,
        totalRemaining: acc.totalRemaining + r.remaining,
        totalRemainingBags: acc.totalRemainingBags + r.remaining_bags,
      }),
      {
        totalInBags: 0,
        totalInKg: 0,
        totalOutBags: 0,
        totalOutKg: 0,
        totalRemaining: 0,
        totalRemainingBags: 0,
      },
    );
  }, [rows]);

  const exportRows = useMemo(
    () =>
      rows.map((r) => ({
        product: r.product,
        bag_size: r.bag_size,
        in_bags: r.in_bags,
        in_kg: r.in_kg,
        out_bags: r.out_bags,
        out_kg: r.out_kg,
        remaining: r.remaining,
        remaining_bags: r.remaining_bags,
      })),
    [rows],
  );

  const maxDailyBags = useMemo(() => {
    if (!insights?.daily_trend?.length) return 1;
    return Math.max(
      1,
      ...insights.daily_trend.map((d) => d.in_bags + d.out_bags),
    );
  }, [insights]);

  const vehicleRows = useMemo(() => {
    const list = insights?.vehicles ?? [];
    const q = vehicleSearch.trim().toUpperCase();
    if (!q) return list;
    return list.filter(
      (v) =>
        v.vehicle_number.toUpperCase().includes(q) ||
        v.dos.some(
          (d) =>
            d.do_number.toUpperCase().includes(q) ||
            d.party.toUpperCase().includes(q),
        ),
    );
  }, [insights, vehicleSearch]);

  const toggleVehicle = (vehicleNumber: string) => {
    setExpandedVehicles((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleNumber)) next.delete(vehicleNumber);
      else next.add(vehicleNumber);
      return next;
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="font-display text-[22px] sm:text-[28px] font-bold tracking-[-0.02em] text-ink">
            Inventory Dashboard
          </h1>
          <p className="text-[12px] sm:text-[14px] text-ink-soft mt-1">
            Track stock movement, entries, and inventory across your store.
          </p>
        </div>
        <ExportMenu
          filename={`inventory-${from}-${to}`}
          title="Inventory Dashboard"
          sheetName="Inventory"
          subtitle={`${formatDate(from)} - ${formatDate(to)}`}
          columns={[
            { key: "product", header: "Product" },
            { key: "bag_size", header: "Default Qty" },
            { key: "in_bags", header: "IN (units)" },
            { key: "in_kg", header: "IN (qty)" },
            { key: "out_bags", header: "OUT (units)" },
            { key: "out_kg", header: "OUT (qty)" },
            { key: "remaining", header: "Remaining" },
            { key: "remaining_bags", header: "Units Left" },
          ]}
          rows={exportRows}
          disabled={loading}
        />
      </div>

      {/* Date Range */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5 mb-4 sm:mb-6 print:hidden">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div className="flex-1 min-w-[120px] sm:flex-none">
            <label className="block text-[11px] font-medium text-ink-faint mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("");
              }}
              className="focus-ring h-9 w-full rounded-[9px] border border-border bg-surface-2 px-2 sm:px-3 text-[12px] sm:text-[13px] text-ink"
            />
          </div>
          <div className="flex-1 min-w-[120px] sm:flex-none">
            <label className="block text-[11px] font-medium text-ink-faint mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("");
              }}
              className="focus-ring h-9 w-full rounded-[9px] border border-border bg-surface-2 px-2 sm:px-3 text-[12px] sm:text-[13px] text-ink"
            />
          </div>
          {["7d", "30d", "mtd", "ytd"].map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`h-9 px-2 sm:px-3 text-[11px] sm:text-[12px] font-medium rounded-[9px] transition-colors ${
                preset === p ? "bg-brand text-brand-ink" : "text-ink-soft hover:text-ink hover:bg-white/5"
              }`}
            >
              {p === "7d" ? "7D" : p === "30d" ? "30D" : p === "mtd" ? "MTD" : "YTD"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5">
          <div className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-green-400/80 mb-1 sm:mb-2">
            Stock In
          </div>
          <div className="font-display text-[18px] sm:text-[28px] font-bold text-green-400 leading-none">
            {totals.totalInBags.toLocaleString()}
          </div>
          <div className="text-[11px] sm:text-[13px] text-green-400/80 mt-1">
            {totals.totalInKg.toLocaleString()} total qty
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5">
          <div className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-orange-400/80 mb-1 sm:mb-2">
            Stock Out
          </div>
          <div className="font-display text-[18px] sm:text-[28px] font-bold text-orange-400 leading-none">
            {totals.totalOutBags.toLocaleString()}
          </div>
          <div className="text-[11px] sm:text-[13px] text-orange-400/80 mt-1">
            {totals.totalOutKg.toLocaleString()} total qty
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5">
          <div className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-1 sm:mb-2">
            Balance
          </div>
          <div className="font-display text-[18px] sm:text-[28px] font-bold text-ink leading-none">
            {totals.totalRemaining.toLocaleString()}
          </div>
          <div className="text-[11px] sm:text-[13px] text-ink-soft mt-1">
            {totals.totalRemainingBags.toLocaleString()} units remaining
          </div>
        </div>
      </div>

      {/* Product matrix */}
      <div className="mb-2">
        <h2 className="text-[13px] font-semibold text-ink">
          Stock Summary
        </h2>
        <p className="text-[11px] text-ink-faint">
          IN / OUT / Remaining breakdown by product
        </p>
      </div>

      {error ? (
        <div className="rounded-[var(--radius-card)] border border-red-500/20 bg-red-500/5 p-6 text-center mb-6">
          <p className="text-[13px] text-red-400 mb-3">{error}</p>
          <button onClick={fetchData} className="text-[13px] font-semibold text-brand hover:underline">
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-12 text-center mb-6">
          <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
          <p className="text-[13px] text-ink-faint mt-3">
            Loading inventory data...
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-12 text-center mb-6">
          <p className="text-[13px] text-ink-faint">
            No inventory movements in this period.
          </p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                    Product
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                    Default Qty
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-green-400/80 font-semibold px-4 py-3">
                    IN (units)
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-green-400/80 font-semibold px-4 py-3">
                    IN (qty)
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-orange-400/80 font-semibold px-4 py-3">
                    OUT (units)
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-orange-400/80 font-semibold px-4 py-3">
                    OUT (qty)
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                    Balance
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                    Units Left
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.item_id}
                    className="border-b border-border/50 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 text-[13px] font-medium text-ink">{r.product}</td>
                    <td className="px-4 py-3 text-[13px] text-ink-soft text-right">{r.bag_size} kg</td>
                    <td className="px-4 py-3 text-[13px] text-green-400 text-right font-medium">
                      {r.in_bags.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-green-400/80 text-right">
                      {r.in_kg.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-orange-400 text-right font-medium">
                      {r.out_bags.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-orange-400/80 text-right">
                      {r.out_kg.toLocaleString()}
                    </td>
                    <td
                      className={`px-4 py-3 text-[13px] text-right font-semibold ${
                        r.remaining > 0
                          ? "text-ink"
                          : r.remaining < 0
                            ? "text-red-400"
                            : "text-ink-faint"
                      }`}
                    >
                      {r.remaining.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-ink-soft text-right">
                      {r.remaining_bags.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-white/[0.02]">
                  <td className="px-4 py-3 text-[13px] font-bold text-ink">
                    Total ({rows.length} products)
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-[13px] text-green-400 text-right font-bold">
                    {totals.totalInBags.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-green-400/80 text-right font-bold">
                    {totals.totalInKg.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-orange-400 text-right font-bold">
                    {totals.totalOutBags.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-orange-400/80 text-right font-bold">
                    {totals.totalOutKg.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-ink text-right font-bold">
                    {totals.totalRemaining.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-ink-soft text-right font-bold">
                    {totals.totalRemainingBags.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Vehicle ledger */}
      {insights && !loading && (
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-2">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">
                Vehicle Ledger
              </h2>
              <p className="text-[11px] text-ink-faint">
                Track all entries per vehicle in the selected period.
              </p>
            </div>
            <input
              type="search"
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              placeholder="Search vehicle, entry, or party..."
              className="focus-ring h-9 w-full sm:w-64 rounded-[9px] border border-border bg-surface px-3 text-[12px] text-ink placeholder:text-ink-faint"
            />
          </div>

          {vehicleRows.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-border bg-surface p-8 text-center">
              <p className="text-[13px] text-ink-faint">
                No vehicle entries in this period.
              </p>
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                        Vehicle No.
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                        Entries
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                        Items
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                        Units
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                        Qty
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-green-400/80 font-semibold px-4 py-3">
                        IN
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-orange-400/80 font-semibold px-4 py-3">
                        OUT
                      </th>
                      <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-4 py-3">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleRows.map((vehicle) => {
                      const open = expandedVehicles.has(vehicle.vehicle_number);
                      return (
                        <Fragment key={vehicle.vehicle_number}>
                          <tr className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 text-[13px] font-semibold text-ink">
                              <button
                                type="button"
                                onClick={() => toggleVehicle(vehicle.vehicle_number)}
                                className="inline-flex items-center gap-2 text-left hover:text-brand transition-colors"
                              >
                                <span className="text-ink-faint text-[11px] w-3">
                                  {open ? "▾" : "▸"}
                                </span>
                                {vehicle.vehicle_number}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-[13px] text-ink-soft text-right">
                              {vehicle.do_count}
                            </td>
                            <td className="px-4 py-3 text-[13px] text-ink-soft text-right">
                              {vehicle.item_count}
                            </td>
                            <td className="px-4 py-3 text-[13px] text-ink text-right font-medium">
                              {vehicle.bags.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-[13px] text-ink-soft text-right">
                              {formatWeight(vehicle.total_weight)}
                            </td>
                            <td className="px-4 py-3 text-[12px] text-green-400 text-right">
                              {vehicle.in_bags.toLocaleString()} / {formatWeight(vehicle.in_weight)}
                            </td>
                            <td className="px-4 py-3 text-[12px] text-orange-400 text-right">
                              {vehicle.out_bags.toLocaleString()} / {formatWeight(vehicle.out_weight)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => toggleVehicle(vehicle.vehicle_number)}
                                className="text-[12px] font-medium text-brand hover:underline"
                              >
                                {open ? "Hide" : "Show entries"}
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-b border-border/50">
                              <td colSpan={8} className="px-4 py-3 bg-surface-2/60">
                                <div className="overflow-x-auto rounded-[10px] border border-border/70">
                                  <table className="w-full min-w-[640px]">
                                    <thead>
                                      <tr className="border-b border-border/60">
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Entry No.
                                        </th>
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Date
                                        </th>
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Direction
                                        </th>
                                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Party
                                        </th>
                                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Items
                                        </th>
                                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Bags
                                        </th>
                                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Weight
                                        </th>
                                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                                          Entry Ref
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {vehicle.dos.map((doRow) => (
                                        <tr
                                          key={doRow.do_id}
                                          className="border-b border-border/40 last:border-b-0"
                                        >
                                          <td className="px-3 py-2 text-[12px] font-medium text-ink">
                                            {doRow.do_number}
                                          </td>
                                          <td className="px-3 py-2 text-[12px] text-ink-soft">
                                            {formatDate(doRow.date)}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span
                                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                                doRow.direction === "IN"
                                                  ? "bg-green-500/15 text-green-400"
                                                  : "bg-orange-500/15 text-orange-400"
                                              }`}
                                            >
                                              {doRow.direction}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-[12px] text-ink-soft truncate max-w-[160px]">
                                            {doRow.party}
                                          </td>
                                          <td className="px-3 py-2 text-[12px] text-ink-soft text-right">
                                            {doRow.item_count}
                                          </td>
                                          <td className="px-3 py-2 text-[12px] text-ink text-right">
                                            {doRow.bags}
                                          </td>
                                          <td className="px-3 py-2 text-[12px] text-ink-soft text-right">
                                            {formatWeight(doRow.total_weight)}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            <Link
                                              href={`/challans/${doRow.do_id}`}
                                              className="text-[12px] font-medium text-brand hover:underline"
                                            >
                                              Open
                                            </Link>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Insights */}
      {insights && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Total Entries
            </div>
            <div className="text-[20px] font-bold text-ink mt-0.5">
              {insights.do_summary.total_dos}
            </div>
            <div className="text-[11px] text-ink-faint">
              {insights.do_summary.in_dos} IN · {insights.do_summary.out_dos} OUT
            </div>
          </div>
          <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Daily Average
            </div>
            <div className="text-[20px] font-bold text-ink mt-0.5">
              {insights.do_summary.avg_dos_per_day}
            </div>
            <div className="text-[11px] text-ink-faint">
              {insights.do_summary.working_days_with_activity}/{insights.period.days} active days
            </div>
          </div>
          <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Net Movement
            </div>
            <div
              className={`text-[20px] font-bold mt-0.5 ${
                insights.movement.net_bags >= 0 ? "text-green-400" : "text-orange-400"
              }`}
            >
              {insights.movement.net_bags >= 0 ? "+" : ""}
              {insights.movement.net_bags.toLocaleString()} units
            </div>
            <div className="text-[11px] text-ink-faint">
              {insights.movement.stock_build_up ? "Stock building up" : "Stock reducing"}
            </div>
          </div>
          <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Active Products
            </div>
            <div className="text-[20px] font-bold text-ink mt-0.5">
              {insights.stock_alerts.active_products}/{insights.stock_alerts.total_products}
            </div>
            <div className="text-[11px] text-ink-faint">
              {insights.stock_alerts.idle_products.length} idle
            </div>
          </div>
        </div>
      )}

      {/* Alerts & Tips */}
      {insights && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4 sm:mb-6">
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-ink mb-1">
              Stock Alerts
            </h2>
            <p className="text-[11px] text-ink-faint mb-3">
              Review before processing outward entries
            </p>
            {insights.stock_alerts.zero_or_negative.length === 0 &&
            insights.stock_alerts.low_stock.length === 0 ? (
              <p className="text-[13px] text-green-400">
                All stock levels look good.
              </p>
            ) : (
              <div className="space-y-2">
                {insights.stock_alerts.zero_or_negative.map((a) => (
                  <div
                    key={`z-${a.product}`}
                    className="flex items-center justify-between gap-2 rounded-[9px] bg-red-500/10 border border-red-500/20 px-3 py-2"
                  >
                    <span className="text-[13px] text-ink font-medium">{a.product}</span>
                    <span className="text-[11px] font-semibold text-red-400">
                      Out of stock ({a.remaining})
                    </span>
                  </div>
                ))}
                {insights.stock_alerts.low_stock.map((a) => (
                  <div
                    key={`l-${a.product}`}
                    className="flex items-center justify-between gap-2 rounded-[9px] bg-amber-500/10 border border-amber-500/20 px-3 py-2"
                  >
                    <span className="text-[13px] text-ink font-medium">{a.product}</span>
                    <span className="text-[11px] font-semibold text-amber-400">
                      Low stock · {a.remaining_bags} units left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-ink mb-1">
              Quick Tips
            </h2>
            <ul className="mt-2 space-y-2 text-[12px] text-ink-soft">
              <li>
                · Record every entry on the same day to keep stock audit-ready.
              </li>
              <li>
                · Verify party name before creating an entry for accurate reporting.
              </li>
              <li>
                · Net movement this period:{" "}
                <span className="text-ink font-medium">
                  {insights.movement.net_kg.toLocaleString()} qty
                </span>
                {insights.movement.stock_build_up
                  ? " (incoming > outgoing)"
                  : " (outgoing > incoming)"}
              </li>
              {insights.stock_alerts.idle_products.length > 0 && (
                <li>
                  · No movement for:{" "}
                  <span className="text-ink">
                    {insights.stock_alerts.idle_products.slice(0, 4).join(", ")}
                    {insights.stock_alerts.idle_products.length > 4 ? "…" : ""}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Parties + Staff + Movement */}
      {insights && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4 sm:mb-6">
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-ink mb-3">
              Top Parties
            </h2>
            {insights.top_parties.length === 0 ? (
              <p className="text-[12px] text-ink-faint">No parties in this period.</p>
            ) : (
              <div className="space-y-2">
                {insights.top_parties.map((p, idx) => (
                  <div key={`${p.name}-${idx}`} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink truncate">{p.name}</div>
                      <div className="text-[11px] text-ink-faint">
                        {p.dos} entries · IN {p.in_bags} · OUT {p.out_bags}
                      </div>
                    </div>
                    <div className="text-[12px] font-semibold text-ink-soft shrink-0">
                      {p.bags} units
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-ink mb-3">
              Staff Activity
            </h2>
            {insights.top_staff.length === 0 ? (
              <p className="text-[12px] text-ink-faint">No staff activity in this period.</p>
            ) : (
              <div className="space-y-2">
                {insights.top_staff.map((s, idx) => (
                  <div key={`${s.name}-${idx}`} className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-medium text-ink truncate">{s.name}</div>
                    <div className="text-[11px] text-ink-faint shrink-0">
                      {s.dos} entries · {s.bags} units
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-ink mb-3">
              Most Active Products
            </h2>
            {insights.most_moved.length === 0 ? (
              <p className="text-[12px] text-ink-faint">No product movement in this period.</p>
            ) : (
              <div className="space-y-2">
                {insights.most_moved.map((m) => (
                  <div key={m.product} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink truncate">{m.product}</div>
                      <div className="text-[11px] text-ink-faint">
                        IN {m.in_bags} · OUT {m.out_bags}
                      </div>
                    </div>
                    <div className="text-[12px] font-semibold text-brand shrink-0">
                      {m.total_bags} units
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Daily trend simple bars */}
      {insights && insights.daily_trend.length > 0 && !loading && (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 mb-4 sm:mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[13px] font-semibold text-ink">
              Daily Movement
            </h2>
            <span className="text-[11px] text-ink-faint">
              Green = IN · Orange = OUT
            </span>
          </div>
          <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
            {insights.daily_trend.map((d) => {
              const inH = Math.max(2, Math.round((d.in_bags / maxDailyBags) * 80));
              const outH = Math.max(d.out_bags > 0 ? 2 : 0, Math.round((d.out_bags / maxDailyBags) * 80));
              return (
                <div
                  key={d.date}
                  className="flex flex-col items-center gap-1 min-w-[28px] flex-1"
                  title={`${d.date}: IN ${d.in_bags} units (${d.in_dos} entries), OUT ${d.out_bags} units (${d.out_dos} entries)`}
                >
                  <div className="flex items-end gap-0.5 h-20">
                    <div className="w-2.5 rounded-t bg-green-400/80" style={{ height: `${inH}px` }} />
                    <div className="w-2.5 rounded-t bg-orange-400/80" style={{ height: `${outH || 0}px` }} />
                  </div>
                  <span className="text-[9px] text-ink-faint">
                    {d.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Entries */}
      {insights && insights.recent_dos.length > 0 && !loading && (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden mb-4 sm:mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-semibold text-ink">
              Recent Entries
            </h2>
            <button
              onClick={() => router.push("/challans")}
              className="text-[12px] font-medium text-brand hover:underline"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-border/50">
            {insights.recent_dos.map((d) => (
              <button
                key={d.do_id}
                onClick={() => router.push(`/challans/${d.do_id}`)}
                className="w-full text-left px-4 py-2.5 hover:bg-white/[0.02] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink truncate">{d.party}</span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        d.direction === "IN"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-orange-500/15 text-orange-400"
                      }`}
                    >
                      {d.direction}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-faint">
                    {d.do_number} · {d.date} · {d.created_by}
                  </div>
                </div>
                <div className="text-[12px] text-ink-soft shrink-0">{d.bags} units</div>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
