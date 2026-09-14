"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { listItems, createItem, updateItem, deleteItem } from "@/lib/api-client";
import { AVAILABLE_UNITS } from "@/lib/types";
import ExportMenu from "@/components/ExportMenu";

interface Item {
  item_id: string;
  name: string;
  bag_size: number;
  unit: string;
}

export default function ItemsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemBagSize, setNewItemBagSize] = useState(50);
  const [newItemUnit, setNewItemUnit] = useState("kg");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBagSize, setEditBagSize] = useState(50);
  const [editUnit, setEditUnit] = useState("kg");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchItems();
  }, [user]);

  async function fetchItems() {
    setLoading(true);
    try {
      const result = await listItems({ limit: 100 });
      setItems(result.data ?? []);
    } catch (err) {
      console.error("Failed to fetch items:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            String(item.bag_size).includes(q),
        )
      : items;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search]);

  const trimmedName = newItemName.trim();
  const isDuplicate =
    trimmedName.length > 0 &&
    items.some((item) => item.name.toLowerCase() === trimmedName.toLowerCase());

  const handleAdd = async () => {
    const name = newItemName.trim();
    if (!name || isDuplicate || newItemBagSize < 1) return;
    setSaving(true);
    try {
      await createItem({ name, bag_size: newItemBagSize, unit: newItemUnit });
      setNewItemName("");
      setNewItemBagSize(50);
      setNewItemUnit("kg");
      setShowAdd(false);
      await fetchItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: Item) => {
    setEditingId(item.item_id);
    setEditName(item.name);
    setEditBagSize(item.bag_size);
    setEditUnit(item.unit);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditBagSize(50);
    setEditUnit("kg");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || editBagSize < 1) return;

    const isEditDuplicate = items.some(
      (item) =>
        item.item_id !== editingId &&
        item.name.toLowerCase() === editName.trim().toLowerCase(),
    );

    if (isEditDuplicate) {
      alert("An item with this name already exists.");
      return;
    }

    setSaving(true);
    try {
      await updateItem(editingId, {
        item_id: editingId,
        name: editName.trim(),
        bag_size: editBagSize,
        unit: editUnit,
      });
      handleCancelEdit();
      await fetchItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this item?")) return;
    try {
      await deleteItem(id);
      setItems((prev) => prev.filter((i) => i.item_id !== id));
      if (editingId === id) handleCancelEdit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

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
        <span className="text-ink-soft">Items</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-[22px] sm:text-[28px] font-bold tracking-[-0.02em] text-ink">
            Items
          </h1>
          <p className="text-[13px] text-ink-soft mt-1">
            Products available when creating an entry.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0 relative z-20">
          <ExportMenu
            filename="items"
            title="Item List"
            sheetName="Items"
            columns={[
              { key: "name", header: "Item Name" },
              { key: "bag_size", header: "Default Quantity" },
              { key: "unit", header: "Unit" },
            ]}
            rows={filteredItems.map((i) => ({ name: i.name, bag_size: i.bag_size, unit: i.unit }))}
            disabled={loading || filteredItems.length === 0}
          />
          <button
            onClick={() => {
              setShowAdd(true);
              setEditingId(null);
            }}
            className="inline-flex h-9 items-center gap-1.5 px-3 sm:px-4 text-[12px] sm:text-[13px] font-semibold bg-brand hover:bg-brand-strong text-brand-ink rounded-[10px] shadow-[var(--shadow-sm)] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>
        </div>
      </div>

      {/* Stats + search */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Total items</div>
          <div className="text-[22px] font-bold text-ink mt-0.5">{items.length}</div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Unit types</div>
          <div className="text-[14px] font-bold text-ink mt-0.5">
            {[...new Set(items.map(i => i.unit))].join(", ") || "—"}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-[12px] border border-border bg-surface px-3 py-2.5 flex items-center">
          <div className="relative w-full">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="focus-ring h-9 w-full rounded-[9px] border border-border bg-surface-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
        {showAdd && (
          <div className="px-4 sm:px-5 py-4 bg-brand/5 border-b border-border">
            <div className="text-[12px] font-semibold text-ink mb-2">New item</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isDuplicate && handleAdd()}
                autoFocus
                className={`focus-ring flex-1 min-w-[140px] h-10 rounded-[9px] border px-3 text-[13px] text-ink placeholder:text-ink-faint bg-surface-2 ${
                  isDuplicate ? "border-red-500/50" : "border-border"
                }`}
                placeholder="Name (e.g. Wheat)"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={newItemBagSize}
                  onChange={(e) => setNewItemBagSize(Number(e.target.value))}
                  min={1}
                  className="focus-ring w-20 h-10 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink text-center"
                />
                <select
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  className="focus-ring h-10 rounded-[9px] border border-border bg-surface-2 px-2 text-[11px] text-ink appearance-none cursor-pointer"
                >
                  {AVAILABLE_UNITS.filter(u => u.value !== "custom").map((u) => (
                    <option key={u.value} value={u.value}>{u.value}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={saving || isDuplicate || !trimmedName}
                className="h-10 px-4 bg-brand hover:bg-brand-strong text-brand-ink text-[13px] font-semibold rounded-[9px] disabled:opacity-40"
              >
                {saving ? "Adding..." : "Add"}
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setNewItemName("");
                }}
                className="h-10 px-3 text-[13px] text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
            </div>
            {isDuplicate && (
              <p className="text-[12px] text-red-400 mt-2">
                An item with this name already exists.
              </p>
            )}
          </div>
        )}

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_160px_120px] gap-3 px-5 py-2.5 border-b border-border bg-white/[0.02]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Item</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Default Qty / Unit</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint text-right">Actions</span>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-[13px] text-ink-faint">
            <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-2" />
            Loading items...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="w-12 h-12 rounded-[12px] bg-white/5 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-ink mb-1">
              {search ? "No matching items" : "No items yet"}
            </p>
            <p className="text-[12px] text-ink-faint mb-4">
              {search
                ? "Try a different search."
                : "Add Wheat, Sugar, Rice, or any product you use in entries."}
            </p>
            {!search && (
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex h-9 items-center gap-1.5 px-4 text-[13px] font-semibold bg-brand text-brand-ink rounded-[9px]"
              >
                Add first item
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filteredItems.map((item) => (
              <div key={item.item_id} className="px-4 sm:px-5 py-3 hover:bg-white/[0.02] transition-colors">
                {editingId === item.item_id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                      autoFocus
                      className="focus-ring flex-1 min-w-[140px] h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
                    />
                    <input
                      type="number"
                      value={editBagSize}
                      onChange={(e) => setEditBagSize(Number(e.target.value))}
                      min={1}
                      className="focus-ring w-20 h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink text-center"
                    />
                    <select
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                      className="focus-ring h-9 rounded-[9px] border border-border bg-surface-2 px-2 text-[11px] text-ink appearance-none cursor-pointer"
                    >
                      {AVAILABLE_UNITS.filter(u => u.value !== "custom").map((u) => (
                        <option key={u.value} value={u.value}>{u.value}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving || !editName.trim()}
                      className="h-9 px-3 bg-brand text-brand-ink text-[12px] font-semibold rounded-[9px] disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="h-9 px-3 text-[12px] text-ink-faint hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_120px] gap-2 sm:gap-3 sm:items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-[10px] bg-brand/15 text-brand flex items-center justify-center text-[12px] font-bold shrink-0">
                        {item.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-ink truncate">{item.name}</div>
                        <div className="text-[11px] text-ink-faint sm:hidden">
                          {item.bag_size} {item.unit}
                        </div>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="inline-flex items-center h-7 px-2.5 rounded-lg bg-white/5 text-[13px] font-semibold text-ink">
                        {item.bag_size}
                      </span>
                      <span className="inline-flex items-center h-7 px-2 rounded-lg bg-brand/15 text-brand text-[11px] font-bold uppercase">
                        {item.unit}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 sm:justify-end">
                      <button
                        onClick={() => handleEdit(item)}
                        className="inline-flex h-8 items-center gap-1 px-2.5 text-[12px] font-medium text-ink-soft hover:text-brand hover:bg-brand/10 rounded-[8px] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.item_id)}
                        className="inline-flex h-8 items-center gap-1 px-2.5 text-[12px] font-medium text-ink-soft hover:text-red-400 hover:bg-red-500/10 rounded-[8px] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && filteredItems.length > 0 && (
          <div className="px-5 py-2.5 border-t border-border text-[11px] text-ink-faint">
            Showing {filteredItems.length} of {items.length} items
            {search ? ` for “${search}”` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
