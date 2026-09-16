"use client";

import { ChevronRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Empty, ErrorText, Field, Loading, PageHeader } from "@/components/admin/ui";
import { useDialogs } from "@/components/DialogProvider";
import { api, useLoad } from "@/lib/api";
import { formatDuration, formatPrice, shortDuration } from "@/lib/format";
import type { AdminService } from "@/lib/types";

type Draft = Omit<AdminService, "id">;
const EMPTY: Draft = { name: "", duration_minutes: 60, price: 0, is_active: true };
const DURATIONS = [30, 60, 90, 120];

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
    <form onSubmit={submit} className="card space-y-4 p-4 sm:p-6">
      <Field label="Название">
        <input className="input-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Маникюр с покрытием" required maxLength={120} autoFocus />
      </Field>

      <div>
        <span className="label">Сколько длится</span>
        <div className="grid grid-cols-4 gap-2">
          {DURATIONS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setDraft({ ...draft, duration_minutes: m })}
              className={`chip whitespace-nowrap px-2 ${draft.duration_minutes === m ? "chip-active" : ""}`}
            >
              {shortDuration(m)}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          Другое, мин
          <input
            type="number"
            inputMode="numeric"
            className="input-sm h-10 w-24"
            min={5}
            max={720}
            step={5}
            value={draft.duration_minutes}
            onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })}
            required
          />
        </label>
      </div>

      <Field label="Цена, ₽">
        <input type="number" inputMode="numeric" className="input-sm" min={0} step={50} value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} placeholder="2000" required />
      </Field>

      <label className="flex items-center justify-between gap-3 text-[15px]">
        <span>
          Доступна для записи
          <span className="block text-xs text-muted">Выключите, чтобы скрыть услугу от клиентов</span>
        </span>
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
      </label>

      <div className="flex gap-3">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Отмена</button>
        <button className="btn-primary flex-1" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
      </div>
      {onDelete && (
        <button type="button" className="btn-ghost w-full text-error" disabled={saving} onClick={() => run(onDelete)}>
          Удалить услугу
        </button>
      )}
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
