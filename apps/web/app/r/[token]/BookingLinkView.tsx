"use client";

import { CalendarPlus, Check, Phone } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientOnly, Loading } from "@/components/admin/ui";
import { useDialogs } from "@/components/DialogProvider";
import { api, CLIENT_TOKEN_KEY, useLoad } from "@/lib/api";
import { formatDay, formatPrice, hhmm, localNowIso } from "@/lib/format";
import type { BookingLink, ClientBooking } from "@/lib/types";

export function BookingLinkView({ token }: { token: string }) {
  return (
    <ClientOnly>
      <Inner token={token} />
    </ClientOnly>
  );
}

function Inner({ token }: { token: string }) {
  const router = useRouter();
  const { confirm } = useDialogs();
  const { data, error, setData } = useLoad<BookingLink>(`/r/${token}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  if (error) {
    return (
      <main className="px-6 pt-20 text-center">
        <h1 className="text-[22px] font-semibold">Запись не найдена</h1>
        <p className="mt-2 text-muted">Проверьте ссылку, которую прислал мастер.</p>
      </main>
    );
  }
  if (!data) return <main className="p-6"><Loading /></main>;

  const b = data.booking;
  const cancelled = b.status === "cancelled";
  const upcoming = b.end_at.slice(0, 16) > localNowIso();

  async function openInApp() {
    setBusy(true);
    setActionError("");
    let deviceToken: string | null = null;
    try {
      deviceToken = localStorage.getItem(CLIENT_TOKEN_KEY);
    } catch {}
    try {
      const { client_token } = await api<{ client_token: string }>(`/r/${token}/claim`, {
        method: "POST",
        body: JSON.stringify({ client_token: deviceToken }),
      });
      try {
        localStorage.setItem(CLIENT_TOKEN_KEY, client_token);
      } catch {}
      router.push(`/c/${client_token}`);
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(false);
    }
  }

  async function cancel() {
    const ok = await confirm({
      title: "Отменить запись?",
      message: "Мастер получит уведомление, а время освободится для других клиентов.",
      confirmText: "Отменить запись",
      cancelText: "Не отменять",
      danger: true,
    });
    if (!ok) return;
    setActionError("");
    try {
      const updated = await api<ClientBooking>(`/r/${token}/cancel`, { method: "POST" });
      setData((d) => d && { ...d, booking: updated });
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  return (
    <main className="px-4 pb-12 pt-[calc(env(safe-area-inset-top)+20px)]">
      <Image src="/logo.png" alt="nook" width={474} height={128} className="h-7 w-auto" priority />

      <section className="mt-6 rounded-md bg-surface-soft p-5 text-center">
        {cancelled ? (
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-error">
            {b.cancelled_by === "client" ? "Вы отменили запись" : "Мастер отменил запись"}
          </span>
        ) : (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white">
            <Check className="h-7 w-7" strokeWidth={2.5} aria-hidden />
          </div>
        )}
        <h1 className="mt-4 text-[26px] font-bold leading-tight">{cancelled ? "Запись отменена" : "Вы записаны"}</h1>
        <p className="mt-2 text-body">{b.master.name} · {b.service_name}</p>
        <p className={`font-semibold first-letter:uppercase ${cancelled ? "line-through" : ""}`}>
          {formatDay(b.start_at)}, {hhmm(b.start_at)}–{hhmm(b.end_at)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {formatPrice(b.price)}
          {b.master.address && ` · ${b.master.address}`}
        </p>
      </section>

      {!cancelled && upcoming && (
        <div className={`mt-4 grid gap-2 ${b.master.phone ? "grid-cols-2" : "grid-cols-1"}`}>
          <a href={`/api/r/${token}/ics`} className="btn-secondary h-11 px-2 text-sm">
            <CalendarPlus className="h-4 w-4" aria-hidden />
            В календарь
          </a>
          {b.master.phone && (
            <a href={`tel:${b.master.phone}`} className="btn-secondary h-11 px-2 text-sm">
              <Phone className="h-4 w-4" aria-hidden />
              Мастеру
            </a>
          )}
        </div>
      )}

      <section className="mt-6 rounded-md border border-hairline p-5">
        <h2 className="font-semibold">Приложение nook</h2>
        <p className="mt-1 text-sm text-muted">Все ваши записи в одном месте, уведомления о переносе и отмене, повторная запись в пару нажатий.</p>
        <button type="button" className="btn-primary mt-4 w-full" onClick={openInApp} disabled={busy}>
          {busy ? "Открываем…" : data.in_app ? "Открыть в nook" : "Сохранить в nook"}
        </button>
      </section>

      {cancelled ? (
        <a href={`/${b.master.slug}`} className="btn-ghost mt-4 w-full">Записаться на другое время</a>
      ) : (
        upcoming && (
          <button type="button" className="btn-ghost mt-4 w-full text-error" onClick={cancel}>Отменить запись</button>
        )
      )}
      {actionError && <p className="mt-3 text-center text-sm text-error">{actionError}</p>}
    </main>
  );
}
