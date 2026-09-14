"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  createWarehouseAsSuperAdmin,
  deleteWarehouseAsSuperAdmin,
  listAllWarehouses,
  updateWarehouseAsSuperAdmin,
} from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

interface WarehouseRow {
  warehouse_id: string;
  name: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  counts: {
    users: number;
    items: number;
    parties: number;
    dos: number;
    files: number;
  };
}

export default function SuperAdminPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listAllWarehouses(includeDeleted);
      setRows(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }, [includeDeleted]);

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin) {
      router.replace("/challans");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await listAllWarehouses(includeDeleted);
        if (cancelled) return;
        setRows(result.data ?? []);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load warehouses",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSuperAdmin, router, includeDeleted]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      await createWarehouseAsSuperAdmin(newName.trim());
      setNewName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (row: WarehouseRow) => {
    const name = window.prompt("New warehouse name", row.name);
    if (!name || name.trim() === row.name) return;
    try {
      await updateWarehouseAsSuperAdmin({
        warehouse_id: row.warehouse_id,
        name: name.trim(),
      });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const handleSoftDelete = async (row: WarehouseRow) => {
    if (!confirm(`Soft-delete "${row.name}"? It can be restored later.`)) return;
    try {
      await deleteWarehouseAsSuperAdmin(row.warehouse_id, "soft");
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleRestore = async (row: WarehouseRow) => {
    try {
      await updateWarehouseAsSuperAdmin({
        warehouse_id: row.warehouse_id,
        is_deleted: false,
      });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Restore failed");
    }
  };

  const handleHardDelete = async (row: WarehouseRow) => {
    const typed = window.prompt(
      `PERMANENTLY delete "${row.name}" and ALL its data?\nType the warehouse name to confirm:`,
    );
    if (typed !== row.name) return;
    try {
      await deleteWarehouseAsSuperAdmin(row.warehouse_id, "hard");
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Hard delete failed");
    }
  };

  if (authLoading || (!isSuperAdmin && loading)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
          Platform control
        </p>
        <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] text-ink sm:text-[28px]">
          Super Admin
        </h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          View and manage every warehouse, user, and dataset across the platform.
        </p>
        <Link
          href="/super-admin/audit"
          className="mt-3 inline-flex text-[13px] font-semibold text-brand hover:underline"
        >
          Audit log cleanup (date range / select rows) →
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-ink-faint">
            Create warehouse
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Warehouse name"
            className="focus-ring h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="h-10 rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-brand-ink disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create"}
        </button>
        <label className="flex h-10 items-center gap-2 text-[12px] text-ink-soft">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => {
              setLoading(true);
              setIncludeDeleted(e.target.checked);
            }}
          />
          Show deleted
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-[10px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-12 text-center text-[13px] text-ink-faint">
          Loading warehouses…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-12 text-center text-[13px] text-ink-faint">
          No warehouses found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Warehouse
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Users
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Entries
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Items
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Files
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.warehouse_id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/super-admin/${row.warehouse_id}`}
                        className="text-[13px] font-semibold text-ink hover:text-brand"
                      >
                        {row.name}
                      </Link>
                      {row.is_deleted && (
                        <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                          Deleted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-ink-soft">
                      {row.counts.users}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-ink-soft">
                      {row.counts.dos}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-ink-soft">
                      {row.counts.items}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-ink-soft">
                      {row.counts.files}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-ink-faint">
                      {formatDate(row.created_at.slice(0, 10))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link
                          href={`/super-admin/${row.warehouse_id}`}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-brand hover:bg-brand/10"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => void handleRename(row)}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-white/5"
                        >
                          Rename
                        </button>
                        {row.is_deleted ? (
                          <button
                            onClick={() => void handleRestore(row)}
                            className="rounded-lg px-2 py-1 text-[11px] font-medium text-green-400 hover:bg-green-500/10"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleSoftDelete(row)}
                            className="rounded-lg px-2 py-1 text-[11px] font-medium text-orange-400 hover:bg-orange-500/10"
                          >
                            Soft delete
                          </button>
                        )}
                        <button
                          onClick={() => void handleHardDelete(row)}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10"
                        >
                          Hard delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
