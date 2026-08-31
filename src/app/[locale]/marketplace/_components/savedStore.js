"use client";

/**
 * How many cars this person has saved, shared across the whole page.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The heart lives on a card in the grid. The number lives in the header — which
 * is rendered by a LAYOUT — and on the account page. Nothing connects them, so
 * tapping a heart changed the card and left the header saying the old number
 * until a full reload.
 *
 * revalidatePath cannot fix that on its own: the action already calls it, but
 * it revalidates PAGES, and partial rendering means a layout does not re-run on
 * navigation. Revalidating the layout instead would rebuild the entire header —
 * viewer, nav counts and all — on every heart tap, to change one integer.
 *
 * So the card publishes the number and the header reads it. Same shape as
 * resultsCount.js and compareStore.js next door: a module-level value and a Set
 * of listeners, read through useSyncExternalStore, which is what React actually
 * provides for a value that lives outside it. Context is the alternative, and
 * it would mean a provider wrapping every marketplace page to move one integer
 * between a card and a layout that is not even its ancestor in the tree.
 *
 * ── The number is the SERVER's, not a running tally ─────────────────────────
 *
 * `nudge` is optimistic and exists only for the moment between the tap and the
 * reply — a heart that waits for a round trip feels broken, and so does a badge
 * that lags one behind it. The action returns the real total and `publish`
 * overwrites whatever the nudge guessed, so a failed save, a double tap or a
 * second tab cannot leave the badge drifting.
 *
 * `null` means nothing has published yet, and the server's number stands.
 */

import { useSyncExternalStore } from "react";

let current = null;
const listeners = new Set();

const announce = () => {
  for (const notify of listeners) notify();
};

/**
 * The authoritative count, from the server.
 *
 * Called from an effect or an action callback, never during render — writing to
 * a store another component is reading mid-render is the "Cannot update a
 * component while rendering a different component" error.
 */
export function publishSavedCount(total) {
  const next = Number.isFinite(total) ? Math.max(0, total) : null;
  if (current === next) return;
  current = next;
  announce();
}

/**
 * The optimistic step, applied while the request is in flight.
 *
 * `base` is what the badge is showing right now — the header's server number
 * when nothing has published yet. Without it the first tap of a session would
 * have to count from zero and the badge would drop from 6 to 1.
 *
 * Clamped at zero: un-saving from a page whose count arrived stale must not
 * produce a badge reading -1.
 */
export function nudgeSavedCount(delta, base = 0) {
  const from = current == null ? base : current;
  const next = Math.max(0, from + delta);
  if (current === next) return;
  current = next;
  announce();
}

/**
 * Seed the store from the server's number, and let a LATER server number win.
 *
 * useSavedCount only FALLS BACK to the server value, it does not store it — so
 * without this the first nudge of a session would count up from zero and a
 * badge showing 6 would drop to 1 on the next tap.
 *
 * `lastFromServer` is what makes this safe to call on every render, and it is
 * doing two jobs:
 *
 *   · The header lives in a LAYOUT, which remounts when you cross between route
 *     groups, carrying whatever the server knew when that segment rendered —
 *     right after a heart tap, one behind. Ignoring a server value we have
 *     already seen means that remount cannot publish the stale 6 over the true
 *     7, so the badge never appears to lose a save.
 *
 *   · A value that HAS changed is the server telling us something we did not
 *     know — another device, another tab, a revalidate — and it wins.
 *
 * A full reload clears the module and this seeds again, which is the one moment
 * a fresh count from the server is unambiguously newer.
 */
let lastFromServer = null;

export function syncSavedCount(total) {
  const next = Number.isFinite(total) ? Math.max(0, total) : null;
  if (next == null || next === lastFromServer) return;
  lastFromServer = next;
  publishSavedCount(next);
}

const subscribe = (notify) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/**
 * The live count, falling back to the server's until something publishes.
 *
 * The server snapshot is always the fallback: this is browser state and nothing
 * has published during SSR, so returning anything else hands hydration a number
 * the server never rendered.
 */
export function useSavedCount(fallback = 0) {
  return useSyncExternalStore(
    subscribe,
    () => (current == null ? fallback : current),
    () => fallback,
  );
}

/**
 * The number on its own, for a SERVER component that cannot subscribe.
 *
 * The account page's stat tile is server-rendered — it has the count already
 * and only the digits need to be live, so this is the smallest client boundary
 * that does the job rather than turning the page into a client component to
 * animate one integer.
 */
export function SavedCount({ fallback = 0 }) {
  return useSavedCount(fallback);
}
