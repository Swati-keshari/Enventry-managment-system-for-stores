"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  deleteAuditAsSuperAdmin,
  getWarehouseAsSuperAdmin,
  listAuditAsSuperAdmin,
  mutateWarehouseUserAsSuperAdmin,
} from "@/lib/api-client";
import { formatDate, formatWeight } from "@/lib/utils";

type Tab = "overview" | "users" | "dos" | "items" | "parties" | "files" | "audit";

interface WarehouseDetail {
  warehouse: {
    warehouse_id: string;
    name: string;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
  };
  users: Array<{
    user_id: string;
    name: string;
    email: string;
    role: string;
    invite_status?: string;
    last_seen_at?: string | null;
    created_at: string;
  }>;
  items: Array<{ item_id: string; name: string; bag_size: number }>;
  parties: Array<{ party_id: string; name: string }>;
  dos: Array<{
    do_id: string;
    do_number: string;
    direction: string;
    date: string;
    item_count: number;
    parties?: { name: string } | null;
    app_users?: { name: string } | null;
    do_items?: Array<{
      bags: number;
      total_weight: number;
      vehicle_number?: string | null;
      items?: { name: string } | null;
    }>;
  }>;
  files: Array<{
    file_id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    category: string;
    created_at: string;
  }>;
  audit: Array<{
    log_id: number | string;
    entity: string;
    entity_id?: string | null;
    action: string;
    timestamp: string;
    user_id?: string | null;
    user_name?: string | null;
    ip_address?: string | null;
  }>;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "dos", label: "Entries" },
  { id: "items", label: "Items" },
  { id: "parties", label: "Parties" },
  { id: "files", label: "Files" },
  { id: "audit", label: "Audit" },
];

