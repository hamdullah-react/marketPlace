"use client";

/**
 * How many cars the CURRENT filters match, shared across the page.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The filter rail and the results grid sit in two different Suspense
 * boundaries, on purpose: the rail reads no searchParams, so it resolves once
 * and then stays put while only the grid re-runs on each filter change. That
 * is what keeps filtering fast — but it also means the rail cannot know the
 * filtered total, and the phone's "Show N cars" button was therefore printing
 * `facets.total`, the count of every car on the platform. Tick "Changan" and
 * the grid dropped to one car while the button underneath still said four.
 *
 * Handing searchParams to the rail would fix the number and undo the speed:
 * the rail would then be waiting on the same query as the grid.
 *
 * So the grid publishes the number it already has and the rail reads it. The
 * count updates the moment the grid re-renders — no refresh, no second query,
 * and the two boundaries stay independent.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 *
 * A module-level number and a Set of listeners, read through
 * useSyncExternalStore — the same pattern as compareStore.js next door, and
 * the thing React actually provides for reading a value that lives outside it.
 * Context is the alternative and it would mean a provider wrapping the whole
 * page just to move one integer between two siblings.
 *
 * `null` means "the grid has not reported yet" — on first paint the rail shows
 * the unfiltered total it was given, which is correct until the grid lands.
 */

import { useSyncExternalStore } from "react";

let current = null;
const listeners = new Set();

/**
 * Called from an effect, never during render.
 *
 * Publishing while rendering would be a write to another component's state
 * mid-render, which React refuses ("Cannot update a component while rendering
 * a different component"). See the effect in ResultsHeader.
 */
export function publishResultsTotal(total) {
  const next = Number.isFinite(total) ? total : null;
  if (current === next) return;
  current = next;
  for (const notify of listeners) notify();
}

const subscribe = (notify) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/**
 * The live count, falling back to `fallback` until the grid reports.
 *
 * The server snapshot is always the fallback: the store is browser state and
 * nothing has published during SSR, so returning anything else would hand
 * hydration a number the server never rendered.
 */
export function useResultsTotal(fallback = 0) {
  return useSyncExternalStore(
    subscribe,
    () => (current == null ? fallback : current),
    () => fallback,
  );
}
