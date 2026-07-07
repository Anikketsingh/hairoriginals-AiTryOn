"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Check, AlertCircle, Info, X } from "lucide-react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // No-op fallback so components never crash outside a provider.
    return { toast: () => {} };
  }
  return ctx;
}

const toneStyles: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-brand",
};

const toneIcon: Record<ToastTone, React.ReactNode> = {
  success: <Check className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-safe"
        role="status"
        aria-live="polite"
      >
        <div className="mt-3 flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <ToastRow key={t.id} toast={t} onDone={() => remove(t.id)} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="pointer-events-auto flex items-center gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-pop)] animate-toast-in">
      <span className={cn("shrink-0", toneStyles[toast.tone])}>{toneIcon[toast.tone]}</span>
      <p className="flex-1 text-sm font-medium text-ink">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDone}
        className="text-ink-faint hover:text-ink transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
