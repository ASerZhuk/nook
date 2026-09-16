"use client";

import { MessageSquare, Share2 } from "lucide-react";
import { useState } from "react";
import { formatDay, hhmm, maskPhone } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { Sheet } from "./ui";

export type NotifyKind = "created" | "moved" | "cancelled";

const TITLES: Record<NotifyKind, string> = {
  created: "Сообщить о записи",
  moved: "Сообщить о переносе",
  cancelled: "Сообщить об отмене",
};

function messageText(kind: NotifyKind, b: Booking, masterName: string, masterSlug: string) {
  const origin = window.location.origin;
  const when = `${formatDay(b.start_at, { day: "numeric", month: "long" })}, ${hhmm(b.start_at)}`;
  if (kind === "cancelled") {
    return `Здравствуйте! Ваша запись на ${when} (${b.service_name}) отменена. Записаться на другое время: ${origin}/${masterSlug}`;
  }
  const intro = kind === "moved" ? "Ваша запись перенесена на" : `Вы записаны к мастеру ${masterName} на`;
  return `Здравствуйте! ${intro} ${when} — ${b.service_name}. Детали, календарь и отмена: ${origin}${b.share_url}`;
}

/** Клиенту без приложения nook: SMS с номера мастера или «Поделиться» в любой мессенджер */
export function NotifyClientSheet({
  kind,
  booking,
  masterName,
  masterSlug,
  onClose,
}: {
  kind: NotifyKind;
  booking: Booking;
  masterName: string;
  masterSlug: string;
  onClose: () => void;
}) {
  const text = messageText(kind, booking, masterName, masterSlug);
  const [copied, setCopied] = useState(false);
  // «sms:номер?&body=» открывает «Сообщения» с текстом и на iOS, и на Android
  const smsHref = `sms:${booking.client_phone}?&body=${encodeURIComponent(text)}`;

  async function share() {
    if (navigator.share) {
      await navigator.share({ text }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
  }

  return (
    <Sheet title={TITLES[kind]} subtitle={`${booking.client_name} · ${maskPhone(booking.client_phone)}`} onClose={onClose}>
      <p className="rounded-sm bg-surface-soft p-3 text-sm leading-relaxed text-body [overflow-wrap:anywhere]">{text}</p>
      <p className="mt-2 text-xs text-muted">SMS уйдёт с вашего номера — клиенту не нужен мессенджер. Или выберите любой мессенджер через «Поделиться».</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <a href={smsHref} className="btn-primary px-3">
          <MessageSquare className="h-5 w-5" aria-hidden />
          SMS
        </a>
        <button type="button" className="btn-secondary px-3" onClick={share}>
          <Share2 className="h-5 w-5" aria-hidden />
          {copied ? "Скопировано" : "Поделиться"}
        </button>
      </div>
      <button type="button" className="btn-ghost mt-2 w-full" onClick={onClose}>Готово</button>
    </Sheet>
  );
}
