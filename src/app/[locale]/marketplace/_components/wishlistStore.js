"use client";

/**
 * The cars a SIGNED-OUT visitor has hearted.
 *
 * ── Why a store rather than state on the card ───────────────────────────────
 *
 * A signed-in visitor's saved list lives in the database and arrives as the
 * `saved` prop. A signed-out one has nowhere to put it but localStorage, and
 * that is shared by every card on the page — which is exactly what the previous
 * version got wrong. Each card read the list once in an effect, kept its own
 * `isFavorite` boolean and wrote localStorage directly, so:
 *
 *   · the same car shown twice on a page (the grid and the "similar cars" rail)
 *     hearted in one place and stayed grey in the other until a reload;
 *   · the read happened in an effect, so every card painted an empty heart
 *     first and filled it in on the next frame — a visible flicker on a grid of
 *     twenty-four cars, on every single navigation;
 *   · a second tab never found out at all.
 *
 * Modelled on compareStore.js next door, for the reasons set out there: a
 * module store costs the pages that ignore it nothing, and useSyncExternalStore
 * is what React wants for an external mutable source read during render.
 *
 * Only ids are stored. The card already has the listing.
 */

const KEY = "marketplaceWishlist";
const EVENT = "marketplace.wishlist.changed";

const EMPTY = [];

/**
 * getSnapshot runs on EVERY render and React bails out only on an identical
 * reference, so a fresh JSON.parse each time would loop for ever. Cached
 * against the raw string and rebuilt only when something actually writes.
 */
let cache = null;
let cacheRaw = null;

function read() {
  if (typeof window === "undefined") return EMPTY;

  let raw = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Private mode, or site data blocked. Degrades to "nothing hearted", which
    // is a working page.
    return EMPTY;
  }

  if (raw === cacheRaw && cache) return cache;

  let parsed = EMPTY;
  try {
    const value = raw ? JSON.parse(raw) : [];
    parsed = Array.isArray(value) ? value.filter((id) => typeof id === "string") : EMPTY;
  } catch {
    parsed = EMPTY;
  }

  cacheRaw = raw;
  cache = parsed;
  return parsed;
}

function write(next) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Not persisted; the in-memory cache still updates so the page reacts and
       simply forgets on the next visit. */
  }
  cacheRaw = JSON.stringify(next);
  cache = next;
  window.dispatchEvent(new Event(EVENT));
}

export function getSnapshot() {
  return read();
}

/** The server cannot read localStorage, and guessing would hydrate wrong. */
export function getServerSnapshot() {
  return EMPTY;
}

export function subscribe(onChange) {
  window.addEventListener(EVENT, onChange);
  // A second tab writing the same key.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Adds or removes, and returns whether the car is now hearted. */
export function toggle(listingId) {
  const current = read();
  const next = current.includes(listingId)
    ? current.filter((id) => id !== listingId)
    : [...current, listingId];
  write(next);
  return next.includes(listingId);
}
