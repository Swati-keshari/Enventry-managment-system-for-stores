"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { exportData, type ExportColumn, type ExportRow } from "@/lib/export-utils";

type Format = "csv" | "xlsx" | "pdf";

interface ExportMenuProps {
  filename: string;
  title: string;
  sheetName?: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  disabled?: boolean;
  className?: string;
}

export default function ExportMenu({
  filename,
  title,
  sheetName,
  subtitle,
  columns,
  rows,
  disabled = false,
  className = "",
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("left");
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 168;
    const spaceRight = window.innerWidth - rect.left;
    // Prefer left-align (opens rightward) when near the left edge / tight on the right.
    setAlign(spaceRight < menuWidth + 12 ? "right" : "left");
  }, [open]);

  const handleExport = async (format: Format) => {
    setBusy(true);
    try {
      await exportData(format, {
        filename,
        title,
        sheetName,
        subtitle,
        columns,
        rows,
      });
      setOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || busy || rows.length === 0}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-1.5 px-3 text-[12px] sm:text-[13px] font-medium border border-border text-ink-soft hover:text-ink hover:bg-white/5 rounded-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
      >
        {busy ? (
          <div className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        Export
        <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1 z-50 min-w-[168px] rounded-[10px] border border-border bg-surface shadow-[var(--shadow-lg)] overflow-hidden ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {(
            [
              ["csv", "CSV"],
              ["xlsx", "Excel (.xlsx)"],
              ["pdf", "PDF"],
            ] as const
          ).map(([format, label]) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => void handleExport(format)}
              className="w-full text-left px-3 py-2.5 text-[12px] text-ink-soft hover:text-ink hover:bg-white/5 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
