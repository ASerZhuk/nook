"use client";

import { Info, TriangleAlert, UserCheck } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDuration, maskPhone } from "@/lib/format";
import type { AdminService, Booking } from "@/lib/types";
import { Field, Sheet } from "./ui";

type Draft = {
  client_name: string;
  client_phone: string;
  service_id: string | null;
  date: string | null;
  time: string | null;
  warnings: string[];
  notes: string[];
  known_client: boolean;
};

type Form = { client_name: string; client_phone: string; service_id: string; date: string; time: string };

// маска пустого поля — «+7»: одна цифра = номер не указан
const hasPhone = (value: string) => value.replace(/\D/g, "").length > 1;
const isReady = (f: Form) =>
  Boolean(f.client_name.trim() && (!hasPhone(f.client_phone) || f.client_phone.replace(/\D/g, "").length === 11) && f.service_id && f.date && f.time);

const EXAMPLES = [
  "Анна шилак 16.09 в 13:30 89531234567",
  "Марина педикюр завтра на утро",
  "снятие в пятницу 18:00 Ольга +7 916 111-22-33",
];

/** Быстрая запись одной строкой: ИИ разбирает текст → мастер проверяет черновик → «Записать» */
export function QuickBookingSheet({
  services,
  onClose,
  onCreated,
}: {
  services: AdminService[];
  onClose: () => void;
  onCreated: (booking: Booking) => void;
}) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<Form>({ client_name: "", client_phone: "+7", service_id: "", date: "", time: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(values: Form) {
    const created = await api<Booking>("/master/bookings", {
      method: "POST",
      body: JSON.stringify({
        service_id: values.service_id,
        client_name: values.client_name.trim(),
        client_phone: hasPhone(values.client_phone) ? values.client_phone : "",
        start_at: `${values.date}T${values.time}:00`,
      }),
    });
    onCreated(created);
  }

  // «Записать»: ИИ разбирает текст в фоне и сразу создаёт запись; черновик — только если что-то непонятно
  async function submitText() {
    setBusy(true);
    setError("");
    try {
      const d = await api<Draft>("/master/quick-parse", { method: "POST", body: JSON.stringify({ text }) });
      const parsed: Form = {
        client_name: d.client_name,
        client_phone: maskPhone(d.client_phone),
        service_id: d.service_id ?? "",
        date: d.date ?? "",
        time: d.time ?? "",
      };
      if (!d.warnings.length && isReady(parsed)) {
        try {
          await create(parsed);
          return;
        } catch (e) {
          setError((e as Error).message);
        }
      }
      setForm(parsed);
      setDraft(d);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await create(form);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const ready = isReady(form);

  return (
    <Sheet title="Быстрая запись" subtitle={draft ? "Проверьте данные" : undefined} onClose={onClose}>
      {!draft ? (
        <>
          <textarea
            className="textarea min-h-28"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Анна, шилак, 16.09 в 13:30, 8 953 853-69-10"
            maxLength={500}
            autoFocus
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setText(example)} className="rounded-full bg-surface-soft px-3 py-1.5 text-left text-xs text-body">
                {example}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
          <button type="button" className="btn-primary mt-5 w-full" disabled={busy || text.trim().length < 3} onClick={submitText}>
            {busy ? "Записываю…" : "Записать"}
          </button>
        </>
      ) : (
        <>
          <p className="rounded-sm bg-surface-soft p-3 text-sm text-muted [overflow-wrap:anywhere]">«{text}»</p>
          {(draft.warnings.length > 0 || draft.notes?.length > 0) && (
            <ul className="mt-3 space-y-1.5">
              {draft.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2 text-sm text-error">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {warning}
                </li>
              ))}
              {draft.notes?.map((note) => (
                <li key={note} className="flex items-start gap-2 text-sm text-muted">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {note}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Клиент" className="col-span-2">
              <input className="input-sm" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </Field>
            <Field label="Телефон (необязательно)" className="col-span-2">
              <input
                className="input-sm"
                type="tel"
                inputMode="tel"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: maskPhone(e.target.value) })}
              />
            </Field>
            {!hasPhone(form.client_phone) && (
              <p className="col-span-2 -mt-1 text-xs text-muted">Без номера вы не сможете предупредить клиента о записи</p>
            )}
            {draft.known_client && (
              <p className="col-span-2 -mt-1 flex items-center gap-1.5 text-xs text-muted">
                <UserCheck className="h-4 w-4" aria-hidden />
                Клиент есть в вашем списке
              </p>
            )}
            <Field label="Услуга" className="col-span-2">
              <select className="input-sm" value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
                <option value="" disabled>
                  Выберите услугу
                </option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatDuration(s.duration_minutes)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дата">
              <input type="date" className="input-sm" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Время">
              <input type="time" step={300} className="input-sm" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
          </div>

          {error && <p className="mt-3 text-sm text-error">{error}</p>}
          <button type="button" className="btn-primary mt-5 w-full" disabled={!ready || busy} onClick={save}>
            {busy ? "Записываем…" : "Записать"}
          </button>
          <button
            type="button"
            className="btn-ghost mt-1 w-full"
            onClick={() => {
              setDraft(null);
              setError("");
            }}
          >
            Изменить текст
          </button>
        </>
      )}
    </Sheet>
  );
}
