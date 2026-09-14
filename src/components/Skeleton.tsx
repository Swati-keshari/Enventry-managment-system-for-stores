"use client";

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-[9px] bg-white/5 ${className}`} />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-12 ml-auto" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-7 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-border/50 last:border-0">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonDOList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-4 w-48 mb-2" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