export default function SuperAdminWarehousePage() {
  const { id } = useParams<{ id: string }>();
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<WarehouseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [auditRows, setAuditRows] = useState<WarehouseDetail["audit"]>([]);
  const [auditSelected, setAuditSelected] = useState<Set<number>>(new Set());
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditWorking, setAuditWorking] = useState(false);
  const [auditMessage, setAuditMessage] = useState("");

  const refreshAudit = useCallback(async () => {
    if (!id) return;
    const result = await listAuditAsSuperAdmin({
      warehouseId: id,
      from: auditFrom || undefined,
      to: auditTo || undefined,
      limit: 300,
    });
    setAuditRows(result.data ?? []);
    setAuditSelected(new Set());
  }, [id, auditFrom, auditTo]);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const result = await getWarehouseAsSuperAdmin(id);
      setData(result.data);
      if (tab === "audit") {
        await refreshAudit();
      } else {
        setAuditRows(result.data?.audit ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warehouse");
    } finally {
      setLoading(false);
    }
  }, [id, tab, refreshAudit]);

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin) {
      router.replace("/challans");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await getWarehouseAsSuperAdmin(id);
        if (cancelled) return;
        setData(result.data);
        setAuditRows(result.data?.audit ?? []);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load warehouse",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isSuperAdmin, router, id]);

  useEffect(() => {
    if (!isSuperAdmin || tab !== "audit" || !id) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await listAuditAsSuperAdmin({
          warehouseId: id,
          from: auditFrom || undefined,
          to: auditTo || undefined,
          limit: 300,
        });
        if (cancelled) return;
        setAuditRows(result.data ?? []);
        setAuditSelected(new Set());
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load audit",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, tab, id, auditFrom, auditTo]);

  const handleRole = async (userId: string, role: string) => {
    try {
      await mutateWarehouseUserAsSuperAdmin(id, {
        action: "update_role",
        user_id: userId,
        role,
      });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Role update failed");
    }
  };

  const handleRemoveUser = async (userId: string, name: string) => {
    if (!confirm(`Remove user ${name} from this warehouse?`)) return;
    try {
      await mutateWarehouseUserAsSuperAdmin(id, {
        action: "remove",
        user_id: userId,
      });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const deleteSelectedAudit = async () => {
    if (auditSelected.size === 0) return;
    if (
      !confirm(
        `Permanently delete ${auditSelected.size} audit log(s) for this warehouse?`,
      )
    ) {
      return;
    }
    setAuditWorking(true);
    setAuditMessage("");
    try {
      const result = await deleteAuditAsSuperAdmin({
        warehouseId: id,
        logIds: [...auditSelected],
      });
      setAuditMessage(result.message ?? `Deleted ${result.deleted} log(s).`);
      await refreshAudit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setAuditWorking(false);
    }
  };

  const deleteAuditRange = async () => {
    if (!auditFrom && !auditTo) {
      alert("Choose a from and/or to date.");
      return;
    }
    if (
      !confirm(
        `Permanently delete audit logs from ${auditFrom || "beginning"} to ${auditTo || "now"} for this warehouse?`,
      )
    ) {
      return;
    }
    setAuditWorking(true);
    setAuditMessage("");
    try {
      const result = await deleteAuditAsSuperAdmin({
        warehouseId: id,
        from: auditFrom || undefined,
        to: auditTo || undefined,
      });
      setAuditMessage(result.message ?? `Deleted ${result.deleted} log(s).`);
      await refreshAudit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Range delete failed");
    } finally {
      setAuditWorking(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-[13px] text-red-400">{error || "Not found"}</p>
        <Link href="/super-admin" className="mt-3 inline-block text-[13px] text-brand">
          Back
        </Link>
      </div>
    );
  }

  const { warehouse } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link href="/super-admin" className="text-[12px] text-ink-faint hover:text-ink">
          ← All warehouses
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[24px] font-bold text-ink">
            {warehouse.name}
          </h1>
          {warehouse.is_deleted && (
            <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
              Deleted
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-ink-faint">
          Created {formatDate(warehouse.created_at.slice(0, 10))} · ID{" "}
          <span className="font-mono">{warehouse.warehouse_id}</span>
        </p>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`shrink-0 rounded-[9px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === entry.id
                ? "bg-brand text-brand-ink"
                : "text-ink-soft hover:bg-white/5 hover:text-ink"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Users", data.users.length],
            ["Entries", data.dos.length],
            ["Items", data.items.length],
            ["Parties", data.parties.length],
            ["Files", data.files.length],
            ["Audit", data.audit.length],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-[var(--radius-card)] border border-border bg-surface p-4"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {label}
              </div>
              <div className="mt-1 font-display text-[22px] font-bold text-ink">
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Invite</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.user_id} className="border-b border-border/50 text-[13px]">
                  <td className="px-4 py-2 text-ink">{u.name}</td>
                  <td className="px-4 py-2 text-ink-soft">{u.email}</td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      onChange={(e) => void handleRole(u.user_id, e.target.value)}
                      className="rounded border border-border bg-transparent px-2 py-1 text-[12px]"
                    >
                      <option value="staff">staff</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-ink-faint">
                    {u.invite_status ?? "accepted"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => void handleRemoveUser(u.user_id, u.name)}
                      className="text-[12px] text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "dos" && (
        <div className="space-y-3">
          {data.dos.length === 0 ? (
            <p className="text-[13px] text-ink-faint">No entries.</p>
          ) : (
            data.dos.map((d) => (
              <div
                key={d.do_id}
                className="rounded-[var(--radius-card)] border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">
                    {d.do_number}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      d.direction === "IN"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-orange-500/15 text-orange-400"
                    }`}
                  >
                    {d.direction}
                  </span>
                  <span className="text-[12px] text-ink-faint">
                    {formatDate(d.date)} · {d.parties?.name ?? "No party"} ·{" "}
                    {d.app_users?.name ?? "—"}
                  </span>
                </div>
                {(d.do_items?.length ?? 0) > 0 && (
                  <div className="mt-2 overflow-x-auto rounded-[8px] border border-border/60">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border/50 text-ink-faint">
                          <th className="px-2 py-1 text-left">Vehicle</th>
                          <th className="px-2 py-1 text-left">Item</th>
                          <th className="px-2 py-1 text-right">Bags</th>
                          <th className="px-2 py-1 text-right">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.do_items?.map((item, idx) => (
                          <tr key={`${d.do_id}-${idx}`} className="border-b border-border/40">
                            <td className="px-2 py-1">
                              {item.vehicle_number || "—"}
                            </td>
                            <td className="px-2 py-1">{item.items?.name ?? "Item"}</td>
                            <td className="px-2 py-1 text-right">{item.bags}</td>
                            <td className="px-2 py-1 text-right">
                              {formatWeight(Number(item.total_weight))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "items" && (
        <SimpleTable
          headers={["Name", "Bag size"]}
          rows={data.items.map((i) => [i.name, `${i.bag_size} kg`])}
        />
      )}

      {tab === "parties" && (
        <SimpleTable
          headers={["Name"]}
          rows={data.parties.map((p) => [p.name])}
        />
      )}

      {tab === "files" && (
        <SimpleTable
          headers={["File", "Category", "Size", "Created"]}
          rows={data.files.map((f) => [
            f.file_name,
            f.category,
            `${Math.round(f.file_size / 1024)} KB`,
            formatDate(f.created_at.slice(0, 10)),
          ])}
        />
      )}

      {tab === "audit" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3">
            <label className="text-[12px] text-ink-soft">
              From
              <input
                type="date"
                value={auditFrom}
                onChange={(e) => setAuditFrom(e.target.value)}
                className="mt-1 block h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
              />
            </label>
            <label className="text-[12px] text-ink-soft">
              To
              <input
                type="date"
                value={auditTo}
                onChange={(e) => setAuditTo(e.target.value)}
                className="mt-1 block h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
              />
            </label>
            <button
              type="button"
              disabled={auditWorking}
              onClick={() => void refreshAudit()}
              className="h-9 rounded-[9px] border border-border px-3 text-[12px] font-semibold text-ink-soft hover:bg-white/5 disabled:opacity-50"
            >
              Apply filter
            </button>
            <button
              type="button"
              disabled={auditWorking || (!auditFrom && !auditTo)}
              onClick={() => void deleteAuditRange()}
              className="h-9 rounded-[9px] border border-red-500/30 bg-red-500/10 px-3 text-[12px] font-semibold text-red-400 disabled:opacity-50"
            >
              Delete date range
            </button>
            <button
              type="button"
              disabled={auditWorking || auditSelected.size === 0}
              onClick={() => void deleteSelectedAudit()}
              className="h-9 rounded-[9px] bg-red-500/90 px-3 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              Delete selected ({auditSelected.size})
            </button>
            <Link
              href="/super-admin/audit"
              className="h-9 inline-flex items-center text-[12px] font-semibold text-brand"
            >
              Manage all warehouses →
            </Link>
          </div>
          {auditMessage && (
            <p className="text-[12px] text-green-400">{auditMessage}</p>
          )}
          {auditRows.length === 0 ? (
            <p className="text-[13px] text-ink-faint">No rows.</p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={
                            auditRows.length > 0 &&
                            auditRows.every((a) =>
                              auditSelected.has(Number(a.log_id)),
                            )
                          }
                          onChange={() => {
                            if (
                              auditRows.every((a) =>
                                auditSelected.has(Number(a.log_id)),
                              )
                            ) {
                              setAuditSelected(new Set());
                            } else {
                              setAuditSelected(
                                new Set(auditRows.map((a) => Number(a.log_id))),
                              );
                            }
                          }}
                          aria-label="Select all"
                        />
                      </th>
                      {["When", "Actor", "Action", "Entity", "IP"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((a) => (
                      <tr
                        key={String(a.log_id)}
                        className="border-b border-border/50 text-[13px] text-ink"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={auditSelected.has(Number(a.log_id))}
                            onChange={() => {
                              const idNum = Number(a.log_id);
                              setAuditSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(idNum)) next.delete(idNum);
                                else next.add(idNum);
                                return next;
                              });
                            }}
                            aria-label={`Select ${a.log_id}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-[12px] text-ink-soft">
                          {a.timestamp.replace("T", " ").slice(0, 19)}
                        </td>
                        <td className="px-3 py-2 text-[12px]">
                          {a.user_name ??
                            (a.user_id ? a.user_id.slice(0, 8) : "System")}
                        </td>
                        <td className="px-3 py-2 text-[12px]">{a.action}</td>
                        <td className="px-3 py-2 text-[12px]">
                          {a.entity_id
                            ? `${a.entity} (${a.entity_id.slice(0, 8)}…)`
                            : a.entity}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-ink-faint">
                          {a.ip_address ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-faint">No rows.</p>;
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-border">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 text-[13px] text-ink">
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-4 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
