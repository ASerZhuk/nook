"use client";

import { ChevronRight, Phone } from "lucide-react";
import { useState } from "react";
import { Empty, ErrorText, Loading, PageHeader, Sheet } from "@/components/admin/ui";
import { api, useLoad } from "@/lib/api";
import { formatDay, formatPrice, hhmm, localNowIso, maskPhone, plural } from "@/lib/format";
import type { Booking, Client } from "@/lib/types";

export default function ClientsPage() {
  const { data, error, setData } = useLoad<Client[]>("/master/clients");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Client | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = (data ?? []).filter((c) => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q));

  function applyNotes(id: string, notes: string | null) {
    setData((list) => list && list.map((c) => (c.id === id ? { ...c, notes } : c)));
    setOpen((c) => (c && c.id === id ? { ...c, notes } : c));
  }

  return (
    <>
      <PageHeader
        title="Клиенты"
        subtitle={data ? `${data.length} ${plural(data.length, ["клиент", "клиента", "клиентов"])}` : undefined}
      />
      <input
        className="input-sm mb-4 md:mb-6 md:max-w-sm"
        type="search"
        placeholder="Поиск по имени или телефону"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ErrorText>{error}</ErrorText>
      {!data ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty>{data.length ? "Никого не нашли" : "Клиенты появятся после первых записей"}</Empty>
      ) : (
        <ul className="divide-y divide-hairline rounded-md border border-hairline">
          {filtered.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpen(c)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-soft">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {maskPhone(c.phone)} · {c.visits} {plural(c.visits, ["визит", "визита", "визитов"])}
                  </span>
                  {c.notes && <span className="mt-0.5 block truncate text-sm text-muted-soft">{c.notes}</span>}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <ClientSheet client={open} onClose={() => setOpen(null)} onNotes={applyNotes} />}
    </>
  );
}

function BookingList({ title, bookings }: { title: string; bookings: Booking[] }) {
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      <ul className="mt-2 divide-y divide-hairline rounded-md border border-hairline">
        {bookings.map((b) => (
          <li key={b.id} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0">
              <span className={`block text-[15px] first-letter:uppercase ${b.status === "cancelled" ? "text-muted line-through" : ""}`}>
                {formatDay(b.start_at, { day: "numeric", month: "long", year: "numeric" })}, {hhmm(b.start_at)}
              </span>
              <span className="block truncate text-sm text-muted">
                {b.service_name}
                {b.status === "cancelled" && ` · отменена${b.cancelled_by === "client" ? " клиентом" : ""}`}
              </span>
            </span>
            <span className={`shrink-0 text-sm font-medium ${b.status === "cancelled" ? "text-muted" : ""}`}>{formatPrice(b.price)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Карточка клиента: заметка и история визитов */
function ClientSheet({ client, onClose, onNotes }: { client: Client; onClose: () => void; onNotes: (id: string, notes: string | null) => void }) {
  const { data, error } = useLoad<Booking[]>(`/master/clients/${client.id}/bookings`);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(client.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const updated = await api<Client>(`/master/clients/${client.id}`, { method: "PUT", body: JSON.stringify({ notes }) });
      onNotes(client.id, updated.notes);
      setEditing(false);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // будущие записи — это ещё не визиты, показываем их отдельно
  const now = localNowIso();
  const upcoming = data?.filter((b) => b.status === "confirmed" && b.start_at > now) ?? [];
  const past = data?.filter((b) => b.start_at <= now || b.status === "cancelled") ?? [];

  return (
    <Sheet title={client.name} subtitle={maskPhone(client.phone)} onClose={onClose}>
      <a href={`tel:${client.phone}`} className="btn-secondary w-full">
        <Phone className="h-5 w-5" aria-hidden />
        Позвонить
      </a>

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-muted">Заметка</h3>
        {editing ? (
          <>
            <textarea className="textarea mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Предпочтения, аллергии, любимый цвет…" autoFocus />
            <div className="mt-2 flex gap-3">
              <button type="button" className="btn-secondary h-11 flex-1" onClick={() => { setEditing(false); setNotes(client.notes ?? ""); }}>Отмена</button>
              <button type="button" className="btn-primary h-11 flex-1" onClick={save} disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
            </div>
            <ErrorText>{saveError}</ErrorText>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-2 w-full rounded-md border border-hairline p-3 text-left text-[15px] active:bg-surface-soft">
            {client.notes ? <span className="whitespace-pre-line text-body">{client.notes}</span> : <span className="text-muted">Добавить заметку</span>}
          </button>
        )}
      </section>

      <ErrorText>{error}</ErrorText>
      {!data ? (
        <div className="mt-5"><Loading /></div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <BookingList title={`Предстоит${upcoming.length > 1 ? ` · ${upcoming.length}` : ""}`} bookings={upcoming} />
          )}
          {past.length > 0 ? (
            <BookingList title={`Визиты · ${past.filter((b) => b.status === "confirmed").length}`} bookings={past} />
          ) : (
            upcoming.length === 0 && <p className="mt-5 text-sm text-muted">Записей пока не было</p>
          )}
        </>
      )}
    </Sheet>
  );
}
