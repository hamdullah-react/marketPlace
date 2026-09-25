/* eslint-disable no-undef */

/**
 * The service worker — the only part of the app that runs with the app closed.
 *
 * ── What it is for, and what it is NOT ──────────────────────────────────────
 *
 * One job: receive a push and show it. It does not cache pages, intercept
 * fetches or try to make the marketplace work offline. A caching service worker
 * is a serious commitment — stale HTML, a stale build manifest and a
 * "why am I seeing yesterday's price" bug class — and none of that is needed to
 * deliver a notification.
 *
 * ── Why the payload carries the TEXT, not an id ─────────────────────────────
 *
 * A push arrives with no session and no cookies. It cannot call the API to look
 * anything up, and a notification that has to fetch before it can be shown is a
 * notification that silently does not appear when the network is slow. So the
 * server sends the finished sentence, already in the recipient's language.
 *
 * ── Chrome will show SOMETHING no matter what ───────────────────────────────
 *
 * On a subscription created with `userVisibleOnly: true` — which is the only
 * kind Chrome allows — the browser shows its own "This site has been updated in
 * the background" if the worker receives a push and shows nothing. So every
 * path here ends in showNotification(), including the one where the payload is
 * unreadable.
 */

/* Square, and the right sizes. This used to point at the wordmark, which is
   2301x512 — a notification icon is rendered in a small square, so a wide logo
   arrived squashed or cropped to a slice of itself.

   `badge` is a different job from `icon`: Android draws it in the status bar as
   a SILHOUETTE, so only its shape survives. A small, mostly-solid mark is the
   only kind that reads at that size. */
const FALLBACK_ICON = "/icons/icon-192.png";
const FALLBACK_BADGE = "/icons/badge-96.png";

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every old tab to close. A
  // seller who has just pressed "turn on notifications" should not have to
  // restart their browser for it to work.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Not JSON, or no data at all. Falls through to the generic notification
    // below rather than throwing — see the note above about Chrome.
  }

  const title = payload.title || "Alromaih Marketplace";

  const options = {
    body: payload.body || "",
    icon: payload.icon || FALLBACK_ICON,
    badge: payload.badge || FALLBACK_BADGE,
    dir: payload.dir || "auto",
    lang: payload.lang || undefined,

    /* Explicitly NOT silent, so the operating system plays its notification
       sound. The Notification API has no custom-sound option any more — a
       chime of our own is only possible while a tab is open, which is what
       ting() in the dashboard already does. */
    silent: false,

    /* A tag collapses repeats: four requests arriving together become one
       entry that updates, rather than four the seller has to dismiss. Grouped
       by KIND, so a new lead never hides a payment confirmation. */
    tag: payload.tag || payload.kind || "alromaih",
    renotify: Boolean(payload.tag || payload.kind),

    /* ── Android alerts on VIBRATION as much as on sound ──────────────────
       Without a pattern here a phone can show the notification silently and
       without moving, which reads as "it never arrived". The pattern is only
       honoured on Android; desktop ignores it rather than erroring, so there
       is no need to detect the platform.

       This is also the half of "no sound" that a site can actually control.
       The other half is the operating system's: Chrome hands the notification
       to Windows, and whether Windows plays a sound is a per-app setting
       (Settings → Notifications → Google Chrome) and off entirely while Focus
       Assist or Do Not Disturb is on. `silent: false` above is the strongest
       statement the web platform lets a page make. */
    vibrate: payload.vibrate || [200, 100, 200],

    /* Where notificationclick should go. Everything the click handler needs
       has to be in here: it cannot ask the server. */
    data: { url: payload.url || "/", kind: payload.kind || null },

    timestamp: payload.timestamp || Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      /* Focus a tab that already has the dashboard open rather than opening a
         second one. A seller who taps four notifications should end up with one
         window, not four. */
      for (const client of windows) {
        try {
          const here = new URL(client.url);
          const there = new URL(target, self.location.origin);
          if (here.origin === there.origin) {
            await client.focus();
            if ("navigate" in client && here.href !== there.href) {
              await client.navigate(there.href);
            }
            return;
          }
        } catch {
          // A client with an unparseable URL. Skip it and try the next.
        }
      }

      await self.clients.openWindow(target);
    })()
  );
});

/**
 * The browser rotated the subscription out from under us.
 *
 * It happens on its own — a key rotation, a long silence, a browser update.
 * Without this the device goes quiet for ever and nobody finds out, because
 * from the server's side the old endpoint simply starts returning 410.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription || null;
        const fresh =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe(
            old ? old.options : { userVisibleOnly: true }
          ));

        await fetch("/api/marketplace/push/resubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldEndpoint: old ? old.endpoint : null,
            subscription: fresh ? fresh.toJSON() : null,
          }),
        });
      } catch {
        // Nothing useful to do here. The next time the dashboard is opened it
        // re-registers, which is the real repair path.
      }
    })()
  );
});
