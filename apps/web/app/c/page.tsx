"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/admin/ui";
import { CLIENT_TOKEN_KEY } from "@/lib/api";

// Точка входа из push-уведомлений клиента: токен хранится в приложении на устройстве
export default function ClientEntry() {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(CLIENT_TOKEN_KEY);
    } catch {}
    if (token) router.replace(`/c/${token}`);
    else setMissing(true);
  }, [router]);

  return (
    <main className="px-6 pt-20 text-center">
      {missing ? (
        <>
          <h1 className="text-[22px] font-semibold">Записей на этом устройстве нет</h1>
          <p className="mt-2 text-muted">Откройте ссылку, которую вы получили после записи к мастеру.</p>
        </>
      ) : (
        <Loading />
      )}
    </main>
  );
}
