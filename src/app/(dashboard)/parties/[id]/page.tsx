"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getParty, listDOs, updateParty, deleteParty } from "@/lib/api-client";

interface Party {
  party_id: string;
  name: string;
  created_at: string;
}

interface DOItemRow {
  bags: number;
  total_weight: number;
  item_id?: string;
  items?: { name: string; bag_size?: number | null } | null;
}

interface DORow {
  do_id: string;
  do_number: string;
  direction: "IN" | "OUT";
  date: string;
  item_count: number;
  creator_name: string | null;
  do_items?: DOItemRow[];
  created_at: string;
}

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

function formatShortDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
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

export default function PartyDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const partyId = typeof params.id === "string" ? params.id : "";

  const [party, setParty] = useState<Party | null>(null);
  const [dos, setDos] = useState<DORow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "IN" | "OUT">("ALL");

  useEffect(() => {
    if (!user || !partyId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [partyRes, doRes] = await Promise.all([
          getParty(partyId),
          listDOs({ partyId, limit: 100 }),
        ]);

        if (cancelled) return;

        const loadedParty = partyRes.party ?? partyRes.data ?? null;
        setParty(loadedParty);
        setEditName(loadedParty?.name ?? "");
        setDos(doRes.data ?? doRes.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load party details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, partyId]);

  const totals = useMemo(() => doTotals(dos), [dos]);
  const visibleDos = useMemo(
    () =>
      directionFilter === "ALL"
        ? dos
        : dos.filter((row) => row.direction === directionFilter),
    [dos, directionFilter],
  );

  const handleSaveName = async () => {
    if (!party) return;
    const name = editName.trim();
    if (!name) return;
    try {
      await updateParty(party.party_id, { name });
      setParty({ ...party, name });
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update party");
    }
  };

  const handleDelete = async () => {
    if (!party) return;
    if (!confirm("Remove this party?")) return;
    try {
      await deleteParty(party.party_id);
      router.push("/parties");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete party");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        <p className="text-[13px] text-ink-faint">Loading party details...</p>
      </div>
    );
  }

  if (error || !party) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.push("/parties")}
          className="mb-4 text-[12px] text-brand hover:underline"
        >
          ← Back to parties
        </button>
        <div className="rounded-[var(--radius-card)] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error || "Party not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 text-[12px] text-ink-faint">
        <button
          type="button"
          className="transition-colors hover:text-ink-soft"
          onClick={() => router.push("/challans")}
        >
          Entries
        </button>
        <span className="mx-2">/</span>
        <button
          type="button"
          className="transition-colors hover:text-ink-soft"
          onClick={() => router.push("/parties")}
        >
          Parties
        </button>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">{party.name}</span>
      </div>

      <div className="mb-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            {editing ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void handleSaveName()}
                  autoFocus
                  className="focus-ring h-10 min-w-[220px] flex-1 rounded-[10px] border border-border bg-surface-2 px-3 text-[15px] font-semibold text-ink"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveName()}
                  className="h-10 rounded-[9px] bg-brand px-3 text-[12px] font-semibold text-brand-ink"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditName(party.name);
                  }}
                  className="h-10 px-3 text-[12px] font-medium text-ink-faint hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-[26px]">
                {party.name}
              </h1>
            )}
            <p className="mt-1 text-[12px] text-ink-faint">
              Added {formatDate(party.created_at)}
            </p>
            <p className="mt-2 text-[12px] text-ink-soft">
              All entries linked to this party, with items, bags and weight.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-8 rounded-lg border border-border px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-white/5 hover:text-ink"
              >
                Edit name
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="h-8 rounded-lg border border-red-500/20 px-3 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(`/challans/new?partyId=${encodeURIComponent(party.party_id)}`)
              }
              className="h-8 rounded-lg bg-brand px-3 text-[12px] font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
            >
              + New Entry
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Entries
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink">{dos.length}</div>
          <div className="text-[11px] text-ink-faint">
            {totals.inCount} IN · {totals.outCount} OUT
          </div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Bags
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink">{totals.bags}</div>
          <div className="text-[11px] text-ink-faint">across all entries</div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Weight
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink">{totals.weight}</div>
          <div className="text-[11px] text-ink-faint">kg total</div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Showing
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink">{visibleDos.length}</div>
          <div className="text-[11px] text-ink-faint">
            {directionFilter === "ALL" ? "all directions" : directionFilter}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">
          Entries
        </h2>
        <div className="flex gap-1 rounded-[9px] border border-border bg-surface p-1">
          {(["ALL", "IN", "OUT"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirectionFilter(value)}
              className={`h-7 rounded-[7px] px-2.5 text-[11px] font-semibold transition-colors ${
                directionFilter === value
                  ? "bg-brand text-brand-ink"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {visibleDos.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-ink-faint">
            No entries for this party yet.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {visibleDos.map((row) => {
              const bags = (row.do_items ?? []).reduce((sum, item) => sum + (item.bags ?? 0), 0);
              const weight = (row.do_items ?? []).reduce(
                (sum, item) => sum + (item.total_weight ?? 0),
                0,
              );

              return (
                <div key={row.do_id} className="px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => router.push(`/challans/${row.do_id}`)}
                    className="w-full text-left transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">
                            Entry {row.do_number}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              row.direction === "IN"
                                ? "bg-green-500/15 text-green-400"
                                : "bg-orange-500/15 text-orange-400"
                            }`}
                          >
                            {row.direction}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-faint">
                          {formatShortDate(row.date)}
                          {row.creator_name ? ` · by ${row.creator_name}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-ink-soft">
                        <div>{row.item_count} items</div>
                        <div>
                          {bags} bags · {weight} kg
                        </div>
                      </div>
                    </div>
                  </button>

                  {(row.do_items?.length ?? 0) > 0 && (
                    <div className="mt-3 overflow-hidden rounded-[10px] border border-border/70 bg-surface-2">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                        <span>Item</span>
                        <span className="text-right">Bags</span>
                        <span className="text-right">Weight</span>
                      </div>
                      {row.do_items?.map((item, index) => (
                        <div
                          key={`${row.do_id}-${item.item_id ?? index}`}
                          className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border/40 px-3 py-2 text-[12px] last:border-b-0"
                        >
                          <span className="truncate text-ink">
                            {item.items?.name ?? "Item"}
                            {item.items?.bag_size != null
                              ? ` · ${item.items.bag_size} kg/bag`
                              : ""}
                          </span>
                          <span className="min-w-[3rem] text-right text-ink-soft">
                            {item.bags}
                          </span>
                          <span className="min-w-[4rem] text-right text-ink-soft">
                            {item.total_weight} kg
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
