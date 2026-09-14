"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { listParties, createParty, updateParty, deleteParty } from "@/lib/api-client";
import ExportMenu from "@/components/ExportMenu";

interface Party {
  party_id: string;
  name: string;
  created_at: string;
}

export default function PartiesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!user) return;
    fetchParties();
  }, [user]);

  async function fetchParties() {
    setLoading(true);
    try {
      const result = await listParties({ limit: 100 });
      setParties(result.data);
    } catch (err) {
      console.error("Failed to fetch parties:", err);
    } finally {
      setLoading(false);
    }
  }

  const trimmedName = newName.trim();
  const isDuplicate = trimmedName.length > 0 && parties.some(
    (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
  );

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || isDuplicate) return;
    try {
      await createParty({ name });
      setNewName("");
      setShowAdd(false);
      fetchParties();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add party");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this party?")) return;
    try {
      await deleteParty(id);
      setParties((prev) => prev.filter((p) => p.party_id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete party");
    }
  };

  const handleEdit = (party: Party) => {
    setEditingId(party.party_id);
    setEditName(party.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateParty(id, { name });
      setParties((prev) =>
        prev.map((p) => (p.party_id === id ? { ...p, name } : p))
      );
      setEditingId(null);
      setEditName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update party");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-[12px] text-ink-faint mb-6">
        <span className="hover:text-ink-soft cursor-pointer transition-colors" onClick={() => router.push("/challans")}>
          Entries
        </span>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Parties</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="font-display text-[22px] sm:text-[28px] font-bold tracking-[-0.02em] text-ink mb-1">
            Parties
          </h1>
          <p className="text-[12px] sm:text-[14px] text-ink-soft mb-2">
            Manage trading parties — buyers, suppliers and transporters.
          </p>
          <p className="text-[11px] sm:text-[12px] text-ink-faint">
            These appear in the entry form when selecting a party.
          </p>
        </div>
        <ExportMenu
          filename="parties"
          title="Parties"
          sheetName="Parties"
          columns={[
            { key: "name", header: "Party Name" },
            { key: "created_at", header: "Created At" },
          ]}
          rows={parties.map((p) => ({
            name: p.name,
            created_at: p.created_at ? new Date(p.created_at).toLocaleString("en-IN") : "",
          }))}
          disabled={loading}
        />
      </div>

      <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Parties ({parties.length})
          </span>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add party
          </button>
        </div>

        {showAdd && (
          <div className="px-5 py-3 bg-white/[0.02] border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isDuplicate && handleAdd()}
                autoFocus
                className={`focus-ring flex-1 h-9 rounded-[9px] border px-3 text-[13px] text-ink placeholder:text-ink-faint transition-colors bg-surface-2 ${
                  isDuplicate ? "border-red-500/50" : "border-border"
                }`}
                placeholder="Party name"
              />
              <button
                onClick={handleAdd}
                disabled={isDuplicate || !trimmedName}
                className="h-9 px-3 bg-brand hover:bg-brand-strong text-brand-ink text-[12px] font-semibold rounded-[9px] shadow-[var(--shadow-sm)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewName(""); }}
                className="h-9 px-3 text-[12px] font-medium text-ink-faint hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
            {isDuplicate && (
              <p className="text-[12px] text-red-400">
                A party with this name already exists.
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className="px-5 py-8 text-center text-[13px] text-ink-faint">
            <div className="w-5 h-5 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto mb-2" />
            Loading parties...
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {parties.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-ink-faint">
                No parties yet. Add your first party above.
              </div>
            ) : (
              parties.map((party) => (
                <div
                  key={party.party_id}
                  className="px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  {editingId === party.party_id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(party.party_id)}
                        autoFocus
                        className="focus-ring flex-1 h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[13px] text-ink placeholder:text-ink-faint transition-colors"
                        placeholder="Party name"
                      />
                      <button
                        onClick={() => handleSaveEdit(party.party_id)}
                        className="h-9 px-3 bg-brand hover:bg-brand-strong text-brand-ink text-[12px] font-semibold rounded-[9px] shadow-[var(--shadow-sm)] transition-all"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="h-9 px-3 text-[12px] font-medium text-ink-faint hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between group">
                      <button
                        type="button"
                        onClick={() => router.push(`/parties/${party.party_id}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="text-[14px] font-medium text-ink transition-colors hover:text-brand">
                          {party.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-faint">
                          View entries & details →
                        </span>
                      </button>
                      <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <button
                          onClick={() => handleEdit(party)}
                          className="p-1 text-ink-faint hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                          title="Edit party"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(party.party_id)}
                          className="p-1 text-ink-faint hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Remove party"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
