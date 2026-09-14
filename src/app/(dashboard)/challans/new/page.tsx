"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createDO, listItems, listParties, createParty } from "@/lib/api-client";
import { todayStr } from "@/lib/utils";

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

export default function NewDOPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
          <p className="text-[13px] text-ink-faint">Loading form...</p>
        </div>
      }
    >
      <NewDOPageInner />
    </Suspense>
  );
}

function NewDOPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPartyId = searchParams.get("partyId") ?? "";

  const [doNumber, setDONumber] = useState("");
  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [partyId, setPartyId] = useState(preselectedPartyId);
  const [partyName, setPartyName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { itemId: "", bags: 0, totalWeight: 0 },
    { itemId: "", bags: 0, totalWeight: 0 },
  ]);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [availableItems, setAvailableItems] = useState<ItemOption[]>([]);
  const [parties, setParties] = useState<PartyOption[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      listItems({ limit: 100 }),
      listParties({ limit: 100 }),
    ]).then(([itemsRes, partiesRes]) => {
      setAvailableItems(itemsRes.data);
      setParties(partiesRes.data);
      if (preselectedPartyId) {
        const exists = (partiesRes.data as PartyOption[]).some(
          (party) => party.party_id === preselectedPartyId,
        );
        if (exists) setPartyId(preselectedPartyId);
      }
    });
  }, [user, preselectedPartyId]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => ({
        bags: acc.bags + item.bags,
        weight: acc.weight + item.totalWeight,
      }),
      { bags: 0, weight: 0 }
    );
  }, [items]);

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
      })
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
        setError("Entry number is required.");
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
        try {
          const newParty = await createParty({ name: partyName.trim() });
          // Handle both possible response shapes
          const pid = newParty?.party_id ?? newParty?.data?.party_id ?? null;
          if (!pid || typeof pid !== "string") {
            throw new Error("Party created but no ID was returned. Please try again.");
          }
          resolvedPartyId = pid;
        } catch (partyErr) {
          setError(partyErr instanceof Error ? partyErr.message : "Failed to create party. Please try again.");
          setSaving(false);
          return;
        }
      } else {
        resolvedPartyId = partyId || null;
      }

      // Validate UUID format before sending
      if (resolvedPartyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedPartyId)) {
        setError(`Invalid party ID: "${resolvedPartyId}". Please try again.`);
        setSaving(false);
        return;
      }

      const validItems = items.filter((item) => item.itemId && item.bags > 0);
      if (validItems.length === 0) {
        setError("Add at least one item with quantity greater than 0.");
        setSaving(false);
        return;
      }

      await createDO({
        do_number: doNumber.trim(),
        date,
        direction,
        party_id: resolvedPartyId,
        items: validItems.map((item, idx) => {
          const bagSize = availableItems.find((ai) => ai.item_id === item.itemId)?.bag_size ?? 0;
          return {
            item_id: item.itemId,
            sequence_num: idx + 1,
            bags: item.bags,
            total_weight: item.totalWeight,
            bag_size: bagSize > 0 ? bagSize : 50,
            vehicle_number: vehicleNumber.trim() || null,
          };
        }),
      });
      router.push("/challans");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-[12px] text-ink-faint mb-6">
        <span className="hover:text-ink-soft cursor-pointer transition-colors" onClick={() => router.push("/challans")}>
          Entries
        </span>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">New Entry</span>
      </div>

      <h1 className="font-display text-[22px] sm:text-[28px] font-bold tracking-[-0.02em] text-ink mb-1">New Entry</h1>
      <p className="text-[12px] sm:text-[14px] text-ink-soft mb-6 sm:mb-8">Record an inventory entry — totals are calculated automatically.</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] px-3 py-2 rounded-[11px] mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info Card */}
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            <div>
              <label className="mb-1.5 block text-[11px] sm:text-[12.5px] font-semibold text-ink-soft">Entry Number</label>
              <input type="text" value={doNumber} onChange={(e) => setDONumber(e.target.value)} className="focus-ring h-10 sm:h-11 w-full rounded-[9px] sm:rounded-[11px] border border-border bg-surface-2 px-3 sm:px-3.5 text-[13px] sm:text-[14px] text-ink placeholder:text-ink-faint transition-colors" placeholder="CH-001" />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] sm:text-[12.5px] font-semibold text-ink-soft">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="focus-ring h-10 sm:h-11 w-full rounded-[9px] sm:rounded-[11px] border border-border bg-surface-2 px-3 sm:px-3.5 text-[13px] sm:text-[14px] text-ink transition-colors" />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] sm:text-[12.5px] font-semibold text-ink-soft">Party <span className="text-ink-faint">(optional)</span></label>
              <select value={partyId} onChange={(e) => { setPartyId(e.target.value); setPartyName(""); }} className="focus-ring h-10 sm:h-11 w-full rounded-[9px] sm:rounded-[11px] border border-border bg-surface-2 px-3 sm:px-3.5 text-[13px] sm:text-[14px] text-ink transition-colors appearance-none cursor-pointer">
                <option value="">Select party</option>
                {parties.map((p) => (
                  <option key={p.party_id} value={p.party_id}>{p.name}</option>
                ))}
                <option value="__new__">+ New party</option>
              </select>
            </div>

            {partyId === "__new__" && (
              <div>
                <label className="mb-1.5 block text-[11px] sm:text-[12.5px] font-semibold text-ink-soft">New Party Name</label>
                <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="focus-ring h-10 sm:h-11 w-full rounded-[9px] sm:rounded-[11px] border border-border bg-surface-2 px-3 sm:px-3.5 text-[13px] sm:text-[14px] text-ink placeholder:text-ink-faint transition-colors" placeholder="Party name" />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[11px] sm:text-[12.5px] font-semibold text-ink-soft">Vehicle No. <span className="text-ink-faint">(optional)</span></label>
              <input type="text" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="focus-ring h-10 sm:h-11 w-full rounded-[9px] sm:rounded-[11px] border border-border bg-surface-2 px-3 sm:px-3.5 text-[13px] sm:text-[14px] text-ink placeholder:text-ink-faint transition-colors" placeholder="e.g. UP32 BT 4451" />
              <p className="mt-1 text-[11px] text-ink-faint">Same truck number can be used again whenever that vehicle returns.</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] sm:text-[12.5px] font-semibold text-ink-soft">Direction</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDirection("IN")} className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-[9px] sm:rounded-[10px] text-[12px] sm:text-[13px] font-semibold transition-all ${direction === "IN" ? "bg-green-600 text-white shadow-[var(--shadow-sm)]" : "bg-surface-2 text-ink-soft hover:text-ink border border-border hover:bg-white/5"}`}>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                IN
              </button>
              <button type="button" onClick={() => setDirection("OUT")} className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-[9px] sm:rounded-[10px] text-[12px] sm:text-[13px] font-semibold transition-all ${direction === "OUT" ? "bg-orange-600 text-white shadow-[var(--shadow-sm)]" : "bg-surface-2 text-ink-soft hover:text-ink border border-border hover:bg-white/5"}`}>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                OUT
              </button>
            </div>
          </div>
        </div>

        {/* Items Card */}
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div>
              <h2 className="text-[13px] sm:text-[14px] font-semibold text-ink">Items</h2>
              <p className="text-[11px] sm:text-[12px] text-ink-faint mt-0.5">One visit can include several items. All lines share the vehicle above.</p>
            </div>
            <button type="button" onClick={addItem} className="flex items-center gap-1 text-[11px] sm:text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">+ Add item</span>
              <span className="sm:hidden">+ Add</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold pb-2 pr-3">Item</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold pb-2 px-3">Units</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold pb-2 px-3">Quantity</th>
                  <th className="w-8 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b border-border/50 last:border-0">
                    <td className="py-2 sm:py-2.5 pr-2 sm:pr-3">
                      <select value={item.itemId} onChange={(e) => updateItem(index, "itemId", e.target.value)} className="focus-ring h-8 sm:h-9 w-full rounded-[8px] sm:rounded-[9px] border border-border bg-surface-2 px-2 sm:px-3 text-[12px] sm:text-[13px] text-ink transition-colors appearance-none cursor-pointer">
                        <option value="">Select item</option>
                        {availableItems.map((ai) => (
                          <option key={ai.item_id} value={ai.item_id}>{ai.name} ({ai.bag_size} {ai.unit})</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 sm:py-2.5 px-2 sm:px-3">
                      <input type="number" value={item.bags || ""} onChange={(e) => updateItem(index, "bags", parseInt(e.target.value) || 0)} min="0" className="focus-ring h-8 sm:h-9 w-full rounded-[8px] sm:rounded-[9px] border border-border bg-surface-2 px-2 sm:px-3 text-[12px] sm:text-[13px] text-ink text-right placeholder:text-ink-faint transition-colors" placeholder="0" />
                    </td>
                    <td className="py-2 sm:py-2.5 px-2 sm:px-3">
                      <input type="number" value={item.totalWeight || ""} readOnly className="focus-ring h-8 sm:h-9 w-full rounded-[8px] sm:rounded-[9px] border border-border bg-surface-2 px-2 sm:px-3 text-[12px] sm:text-[13px] text-ink text-right placeholder:text-ink-faint transition-colors cursor-not-allowed opacity-70" placeholder="0" />
                    </td>
                    <td className="py-2 sm:py-2.5 pl-1">
                      <button type="button" onClick={() => removeItem(index)} className="p-1 text-ink-faint hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" disabled={items.length <= 1}>
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-2.5 text-[13px] text-ink-soft font-semibold">Total</td>
                  <td className="py-2.5 text-right text-[13px] text-ink font-semibold">{totals.bags}</td>
                  <td className="py-2.5 text-right text-[13px] text-ink font-semibold">{totals.weight}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6">
          <label className="block text-[13px] sm:text-[14px] font-semibold text-ink mb-2">Summary</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="focus-ring w-full rounded-[9px] sm:rounded-[11px] border border-border bg-surface-2 px-3 sm:px-3.5 py-2.5 text-[13px] sm:text-[14px] text-ink placeholder:text-ink-faint transition-colors resize-none" placeholder="e.g. All items received safely." />
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button type="submit" disabled={saving} className="focus-ring group inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-brand text-[13px] sm:text-[14px] font-semibold text-brand-ink shadow-[var(--shadow-sm)] transition-all hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 px-6">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Save Entry"}
          </button>
          <button type="button" onClick={() => router.push("/challans")} className="inline-flex h-11 items-center justify-center px-6 text-[13px] sm:text-[14px] font-medium text-ink-soft hover:text-ink border border-border hover:bg-white/5 rounded-[11px] transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}