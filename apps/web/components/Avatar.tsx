/** Аватар мастера: фото или первая буква имени. Без хуков — подходит и для серверных компонентов. */
export function Avatar({ name, url, size = 64 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- файл с API, уже сжат до 512px
    return <img src={url} alt={name} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}
