// Service worker for notifications only: it never caches anything or handles page loads,
// so every phone always gets the current version of the app from the network.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Earlier versions cached the app here; remove anything left over.
      for (const key of await caches.keys()) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// A cooking timer is up (sent by the server, see src/server/timers-service.ts).
self.addEventListener("push", (event) => {
  let message = { title: "Time's up", body: "", tag: "timer", url: "/" };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // No payload: show the generic message.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      renotify: true,
      requireInteraction: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [300, 150, 300, 150, 300],
      data: { url: message.url },
    }),
  );
});

// Tapping the notification opens the app (or brings it to the front) on the recipe.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url).catch(() => {});
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
