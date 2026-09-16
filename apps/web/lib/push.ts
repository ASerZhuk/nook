import { api } from "./api";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Android/Chrome присылает beforeinstallprompt один раз и рано — ловим на уровне модуля
let installPrompt: InstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event("nook:installable"));
  });
}

export const canPromptInstall = () => installPrompt !== null;

export async function promptInstall() {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  return outcome === "accepted";
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// На экран «Домой» на iOS добавляет только Safari: в Chrome/Firefox/Яндексе такого пункта нет
export const isIOSSafari = () => isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i.test(navigator.userAgent);

// На iOS PushManager доступен только в приложении, добавленном на экран «Домой» (iOS 16.4+)
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

function base64UrlToBytes(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function existingSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription())?.toJSON() ?? null;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

function pushErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "NotAllowedError") return "Уведомления запрещены в настройках браузера.";
  if (name === "AbortError" || /push service/i.test(message)) {
    // Brave по умолчанию отключает push-сервис Google; встроенные браузеры (Electron, IDE) push не поддерживают
    return "Браузер не смог подключиться к сервису уведомлений. В Brave включите «Использовать сервисы Google для push-сообщений» (настройки → Конфиденциальность). Во встроенных браузерах приложений уведомления не работают — откройте nook в Chrome или Safari.";
  }
  return `Не удалось включить уведомления: ${message}`;
}

export async function subscribePush() {
  await registerSW();
  const registration = await navigator.serviceWorker.ready;
  const { public_key } = await api<{ public_key: string }>("/push/vapid-key");
  const applicationServerKey = base64UrlToBytes(public_key);

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const existingKey = existing.options.applicationServerKey;
    if (existingKey && sameBytes(new Uint8Array(existingKey), applicationServerKey)) return existing.toJSON();
    await existing.unsubscribe(); // подписка со старым VAPID-ключом — переподписываемся
  }
  try {
    return (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })).toJSON();
  } catch (error) {
    throw new Error(pushErrorMessage(error));
  }
}
