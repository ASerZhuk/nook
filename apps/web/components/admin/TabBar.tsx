"use client";

import { CalendarDays, Clock, Plus, UserRound, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export const NEW_BOOKING_EVENT = "nook:new-booking";

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${active ? "text-primary" : "text-muted"}`}
    >
      <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();

  function newBooking() {
    if (pathname === "/app") window.dispatchEvent(new Event(NEW_BOOKING_EVENT));
    else router.push("/app?new=1");
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-hairline bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Разделы">
      <div className="grid h-16 grid-cols-5">
        <Tab href="/app" label="Записи" icon={CalendarDays} active={pathname === "/app"} />
        <Tab href="/app/clients" label="Клиенты" icon={Users} active={pathname.startsWith("/app/clients")} />
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={newBooking}
            aria-label="Новая запись"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-float transition-colors active:bg-primary-active"
          >
            <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
        <Tab href="/app/schedule" label="Расписание" icon={Clock} active={pathname.startsWith("/app/schedule")} />
        <Tab
          href="/app/profile"
          label="Профиль"
          icon={UserRound}
          active={pathname.startsWith("/app/profile") || pathname.startsWith("/app/services")}
        />
      </div>
    </nav>
  );
}
