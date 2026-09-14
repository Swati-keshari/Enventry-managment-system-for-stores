"use client";

import { useEffect, useState } from "react";
import {
  disconnectDriveIntegration,
  getDriveIntegrationStatus,
  startDriveIntegration,
  type DriveIntegrationStatus,
} from "@/lib/api-client";

export function DriveIntegrationCard() {
  const [status, setStatus] = useState<DriveIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    const result = new URL(window.location.href).searchParams.get("drive");
    if (result === "connected") {
      return "Google Drive connected successfully";
    }
    if (result === "error") {
      return "Google Drive connection failed. Check the OAuth redirect URL and try again.";
    }
    return "";
  });

  useEffect(() => {
    let cancelled = false;
    getDriveIntegrationStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not check Google Drive");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = async () => {
    setWorking(true);
    setMessage("");
    try {
      const result = await startDriveIntegration();
      window.location.assign(result.authorization_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not connect Google Drive");
      setWorking(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Drive from this store?")) return;
    setWorking(true);
    setMessage("");
    try {
      await disconnectDriveIntegration();
      setStatus({ connected: false });
      setMessage("Google Drive disconnected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect Google Drive");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand/10 text-brand">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M8 3h8l5 9-4 7H7l-4-7 5-9Z" />
                <path d="m8 3 5 9h8M3 12h10l4 7" />
              </svg>
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-ink">
                Google Drive storage
              </h2>
              <p className="text-[11px] text-ink-faint">
                Google Drive document storage
              </p>
            </div>
          </div>

          <div className="mt-3 text-[12px] text-ink-soft">
            {loading ? (
              "Checking connection..."
            ) : status?.connected ? (
              <>
                <span className="font-semibold text-green-500">Connected</span>
                {status.account_email ? ` as ${status.account_email}` : ""}
                {status.folder_name ? ` · Folder: ${status.folder_name}` : ""}
                {status.mode === "service_account"
                  ? " · using service account fallback"
                  : ""}
              </>
            ) : (
              <>
                Connect the Drive owner&apos;s Google account to store entry documents.
                <span className="mt-1 block text-ink-faint">
                  Service-account editor access alone cannot use personal Drive storage.
                </span>
              </>
            )}
          </div>

          {message && (
            <p className="mt-3 rounded-[9px] border border-border bg-surface-2 px-3 py-2 text-[11px] text-ink-soft">
              {message}
            </p>
          )}

          {!status?.connected && status?.callback_url && (
            <p className="mt-3 break-all text-[10px] text-ink-faint">
              Google OAuth redirect URL: {status.callback_url}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {status?.connected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={working}
              className="h-9 rounded-[9px] border border-red-500/30 px-3 text-[12px] font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              {working ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={working || loading}
              className="h-9 rounded-[9px] bg-brand px-3 text-[12px] font-semibold text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-50"
            >
              {working ? "Opening Google..." : "Connect Google Drive"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

