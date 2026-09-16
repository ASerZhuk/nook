"use client";

import { Phone } from "lucide-react";
import { useState } from "react";
import { Empty, ErrorText, Loading, PageHeader } from "@/components/admin/ui";
import { api, useLoad } from "@/lib/api";
import { maskPhone, plural } from "@/lib/format";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  const { data, error, setData } = useLoad<Client[]>("/master/clients");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = (data ?? []).filter((c) => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q));

  async function saveNotes(id: string) {
    setSaveError("");
    try {
      const updated = await api<Client>(`/master/clients/${id}`, { method: "PUT", body: JSON.stringify({ notes }) });
      setData((list) => list && list.map((c) => (c.id === id ? { ...c, notes: updated.notes } : c)));
      setEditing(null);
    } catch (e) {
      setSaveError((e as Error).message);
    }
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
            <li key={c.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-sm text-muted">
                    {maskPhone(c.phone)} · {c.visits} {plural(c.visits, ["визит", "визита", "визитов"])}
                  </p>
                </div>
                <a href={`tel:${c.phone}`} className="icon-btn h-11 w-11 shrink-0" aria-label={`Позвонить: ${c.name}`}>
                  <Phone className="h-5 w-5" aria-hidden />
                </a>
              </div>

              <div className="mt-2 pl-[52px]">
                {editing === c.id ? (
                  <>
                    <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Предпочтения, аллергии, любимый цвет…" autoFocus />
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button className="btn-primary h-11 flex-1 sm:flex-none" onClick={() => saveNotes(c.id)}>Сохранить</button>
                      <button className="btn-secondary h-11 flex-1 sm:flex-none" onClick={() => setEditing(null)}>Отмена</button>
                    </div>
                    <div className="mt-2"><ErrorText>{saveError}</ErrorText></div>
                  </>
                ) : (
                  <>
                    {c.notes && <p className="mb-1 whitespace-pre-line text-sm text-body">{c.notes}</p>}
                    <button
                      type="button"
                      className="py-1 text-sm font-medium underline underline-offset-4"
                      onClick={() => {
                        setEditing(c.id);
                        setNotes(c.notes ?? "");
                        setSaveError("");
                      }}
                    >
                      {c.notes ? "Изменить заметку" : "Добавить заметку"}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
