"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validToken, setValidToken] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    if (window.location.hash.includes("access_token")) return true;
    try {
      if (sessionStorage.getItem("resetRedirect") === "1") return true;
    } catch {
      // ignore
    }
    return null;
  });

  useEffect(() => {
    const supabase = getSupabase();
    let invalidTimer: ReturnType<typeof setTimeout> | undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setValidToken(true);
        sessionStorage.removeItem("resetRedirect");
      }
      if (
        event === "SIGNED_IN" &&
        typeof window !== "undefined" &&
        window.location.hash.includes("type=invite")
      ) {
        setValidToken(true);
        sessionStorage.removeItem("resetRedirect");
      }
    });

    // Hash / redirect flag already handled in useState initializer.
    // Only check async session when we still don't know token validity.
    if (validToken === null) {
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setValidToken(true);
          sessionStorage.removeItem("resetRedirect");
        } else {
          invalidTimer = setTimeout(() => {
            setValidToken((prev) => (prev === null ? false : prev));
          }, 2000);
        }
      });
    } else if (validToken === true) {
      sessionStorage.removeItem("resetRedirect");
    }

    return () => {
      subscription.unsubscribe();
      if (invalidTimer) clearTimeout(invalidTimer);
    };
  }, [validToken]);

  const validate = (): string | null => {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[0-9]/.test(password)) return "Password must contain at least 1 number.";
    if (!/[a-zA-Z]/.test(password)) return "Password must contain at least 1 letter.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        setError("Invalid or expired reset link. Request a new one.");
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (validToken === false) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
        <h1 className="font-display text-[20px] font-bold text-ink text-center mb-2">Invalid or expired link</h1>
        <p className="text-[13.5px] text-ink-soft text-center mb-6">
          This reset link is no longer valid. Please request a new one.
        </p>
        <Link href="/forgot-password" className="block text-center text-[13px] font-semibold text-brand hover:underline">
          Request new reset link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
        <div className="w-10 h-10 rounded-[11px] bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-display text-[20px] font-bold text-ink text-center mb-2">Password updated</h1>
        <p className="text-[13.5px] text-ink-soft text-center">
          Redirecting to sign in...
        </p>
      </div>
    );
  }

  if (validToken === null) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8 text-center">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)] sm:p-8">
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Set new password</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">Choose a strong password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] px-3 py-2 rounded-[11px]">{error}</div>
        )}

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">New password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="focus-ring h-11 w-full rounded-[11px] border border-border bg-surface-2 px-3.5 pr-11 text-[14px] text-ink placeholder:text-ink-faint transition-colors"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {showPassword ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                ) : (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Confirm password</label>
          <input
            id="confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
            className="focus-ring h-11 w-full rounded-[11px] border border-border bg-surface-2 px-3.5 text-[14px] text-ink placeholder:text-ink-faint transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="focus-ring group inline-flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-brand text-[14px] font-semibold text-brand-ink shadow-[var(--shadow-sm)] transition-all hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            "Update password"
          )}
        </button>
      </form>
    </div>
  );
}
