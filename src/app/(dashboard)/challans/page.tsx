"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { listDOs, deleteDO } from "@/lib/api-client";
import ExportMenu from "@/components/ExportMenu";
import {
  formatWeight,
  formatDate,
  last7DaysRange,
} from "@/lib/utils";

interface DOItemRow {
  bags: number;
  total_weight: number;
  vehicle_number?: string | null;
  items?: { name: string; bag_size?: number } | null;
}

interface DORecord {
  do_id: string;
  do_number: string;
  direction: string;
  date: string;
  item_count: number;
  created_at: string;
  parties?: { name: string } | null;
  app_users?: { name: string } | null;
  do_items?: DOItemRow[];
}

export default function DOsPage() {
  const { user } = useAuth();
  const initialRange = last7DaysRange();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [DOs, setDOs] = useState<DORecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !from || !to) return;
    fetchDOs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, from, to]);

  async function fetchDOs(nextCursor?: string) {
    setLoading(true);
    try {
      const result = await listDOs({
        from,
        to,
        cursor: nextCursor,
        limit: 50,
      });
      if (nextCursor) {
        setDOs((prev) => [...prev, ...result.data]);
      } else {
        setDOs(result.data);
      }
      setHasMore(result.hasMore);
      setCursor(result.cursor);
    } catch (err) {
      console.error("Failed to fetch entries:", err);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    let bags = 0;
    let weight = 0;

    for (const DO of DOs) {
      if (DO.do_items) {
        for (const item of DO.do_items) {
          bags += item.bags;
          weight += item.total_weight;
        }
      }
    }

    return { doCount: DOs.length, bags, weight };
  }, [DOs]);

  const handleApply = () => {
    setCursor(null);
    fetchDOs();
  };

  const handleToday = () => {
    const today = new Date().toISOString().split("T")[0];
    setFrom(today);
    setTo(today);
  };

  const handleClear = () => {
    setFrom("");
    setTo("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await deleteDO(id);
      setDOs((prev) => prev.filter((d) => d.do_id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const showingRange =
    from && to
      ? `Showing ${formatDate(from)} - ${formatDate(to)}`
      : "";

  const exportRows = useMemo(
    () =>
      DOs.map((d) => {
        const bags = (d.do_items ?? []).reduce((s, i) => s + i.bags, 0);
        const weight = (d.do_items ?? []).reduce((s, i) => s + i.total_weight, 0);
        return {
          do_number: d.do_number,
          direction: d.direction,
          date: d.date,
          party: d.parties?.name ?? "",
          created_by: d.app_users?.name ?? "",
          items: d.item_count,
          bags,
          weight,
        };
      }),
    [DOs],
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="font-display text-[22px] sm:text-[28px] font-bold tracking-[-0.02em] text-ink">
            Inventory Entries
          </h1>
          <p className="text-[12px] sm:text-[14px] text-ink-soft mt-1">
            Your entries &mdash; In &amp; Out, units, quantity and totals.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportMenu
            filename={`dos-${from || "all"}-${to || "all"}`}
            title="Inventory Records"
            sheetName="Entries"
            subtitle={showingRange || undefined}
            columns={[
              { key: "do_number", header: "Entry Number" },
              { key: "direction", header: "Direction" },
              { key: "date", header: "Date" },
              { key: "party", header: "Party" },
              { key: "created_by", header: "Created By" },
              { key: "items", header: "Items" },
              { key: "bags", header: "Units" },
              { key: "weight", header: "Quantity" },
            ]}
            rows={exportRows}
            disabled={loading}
          />
          <Link
            href="/items"
            className="inline-flex h-9 items-center px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium border border-border text-ink-soft hover:text-ink hover:bg-white/5 rounded-[10px] transition-colors"
          >
            Items
          </Link>
          <Link
            href="/challans/new"
            className="inline-flex h-9 items-center gap-1.5 px-3 sm:px-4 text-[12px] sm:text-[13px] font-semibold bg-brand hover:bg-brand-strong text-brand-ink rounded-[10px] shadow-[var(--shadow-sm)] transition-all active:scale-[0.98]"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Entry
          </Link>
        </div>
      </div>

      {/* Date Filter */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-[13px] font-medium text-ink-soft hover:text-ink transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filters
          </button>
          {showingRange && (
            <span className="text-[12px] text-ink-faint">{showingRange}</span>
          )}
        </div>
        {showFilters && (
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="flex-1 min-w-[120px] sm:flex-none">
              <label className="block text-[11px] font-medium text-ink-faint mb-1">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="focus-ring h-9 w-full rounded-[9px] border border-border bg-surface-2 px-2 sm:px-3 text-[12px] sm:text-[13px] text-ink focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-[120px] sm:flex-none">
              <label className="block text-[11px] font-medium text-ink-faint mb-1">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="focus-ring h-9 w-full rounded-[9px] border border-border bg-surface-2 px-2 sm:px-3 text-[12px] sm:text-[13px] text-ink focus:outline-none"
              />
            </div>
            <button
              onClick={handleApply}
              className="inline-flex h-9 items-center gap-1.5 bg-brand hover:bg-brand-strong text-brand-ink px-3 sm:px-4 rounded-[9px] text-[12px] sm:text-[13px] font-semibold shadow-[var(--shadow-sm)] transition-all active:scale-[0.98]"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Apply
            </button>
            <button
              onClick={handleToday}
              className="h-9 px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium text-ink-soft hover:text-ink hover:bg-white/5 rounded-[9px] transition-colors"
            >
              Today
            </button>
            {from && to && (
              <button
                onClick={handleClear}
                className="h-9 px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium text-ink-soft hover:text-ink hover:bg-white/5 rounded-[9px] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Total Entries
            </span>
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ink-faint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="font-display text-[20px] sm:text-[28px] font-bold text-ink leading-none">
            {stats.doCount}
          </div>
          <div className="text-[9px] sm:text-[11px] text-ink-faint mt-1">in selected period</div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Units
            </span>
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ink-faint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <div className="font-display text-[20px] sm:text-[28px] font-bold text-ink leading-none">
            {stats.bags}
          </div>
          <div className="text-[9px] sm:text-[11px] text-ink-faint mt-1">all vehicles</div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-5">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Weight
            </span>
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ink-faint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
              />
            </svg>
          </div>
          <div className="font-display text-[20px] sm:text-[28px] font-bold text-ink leading-none">
            {formatWeight(stats.weight)}
          </div>
          <div className="text-[9px] sm:text-[11px] text-ink-faint mt-1">all vehicles</div>
        </div>
      </div>

      {/* DO List */}
      {loading && DOs.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-12 text-center">
          <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
          <p className="text-[13px] text-ink-faint mt-3">Loading entries...</p>
        </div>
      ) : DOs.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-12 text-center">
          <div className="w-12 h-12 rounded-[13px] bg-white/5 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="font-display font-semibold text-ink mb-1">
            {from && to ? "No entries in this range" : "No entries yet"}
          </h3>
          <p className="text-[13px] text-ink-faint mb-5 max-w-sm mx-auto">
            {from && to
              ? "Try a different date range, or clear the filter."
              : "Record your first inventory entry — add the vehicle, items, units and quantity, and totals are calculated for you."}
          </p>
          <Link
            href="/challans/new"
            className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-strong text-brand-ink px-5 py-2.5 rounded-[11px] text-[13px] font-semibold shadow-[var(--shadow-sm)] transition-all active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create an Entry
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {DOs.map((DO) => {
            const totalBags = DO.do_items?.reduce((s, i) => s + i.bags, 0) ?? 0;
            const totalWeight = DO.do_items?.reduce((s, i) => s + i.total_weight, 0) ?? 0;

            return (
              <div
                key={DO.do_id}
                className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5 hover:border-brand/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          DO.direction === "IN"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {DO.direction === "IN" ? "IN" : "OUT"}
                      </span>
                      <span className="text-[11px] sm:text-[12px] text-ink-faint">
                        {formatDate(DO.date)}
                      </span>
                    </div>
                    <h3 className="truncate font-display text-[13px] font-semibold text-ink sm:text-[14px]">
                      <Link
                        href={`/challans/${DO.do_id}`}
                        className="transition-colors hover:text-brand"
                      >
                        {DO.parties?.name || DO.do_number || "Unnamed Entry"}
                      </Link>
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] sm:text-[12px] text-ink-faint">
                      <span>
                        Entry: <span className="text-ink-soft">{DO.do_number || "N/A"}</span>
                      </span>
                      {DO.app_users && (
                        <span>
                          By: <span className="text-ink-soft">{DO.app_users.name}</span>
                        </span>
                      )}
                      {(DO.do_items?.length ?? 0) > 0 && (
                        <span>
                          Items: <span className="text-ink-soft">{DO.do_items?.length ?? DO.item_count}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <Link
                      href={`/challans/${DO.do_id}`}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-brand/10 hover:text-brand"
                      title="View Entry"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </Link>
                    <Link
                      href={`/challans/${DO.do_id}/edit`}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-brand/10 hover:text-brand"
                      title="Edit Entry"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => handleDelete(DO.do_id)}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="Delete Entry"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {(DO.do_items?.length ?? 0) > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-[10px] border border-border/70 bg-surface-2">
                    <table className="w-full min-w-[420px]">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                            Vehicle No.
                          </th>
                          <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                            Item
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                            Units
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                            Quantity
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {DO.do_items?.map((item, index) => (
                          <tr
                            key={`${DO.do_id}-${item.items?.name ?? index}-${index}`}
                            className="border-b border-border/40 last:border-b-0"
                          >
                            <td className="px-3 py-2 text-[12px] text-ink">
                              {item.vehicle_number?.trim() || "—"}
                            </td>
                            <td className="px-3 py-2 text-[12px] font-medium text-ink">
                              {item.items?.name ?? "Item"}
                            </td>
                            <td className="px-3 py-2 text-right text-[12px] text-ink-soft">
                              {item.bags}
                            </td>
                            <td className="px-3 py-2 text-right text-[12px] text-ink-soft">
                              {formatWeight(item.total_weight)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border/60">
                          <td
                            colSpan={2}
                            className="px-3 py-2 text-[12px] font-semibold text-ink-soft"
                          >
                            Total
                          </td>
                          <td className="px-3 py-2 text-right text-[12px] font-semibold text-ink">
                            {totalBags}
                          </td>
                          <td className="px-3 py-2 text-right text-[12px] font-semibold text-ink">
                            {formatWeight(totalWeight)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => fetchDOs(cursor!)}
              className="w-full py-3 text-[13px] font-medium text-brand hover:bg-white/5 rounded-[11px] transition-colors"
            >
              Load more...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
