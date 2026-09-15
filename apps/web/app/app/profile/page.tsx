"use client";

import { Camera, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { AvatarCropSheet } from "@/components/admin/AvatarCropSheet";
import { LinkCard } from "@/components/admin/LinkCard";
import { useMaster } from "@/components/admin/MasterShell";
import { PushSetup } from "@/components/admin/PushSetup";
import { ErrorText, Field, PageHeader, PasswordInput } from "@/components/admin/ui";
import { api, useLoad } from "@/lib/api";
import { plural } from "@/lib/format";
import type { AdminService, Schedule } from "@/lib/types";

const WEEK_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export default function ProfilePage() {
  const { me, reload } = useMaster();
  const services = useLoad<AdminService[]>("/master/services");
  const schedule = useLoad<Schedule>("/master/schedule");
  const [form, setForm] = useState({ name: me.name, specialty: me.specialty, address: me.address, slug: me.slug });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/master/me", { method: "PUT", body: JSON.stringify(form) });
      reload();
      setMessage("Сохранено");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const activeCount = services.data?.filter((s) => s.is_active).length ?? 0;
  const upcomingDays = schedule.data ? new Set([...schedule.data.date_hours, ...schedule.data.date_slots].map((d) => d.date)).size : 0;
  const workDays = !schedule.data
    ? ""
    : schedule.data.schedule_type === "dates"
      ? `По дням · ${upcomingDays} ${plural(upcomingDays, ["рабочий день", "рабочих дня", "рабочих дней"])} впереди`
      : [...new Set([...schedule.data.working_hours, ...schedule.data.working_slots].map((h) => h.weekday))].sort().map((d) => WEEK_SHORT[d]).join(", ");

  return (
    <>
      <PageHeader title="Профиль" subtitle={me.phone} />
      <AvatarSection name={me.name} url={me.avatar_url} onChanged={reload} />
      <div className="mt-5">
        <LinkCard slug={me.slug} />
      </div>

      <nav className="mt-5 divide-y divide-hairline rounded-md border border-hairline">
        <Row href="/app/services" title="Услуги" hint={services.data ? `${activeCount} ${plural(activeCount, ["услуга", "услуги", "услуг"])}` : "…"} />
        <Row href="/app/schedule" title="Расписание" hint={schedule.data ? workDays || "Не заполнено" : "…"} />
      </nav>

      <div className="mt-5">
        <PushSetup
          title="Уведомления о записях"
          description="Сообщим, когда клиент запишется или отменит запись."
          subscribePath="/master/push/subscribe"
          testPath="/master/push/test"
        />
      </div>

      <PasswordSection hasPassword={me.has_password} phone={me.phone} onSaved={reload} />

      <form onSubmit={save} className="mt-5 space-y-4 rounded-md border border-hairline p-5">
        <h2 className="font-semibold">О вас</h2>
        <Field label="Имя">
          <input className="input-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Чем вы занимаетесь">
          <input className="input-sm" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Мастер маникюра" />
        </Field>
        <Field label="Адрес">
          <input className="input-sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <label className="block">
          <span className="label">Ссылка</span>
          <span className="flex h-11 items-center rounded-sm border border-hairline px-3 focus-within:border-primary focus-within:shadow-[inset_0_0_0_1px_var(--color-primary)]">
            <span className="shrink-0 text-muted">{window.location.host}/</span>
            <input
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={3}
              maxLength={30}
              required
            />
          </span>
        </label>
        <button className="btn-primary w-full" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button>
        {message && <p className="text-sm text-muted">{message}</p>}
        <ErrorText>{error}</ErrorText>
      </form>

      <button type="button" onClick={logout} className="btn-ghost mt-4 w-full text-error">Выйти</button>
    </>
  );
}

function AvatarSection({ name, url, onChanged }: { name: string; url: string | null; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function upload(image: Blob) {
    const body = new FormData();
    body.append("file", image, "avatar.jpg");
    run(async () => {
      await api("/master/avatar", { method: "POST", body });
      setCropFile(null);
    });
  }

  return (
    <section className="flex items-center gap-4">
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="relative shrink-0" aria-label="Изменить фото">
        <Avatar name={name} url={url} size={72} />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-ink text-white">
          <Camera className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
      <div className="min-w-0">
        <p className="truncate font-semibold">{name || "Без имени"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" className="py-1 text-sm font-medium underline underline-offset-4" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Загружаем…" : url ? "Изменить фото" : "Загрузить фото"}
          </button>
          {url && !busy && (
            <button type="button" className="py-1 text-sm font-medium text-error" onClick={() => run(() => api("/master/avatar", { method: "DELETE" }))}>
              Удалить
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-error">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // чтобы можно было выбрать тот же файл ещё раз
          if (file) {
            setError("");
            setCropFile(file);
          }
        }}
      />
      {cropFile && (
        <AvatarCropSheet
          file={cropFile}
          busy={busy}
          error={error}
          onClose={() => {
            setCropFile(null);
            setError("");
          }}
          onDone={upload}
        />
      )}
    </section>
  );
}

function PasswordSection({ hasPassword, phone, onSaved }: { hasPassword: boolean; phone: string; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  // /app/profile#password — после «Забыли пароль» или из напоминания
  useEffect(() => {
    if (window.location.hash !== "#password") return;
    ref.current?.scrollIntoView({ block: "center" });
    setHighlight(true);
    window.history.replaceState(null, "", "/app/profile");
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/master/password", { method: "PUT", body: JSON.stringify({ password }) });
      setPassword("");
      setHighlight(false);
      setMessage(hasPassword ? "Пароль изменён" : "Пароль сохранён — теперь можно входить без звонка");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      ref={ref}
      onSubmit={save}
      className={`mt-5 space-y-3 rounded-md border p-5 ${highlight ? "border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-hairline"}`}
    >
      <h2 className="font-semibold">{hasPassword ? "Сменить пароль" : "Пароль для входа"}</h2>
      <p className="text-sm text-muted">
        {hasPassword ? "Пароль для входа в nook. Минимум 6 символов." : "Задайте пароль для входа."}
      </p>
      <input className="sr-only" type="text" name="username" autoComplete="username" value={phone} readOnly tabIndex={-1} aria-hidden />
      <PasswordInput className="input-sm" value={password} onChange={setPassword} autoComplete="new-password" />
      <button className="btn-primary w-full" disabled={saving || password.length < 6}>
        {saving ? "Сохраняем…" : hasPassword ? "Сменить пароль" : "Сохранить пароль"}
      </button>
      {message && <p className="text-sm text-muted">{message}</p>}
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function Row({ href, title, hint }: { href: string; title: string; hint: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-4 px-4 py-3.5 active:bg-surface-soft">
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted">{hint}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
    </Link>
  );
}
