"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`focus-ring inline-flex items-center justify-center rounded-[10px] border border-border bg-surface-2 text-ink-soft shadow-[var(--shadow-sm)] transition-colors hover:text-ink hover:bg-white/5 ${
        compact ? "h-8 w-8" : "h-9 gap-2 px-3"
      }`}
      aria-label="Toggle light and dark theme"
      title="Light / Dark theme"
    >
      <svg
        className="h-4 w-4 dark:hidden"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </svg>
      <svg
        className="hidden h-4 w-4 dark:block"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      {!compact && (
        <span className="hidden text-[12px] font-semibold lg:inline">
          Theme
        </span>
      )}
    </button>
  );
}

