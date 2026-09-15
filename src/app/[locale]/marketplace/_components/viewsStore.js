"use client";

/**
 * Live view counts, shared by every card on the page.
 *
 * One store rather than state in each card, for the reason compareStore and
 * savedStore exist: the same car can appear in two rows at once, and the two
 * must never show different numbers. LiveViews writes; ListingCard reads.
 *
 * Counts only ever go UP — a view cannot be un-viewed — so a write that is
 * lower than what is held is ignored. That keeps an optimistic bump from being
 * undone by a poll that was sent a moment before it.
 */

let views = new Map();
const listeners = new Set();
const EMPTY = new Map();

export function subscribeViews(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getViews() {
  return views;
}

/** The server renders the numbers it was given; nothing is live yet. */
export function getServerViews() {
  return EMPTY;
}

/** @param entries  iterable of [listingId, count] */
export function setViews(entries) {
  let next = null;
  for (const [id, n] of entries) {
    const count = Number(n);
    if (!id || !Number.isFinite(count)) continue;
    const current = (next ?? views).get(id);
    if (current == null || count > current) {
      next ??= new Map(views);
      next.set(id, count);
    }
  }
  if (!next) return;
  views = next;
  listeners.forEach((l) => l());
}

/** This browser just opened the car — count it before the next poll does. */
export function bumpViews(id) {
  const current = views.get(id);
  if (current != null) setViews([[id, current + 1]]);
}
