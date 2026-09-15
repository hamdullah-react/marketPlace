"use client";

/**
 * "The media library changed" — shared by every gallery on the page, and every
 * tab.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Installing or removing a template happens on the Catalog page, while the
 * library is drawn by MediaGallery — on the Media page, and inside every image
 * picker. Nothing connected them, so installing Car images and opening Media
 * showed the old library until a full reload:
 *
 *   · the gallery keeps its folders in state seeded ONCE from the server, so
 *     the new Exterior and Interior folders never appeared
 *   · a Media page kept alive by the router came back exactly as it was
 *
 * revalidatePath in the action is not enough on its own: it updates the server
 * payload, not a gallery's own state.
 *
 * ── A version, not a copy of the library ────────────────────────────────────
 *
 * The store holds a number that goes up when something changed, and nothing
 * else. Each gallery remembers the version it last loaded and, when the number
 * moves, reads its photos and folders again from the server. Mirroring the
 * library here would mean keeping two lists in step for ever; a version needs
 * no seeding and cannot drift.
 *
 * Same shape as savedStore.js and compareStore.js: a module value, a Set of
 * listeners, read through useSyncExternalStore.
 *
 * ── Other tabs ──────────────────────────────────────────────────────────────
 *
 * A BroadcastChannel carries the bump to other tabs of the same site, so Media
 * open in one tab updates when a template is installed in another. A channel
 * never receives its own messages, so a bump is not counted twice.
 */

let version = 0;
const listeners = new Set();

const announce = () => {
  version += 1;
  for (const notify of listeners) notify();
};

let channel = null;

function getChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel("marketplace-media");
    channel.onmessage = announce;
  }
  return channel;
}

/**
 * Tell every gallery the library changed.
 *
 * Called from an event handler or an action callback, never during render:
 * writing to a store another component reads mid-render is the "Cannot update
 * a component while rendering a different component" error.
 */
export function publishMediaChange() {
  announce();
  getChannel()?.postMessage({ at: Date.now() });
}

export function subscribeMedia(notify) {
  // Opened on first subscribe, so another tab's bump reaches this one.
  getChannel();
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function getMediaVersion() {
  return version;
}

/** Nothing has changed during server rendering. */
export function getServerMediaVersion() {
  return 0;
}
