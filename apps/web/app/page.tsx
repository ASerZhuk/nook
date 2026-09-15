import Image from "next/image";
import Link from "next/link";

const POINTS = [
  ["Ссылка вместо переписки", "Добавьте услуги и расписание — клиенты записываются сами в свободное время."],
  ["Уведомление о каждой записи", "Сообщение приходит на телефон, как от мессенджера."],
  ["Всё под рукой", "Записи по дням, клиенты с заметками. Никакой CRM — как блокнот, только удобнее."],
] as const;

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      <Image src="/logo.png" alt="nook" width={474} height={128} className="h-9 w-auto self-start" priority />
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.5px]">Запись клиентов — проще, чем в блокноте</h1>
        <p className="mt-4 text-base leading-relaxed text-body">Для частных мастеров: маникюр, брови, массаж, стрижки и всё, где клиенты записываются на время.</p>
        <ul className="mt-8 space-y-5">
          {POINTS.map(([title, text], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">{i + 1}</span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="mt-0.5 block text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Link href="/login" className="btn-primary w-full">Начать бесплатно</Link>
      <Link href="/login?mode=password" className="btn-ghost mt-2 w-full">У меня уже есть аккаунт</Link>
    </main>
  );
}
