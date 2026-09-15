"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { maskPhone } from "@/lib/format";

type Step = "phone" | "password" | "register";
type AuthResult = { onboarded: boolean; has_password: boolean };

// Тестовый режим: вход и регистрация по номеру и паролю, без кодов подтверждения
export default function LoginPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+7");
  const [password, setPassword] = useState("");
  const [noPassword, setNoPassword] = useState(false);
  // «У меня уже есть аккаунт» → /login?mode=password
  const [loginMode, setLoginMode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoginMode(new URLSearchParams(window.location.search).get("mode") === "password");
  }, []);

  async function submitPhone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const status = await api<{ exists: boolean; has_password: boolean }>("/auth/start", { method: "POST", body: JSON.stringify({ phone }) });
      setPassword("");
      setNoPassword(status.exists && !status.has_password);
      setStep(status.exists ? "password" : "register");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<AuthResult>(step === "register" ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      window.location.href = result.onboarded ? "/app" : "/app/onboarding";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function changePhone() {
    setStep("phone");
    setPassword("");
    setNoPassword(false);
    setError("");
  }

  const phoneLine = (
    <p className="mt-2 text-base text-muted">
      {phone} ·{" "}
      <button type="button" className="font-medium text-ink underline underline-offset-4" onClick={changePhone}>
        Изменить
      </button>
    </p>
  );

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      <Image src="/logo.png" alt="nook" width={474} height={128} className="h-9 w-auto self-start" priority />

      {step === "phone" && (
        <form onSubmit={submitPhone} className="mt-12 flex flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight">{loginMode ? "Вход в аккаунт" : "Вход или регистрация"}</h1>
          <p className="mt-2 text-base text-muted">
            {loginMode ? "Введите номер, на который зарегистрирован аккаунт." : "Введите номер телефона — если аккаунта ещё нет, создадим."}
          </p>
          <input
            className="input mt-8 text-xl tracking-wide"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
            placeholder="+7 (900) 123-45-67"
            aria-label="Номер телефона"
            autoFocus
            required
          />
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
          <div className="mt-auto pt-8">
            <button className="btn-primary w-full" disabled={busy || phone.replace(/\D/g, "").length < 11}>
              {busy ? "Проверяем…" : "Продолжить"}
            </button>
          </div>
        </form>
      )}

      {(step === "password" || step === "register") && (
        <form onSubmit={submitPassword} className="mt-12 flex flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight">
            {step === "register" ? "Придумайте пароль" : noPassword ? "Вход недоступен" : "Введите пароль"}
          </h1>
          {phoneLine}

          {step === "register" && (
            <p className="mt-6 text-[15px] leading-relaxed text-body">
              {loginMode ? "Аккаунт с этим номером не найден — создадим новый. " : "Аккаунта с этим номером ещё нет — создадим. "}
              Пароль понадобится для входа.
            </p>
          )}

          {noPassword ? (
            <div className="mt-8 rounded-md bg-surface-soft p-4 text-[15px] leading-relaxed text-body">
              Для этого номера не задан пароль, а вход без пароля сейчас отключён.
            </div>
          ) : (
            <>
              {/* логин для менеджера паролей iOS/Android */}
              <input className="sr-only" type="text" name="username" autoComplete="username" value={phone} readOnly tabIndex={-1} aria-hidden />
              <div className={step === "register" ? "mt-4" : "mt-8"}>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete={step === "register" ? "new-password" : "current-password"}
                  autoFocus
                />
              </div>
              {step === "register" && <p className="mt-2 text-xs text-muted">Минимум 6 символов</p>}
            </>
          )}

          {error && <p className="mt-3 text-sm text-error">{error}</p>}
          {!noPassword && (
            <div className="mt-auto pt-8">
              <button className="btn-primary w-full" disabled={busy || password.length < (step === "register" ? 6 : 1)}>
                {busy ? (step === "register" ? "Создаём…" : "Входим…") : step === "register" ? "Создать аккаунт" : "Войти"}
              </button>
            </div>
          )}
        </form>
      )}
    </main>
  );
}
