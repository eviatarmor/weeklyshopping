import { useSyncExternalStore } from "react";
import { trpcClient } from "@/client/lib/trpc";

export type NotificationStatus = "on" | "off" | "blocked" | "install-first" | "unsupported";

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function status(): NotificationStatus {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhones only allow notifications for apps added to the home screen.
    return isIos() && !isInstalled() ? "install-first" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "granted") return localStorage.getItem("push-subscribed") === "1" ? "on" : "off";
  return "off";
}

/** Whether timer notifications reach this phone. */
export function useNotificationStatus(): NotificationStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status,
    () => "unsupported" as const,
  );
}

async function subscription(): Promise<PushSubscription | null> {
  const key = await trpcClient.timers.pushKey.query();
  if (!key) return null;
  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

async function register(sub: PushSubscription) {
  const json = sub.toJSON();
  await trpcClient.timers.subscribe.mutate({ endpoint: sub.endpoint, keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! } });
  localStorage.setItem("push-subscribed", "1");
  changed();
}

/** Ask for permission (must run from a tap) and subscribe this phone. Returns the new status. */
export async function enableNotifications(): Promise<NotificationStatus> {
  if (status() === "unsupported" || status() === "install-first") return status();
  const permission = await Notification.requestPermission();
  changed();
  if (permission !== "granted") return status();
  try {
    const sub = await subscription();
    if (sub) await register(sub);
  } catch (error) {
    console.error("push subscription failed", error);
  }
  return status();
}

export async function disableNotifications() {
  const registration = await navigator.serviceWorker.getRegistration();
  const sub = await registration?.pushManager.getSubscription();
  if (sub) {
    await trpcClient.timers.unsubscribe.mutate({ endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  localStorage.removeItem("push-subscribed");
  changed();
}

/** On start: make sure the server still has this phone's subscription (browsers rotate them). */
export async function refreshSubscription() {
  if (status() !== "on") return;
  try {
    const sub = await subscription();
    if (sub) await register(sub);
  } catch (error) {
    console.error("push refresh failed", error);
  }
}
