"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { listAuditLog, verifyAuditIntegrity, repairAuditIntegrity } from "@/lib/api-client";
import ExportMenu from "@/components/ExportMenu";

interface AuditEntry {
  log_id: number;
  user_id: string | null;
  actor_name?: string | null;
  user_name?: string | null;
  entity: string;
  entity_id: string | null;
  target_name?: string | null;
  action: string;
  ip_address: string | null;
  timestamp: string;
  app_users?: { name: string } | null;
}

export default function AuditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<string | null>(null);
  const [chainBroken, setChainBroken] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  useEffect(() => {
    if (!user || user.role !== "admin") {
      router.replace("/challans");
      return;
    }
    fetchEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, actionFilter, entityFilter]);

  async function fetchEntries(nextCursor?: string) {
    setLoading(true);
    try {
      const result = await listAuditLog({
        cursor: nextCursor,
        limit: 50,
        action: actionFilter || undefined,
        entity: entityFilter || undefined,
      });
      if (nextCursor) {
        setEntries((prev) => [...prev, ...result.data]);
      } else {
        setEntries(result.data);
      }
      setHasMore(result.hasMore);
      setCursor(result.cursor);
    } catch (err) {
      console.error("Failed to fetch audit log:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleVerify = async () => {
    setVerifying(true);
    setIntegrityResult(null);
    try {
      const result = await verifyAuditIntegrity();
      if (result && typeof result.ok === "boolean") {
        setChainBroken(!result.ok);
        setIntegrityResult(
          result.ok
            ? "Audit chain integrity verified — no tampering detected."
            : result.brokenAt != null
              ? `Chain broken at log #${result.brokenAt}. ${result.message}`
              : result.message || "Chain integrity check failed.",
        );
      } else {
        setChainBroken(false);
        setIntegrityResult("Failed to verify integrity.");
      }
    } catch {
      setChainBroken(false);
      setIntegrityResult("Failed to verify integrity.");
    } finally {
      setVerifying(false);
    }
  };

  const handleRepair = async () => {
    if (
      !confirm(
        "Repair audit chain links for this warehouse? Content hashes stay the same; only previous_hash links are corrected.",
      )
    ) {
      return;
    }
    setRepairing(true);
    setIntegrityResult(null);
    try {
      const result = await repairAuditIntegrity();
      setChainBroken(!(result.verify?.ok ?? result.ok));
      setIntegrityResult(
        result.verify?.ok || result.ok
          ? `${result.message ?? "Repaired."} Integrity verified.`
          : `Repair ran, but chain is still broken: ${result.verify?.message ?? result.message}`,
      );
      // Refresh list so newly linked rows are visible after repair.
      await fetchEntries();
    } catch (err) {
      setIntegrityResult(
        err instanceof Error ? err.message : "Failed to repair audit chain.",
      );
    } finally {
      setRepairing(false);
    }
  };

  const actionColors: Record<string, string> = {
    create: "bg-green-500/15 text-green-400",
    upload_file: "bg-green-500/15 text-green-400",
    update: "bg-blue-500/15 text-blue-400",
    set_bag_size: "bg-blue-500/15 text-blue-400",
    delete: "bg-red-500/15 text-red-400",
    login: "bg-purple-500/15 text-purple-400",
    logout: "bg-yellow-500/15 text-yellow-400",
    add_user: "bg-blue-500/15 text-blue-400",
    remove_user: "bg-red-500/15 text-red-400",
    update_user: "bg-blue-500/15 text-blue-400",
  };

  const entityLabels: Record<string, string> = {
    do: "Entry",
    do_item: "Entry item",
    item: "Item",
    party: "Party",
    file: "Document",
    user: "User",
  };

  function displayAction(action: string) {
    if (action === "upload_file") return "create";
    if (action === "set_bag_size") return "update";
    return action;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-[12px] text-ink-faint mb-6">
        <span className="hover:text-ink-soft cursor-pointer transition-colors" onClick={() => router.push("/challans")}>
          Entries
        </span>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Audit Log</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="font-display text-[22px] sm:text-[28px] font-bold tracking-[-0.02em] text-ink mb-1">
            Audit Log
          </h1>
          <p className="text-[12px] sm:text-[14px] text-ink-soft">
            Append-only trail of all actions.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportMenu
            filename={`audit-${actionFilter || "all"}`}
            title="Audit Log"
            sheetName="Audit"
            subtitle={actionFilter ? `Filter: ${actionFilter}` : undefined}
            columns={[
              { key: "timestamp", header: "Timestamp" },
              { key: "user", header: "User" },
              { key: "action", header: "Action" },
              { key: "entity", header: "Entity" },
              { key: "entity_id", header: "Entity ID" },
              { key: "ip_address", header: "IP Address" },
            ]}
            rows={entries.map((e) => ({
              timestamp: e.timestamp ? new Date(e.timestamp).toLocaleString("en-IN") : "",
              user: e.actor_name ?? e.user_name ?? e.app_users?.name ?? e.user_id ?? "",
              action: displayAction(e.action),
              entity: e.target_name
                ? `${entityLabels[e.entity] || e.entity} · ${e.target_name}`
                : e.entity_id
                  ? `${entityLabels[e.entity] || e.entity} (${e.entity_id})`
                  : entityLabels[e.entity] || e.entity,
              entity_id: e.entity_id ?? "",
              ip_address: e.ip_address ?? "",
            }))}
            disabled={loading}
          />
          <button
            onClick={handleVerify}
            disabled={verifying || repairing}
            className="inline-flex h-9 items-center gap-2 px-3 sm:px-4 text-[12px] sm:text-[13px] font-semibold border border-border text-ink-soft hover:text-ink hover:bg-white/5 rounded-[10px] transition-colors disabled:opacity-60"
          >
            {verifying ? (
              <div className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
            Verify Integrity
          </button>
          {chainBroken && (
            <button
              onClick={handleRepair}
              disabled={repairing || verifying}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand px-3 text-[12px] font-semibold text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-60 sm:px-4 sm:text-[13px]"
            >
              {repairing ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              Repair Chain
            </button>
          )}
        </div>
      </div>

      {integrityResult && (
        <div className={`mb-6 px-4 py-3 rounded-[11px] text-[13px] ${integrityResult.toLowerCase().includes("verified") ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
          {integrityResult}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink transition-colors"
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
          <option value="add_user">Add user</option>
          <option value="remove_user">Remove user</option>
          <option value="update_user">Update user</option>
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink transition-colors"
        >
          <option value="">All entities</option>
          <option value="do">Entries</option>
          <option value="do_item">Entry items</option>
          <option value="item">Items</option>
          <option value="party">Parties</option>
          <option value="file">Documents</option>
          <option value="user">Users</option>
        </select>
      </div>

      <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-ink-faint">
            <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-2" />
            Loading audit log...
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-ink-faint">
            No audit entries yet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">#</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Time</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Actor</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Action</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Entity</th>
                    <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.log_id} className="border-b border-border/50 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-2.5 text-[12px] text-ink-faint font-mono">{entry.log_id}</td>
                      <td className="px-5 py-2.5 text-[12px] text-ink-soft">
                        {new Date(entry.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-5 py-2.5 text-[12px] text-ink-soft">
                        {entry.actor_name ||
                          entry.user_name ||
                          entry.app_users?.name ||
                          (entry.user_id ? entry.user_id.slice(0, 8) : "System")}
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${actionColors[entry.action] || "bg-white/5 text-ink-faint"}`}>
                          {displayAction(entry.action)}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-[12px] text-ink-soft">
                        {entityLabels[entry.entity] || entry.entity}
                        {entry.target_name ? (
                          <span className="text-ink ml-1">· {entry.target_name}</span>
                        ) : entry.entity_id ? (
                          <span className="text-ink-faint ml-1">({entry.entity_id.slice(0, 8)}...)</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-2.5 text-[11px] text-ink-faint font-mono">{entry.ip_address || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <button
                onClick={() => fetchEntries(cursor!)}
                className="w-full py-3 text-[13px] font-medium text-brand hover:bg-white/5 transition-colors border-t border-border"
              >
                Load more...
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
