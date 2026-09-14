"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createWarehouse } from "@/lib/api-client";

export default function OnboardingPage() {
  const {
    session,
    user,
    loading,
    needsOnboarding,
    isSuperAdmin,
    refreshUser,
    signOut,
  } = useAuth();
  const router = useRouter();
  const [warehouseName, setWarehouseName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (user) {
      router.replace("/challans");
      return;
    }
    if (isSuperAdmin) {
      router.replace("/super-admin");
    }
  }, [loading, session, user, isSuperAdmin, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (warehouseName.trim().length < 2) {
      setError("Store name must be at least 2 characters");
      return;
    }
    if (adminName.trim().length === 1) {
      setError("Your name must be at least 2 characters");
      return;
    }
    setSubmitting(true);
    try {
      await createWarehouse({
        name: warehouseName.trim(),
        adminName: adminName.trim() || undefined,
      });
      await refreshUser();
      router.replace("/challans");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create store");
      setSubmitting(false);
    }
  };

  if (loading || !needsOnboarding) {
    return (
      <div className="aurora relative flex min-h-dvh items-center justify-center">
        <div className="w-9 h-9 rounded-[11px] bg-brand flex items-center justify-center animate-pulse">
          <svg
            className="w-5 h-5 text-brand-ink"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="aurora relative flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[440px] animate-rise">
        <div className="mb-6 flex justify-center">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand text-brand-ink shadow-[var(--shadow-sm)]">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                <path d="M3 7v6l9 4 9-4V7" />
                <path d="M12 11v10" />
              </svg>
            </span>
            <div className="leading-tight">
              <div className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink">
                Set up your store
              </div>
              <div className="text-[11px] font-medium text-ink-faint">
                You become the admin automatically
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
            Create a store
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-soft">
            Name your store to unlock entries, items, parties, and team management.
            As the creator you are assigned the <strong className="text-ink">admin</strong> role.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] px-3 py-2 rounded-[11px]">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="warehouseName"
                className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft"
              >
                Store name
              </label>
              <input
                id="warehouseName"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                placeholder="e.g. My Store"
                className="focus-ring h-11 w-full rounded-[11px] border border-border bg-surface-2 px-3.5 text-[14px] text-ink placeholder:text-ink-faint"
              />
            </div>

            <div>
              <label
                htmlFor="adminName"
                className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft"
              >
                Your name (admin, optional)
              </label>
              <input
                id="adminName"
                type="text"
                maxLength={100}
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder={
                  (session?.user.user_metadata as { name?: string } | undefined)?.name ??
                  session?.user.email?.split("@")[0] ??
                  "Your full name"
                }
                className="focus-ring h-11 w-full rounded-[11px] border border-border bg-surface-2 px-3.5 text-[14px] text-ink placeholder:text-ink-faint"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-[11px] bg-brand text-[14px] font-semibold text-brand-ink shadow-[var(--shadow-sm)] transition-all hover:bg-brand-strong active:scale-[0.99] disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create store & continue"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => signOut()}
            className="mt-4 w-full text-center text-[12px] text-ink-faint hover:text-ink-soft"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
