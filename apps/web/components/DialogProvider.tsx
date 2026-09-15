"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean; // удаление/отмена — красная кнопка
};
type ToastKind = "error" | "success" | "info";
type Toast = { id: number; message: string; kind: ToastKind };
type Dialogs = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, kind?: ToastKind) => void;
};

const DialogContext = createContext<Dialogs | null>(null);

/** Кастомные подтверждения и уведомления вместо системных confirm()/alert() */
export function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs must be used inside DialogProvider");
  return ctx;
}

const TOAST_ICON = { error: CircleAlert, success: CircleCheck, info: Info } as const;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "error") => {
      const id = ++nextId.current;
      setToasts((list) => [...list.slice(-2), { id, message, kind }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const answer = useCallback(
    (ok: boolean) => {
      setPending((current) => {
        current?.resolve(ok);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!pending) return;
    // capture: Escape закрывает только окно подтверждения, а не шторку под ним
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      answer(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending, answer]);

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

  return (
    <DialogContext.Provider value={value}>
      {children}

      {pending && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6"
          onMouseDown={(e) => e.target === e.currentTarget && answer(false)}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-md bg-white p-6 shadow-float">
            {pending.danger && (
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0f3] text-error" aria-hidden>
                <CircleAlert className="h-6 w-6" />
              </span>
            )}
            <h2 id="confirm-title" className="text-xl font-semibold leading-tight">{pending.title}</h2>
            {pending.message && <p className="mt-2 text-[15px] leading-relaxed text-body">{pending.message}</p>}
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                className={`btn-primary w-full ${pending.danger ? "bg-error hover:bg-[#a52c11] active:bg-[#a52c11]" : ""}`}
                onClick={() => answer(true)}
              >
                {pending.confirmText ?? "Да"}
              </button>
              <button type="button" className="btn-secondary w-full border-hairline" onClick={() => answer(false)} autoFocus>
                {pending.cancelText ?? "Отмена"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] mx-auto flex max-w-md flex-col gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)]"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.kind];
          return (
            <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-3 rounded-md bg-ink px-4 py-3 text-sm text-white shadow-float">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.kind === "error" ? "text-primary" : "text-white"}`} aria-hidden />
              <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
              <button type="button" className="-m-1 shrink-0 p-1 text-white/70" onClick={() => dismiss(t.id)} aria-label="Закрыть">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </DialogContext.Provider>
  );
}
