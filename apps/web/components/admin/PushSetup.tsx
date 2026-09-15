"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { canPromptInstall, existingSubscription, isIOS, isStandalone, promptInstall, pushSupported, subscribePush } from "@/lib/push";

type Status = "loading" | "needs-install" | "unsupported" | "default" | "denied" | "on";

type Props = { title: string; description: string; subscribePath: string; testPath?: string; clientToken?: string };

/** Установка PWA + включение web push. Общий для мастера и клиента. */
export function PushSetup({ title, description, subscribePath, testPath, clientToken }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [installable, setInstallable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const standalone = isStandalone();
    const refreshInstallable = () => setInstallable(!standalone && canPromptInstall());
    refreshInstallable();
    window.addEventListener("nook:installable", refreshInstallable);

    let cancelled = false;
    (async () => {
      let next: Status = "default";
      if (!pushSupported()) next = isIOS() && !standalone ? "needs-install" : "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else if (Notification.permission === "granted") {
        const subscription = await existingSubscription().catch(() => null);
        if (subscription) {
          // привязываем подписку устройства к текущему аккаунту
          await api(subscribePath, { method: "POST", body: JSON.stringify(subscription), clientToken }).catch(() => undefined);
          next = "on";
        }
      }
      if (!cancelled) setStatus(next);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("nook:installable", refreshInstallable);
    };
  }, [subscribePath, clientToken]);

  async function enable() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // запрос разрешения — первым действием после нажатия (требование iOS)
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }
      const subscription = await subscribePush();
      await api(subscribePath, { method: "POST", body: JSON.stringify(subscription), clientToken });
      setStatus("on");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!testPath) return;
    setError("");
    setMessage("");
    try {
      await api(testPath, { method: "POST" });
      setMessage("Отправили тестовое уведомление");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="rounded-md border border-hairline p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>

      {status === "loading" && <p className="mt-3 text-sm text-muted">Проверяем…</p>}
      {status === "default" && (
        <button className="btn-primary mt-4 w-full" onClick={enable} disabled={busy}>
          {busy ? "Включаем…" : "Включить уведомления"}
        </button>
      )}
      {status === "on" && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Check className="h-4 w-4 text-primary" aria-hidden />
            Уведомления включены
          </p>
          {testPath && <button className="btn-ghost -mr-3" onClick={test}>Проверить</button>}
        </div>
      )}
      {status === "denied" && <p className="mt-3 text-sm text-error">Уведомления запрещены. Разрешите их для nook в настройках телефона.</p>}
      {status === "unsupported" && (
        <p className="mt-3 text-sm text-muted">Этот браузер не поддерживает уведомления. Откройте ссылку в Safari (iPhone) или Chrome (Android).</p>
      )}
      {status === "needs-install" && (
        <ol className="mt-4 space-y-2 rounded-sm bg-surface-soft p-4 text-sm text-body">
          <li>1. Нажмите «Поделиться» внизу экрана Safari</li>
          <li>2. Выберите «На экран „Домой“»</li>
          <li>3. Откройте nook с иконки и включите уведомления</li>
        </ol>
      )}
      {installable && (
        <button className="btn-secondary mt-3 w-full" onClick={async () => (await promptInstall()) && setInstallable(false)}>
          Установить приложение
        </button>
      )}
      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
    </section>
  );
}
