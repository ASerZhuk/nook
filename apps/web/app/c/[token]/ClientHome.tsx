"use client";

import Image from "next/image";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useDialogs } from "@/components/DialogProvider";
import { PushSetup } from "@/components/admin/PushSetup";
import { ClientOnly, Empty, Loading } from "@/components/admin/ui";
import { api, CLIENT_TOKEN_KEY, useLoad } from "@/lib/api";
import { formatDay, formatPrice, hhmm, localNowIso } from "@/lib/format";
import { registerSW } from "@/lib/push";
import type { ClientBooking, ClientMe } from "@/lib/types";

type Props = { token: string; bookedId: string | null };

/** Приложение клиента: записи ко всем мастерам, отмена, календарь, повторная запись, уведомления */
export function ClientHome(props: Props) {
  return (
    <ClientOnly>
      <Inner {...props} />
    </ClientOnly>
  );
}

function Inner({ token, bookedId }: Props) {
  const { data, error, setData } = useLoad<ClientMe>("/client/me", token);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CLIENT_TOKEN_KEY, token);
    } catch {}
    registerSW().catch(() => undefined);
    // убираем ?booked, чтобы «На экран Домой» сохранил чистый адрес /c/{token}
    if (bookedId) window.history.replaceState(null, "", `/c/${token}`);
  }, [token, bookedId]);

  if (error) {
    return (
      <main className="px-6 pt-20 text-center">
        <h1 className="text-[22px] font-semibold">Ссылка недействительна</h1>
        <p className="mt-2 text-muted">Откройте ссылку, которую вы получили после записи к мастеру.</p>
      </main>
    );
  }
  if (!data) return <main className="p-6"><Loading /></main>;

  const now = localNowIso();
  const booked = bookedId ? data.bookings.find((b) => b.id === bookedId) : undefined;
  const upcoming = data.bookings.filter((b) => b.end_at.slice(0, 16) > now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = data.bookings.filter((b) => b.end_at.slice(0, 16) <= now);
  const masters = [...new Map(data.bookings.map((b) => [b.master.slug, b.master])).values()];

  const replace = (updated: ClientBooking) => setData((d) => d && { ...d, bookings: d.bookings.map((b) => (b.id === updated.id ? updated : b)) });

  return (
    <main className="px-4 pb-12 pt-[calc(env(safe-area-inset-top)+20px)]">
      <Image src="/logo.png" alt="nook" width={474} height={128} className="h-7 w-auto" priority />

      {booked && (
        <section className="mt-6 rounded-md bg-surface-soft p-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white">
            <Check className="h-7 w-7" strokeWidth={2.5} aria-hidden />
          </div>
          <h1 className="mt-4 text-[26px] font-bold leading-tight">Вы записаны!</h1>
          <p className="mt-2 text-body">{booked.master.name} · {booked.service_name}</p>
          <p className="font-semibold first-letter:uppercase">{formatDay(booked.start_at)}, {hhmm(booked.start_at)}</p>
          <a href={icsUrl(booked, token)} className="btn-secondary mt-4 w-full">Добавить в календарь</a>
        </section>
      )}

      <div className="mt-6">
        <PushSetup
          title="Узнавайте об изменениях"
          description="Если мастер перенесёт или отменит запись — придёт уведомление. Здесь же все ваши записи и повторная запись."
          subscribePath="/client/push/subscribe"
          clientToken={token}
        />
      </div>

      <h2 className="mt-8 text-xl font-semibold">Мои записи</h2>
      {upcoming.length ? (
        <ul className="mt-3 space-y-3">
          {upcoming.map((b) => (
            <BookingCard key={b.id} booking={b} token={token} onChanged={replace} />
          ))}
        </ul>
      ) : (
        <div className="mt-3"><Empty>Предстоящих записей нет</Empty></div>
      )}

      {masters.length > 0 && (
        <>
          <h2 className="mt-8 text-xl font-semibold">Записаться снова</h2>
          <ul className="mt-3 divide-y divide-hairline rounded-md border border-hairline">
            {masters.map((m) => (
              <li key={m.slug}>
                <Link href={`/${m.slug}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-soft">
                  <Avatar name={m.name} url={m.avatar_url} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block truncate text-sm text-muted">{m.specialty || m.address}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <div className="mt-8">
          <button type="button" className="btn-ghost -ml-3" onClick={() => setShowPast((v) => !v)}>
            {showPast ? "Скрыть прошедшие" : `Прошедшие записи (${past.length})`}
          </button>
          {showPast && (
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {past.map((b) => (
                <li key={b.id} className={b.status === "cancelled" ? "line-through" : ""}>
                  {formatDay(b.start_at, { day: "numeric", month: "long" })}, {hhmm(b.start_at)} · {b.master.name} · {b.service_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

const icsUrl = (b: ClientBooking, token: string) => `/api/client/bookings/${b.id}/ics?t=${encodeURIComponent(token)}`;

function BookingCard({ booking: b, token, onChanged }: { booking: ClientBooking; token: string; onChanged: (b: ClientBooking) => void }) {
  const cancelled = b.status === "cancelled";
  const { confirm, toast } = useDialogs();

  async function cancel() {
    const ok = await confirm({
      title: "Отменить запись?",
      message: `${b.master.name}, ${formatDay(b.start_at, { day: "numeric", month: "long" })} в ${hhmm(b.start_at)}. Мастер получит уведомление.`,
      confirmText: "Отменить запись",
      cancelText: "Не отменять",
      danger: true,
    });
    if (!ok) return;
    try {
      onChanged(await api<ClientBooking>(`/client/bookings/${b.id}/cancel`, { method: "POST", clientToken: token }));
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <li className={`rounded-md border border-hairline p-4 ${cancelled ? "bg-surface-soft" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted first-letter:uppercase">{formatDay(b.start_at)}</p>
          <p className={`text-lg font-semibold ${cancelled ? "line-through" : ""}`}>{hhmm(b.start_at)}–{hhmm(b.end_at)}</p>
          <p className="truncate text-sm">{b.service_name} · {formatPrice(b.price)}</p>
          <p className="truncate text-sm text-muted">{b.master.name}{b.master.address && ` · ${b.master.address}`}</p>
        </div>
        {cancelled && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-error">
            {b.cancelled_by === "client" ? "Вы отменили" : "Мастер отменил"}
          </span>
        )}
      </div>
      {cancelled ? (
        <Link href={`/${b.master.slug}`} className="btn-secondary mt-4 h-11 w-full text-sm">Выбрать другое время</Link>
      ) : (
        <>
          <div className={`mt-4 grid gap-2 ${b.master.phone ? "grid-cols-2" : "grid-cols-1"}`}>
            {b.master.phone && <a href={`tel:${b.master.phone}`} className="btn-secondary h-11 px-2 text-sm">Позвонить</a>}
            <a href={icsUrl(b, token)} className="btn-secondary h-11 px-2 text-sm">В календарь</a>
          </div>
          <button type="button" onClick={cancel} className="btn-ghost mt-1 w-full text-error">Отменить запись</button>
        </>
      )}
    </li>
  );
}
