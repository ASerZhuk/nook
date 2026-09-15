"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { maskPhone } from "@/lib/format";

type Step = "phone" | "password" | "code";
type AuthResult = { onboarded: boolean; has_password: boolean };

export default function LoginPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+7");
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState(false);
  // «У меня уже есть аккаунт» → /login?mode=password: после номера сразу пароль, без звонка
  const [passwordMode, setPasswordMode] = useState(false);
  const [noPassword, setNoPassword] = useState(false);

  useEffect(() => {
    setPasswordMode(new URLSearchParams(window.location.search).get("mode") === "password");
  }, []);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  function finish(result: AuthResult, viaCall: boolean) {
    if (!result.onboarded) window.location.href = "/app/onboarding";
    else if (!result.has_password || (viaCall && forgot)) window.location.href = "/app/profile#password";
    else window.location.href = "/app";
  }

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ retry_in: number; dev_code: string | null }>("/auth/request-code", { method: "POST", body: JSON.stringify({ phone }) });
      setStep("code");
      setCode("");
      setRetryIn(res.retry_in);
      setDevCode(res.dev_code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPhone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { has_password } = await api<{ has_password: boolean }>("/auth/start", { method: "POST", body: JSON.stringify({ phone }) });
      if (has_password || passwordMode) {
        setNoPassword(!has_password);
        setStep("password");
        setBusy(false);
      } else {
        await requestCode();
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function loginWithPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      finish(await api<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) }), false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function verify(value: string) {
    setBusy(true);
    setError("");
    try {
      finish(await api<AuthResult>("/auth/verify", { method: "POST", body: JSON.stringify({ phone, code: value }) }), true);
    } catch (err) {
      setError((err as Error).message);
      setCode("");
      setBusy(false);
    }
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setCode(digits);
    if (digits.length === 4) verify(digits);
  }

  function changePhone() {
    setStep("phone");
    setPassword("");
    setForgot(false);
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
          <h1 className="text-[28px] font-bold leading-tight">{passwordMode ? "Вход в аккаунт" : "Вход по номеру телефона"}</h1>
          <p className="mt-2 text-base text-muted">
            {passwordMode ? "Введите номер, на который зарегистрирован аккаунт." : "Если аккаунта ещё нет — создадим."}
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
          <div className={`mt-5 rounded-md bg-surface-soft p-4 text-[15px] leading-relaxed text-body ${passwordMode ? "hidden" : ""}`}>
            <p className="font-semibold text-ink">Первый вход — по звонку</p>
            <p className="mt-1">Отвечать не нужно. Код для входа — <b className="text-ink">последние 4 цифры</b> номера, с которого позвонят. Потом придумаете пароль и будете входить без звонка.</p>
            <p className="mt-2 text-sm text-muted">Например, +7 900 123-<b className="text-ink">45-67</b> → код <b className="text-ink">4567</b></p>
          </div>
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
          <div className="mt-auto pt-8">
            <button className="btn-primary w-full" disabled={busy || phone.replace(/\D/g, "").length < 11}>
              {busy ? "Проверяем…" : "Продолжить"}
            </button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={loginWithPassword} className="mt-12 flex flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight">{noPassword ? "Пароль не задан" : "Введите пароль"}</h1>
          {phoneLine}
          {noPassword ? (
            <div className="mt-8 rounded-md bg-surface-soft p-4 text-[15px] leading-relaxed text-body">
              Для этого номера ещё нет пароля. Войдите по звонку — после входа сможете придумать пароль и дальше входить без звонка.
            </div>
          ) : (
            <>
              {/* логин для менеджера паролей iOS/Android */}
              <input className="sr-only" type="text" name="username" autoComplete="username" value={phone} readOnly tabIndex={-1} aria-hidden />
              <div className="mt-8">
                <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
              </div>
            </>
          )}
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
          {!noPassword && (
            <button
              type="button"
              className="btn-ghost -ml-3 mt-3 self-start"
              disabled={busy}
              onClick={() => {
                setForgot(true);
                requestCode();
              }}
            >
              Забыли пароль? Войти по звонку
            </button>
          )}
          <div className="mt-auto pt-8">
            {noPassword ? (
              <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => requestCode()}>
                {busy ? "Звоним…" : "Войти по звонку"}
              </button>
            ) : (
              <button className="btn-primary w-full" disabled={busy || !password}>{busy ? "Входим…" : "Войти"}</button>
            )}
          </div>
        </form>
      )}

      {step === "code" && (
        <div className="mt-12 flex flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight">Введите последние 4 цифры номера</h1>
          <p className="mt-2 text-base text-muted">
            Сейчас на {phone} позвонит робот — трубку брать не нужно. Код — последние 4 цифры номера, с которого звонят.{" "}
            <button type="button" className="font-medium text-ink underline underline-offset-4" onClick={changePhone}>
              Изменить номер
            </button>
          </p>
          <input
            className="input mt-8 text-center text-[28px] font-semibold tracking-[0.6em]"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            aria-label="Последние 4 цифры номера"
            disabled={busy}
            autoFocus
          />
          {devCode && (
            <button type="button" onClick={() => onCodeChange(devCode)} className="mt-3 rounded-sm bg-surface-soft p-3 text-left text-sm text-body">
              Режим разработки: звонка не будет. Код — <b>{devCode}</b> (нажмите, чтобы подставить)
            </button>
          )}
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
          <div className="mt-auto pt-8 text-center">
            {retryIn > 0 ? (
              <p className="text-sm text-muted">Позвонить ещё раз можно через {retryIn} с</p>
            ) : (
              <button type="button" className="btn-ghost" onClick={() => requestCode()} disabled={busy}>
                Позвонить ещё раз
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
