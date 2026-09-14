"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = getSupabase();
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (authError) {
        if (authError.message.includes("rate") || authError.status === 429) {
          setError("Too many reset attempts. Try again in 1 hour.");
          setCooldown(60);
          const timer = setInterval(() => {
            setCooldown((prev) => {
              if (prev <= 1) {
                clearInterval(timer);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          // Always show same message to prevent email enumeration
          setSent(true);
        }
      } else {
        setSent(true);
      }
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
        <div className="w-10 h-10 rounded-[11px] bg-brand/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="font-display text-[20px] font-bold text-ink text-center mb-2">Check your email</h1>
        <p className="text-[13.5px] text-ink-soft text-center mb-6">
          If an account exists with <span className="font-medium text-ink">{email}</span>, you&apos;ll receive a reset link shortly.
        </p>
        <Link href="/login" className="block text-center text-[13px] font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Forgot password?</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">Enter your email and we&apos;ll send a reset link.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] px-3 py-2 rounded-[11px]">{error}</div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="focus-ring h-11 w-full rounded-[11px] border border-border bg-surface-2 px-3.5 text-[14px] text-ink placeholder:text-ink-faint transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading || cooldown > 0}
          className="focus-ring group inline-flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-brand text-[14px] font-semibold text-brand-ink shadow-[var(--shadow-sm)] transition-all hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : cooldown > 0 ? (
            `Wait ${cooldown}s`
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <p className="pt-4 text-center text-[13px] text-ink-soft">
        Remember your password?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
