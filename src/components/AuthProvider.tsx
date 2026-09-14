"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  getSupabase,
  hasSupabaseBrowserConfig,
} from "@/lib/supabase-browser";
import { logLoginAudit, logLogoutAudit, pingUserPresence } from "@/lib/api-client";
import { isSuperAdminEmail } from "@/lib/super-admin";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "staff";
  warehouseId: string;
  warehouseName: string;
}

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  /** Logged in via Supabase Auth but no warehouse membership yet */
  needsOnboarding: boolean;
  /** Platform super-admin (email allowlist) — UI hint only; APIs enforce server-side */
  isSuperAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<AppUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // Lazy client creation — avoids crashing Next.js prerender when Preview env
  // is missing NEXT_PUBLIC_SUPABASE_* (Production has them; Preview may not).
  const supabase = useMemo<SupabaseClient<Database> | null>(() => {
    if (typeof window === "undefined" && !hasSupabaseBrowserConfig()) {
      return null;
    }
    if (!hasSupabaseBrowserConfig()) return null;
    try {
      return getSupabase();
    } catch {
      return null;
    }
  }, []);

  const [loading, setLoading] = useState(() => hasSupabaseBrowserConfig());

  const resolveAppUser = useCallback(
    async (s: Session): Promise<AppUser | null> => {
      if (!supabase) return null;

      const { data, error } = await supabase
        .from("app_users")
        .select("user_id, email, name, role, warehouse_id, deleted_at")
        .eq("user_id", s.user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (error || !data) return null;

      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("name, is_deleted")
        .eq("warehouse_id", data.warehouse_id)
        .maybeSingle();

      if (!warehouse || warehouse.is_deleted) return null;

      return {
        id: data.user_id,
        email: data.email,
        name: data.name,
        role: data.role as "admin" | "manager" | "staff",
        warehouseId: data.warehouse_id,
        warehouseName: warehouse.name ?? "Warehouse",
      };
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        setUser(await resolveAppUser(s));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (s) {
        setUser(await resolveAppUser(s));
        // Covers password, Google OAuth, and magic-link sign-ins.
        // Skip INITIAL_SESSION / TOKEN_REFRESHED so page reloads don't spam login logs.
        // Defer so we don't deadlock inside onAuthStateChange.
        // Dedupe rapid repeat SIGNED_IN (React remounts / multi-tab).
        if (event === "SIGNED_IN") {
          const dedupeKey = `login-audit:${s.user.id}`;
          const last = sessionStorage.getItem(dedupeKey);
          const now = Date.now();
          if (last && now - Number(last) < 60_000) {
            // already logged recently
          } else {
            sessionStorage.setItem(dedupeKey, String(now));
            window.setTimeout(() => {
              logLoginAudit().catch(() => {});
            }, 0);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, resolveAppUser]);

  // Keep presence Active while this tab is open; also mark invite accepted.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const beat = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      pingUserPresence().catch(() => {});
    };

    beat();
    const intervalId = window.setInterval(beat, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (!supabase) {
      setUser(null);
      setSession(null);
      return null;
    }
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    setSession(s);
    if (!s) {
      setUser(null);
      return null;
    }
    const appUser = await resolveAppUser(s);
    setUser(appUser);
    return appUser;
  }, [supabase, resolveAppUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        return { error: "Auth is not configured." };
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        const msg =
          error.message === "Invalid login credentials"
            ? "Invalid email or password"
            : error.message;
        return { error: msg };
      }
      // Login audit is written via onAuthStateChange(SIGNED_IN)
      return {};
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      if (!supabase) {
        return { error: "Auth is not configured." };
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        const normalizedMessage = error.message.toLowerCase();
        const mayAlreadyExist =
          normalizedMessage.includes("rate limit") ||
          normalizedMessage.includes("already registered") ||
          normalizedMessage.includes("already exists");

        if (mayAlreadyExist) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (!signInError) return {};
        }

        const message = normalizedMessage.includes("rate limit")
          ? "Signup email quota is temporarily exhausted. If you already have an account, use Sign in. For a new account, try again later."
          : error.message;
        return { error: message };
      }
      return {};
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    logLogoutAudit().catch(() => {});
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
  }, [supabase]);

  const needsOnboarding = Boolean(session && !user);
  const isSuperAdmin = isSuperAdminEmail(session?.user?.email ?? user?.email);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        needsOnboarding,
        isSuperAdmin,
        loading,
        signIn,
        signUp,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
