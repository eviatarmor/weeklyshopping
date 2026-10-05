// Service worker: timer notifications, plus an offline fallback for the app itself.
// Page loads always go to the network first (so new deploys and the Cloudflare Access login
// work as normal); the saved copy is only used when there's no connection at all.

const OFFLINE_CACHE = "offline-v1";
/** On a bad signal, give up on the network after this long and open the saved copy. */
const NAVIGATION_TIMEOUT_MS = 6000;

/** Old builds' files pile up in the cache: keep only the most recent ones. */
async function trim(cache, max = 150) {
  // Never drop the saved app page itself.
  const keys = (await cache.keys()).filter((k) => new URL(k.url).pathname !== "/");
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches from earlier versions (the old precache etc.).
      for (const key of await caches.keys()) if (key !== OFFLINE_CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // API calls and Access endpoints always go straight to the network.
  if (url.pathname.startsWith("/trpc") || url.pathname.startsWith("/cdn-cgi")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await Promise.race([
            fetch(req),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAVIGATION_TIMEOUT_MS)),
          ]);
          // Keep the latest real app page (not a login redirect) for offline use.
          if (res.ok && res.type === "basic" && (res.headers.get("content-type") ?? "").includes("text/html")) {
            const cache = await caches.open(OFFLINE_CACHE);
            await cache.put("/", res.clone());
          }
          return res;
        } catch {
          // No connection: open the saved app; it shows the list saved on the phone.
          return (await caches.match("/", { cacheName: OFFLINE_CACHE })) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Built files have a hash in their name and never change: serve from cache when offline.
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(OFFLINE_CACHE);
            await cache.put(req, res.clone());
            event.waitUntil(trim(cache));
          }
          return res;
        } catch {
          return (await caches.match(req, { cacheName: OFFLINE_CACHE })) ?? Response.error();
        }
      })(),
    );
  }
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
