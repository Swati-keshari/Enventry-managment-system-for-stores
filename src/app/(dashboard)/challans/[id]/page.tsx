"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { uploadFile, deleteFile } from "@/lib/api-client";
import { getSupabase } from "@/lib/supabase-browser";
import { formatWeight, formatDate } from "@/lib/utils";

interface DOFile {
  file_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  drive_url: string;
  category: string;
  created_at: string;
}

interface DOItem {
  do_item_id: string;
  item_id: string;
  sequence_num: number;
  bags: number;
  total_weight: number;
  bag_size: number;
  vehicle_number?: string | null;
  items?: { name: string };
}

interface DORecord {
  do_id: string;
  do_number: string;
  direction: string;
  date: string;
  item_count: number;
  created_at: string;
  parties?: { name: string } | null;
  app_users?: { name: string } | null;
  do_items: DOItem[];
  files: DOFile[];
}

export default function DODetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const doId = params.id as string;

  const [DO, setDO] = useState<DORecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        const res = await fetch(`/api/do?id=${doId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Entry not found");
        const result = await res.json();
        if (!cancelled) setDO(result.data);
      } catch (err) {
        console.error("Failed to fetch entry:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, doId, refreshKey]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("do_id", doId);
        formData.append("category", "document");

        await uploadFile(formData);
      } catch (err) {
        alert(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    setRefreshKey(k => k + 1);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await deleteFile(fileId);
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete file");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!DO) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <p className="text-ink-faint">Entry not found.</p>
      </div>
    );
  }

  const totalBags = DO.do_items?.reduce((s, i) => s + i.bags, 0) ?? 0;
  const totalWeight = DO.do_items?.reduce((s, i) => s + i.total_weight, 0) ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-[12px] text-ink-faint mb-6">
        <span className="hover:text-ink-soft cursor-pointer transition-colors" onClick={() => router.push("/challans")}>Entries</span>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">{DO.do_number || "Entry Detail"}</span>
      </div>

      {/* DO Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${DO.direction === "IN" ? "bg-green-500/15 text-green-400" : "bg-orange-500/15 text-orange-400"}`}>
              {DO.direction === "IN" ? "IN — Inward" : "OUT — Outward"}
            </span>
            <span className="text-[12px] text-ink-faint">{formatDate(DO.date)}</span>
          </div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.02em] text-ink">
            {DO.parties?.name || DO.do_number || "Inventory Entry"}
          </h1>
          <p className="text-[13px] text-ink-faint mt-1">
            Entry: {DO.do_number} {DO.app_users && `· Created by ${DO.app_users.name}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => router.push(`/challans/${doId}/edit`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-4 text-[13px] font-medium text-ink-soft transition-colors hover:bg-white/5 hover:text-ink"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button
            onClick={() => router.push(`/challans/${doId}/print`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-4 text-[13px] font-medium text-ink-soft transition-colors hover:bg-white/5 hover:text-ink"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Items Table */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Items ({DO.do_items?.length || 0})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">#</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Vehicle No.</th>
                <th className="text-left text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Item</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Units</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-ink-faint font-semibold px-5 py-2.5">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {DO.do_items?.map((item) => (
                <tr key={item.do_item_id} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-2.5 text-[12px] text-ink-faint">{item.sequence_num}</td>
                  <td className="px-5 py-2.5 text-[13px] text-ink">{item.vehicle_number || "—"}</td>
                  <td className="px-5 py-2.5 text-[13px] text-ink font-medium">{item.items?.name || item.item_id}</td>
                  <td className="px-5 py-2.5 text-[13px] text-ink text-right">{item.bags}</td>
                  <td className="px-5 py-2.5 text-[13px] text-ink text-right">{formatWeight(item.total_weight)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={3} className="px-5 py-2.5 text-[13px] text-ink-soft font-semibold">Total</td>
                <td className="px-5 py-2.5 text-[13px] text-ink font-semibold text-right">{totalBags}</td>
                <td className="px-5 py-2.5 text-[13px] text-ink font-semibold text-right">{formatWeight(totalWeight)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* File Upload Zone */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Documents ({DO.files?.length || 0})</span>
          <span className="text-[10px] font-medium text-brand">
            Google Drive synced
          </span>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mx-5 my-4 border-2 border-dashed rounded-[11px] p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-brand bg-brand/5" : "border-border hover:border-brand/30 hover:bg-white/[0.02]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
              <span className="text-[13px] text-ink-soft">Uploading...</span>
            </div>
          ) : (
            <>
              <svg className="w-8 h-8 text-ink-faint mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-[13px] text-ink-soft">Drag & drop files here, or <span className="font-semibold text-brand">browse</span></p>
              <p className="text-[11px] text-ink-faint mt-1">
                PDF, JPG, PNG — max 4MB · Stored in Google Drive
              </p>
            </>
          )}
        </div>

        {/* File List */}
        {DO.files && DO.files.length > 0 && (
          <div className="divide-y divide-border/50">
            {DO.files.map((file) => (
              <div key={file.file_id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                    <svg className="w-4 h-4 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-ink">{file.file_name}</div>
                    <div className="text-[11px] text-ink-faint">{file.file_type} · {formatFileSize(file.file_size)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={file.drive_url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-brand hover:underline">Open</a>
                  <button onClick={() => handleDeleteFile(file.file_id)} className="p-1 text-ink-faint hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Delete file">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
