"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getUser, listAuditLog, listDOs, updateUserRole, removeUser } from "@/lib/api-client";

interface AppUser {
  user_id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_seen_at?: string | null;
  invite_status?: string | null;
}

interface DORow {
  do_id: string;
  do_number: string;
  direction: "IN" | "OUT";
  date: string;
  item_count: number;
  party_name: string | null;
  do_items?: Array<{ bags: number; total_weight: number }>;
  created_at: string;
}

interface AuditEntry {
  log_id: number;
  entity: string;
  entity_id: string | null;
  action: string;
  ip_address: string | null;
  timestamp: string;
}

const roleColors: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-400",
  manager: "bg-blue-500/15 text-blue-400",
  staff: "bg-green-500/15 text-green-400",
};

const actionColors: Record<string, string> = {
  create: "bg-green-500/15 text-green-400",
  update: "bg-blue-500/15 text-blue-400",
  delete: "bg-red-500/15 text-red-400",
  login: "bg-purple-500/15 text-purple-400",
  logout: "bg-yellow-500/15 text-yellow-400",
  add_user: "bg-blue-500/15 text-blue-400",
  remove_user: "bg-red-500/15 text-red-400",
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function doTotals(dos: DORow[]) {
  let bags = 0;
  let weight = 0;
  let inCount = 0;
  let outCount = 0;

  for (const row of dos) {
    if (row.direction === "IN") inCount += 1;
    else outCount += 1;
    for (const item of row.do_items ?? []) {
      bags += item.bags ?? 0;
      weight += item.total_weight ?? 0;
    }
  }

  return { bags, weight, inCount, outCount };
}

export default function UserDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [profile, setProfile] = useState<AppUser | null>(null);
  const [dos, setDos] = useState<DORow[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"dos" | "logs">("dos");

  useEffect(() => {
    if (!user || user.role !== "admin") {
      router.replace("/challans");
      return;
    }
    if (!userId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [userRes, doRes, auditRes] = await Promise.all([
          getUser(userId),
          listDOs({ userId, limit: 50 }),
          listAuditLog({ userId, limit: 50 }),
        ]);

        if (cancelled) return;

        setProfile(userRes.user ?? userRes.data ?? null);
        setDos(doRes.data ?? doRes.items ?? []);
        setLogs(auditRes.data ?? auditRes.entries ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load user details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, userId, router]);

  const totals = useMemo(() => doTotals(dos), [dos]);
  const loginCount = useMemo(
    () => logs.filter((l) => l.action === "login").length,
    [logs],
  );
  const lastActive =
    logs[0]?.timestamp ?? profile?.last_seen_at ?? profile?.created_at ?? null;

  const handleRoleChange = async (newRole: string) => {
    if (!profile) return;
    try {
      await updateUserRole(profile.user_id, newRole);
      setProfile({ ...profile, role: newRole });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleRemove = async () => {
    if (!profile) return;
    if (!confirm("Remove this user? They will lose access immediately.")) return;
    try {
      await removeUser(profile.user_id);
      router.push("/users");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove user");
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[13px] text-ink-faint">Loading user details...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push("/users")}
          className="text-[12px] text-brand hover:underline mb-4"
        >
          ← Back to users
        </button>
        <div className="rounded-[var(--radius-card)] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error || "User not found"}
        </div>
      </div>
    );
  }

  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-[12px] text-ink-faint mb-6">
        <span
          className="hover:text-ink-soft cursor-pointer transition-colors"
          onClick={() => router.push("/challans")}
        >
          Entries
        </span>
        <span className="mx-2">/</span>
        <span
          className="hover:text-ink-soft cursor-pointer transition-colors"
          onClick={() => router.push("/users")}
        >
          Users
        </span>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">{profile.name}</span>
      </div>

      {/* Profile header */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center text-[14px] font-semibold text-brand-ink shrink-0">
              {initials}
            </div>
            <div>
              <h1 className="font-display text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-ink">
                {profile.name}
              </h1>
              <p className="text-[13px] text-ink-soft mt-0.5">{profile.email}</p>
              <p className="text-[11px] text-ink-faint mt-1">
                Joined {formatDate(profile.created_at)}
                {lastActive ? ` · Last activity ${formatDate(lastActive)}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={profile.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className={`h-8 rounded-lg border border-border bg-transparent px-2 text-[12px] font-semibold appearance-none cursor-pointer ${roleColors[profile.role] || ""}`}
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            {profile.user_id !== user?.id && (
              <button
                onClick={handleRemove}
                className="h-8 px-3 text-[12px] font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Entries</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">{dos.length}</div>
          <div className="text-[11px] text-ink-faint">
            {totals.inCount} IN · {totals.outCount} OUT
          </div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Bags</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">{totals.bags}</div>
          <div className="text-[11px] text-ink-faint">across their entries</div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Weight</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">{totals.weight}</div>
          <div className="text-[11px] text-ink-faint">kg total</div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Logins</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">{loginCount}</div>
          <div className="text-[11px] text-ink-faint">in recent logs</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 border-b border-border">
        <button
          onClick={() => setTab("dos")}
          className={`px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
            tab === "dos"
              ? "border-brand text-ink"
              : "border-transparent text-ink-faint hover:text-ink-soft"
          }`}
        >
          Entries ({dos.length})
        </button>
        <button
          onClick={() => setTab("logs")}
          className={`px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
            tab === "logs"
              ? "border-brand text-ink"
              : "border-transparent text-ink-faint hover:text-ink-soft"
          }`}
        >
          Activity Log ({logs.length})
        </button>
      </div>

      {tab === "dos" ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
          {dos.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-ink-faint">
              No entries created by this user.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {dos.map((row) => {
                const bags = (row.do_items ?? []).reduce((s, i) => s + (i.bags ?? 0), 0);
                const weight = (row.do_items ?? []).reduce((s, i) => s + (i.total_weight ?? 0), 0);
                return (
                  <button
                    key={row.do_id}
                    onClick={() => router.push(`/challans/${row.do_id}`)}
                    className="w-full text-left px-4 sm:px-5 py-3 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">
                            {row.party_name || "No party"}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              row.direction === "IN"
                                ? "bg-green-500/15 text-green-400"
                                : "bg-orange-500/15 text-orange-400"
                            }`}
                          >
                            {row.direction}
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-faint mt-0.5">
                          Entry: {row.do_number} · {row.date}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-ink-soft shrink-0">
                        <div>{row.item_count} items</div>
                        <div>
                          {bags} bags · {weight} kg
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
          {logs.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-ink-faint">
              No activity logs for this user yet.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {logs.map((entry) => (
                <div key={entry.log_id} className="px-4 sm:px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            actionColors[entry.action] || "bg-white/10 text-ink-soft"
                          }`}
                        >
                          {entry.action}
                        </span>
                        <span className="text-[12px] text-ink">{entry.entity}</span>
                        {entry.entity_id && (
                          <span className="text-[11px] text-ink-faint font-mono truncate max-w-[140px]">
                            {entry.entity_id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      {entry.ip_address && (
                        <div className="text-[11px] text-ink-faint mt-1">IP {entry.ip_address}</div>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-faint shrink-0">
                      {formatDate(entry.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
