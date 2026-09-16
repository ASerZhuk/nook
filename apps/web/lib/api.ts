import { useCallback, useEffect, useState } from "react";

export const CLIENT_TOKEN_KEY = "nook_client_token";

type Options = RequestInit & { clientToken?: string };

// Клиентский запрос к API того же origin (Caddy в проде, rewrites в dev)
export async function api<T = unknown>(path: string, { clientToken, ...init }: Options = {}): Promise<T> {
  // FormData (загрузка файлов) — браузер сам проставит multipart-заголовок
  const headers: Record<string, string> = init.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (clientToken) headers["X-Client-Token"] = clientToken;
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  if (res.status === 401 && path.startsWith("/master")) {
    // сбрасываем протухшую cookie, иначе middleware зациклит /login ↔ /app
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
    throw new Error("Требуется вход");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    // detail — строка или {code, message}: по code фронт отличает «нужно подтверждение» от обычной ошибки
    const detail = data?.detail;
    const message =
      typeof detail === "string" ? detail : typeof detail?.message === "string" ? detail.message : "Что-то пошло не так. Попробуйте ещё раз.";
    const code = detail && typeof detail === "object" ? (detail.code as string | undefined) : undefined;
    throw Object.assign(new Error(message), { status: res.status, code });
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function useLoad<T>(path: string | null, clientToken?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let ignore = false;
    setError("");
    api<T>(path, { clientToken })
      .then((d) => !ignore && setData(d))
      .catch((e: Error) => !ignore && setError(e.message));
    return () => {
      ignore = true;
    };
  }, [path, clientToken, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, setData };
}
