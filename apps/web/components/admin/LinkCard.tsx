"use client";

import { useState } from "react";

export function LinkCard({ slug }: { slug: string }) {
  const url = `${window.location.origin}/${slug}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (navigator.share) await navigator.share({ title: "Запись онлайн", text: "Записывайтесь ко мне онлайн:", url }).catch(() => undefined);
    else await copy();
  }

  return (
    <section className="rounded-md bg-surface-soft p-5">
      <p className="text-sm text-muted">Ссылка для записи клиентов</p>
      <p className="mt-1 break-all text-lg font-semibold">{url.replace(/^https?:\/\//, "")}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className="btn-primary" onClick={share}>Поделиться</button>
        <button className="btn-secondary" onClick={copy}>{copied ? "Скопировано" : "Копировать"}</button>
      </div>
      <a href={`/${slug}`} target="_blank" rel="noreferrer" className="mt-3 block py-1 text-center text-sm font-medium underline underline-offset-4">
        Как видят клиенты
      </a>
    </section>
  );
}
