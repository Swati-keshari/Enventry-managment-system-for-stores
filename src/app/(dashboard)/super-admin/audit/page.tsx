"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  deleteAuditAsSuperAdmin,
  listAllWarehouses,
  listAuditAsSuperAdmin,
} from "@/lib/api-client";

interface WarehouseOpt {
  warehouse_id: string;
  name: string;
}

interface AuditRow {
  log_id: number;
  warehouse_id: string;
  warehouse_name?: string | null;
  actor_name?: string | null;
  entity: string;
  entity_id?: string | null;
  action: string;
  timestamp: string;
  ip_address?: string | null;
  new_data?: Record<string, unknown> | null;
  old_data?: Record<string, unknown> | null;
}

function labelFor(row: AuditRow): string {
  const data = { ...(row.old_data ?? {}), ...(row.new_data ?? {}) };
  if (row.entity === "do" && typeof data.do_number === "string") {
    return `${data.do_number}${typeof data.direction === "string" ? ` · ${data.direction}` : ""}`;
  }
  if (typeof data.name === "string") return data.name;
  if (typeof data.file_name === "string") return data.file_name;
  if (typeof data.email === "string") return data.email;
  if (row.entity_id) return row.entity_id.slice(0, 8);
  return "—";
}

export default function SuperAdminAuditPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await listAuditAsSuperAdmin({
        warehouseId: warehouseId === "all" ? undefined : warehouseId,
        from: from || undefined,
        to: to || undefined,
        limit: 200,
      });
      setRows(result.data ?? []);
      setTotal(result.total ?? 0);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [warehouseId, from, to]);

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin) {
      router.replace("/challans");
      return;
    }
    let cancelled = false;
    void listAllWarehouses(true)
      .then((res) => {
        if (!cancelled) setWarehouses(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setWarehouses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await listAuditAsSuperAdmin({
          warehouseId: warehouseId === "all" ? undefined : warehouseId,
          from: from || undefined,
          to: to || undefined,
          limit: 200,
        });
        if (cancelled) return;
        setRows(result.data ?? []);
        setTotal(result.total ?? 0);
        setSelected(new Set());
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load audit logs",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSuperAdmin, warehouseId, from, to]);

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.log_id)),
    [rows, selected],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.log_id)));
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Permanently delete ${selected.size} selected audit log(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const result = await deleteAuditAsSuperAdmin({
        warehouseId: warehouseId === "all" ? undefined : warehouseId,
        logIds: [...selected],
      });
      setMessage(result.message ?? `Deleted ${result.deleted} log(s).`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setWorking(false);
    }
  };

  const deleteByRange = async () => {
    if (!from && !to) {
      setError("Choose a from and/or to date for range delete.");
      return;
    }
    const scope =
      warehouseId === "all" ? "ALL warehouses" : "the selected warehouse";
    if (
      !confirm(
        `Permanently delete audit logs for ${scope} from ${from || "beginning"} to ${to || "now"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const result = await deleteAuditAsSuperAdmin({
        warehouseId: warehouseId === "all" ? "all" : warehouseId,
        from: from || undefined,
        to: to || undefined,
      });
      setMessage(result.message ?? `Deleted ${result.deleted} log(s).`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Range delete failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 text-[12px] text-ink-faint">
        <Link href="/super-admin" className="hover:text-ink-soft">
          ← Super Admin
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-ink sm:text-[28px]">
          Audit log cleanup
        </h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          Super Admin only — delete logs by date range or one-by-one across warehouses.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <label className="text-[12px] text-ink-soft">
          Warehouse
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="mt-1 block h-9 min-w-[200px] rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
          >
            <option value="all">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.warehouse_id} value={w.warehouse_id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-ink-soft">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
          />
        </label>
        <label className="text-[12px] text-ink-soft">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || working}
          className="h-9 rounded-[9px] border border-border px-3 text-[12px] font-semibold text-ink-soft hover:bg-white/5 disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void deleteByRange()}
          disabled={working || (!from && !to)}
          className="h-9 rounded-[9px] border border-red-500/30 bg-red-500/10 px-3 text-[12px] font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
        >
          Delete by date range
        </button>
        <button
          type="button"
          onClick={() => void deleteSelected()}
          disabled={working || selected.size === 0}
          className="h-9 rounded-[9px] bg-red-500/90 px-3 text-[12px] font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          Delete selected ({selected.size})
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-[11px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-3 rounded-[11px] border border-green-500/20 bg-green-500/10 px-4 py-3 text-[13px] text-green-400">
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {loading ? (
          <div className="px-5 py-10 text-center text-[13px] text-ink-faint">
            Loading audit logs...
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-ink-faint">
            No audit rows for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    When
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Warehouse
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Actor
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Action
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Entity
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.log_id}
                    className="border-b border-border/50 text-[13px] text-ink"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.log_id)}
                        onChange={() => toggleOne(row.log_id)}
                        aria-label={`Select log ${row.log_id}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-ink-faint">
                      {row.log_id}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-ink-soft">
                      {row.timestamp.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-ink-soft">
                      {row.warehouse_name ?? row.warehouse_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-[12px]">
                      {row.actor_name ?? "System"}
                    </td>
                    <td className="px-3 py-2 text-[12px]">{row.action}</td>
                    <td className="px-3 py-2 text-[12px]">
                      {row.entity} · {labelFor(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-faint">
        Showing {rows.length} of {total} matching logs.
      </p>
    </div>
  );
}
