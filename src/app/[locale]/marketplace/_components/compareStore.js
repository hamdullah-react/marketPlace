"use client";

/**
 * The cars a visitor has ticked to compare.
 *
 * ── Why this exists when the compare page is URL-driven ─────────────────────
 *
 * The comparison itself is a URL (see compare/_apicalls/compareApi) and that
 * does not change. What a URL cannot express is the half-finished act of
 * BUILDING one: a buyer scrolling the cars grid ticks a second car three rows
 * below the first, and until they press Compare there is no comparison to have
 * a URL for.
 *
 * So this holds the shortlist and nothing else. Pressing Compare turns it into
 * a path and the page takes over from there — the list is a staging area, not
 * a second source of truth about what is being compared.
 *
 * ── A module store, not a context ───────────────────────────────────────────
 *
 * A provider would have to wrap the browse layout, which would make every page
 * under it a client boundary's child for the sake of a feature most visitors
 * never touch. A module-level store with useSyncExternalStore costs nothing to
 * the pages that ignore it, and useSyncExternalStore is what React 19 wants for
 * exactly this: an external mutable source read during render.
 *
 * ── What is stored ──────────────────────────────────────────────────────────
 *
 * The handful of fields the bar draws — id, slug, title, image, price — and not
 * the whole listing. The bar shows a thumbnail and a name; the compare page
 * re-reads every car from the database by slug, so anything cached here beyond
 * those five fields would be a second copy of the truth that goes stale the
 * moment a seller edits their price.
 */

const KEY = "marketplace.compare";
const EVENT = "marketplace.compare.changed";

/** Same ceiling as the compare page. Duplicated as a literal rather than
 *  imported: compareApi is server-side and pulling it in here would drag the
 *  database client into the browser bundle. */
export const MAX = 3;

const EMPTY = [];

/**
 * useSyncExternalStore calls getSnapshot on EVERY render and bails out only
 * when the reference is identical. Parsing localStorage each time would return
 * a new array every call and spin React into an infinite re-render, so the
 * parsed list is cached and only rebuilt when something actually writes.
 */
let cache = null;
let cacheRaw = null;

function read() {
  if (typeof window === "undefined") return EMPTY;

  let raw = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Private mode, or site data blocked. The feature degrades to "nothing is
    // ticked", which is a working page rather than a crashed one.
    return EMPTY;
  }

  if (raw === cacheRaw && cache) return cache;

  let parsed = EMPTY;
  try {
    const value = raw ? JSON.parse(raw) : [];
    parsed = Array.isArray(value)
      ? value.filter((c) => c && typeof c.slug === "string").slice(0, MAX)
      : EMPTY;
  } catch {
    parsed = EMPTY;
  }

  cacheRaw = raw;
  cache = parsed;
  return parsed;
}

function write(next) {
  const trimmed = next.slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* Nothing persisted. The in-memory cache below still updates, so the bar
       reacts for this page view and simply forgets on the next one. */
  }
  cacheRaw = JSON.stringify(trimmed);
  cache = trimmed;
  window.dispatchEvent(new Event(EVENT));
}

/* ── The API the components use ─────────────────────────────────────────── */

export function getSnapshot() {
  return read();
}

/** The server renders nothing ticked, which is what a first paint should show:
 *  localStorage is not readable there, and guessing would mean the markup
 *  disagreeing with the browser and hydrating wrong. */
export function getServerSnapshot() {
  return EMPTY;
}

export function subscribe(onChange) {
  window.addEventListener(EVENT, onChange);
  // A second tab writing the same key. Without this, ticking a car in one tab
  // leaves the other tab's bar showing a list that is no longer true.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Add or remove, and say what happened.
 *
 * Returns "full" rather than silently doing nothing when the list is at its
 * ceiling — the card needs to be able to tell the visitor why their tap had no
 * effect. The main site answers that with alert(); a returned flag lets the
 * caller say it in the page instead.
 */
export function toggle(car) {
  if (!car?.slug) return "ignored";

  const current = read();
  if (current.some((c) => c.slug === car.slug)) {
    write(current.filter((c) => c.slug !== car.slug));
    return "removed";
  }

  if (current.length >= MAX) return "full";

  write([
    ...current,
    {
      id: car.id ?? car.slug,
      slug: car.slug,
      title: car.title ?? "",
      image: car.image ?? null,
      priceLabel: car.priceLabel ?? null,
    },
  ]);
  return "added";
}

export function remove(slug) {
  write(read().filter((c) => c.slug !== slug));
}

export function clear() {
  write([]);
}

/** The path the Compare button goes to, or null when there is nothing to compare. */
export function comparePath(list, locale) {
  if (!list?.length) return null;
  return `/${locale}/marketplace/compare/${list.map((c) => c.slug).join("/")}`;
}
