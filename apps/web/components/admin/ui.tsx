"use client";

import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: string; action?: ReactNode; back?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 pt-4">
      <div>
        {back && (
          <Link href={back} className="-ml-1 mb-1 inline-flex items-center gap-1 px-1 py-1 text-sm font-medium text-muted">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Назад
          </Link>
        )}
        <h1 className="text-2xl font-bold leading-tight first-letter:uppercase md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted first-letter:uppercase">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** Поле пароля с кнопкой «Показать» (на телефоне легко ошибиться при вводе) */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  autoFocus,
  className = "input",
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input
        className={`${className} pr-24`}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        minLength={autoComplete === "new-password" ? 6 : undefined}
        maxLength={128}
        aria-label="Пароль"
        required
      />
      <button type="button" className="absolute inset-y-0 right-0 px-4 text-sm font-medium text-muted" onClick={() => setVisible((v) => !v)}>
        {visible ? "Скрыть" : "Показать"}
      </button>
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-hairline p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-[28px] font-bold leading-none">{value}</p>
    </div>
  );
}

export const Loading = () => <p className="text-sm text-muted">Загрузка…</p>;

export const ErrorText = ({ children }: { children?: string }) =>
  children ? <p className="text-sm text-error">{children}</p> : null;

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-dashed border-hairline p-10 text-center text-sm text-muted">{children}</div>
);

/** Админка рендерится только на клиенте: даты зависят от часового пояса браузера */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
}

/** Нижняя шторка */
export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-lg bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {subtitle && <p className="text-sm text-muted first-letter:uppercase">{subtitle}</p>}
            <h2 className="text-[22px] font-medium leading-tight tracking-[-0.44px]">{title}</h2>
          </div>
          <button type="button" className="icon-btn h-9 w-9 shrink-0" onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
