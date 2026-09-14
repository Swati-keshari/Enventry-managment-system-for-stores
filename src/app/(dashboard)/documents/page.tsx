"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  deleteFile,
  listFiles,
  uploadFile,
  type StoredFile,
} from "@/lib/api-client";

const DOCUMENT_CATEGORIES = [
  { value: "document", label: "General document" },
  { value: "report", label: "Report" },
  { value: "template", label: "Template" },
  { value: "rate_list", label: "Rate list" },
  { value: "contact", label: "Contact" },
  { value: "other", label: "Other" },
] as const;

function categoryLabel(category: string) {
  return (
    DOCUMENT_CATEGORIES.find((option) => option.value === category)?.label ??
    category
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type GalleryType = "all" | "pdf" | "csv" | "image" | "xl" | "other";

function getGalleryType(file: StoredFile): Exclude<GalleryType, "all"> {
  const pathType = file.folder_path.split("/").filter(Boolean).at(-1);
  if (
    pathType === "pdf" ||
    pathType === "csv" ||
    pathType === "image" ||
    pathType === "xl" ||
    pathType === "other"
  ) {
    return pathType;
  }
  if (file.file_type === "application/pdf") return "pdf";
  if (file.file_type === "text/csv") return "csv";
  if (file.file_type.startsWith("image/")) return "image";
  if (file.file_type.includes("excel") || file.file_type.includes("spreadsheet")) {
    return "xl";
  }
  return "other";
}

const TYPE_STYLES: Record<
  Exclude<GalleryType, "all">,
  { label: string; className: string }
> = {
  pdf: { label: "PDF", className: "bg-red-500/15 text-red-500" },
  csv: { label: "CSV", className: "bg-green-500/15 text-green-500" },
  image: { label: "IMAGE", className: "bg-purple-500/15 text-purple-500" },
  xl: { label: "EXCEL", className: "bg-emerald-500/15 text-emerald-500" },
  other: { label: "FILE", className: "bg-blue-500/15 text-blue-500" },
};

export default function DocumentsPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState("document");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<GalleryType>("all");
  const [showUpload, setShowUpload] = useState(false);

  const refreshFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listFiles();
      setFiles(result.files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listFiles()
      .then((result) => {
        if (!cancelled) setFiles(result.files);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error ? error.message : "Could not load documents",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    setMessage("");
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", category);
      if (description.trim()) {
        formData.append("description", description.trim());
      }
      await uploadFile(formData);
      setSelectedFile(null);
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Uploaded to Google Drive");
      await refreshFiles();
      setShowUpload(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (file: StoredFile) => {
    if (!confirm(`Delete ${file.file_name}?`)) return;
    try {
      await deleteFile(file.file_id);
      setFiles((current) =>
        current.filter((item) => item.file_id !== file.file_id),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const canDelete = user?.role === "admin" || user?.role === "manager";
  const normalizedSearch = search.trim().toLowerCase();
  const visibleFiles = files.filter((file) => {
    const matchesType =
      typeFilter === "all" || getGalleryType(file) === typeFilter;
    const matchesSearch =
      !normalizedSearch ||
      file.file_name.toLowerCase().includes(normalizedSearch) ||
      file.description?.toLowerCase().includes(normalizedSearch) ||
      file.folder_path.toLowerCase().includes(normalizedSearch);
    return matchesType && matchesSearch;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 text-[12px] text-ink-faint">
        <Link href="/challans" className="transition-colors hover:text-ink-soft">
          Entries
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Documents</span>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-[28px]">
            Documents
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            Browse warehouse files in one visual library.
          </p>
          <p className="mt-1 text-[12px] text-ink-faint">
            View all store documents in one visual library.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload((current) => !current)}
          className="h-10 shrink-0 rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
        >
          {showUpload ? "Close upload" : "+ Upload"}
        </button>
      </div>

      {showUpload && (
      <div className="mb-5 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-ink-soft">
              Category
            </span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="focus-ring h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[13px] text-ink"
            >
              {DOCUMENT_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-ink-soft">
              Description
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={250}
              placeholder="Optional description"
              className="focus-ring h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-[13px] text-ink placeholder:text-ink-faint"
            />
          </label>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            chooseFile(event.dataTransfer.files[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-4 cursor-pointer rounded-[12px] border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver
              ? "border-brand bg-brand/5"
              : "border-border hover:border-brand/40 hover:bg-white/[0.02]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.csv,.xls,.xlsx,.doc,.docx,.txt"
            onChange={(event) => chooseFile(event.target.files?.[0])}
            className="hidden"
          />
          <svg
            className="mx-auto mb-2 h-8 w-8 text-ink-faint"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
            <path d="M5 13v6h14v-6" />
          </svg>
          {selectedFile ? (
            <>
              <p className="text-[13px] font-semibold text-ink">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                {formatFileSize(selectedFile.size)} · Click to choose another file
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-ink-soft">
                Drag a file here or{" "}
                <span className="font-semibold text-brand">browse</span>
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                PDF, image, CSV, Excel, Word or TXT · max 4 MB
              </p>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-ink-faint">
            Stored securely in the connected Google Drive folder.
          </p>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="h-10 rounded-[10px] bg-brand px-5 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload document"}
          </button>
        </div>

        {message && (
          <p className="mt-3 rounded-[9px] border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-soft">
            {message}
          </p>
        )}
      </div>
      )}

      {!showUpload && message && (
        <p className="mb-4 rounded-[9px] border border-border bg-surface px-3 py-2 text-[12px] text-ink-soft">
          {message}
        </p>
      )}

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              All documents
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {visibleFiles.length} of {files.length} files · Google Drive
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search documents..."
                className="focus-ring h-9 w-full rounded-[9px] border border-border bg-surface-2 pl-9 pr-3 text-[12px] text-ink placeholder:text-ink-faint sm:w-56"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as GalleryType)
              }
              className="focus-ring h-9 rounded-[9px] border border-border bg-surface-2 px-3 text-[12px] text-ink"
            >
              <option value="all">All types</option>
              <option value="pdf">PDF</option>
              <option value="image">Images</option>
              <option value="csv">CSV</option>
              <option value="xl">Excel</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface px-5 py-16 text-center text-[13px] text-ink-faint">
            <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            Loading documents...
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-5 py-16 text-center text-[13px] text-ink-faint">
            No documents uploaded yet. Use the upload area above.
          </div>
        ) : visibleFiles.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface px-5 py-12 text-center text-[13px] text-ink-faint">
            No documents match your search.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleFiles.map((file) => {
              const fileType = getGalleryType(file);
              const typeStyle = TYPE_STYLES[fileType];
              const canPreview = fileType === "image" || fileType === "pdf";
              const thumbnailUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(file.drive_file_id)}&sz=w600`;

              return (
                <article
                  key={file.file_id}
                  className="group min-w-0 overflow-hidden rounded-[13px] border border-border bg-surface shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[var(--shadow-lg)]"
                >
                  <a
                    href={file.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title={`Open ${file.file_name}`}
                  >
                    {canPreview ? (
                      <div
                        className="aspect-[4/3] border-b border-border bg-surface-2 bg-cover bg-center"
                        style={{ backgroundImage: `url("${thumbnailUrl}")` }}
                      >
                        <div className="h-full w-full bg-gradient-to-t from-black/10 to-transparent" />
                      </div>
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center border-b border-border bg-surface-2">
                        <div
                          className={`flex h-16 w-14 flex-col items-center justify-center rounded-[10px] border border-current/20 ${typeStyle.className}`}
                        >
                          <svg
                            className="mb-1 h-6 w-6"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            aria-hidden="true"
                          >
                            <path d="M6 2h8l4 4v16H6z" />
                            <path d="M14 2v5h5" />
                          </svg>
                          <span className="text-[9px] font-bold">
                            {typeStyle.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </a>

                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <a
                          href={file.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-[12px] font-semibold text-ink hover:text-brand"
                          title={file.file_name}
                        >
                          {file.file_name}
                        </a>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-faint">
                          <span className={`rounded px-1.5 py-0.5 font-semibold ${typeStyle.className}`}>
                            {typeStyle.label}
                          </span>
                          <span>{formatFileSize(file.file_size)}</span>
                        </div>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(file)}
                          className="shrink-0 rounded-[7px] p-1 text-ink-faint opacity-100 transition-colors hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Delete document"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <p className="mt-2 truncate text-[10px] text-ink-faint">
                      {categoryLabel(file.category)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-faint">
                      {formatDate(file.created_at)}
                    </p>
                    {file.do_id && (
                      <Link
                        href={`/challans/${file.do_id}`}
                        className="mt-2 inline-flex text-[10px] font-semibold text-brand hover:underline"
                      >
                        View linked entry →
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

