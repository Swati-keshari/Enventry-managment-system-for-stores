"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, session, loading, needsOnboarding, isSuperAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onSuperAdminRoute = pathname.startsWith("/super-admin");
  const canAccessDashboard = Boolean(user) || (isSuperAdmin && onSuperAdminRoute);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    // Super-admins may use /super-admin without warehouse membership.
    if (needsOnboarding && !(isSuperAdmin && onSuperAdminRoute)) {
      router.replace("/onboarding");
    }
  }, [
    user,
    session,
    loading,
    needsOnboarding,
    isSuperAdmin,
    onSuperAdminRoute,
    router,
  ]);

  if (loading) {
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

  if (!canAccessDashboard) return null;

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="text-center py-4 text-[11px] text-ink-faint border-t border-border">
        Enventry &middot; Built for goods &amp; stock tracking
      </footer>
    </div>
  );
}
