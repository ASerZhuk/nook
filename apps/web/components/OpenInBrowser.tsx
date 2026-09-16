"use client";

import { Compass } from "lucide-react";
import { useEffect, useState } from "react";

// встроенные браузеры соцсетей и мессенджеров: там нет установки на экран «Домой» и уведомлений
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|VKAndroidApp|VKClient|OKApp|Telegram|TelegramBot|MicroMessenger|Line\/|Snapchat|Pinterest|YaApp|TikTok|musical_ly/i;

/** Ссылка из соцсети открывается во встроенном браузере — предлагаем перейти в Safari (iOS) или Chrome (Android) */
export function OpenInBrowser() {
  const [ios, setIOS] = useState(false);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIOS(isIOS);
    setShow(IN_APP.test(ua));
  }, []);

  if (!show) return null;

  function open() {
    const { host, pathname, search } = window.location;
    // x-safari-https:// выводит из встроенного браузера в Safari; на Android — intent в браузер по умолчанию
    window.location.href = ios
      ? `x-safari-https://${host}${pathname}${search}`
      : `intent://${host}${pathname}${search}#Intent;scheme=https;end`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mb-4 rounded-md bg-surface-soft p-4 text-sm">
      <p className="flex items-start gap-2 text-body">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span>
          Вы открыли ссылку внутри приложения. {ios ? "В Safari" : "В обычном браузере"} страница работает полностью — можно сохранить запись
          и получать уведомления.
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-primary h-11 flex-1 text-sm" onClick={open}>
          Открыть в {ios ? "Safari" : "браузере"}
        </button>
        <button type="button" className="btn-secondary h-11 px-4 text-sm" onClick={copy}>
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
    </div>
  );
}
