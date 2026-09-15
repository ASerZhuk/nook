"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Sheet } from "./ui";

const OUTPUT_SIZE = 800; // сервер дожмёт до 512
const MAX_ZOOM = 4;

type Point = { x: number; y: number };
type Props = { file: File; busy?: boolean; error?: string; onClose: () => void; onDone: (image: Blob) => void };

/** Выбор участка фото для аватара: перетаскивание, щипок/ползунок для масштаба, круглая маска */
export function AvatarCropSheet({ file, busy, error, onClose, onDone }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const [src, setSrc] = useState("");
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setFrame(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // фото заполняет рамку целиком (cover), zoom — поверх этого
  const baseScale = natural && frame ? Math.max(frame / natural.w, frame / natural.h) : 1;
  const scale = baseScale * zoom;

  const clamp = useCallback(
    (x: number, y: number, s: number): Point => {
      if (!natural) return { x, y };
      return {
        x: Math.min(0, Math.max(frame - natural.w * s, x)),
        y: Math.min(0, Math.max(frame - natural.h * s, y)),
      };
    },
    [natural, frame],
  );

  useEffect(() => {
    if (!natural || !frame) return;
    const s = Math.max(frame / natural.w, frame / natural.h);
    setZoom(1);
    setOffset({ x: (frame - natural.w * s) / 2, y: (frame - natural.h * s) / 2 });
  }, [natural, frame]);

  function zoomTo(nextZoom: number) {
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    const nextScale = baseScale * z;
    const center = frame / 2; // масштабируем относительно центра рамки
    setOffset((o) => clamp(center - (center - o.x) * (nextScale / scale), center - (center - o.y) * (nextScale / scale), nextScale));
    setZoom(z);
  }

  const pinchDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: pinchDistance(), zoom };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current?.distance) {
      zoomTo(pinch.current.zoom * (pinchDistance() / pinch.current.distance));
      return;
    }
    setOffset((o) => clamp(o.x + e.clientX - previous.x, o.y + e.clientY - previous.y, scale));
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function save() {
    const image = imageRef.current;
    if (!image || !natural || !frame) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    const side = frame / scale; // сторона видимого квадрата в пикселях исходного фото
    ctx.drawImage(image, -offset.x / scale, -offset.y / scale, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob((blob) => (blob ? onDone(blob) : setLocalError("Не удалось обработать фото")), "image/jpeg", 0.9);
  }

  return (
    <Sheet title="Фото профиля" subtitle="Выберите нужный участок" onClose={onClose}>
      <div
        ref={frameRef}
        className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-md bg-surface-strong active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 0.9))}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- локальный файл до загрузки
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setLocalError("Не удалось открыть фото — выберите JPG, PNG или WebP")}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{
              width: natural ? natural.w * scale : undefined,
              height: natural ? natural.h * scale : undefined,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              visibility: natural && frame ? "visible" : "hidden",
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ring-2 ring-white/80" aria-hidden />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="icon-btn h-9 w-9 shrink-0" onClick={() => zoomTo(zoom - 0.25)} disabled={zoom <= 1} aria-label="Уменьшить">
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="h-2 flex-1 accent-primary"
          aria-label="Масштаб"
        />
        <button type="button" className="icon-btn h-9 w-9 shrink-0" onClick={() => zoomTo(zoom + 0.25)} disabled={zoom >= MAX_ZOOM} aria-label="Увеличить">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {(localError || error) && <p className="mt-3 text-sm text-error">{localError || error}</p>}
      <button type="button" className="btn-primary mt-5 w-full" disabled={!natural || busy} onClick={save}>
        {busy ? "Загружаем…" : "Сохранить фото"}
      </button>
    </Sheet>
  );
}
