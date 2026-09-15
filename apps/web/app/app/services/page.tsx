"use client";

import { ChevronRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Empty, ErrorText, Field, Loading, PageHeader } from "@/components/admin/ui";
import { useDialogs } from "@/components/DialogProvider";
import { api, useLoad } from "@/lib/api";
import { formatDuration, formatPrice } from "@/lib/format";
import type { AdminService } from "@/lib/types";

type Draft = Omit<AdminService, "id">;
const EMPTY: Draft = { name: "", duration_minutes: 60, price: 0, is_active: true };

export default function ServicesPage() {
  const { data, error, reload } = useLoad<AdminService[]>("/master/services");
  const { confirm } = useDialogs();
  const [editing, setEditing] = useState<string | null>(null);

  async function save(draft: Draft, id?: string) {
    await api(id ? `/master/services/${id}` : "/master/services", { method: id ? "PUT" : "POST", body: JSON.stringify(draft) });
    setEditing(null);
    reload();
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Удалить услугу?",
      message: "Если по ней уже были записи, услуга не удалится, а будет скрыта от клиентов.",
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    await api(`/master/services/${id}`, { method: "DELETE" });
    setEditing(null);
    reload();
  }

  return (
    <>
      <PageHeader
        title="Услуги"
        back="/app/profile"
        subtitle="То, что клиенты выбирают при записи"
        action={<button className="btn-primary w-full sm:w-auto" onClick={() => setEditing("new")}>Добавить услугу</button>}
      />

      {editing === "new" && (
        <div className="mb-4">
          <ServiceForm initial={EMPTY} onSave={(d) => save(d)} onCancel={() => setEditing(null)} />
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {!data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty>Добавьте первую услугу — клиенты сразу смогут на неё записаться</Empty>
      ) : (
        <>
          <ul className="divide-y divide-hairline rounded-md border border-hairline">
            {data.map((s) =>
              editing === s.id ? (
                <li key={s.id} className="p-3 sm:p-4">
                  <ServiceForm initial={s} onSave={(d) => save(d, s.id)} onDelete={() => remove(s.id)} onCancel={() => setEditing(null)} />
                </li>
              ) : (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(s.id)}
                    className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-surface-soft active:bg-surface-soft"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {formatDuration(s.duration_minutes)}
                        {!s.is_active && " · скрыта от клиентов"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold">{formatPrice(s.price)}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
                  </button>
                </li>
              ),
            )}
          </ul>
          <p className="mt-3 text-sm text-muted">Нажмите на услугу, чтобы изменить или удалить её.</p>
        </>
      )}
    </>
  );
}

type FormProps = { initial: Draft; onSave: (draft: Draft) => Promise<void>; onDelete?: () => Promise<void>; onCancel: () => void };

function ServiceForm({ initial, onSave, onDelete, onCancel }: FormProps) {
  const [draft, setDraft] = useState<Draft>({
    name: initial.name,
    duration_minutes: initial.duration_minutes,
    price: initial.price,
    is_active: initial.is_active,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run(() => onSave(draft));
  }

  return (
    <form onSubmit={submit} className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-[1fr_160px_140px] sm:p-6">
      <Field label="Название" className="col-span-2 sm:col-span-1">
        <input className="input-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={120} />
      </Field>
      <Field label="Длительность, мин">
        <input type="number" inputMode="numeric" className="input-sm" min={5} max={720} step={5} value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })} required />
      </Field>
      <Field label="Цена, ₽">
        <input type="number" inputMode="numeric" className="input-sm" min={0} step={50} value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} required />
      </Field>
      <label className="col-span-2 flex items-center gap-3 py-1 text-[15px] sm:col-span-3">
        <input type="checkbox" className="h-5 w-5 accent-primary" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
        Доступна для записи
      </label>
      <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-3">
        <button className="btn-primary flex-1 sm:flex-none" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={onCancel}>Отмена</button>
        {onDelete && (
          <button type="button" className="btn-ghost w-full text-error sm:ml-auto sm:w-auto" disabled={saving} onClick={() => run(onDelete)}>
            Удалить услугу
          </button>
        )}
      </div>
      {error && <p className="col-span-2 text-sm text-error sm:col-span-3">{error}</p>}
    </form>
  );
}
