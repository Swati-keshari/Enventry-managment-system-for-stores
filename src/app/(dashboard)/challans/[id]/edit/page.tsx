"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  createParty,
  getDO,
  listItems,
  listParties,
  updateDO,
} from "@/lib/api-client";

interface ItemOption {
  item_id: string;
  name: string;
  bag_size: number;
  unit: string;
}

interface PartyOption {
  party_id: string;
  name: string;
}

interface LineItem {
  itemId: string;
  bags: number;
  totalWeight: number;
}

export default function EditDOPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const doId = typeof params.id === "string" ? params.id : "";

  const [doNumber, setDONumber] = useState("");
  const [date, setDate] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ itemId: "", bags: 0, totalWeight: 0 }]);
  const [summary, setSummary] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [availableItems, setAvailableItems] = useState<ItemOption[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);

  useEffect(() => {
    if (!user || !doId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [itemsRes, partiesRes, doRes] = await Promise.all([
          listItems({ limit: 100 }),
          listParties({ limit: 100 }),
          getDO(doId),
        ]);

        if (cancelled) return;

        const catalog = (itemsRes.data ?? []) as ItemOption[];
        const partyList = (partiesRes.data ?? []) as PartyOption[];
        const record = doRes.data ?? doRes;

        setAvailableItems(catalog);
        setParties(partyList);
        setDONumber(record.do_number ?? "");
        setDate(record.date ?? "");
        setDirection(record.direction === "OUT" ? "OUT" : "IN");
        setPartyId(record.party_id ?? "");
        setUpdatedAt(record.updated_at);

        const rawLines = (record.do_items ?? []) as Array<{
          item_id: string;
          bags: number;
          total_weight: number;
          bag_size?: number;
          vehicle_number?: string | null;
        }>;
        const headerVehicle =
          rawLines.find((item) => item.vehicle_number?.trim())?.vehicle_number?.trim() ?? "";
        setVehicleNumber(headerVehicle);

        const lineItems: LineItem[] = rawLines.map((item) => {
          const catalogItem = catalog.find((entry) => entry.item_id === item.item_id);
          const bagSize = catalogItem?.bag_size ?? item.bag_size ?? 0;
          return {
            itemId: item.item_id,
            bags: item.bags ?? 0,
            totalWeight:
              item.total_weight ??
              Math.round((item.bags ?? 0) * bagSize * 100) / 100,
          };
        });

        setItems(lineItems.length > 0 ? lineItems : [{ itemId: "", bags: 0, totalWeight: 0 }]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load entry");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, doId]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          bags: acc.bags + item.bags,
          weight: acc.weight + item.totalWeight,
        }),
        { bags: 0, weight: 0 },
      ),
    [items],
  );

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "itemId" && typeof value === "string") {
          const found = availableItems.find((ai) => ai.item_id === value);
          if (found) {
            updated.totalWeight = found.bag_size * updated.bags;
          }
        }
        if (field === "bags" && typeof value === "number") {
          const found = availableItems.find((ai) => ai.item_id === item.itemId);
          if (found) {
            updated.totalWeight = found.bag_size * value;
          }
        }
        return updated;
      }),
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { itemId: "", bags: 0, totalWeight: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!doNumber.trim()) {
        setError("Entry Number is required.");
        setSaving(false);
        return;
      }

      if (!date) {
        setError("Date is required.");
        setSaving(false);
        return;
      }

      let resolvedPartyId: string | null = null;

      if (partyId === "__new__") {
        if (!partyName.trim()) {
          setError("Please enter a party name.");
          setSaving(false);
          return;
        }
        const newParty = await createParty({ name: partyName.trim() });
        const pid = newParty?.party_id ?? newParty?.data?.party_id ?? null;
        if (!pid || typeof pid !== "string") {
          throw new Error("Party created but no ID was returned. Please try again.");
        }
        resolvedPartyId = pid;
      } else {
        resolvedPartyId = partyId || null;
      }

      const validItems = items.filter((item) => item.itemId && item.bags > 0);
      if (validItems.length === 0) {
        setError("Add at least one item with quantity greater than 0.");
        setSaving(false);
        return;
      }

      await updateDO(
        doId,
        {
          do_number: doNumber.trim(),
          date,
          direction,
          party_id: resolvedPartyId,
          items: validItems.map((item) => {
            const bagSize =
              availableItems.find((ai) => ai.item_id === item.itemId)?.bag_size ?? 0;
            return {
              item_id: item.itemId,
              bags: item.bags,
              bag_size: bagSize > 0 ? bagSize : 50,
              vehicle_number: vehicleNumber.trim() || null,
            };
          }),
        },
        updatedAt,
      );

      router.push(`/challans/${doId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        <p className="text-[13px] text-ink-faint">Loading entry...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
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
          onClick={() => router.push(`/challans/${doId}`)}
        >
          {doNumber || "Entry"}
        </button>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Edit</span>
      </div>

      <h1 className="font-display mb-1 text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-[28px]">
        Edit Entry
      </h1>
      <p className="mb-6 text-[12px] text-ink-soft sm:mb-8 sm:text-[14px]">
        Update party, direction, date and items for this entry.
      </p>

      {error && (
        <div className="mb-6 rounded-[11px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft sm:text-[12.5px]">
                Entry Number
              </label>
              <input
                type="text"
                value={doNumber}
                onChange={(e) => setDONumber(e.target.value)}
                className="focus-ring h-10 w-full rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink transition-colors sm:h-11 sm:rounded-[11px] sm:px-3.5 sm:text-[14px]"
                placeholder="CH-001"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft sm:text-[12.5px]">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="focus-ring h-10 w-full rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink transition-colors sm:h-11 sm:rounded-[11px] sm:px-3.5 sm:text-[14px]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft sm:text-[12.5px]">
                Party <span className="text-ink-faint">(optional)</span>
              </label>
              <select
                value={partyId}
                onChange={(e) => {
                  setPartyId(e.target.value);
                  setPartyName("");
                }}
                className="focus-ring h-10 w-full cursor-pointer appearance-none rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink transition-colors sm:h-11 sm:rounded-[11px] sm:px-3.5 sm:text-[14px]"
              >
                <option value="">Select party</option>
                {parties.map((p) => (
                  <option key={p.party_id} value={p.party_id}>
                    {p.name}
                  </option>
                ))}
                <option value="__new__">+ New party</option>
              </select>
            </div>

            {partyId === "__new__" && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft sm:text-[12.5px]">
                  New Party Name
                </label>
                <input
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  className="focus-ring h-10 w-full rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink transition-colors sm:h-11 sm:rounded-[11px] sm:px-3.5 sm:text-[14px]"
                  placeholder="Party name"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft sm:text-[12.5px]">
                Vehicle No. <span className="text-ink-faint">(optional)</span>
              </label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="focus-ring h-10 w-full rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink transition-colors sm:h-11 sm:rounded-[11px] sm:px-3.5 sm:text-[14px]"
                placeholder="e.g. UP32 BT 4451"
              />
              <p className="mt-1 text-[11px] text-ink-faint">
                Same truck number can be used again whenever that vehicle returns.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold text-ink-soft sm:text-[12.5px]">
              Direction
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("IN")}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-semibold transition-all sm:rounded-[10px] sm:px-4 sm:text-[13px] ${
                  direction === "IN"
                    ? "bg-green-600 text-white shadow-[var(--shadow-sm)]"
                    : "border border-border bg-surface-2 text-ink-soft hover:bg-white/5 hover:text-ink"
                }`}
              >
                IN
              </button>
              <button
                type="button"
                onClick={() => setDirection("OUT")}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12px] font-semibold transition-all sm:rounded-[10px] sm:px-4 sm:text-[13px] ${
                  direction === "OUT"
                    ? "bg-orange-600 text-white shadow-[var(--shadow-sm)]"
                    : "border border-border bg-surface-2 text-ink-soft hover:bg-white/5 hover:text-ink"
                }`}
              >
                OUT
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between sm:mb-4">
            <div>
              <h2 className="text-[13px] font-semibold text-ink sm:text-[14px]">
                Items
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-faint sm:text-[12px]">
                One visit can include several items. All lines share the vehicle above.
              </p>
            </div>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 text-[11px] font-semibold text-brand transition-colors hover:text-brand-hover sm:text-[12px]"
            >
              + Add item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Item
                  </th>
                  <th className="px-3 pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Units
                  </th>
                  <th className="px-3 pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Quantity
                  </th>
                  <th className="w-8 pb-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-2 sm:py-2.5 sm:pr-3">
                      <select
                        value={item.itemId}
                        onChange={(e) => updateItem(index, "itemId", e.target.value)}
                        className="focus-ring h-8 w-full cursor-pointer appearance-none rounded-[8px] border border-border bg-surface-2 px-2 text-[12px] text-ink transition-colors sm:h-9 sm:rounded-[9px] sm:px-3 sm:text-[13px]"
                      >
                        <option value="">Select item</option>
                        {availableItems.map((ai) => (
                          <option key={ai.item_id} value={ai.item_id}>
                            {ai.name} ({ai.bag_size} {ai.unit})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 sm:px-3 sm:py-2.5">
                      <input
                        type="number"
                        value={item.bags || ""}
                        onChange={(e) =>
                          updateItem(index, "bags", parseInt(e.target.value) || 0)
                        }
                        min="0"
                        className="focus-ring h-8 w-full rounded-[8px] border border-border bg-surface-2 px-2 text-right text-[12px] text-ink transition-colors sm:h-9 sm:rounded-[9px] sm:px-3 sm:text-[13px]"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-2 sm:px-3 sm:py-2.5">
                      <input
                        type="number"
                        value={item.totalWeight || ""}
                        readOnly
                        className="focus-ring h-8 w-full cursor-not-allowed rounded-[8px] border border-border bg-surface-2 px-2 text-right text-[12px] text-ink opacity-70 transition-colors sm:h-9 sm:rounded-[9px] sm:px-3 sm:text-[13px]"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 pl-1 sm:py-2.5">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
                        disabled={items.length <= 1}
                      >
                        <svg
                          className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-2.5 text-[13px] font-semibold text-ink-soft">
                    Total
                  </td>
                  <td className="py-2.5 text-right text-[13px] font-semibold text-ink">
                    {totals.bags}
                  </td>
                  <td className="py-2.5 text-right text-[13px] font-semibold text-ink">
                    {totals.weight} kg
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6">
          <label className="mb-2 block text-[13px] font-semibold text-ink sm:text-[14px]">
            Summary
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="focus-ring w-full resize-none rounded-[9px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink transition-colors sm:rounded-[11px] sm:px-3.5 sm:text-[14px]"
            placeholder="Optional note about this update."
          />
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={saving}
            className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-brand px-6 text-[13px] font-semibold text-brand-ink shadow-[var(--shadow-sm)] transition-all hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:text-[14px]"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              "Save changes"
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/challans/${doId}`)}
            className="inline-flex h-11 items-center justify-center rounded-[11px] border border-border px-6 text-[13px] font-medium text-ink-soft transition-colors hover:bg-white/5 hover:text-ink sm:text-[14px]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
