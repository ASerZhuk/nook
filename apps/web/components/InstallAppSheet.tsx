"use client";

import { Check, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/admin/ui";
import { canPromptInstall, isIOS, isIOSSafari, isStandalone, promptInstall } from "@/lib/push";

type Props = { onClose: () => void; title?: string; description?: string };

/** Предложение установить приложение: кнопка там, где браузер это умеет, короткие шаги — на iPhone */
export function InstallAppSheet({ onClose, title = "Установите nook на телефон", description = "Откуда быстрее заходить и куда приходят уведомления о записях." }: Props) {
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ios, setIOS] = useState(false);
  const [safari, setSafari] = useState(false);

  useEffect(() => {
    const refresh = () => setInstallable(canPromptInstall());
    const done = () => setInstalled(true);
    refresh();
    setInstalled(isStandalone());
    setIOS(isIOS());
    setSafari(isIOSSafari());
    window.addEventListener("nook:installable", refresh);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("nook:installable", refresh);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  async function install() {
    setBusy(true);
    try {
      if (await promptInstall()) setInstalled(true);
      else setInstallable(canPromptInstall());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={installed ? "Приложение установлено" : title} onClose={onClose}>
      {installed ? (
        <p className="flex items-center gap-2 text-[15px] text-body">
          <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          Открывайте nook с иконки на экране телефона.
        </p>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-body">{description}</p>

          {installable ? (
            <button type="button" className="btn-primary mt-5 w-full" onClick={install} disabled={busy}>
              {busy ? "Устанавливаем…" : "Установить"}
            </button>
          ) : ios && safari ? (
            <ol className="mt-5 space-y-3 rounded-md bg-surface-soft p-4 text-[15px] text-body">
              <li className="flex items-center gap-3">
                <Share className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                Нажмите «Поделиться» внизу Safari
              </li>
              <li className="flex items-center gap-3">
                <SquarePlus className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                Выберите «На экран „Домой“»
              </li>
            </ol>
          ) : ios ? (
            <div className="mt-5 rounded-md bg-surface-soft p-4 text-[15px] leading-relaxed text-body">
              На iPhone приложение добавляет только Safari. Откройте nook в Safari и повторите — в других браузерах пункта «На экран „Домой“» нет.
            </div>
          ) : (
            <div className="mt-5 rounded-md bg-surface-soft p-4 text-[15px] leading-relaxed text-body">
              Откройте nook на телефоне: в Chrome на Android появится кнопка установки, в Safari на iPhone — «Поделиться» → «На экран „Домой“».
            </div>
          )}

          {ios && <p className="mt-3 text-xs text-muted">На iPhone установка работает только в Safari.</p>}
        </>
      )}

      <button type="button" className="btn-ghost mt-4 w-full" onClick={onClose}>
        {installed ? "Готово" : "Позже"}
      </button>
    </Sheet>
  );
}
