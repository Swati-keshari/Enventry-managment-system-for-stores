"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function HomePage() {
  const { user, session, loading, needsOnboarding, isSuperAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    const isRecoveryOrInvite = hash.includes("type=recovery") || hash.includes("type=invite");

    // If URL has a recovery/invite token, redirect to reset-password immediately
    if (isRecoveryOrInvite) {
      const alreadyRedirecting = sessionStorage.getItem("resetRedirect");
      if (!alreadyRedirecting) {
        sessionStorage.setItem("resetRedirect", "1");
        window.location.replace("/reset-password" + hash);
      }
      // Always return — never do session-based redirects when token is present
      return;
    }

    // Clear the flag once we're no longer on a recovery URL
    sessionStorage.removeItem("resetRedirect");

    if (loading) return;

    if (!session) {
      router.replace("/login");
      return;
    }
    if (needsOnboarding) {
      router.replace(isSuperAdmin ? "/super-admin" : "/onboarding");
      return;
    }
    if (user) {
      router.replace("/challans");
    }
  }, [user, session, loading, needsOnboarding, isSuperAdmin, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center animate-pulse">
          <svg
            className="w-6 h-6 text-white"
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
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    </div>
  );
}
