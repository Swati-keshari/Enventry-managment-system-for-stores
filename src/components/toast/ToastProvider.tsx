"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  autoDismiss?: boolean;
  duration?: number;
}

interface ToastContextType {
  toast: (type: ToastType, message: string, opts?: { autoDismiss?: boolean; duration?: number }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const toastFn = useCallback(
    (type: ToastType, message: string, opts?: { autoDismiss?: boolean; duration?: number }) => {
      const id = `t_${++counter}`;
      const autoDismiss = opts?.autoDismiss ?? type !== "error";
      const duration = opts?.duration ?? (type === "error" ? 8000 : 3000);

      setToasts((prev) => [...prev, { id, type, message, autoDismiss, duration }]);

      if (autoDismiss) {
        const timer = setTimeout(() => remove(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [remove]
  );

  const ctx: ToastContextType = {
    toast: toastFn,
    success: (m) => toastFn("success", m),
    error: (m) => toastFn("error", m),
    warning: (m) => toastFn("warning", m),
    info: (m) => toastFn("info", m),
  };

  const typeStyles: Record<ToastType, string> = {
    success: "bg-green-500/15 border-green-500/30 text-green-400",
    error: "bg-red-500/15 border-red-500/30 text-red-400",
    warning: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    info: "bg-blue-500/15 border-blue-500/30 text-blue-400",
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-[11px] border text-[13px] shadow-lg animate-slide-up ${typeStyles[t.type]}`}
            role="status"
          >
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 mt-0.5 text-current opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
