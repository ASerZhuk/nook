"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLoad } from "@/lib/api";
import { registerSW } from "@/lib/push";
import type { MasterProfile } from "@/lib/types";
import { TabBar } from "./TabBar";
import { ClientOnly, ErrorText, Loading } from "./ui";

type MasterContextValue = { me: MasterProfile; reload: () => void };

const MasterContext = createContext<MasterContextValue | null>(null);

export function useMaster() {
  const ctx = useContext(MasterContext);
  if (!ctx) throw new Error("useMaster must be used inside MasterShell");
  return ctx;
}

export function MasterShell({ children }: { children: ReactNode }) {
  return (
    <ClientOnly>
      <ShellInner>{children}</ShellInner>
    </ClientOnly>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { data: me, error, reload } = useLoad<MasterProfile>("/master/me");
  const pathname = usePathname();
  const router = useRouter();
  const onboarding = pathname.startsWith("/app/onboarding");

  useEffect(() => {
    registerSW().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (me && !me.onboarded && !onboarding) router.replace("/app/onboarding");
  }, [me, onboarding, router]);

  if (!me) return <div className="p-6">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</div>;

  return (
    <MasterContext.Provider value={{ me, reload }}>
      <main className={`px-4 pt-[env(safe-area-inset-top)] ${onboarding ? "pb-10" : "pb-28"}`}>
        {me.onboarded && !me.has_password && pathname === "/app" && (
          <Link href="/app/profile#password" className="mt-3 flex items-center justify-between gap-3 rounded-md bg-surface-soft px-4 py-3 text-sm text-body">
            <span>
              <b className="text-ink">Задайте пароль</b> — он нужен для входа
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-soft" aria-hidden />
          </Link>
        )}
        {children}
      </main>
      {!onboarding && <TabBar />}
    </MasterContext.Provider>
  );
}
