"use client";

/**
 * The thin bar across the top that says "the page is coming".
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * A click on a link that has not been prefetched waits for the SERVER before
 * anything on screen changes — the old page simply sits there. On a dashboard
 * page that reads a dozen tables that is a second or two of a dead interface,
 * and the honest reading of it is that the click did not work, so people click
 * again.
 *
 * `loading.js` is the real fix for a slow route and this is the other half: it
 * covers the gap BEFORE the new route's own fallback appears, and it covers
 * navigations that have no fallback at all.
 *
 * ── How a navigation is detected without router events ──────────────────────
 *
 * The App Router has no `routeChangeStart`. What it has is:
 *
 *   start   the CLICK. A capture-phase listener sees any <a> press anywhere in
 *           the tree — nav, card, breadcrumb, dropdown — without a single one
 *           of them knowing about this component. Plus `popstate`, for back
 *           and forward.
 *   end     usePathname() changing, which happens when the new route has
 *           actually committed.
 *
 * usePathname only — deliberately NOT useSearchParams, which would drag a
 * Suspense requirement into the layout this is mounted in. A filter change
 * that only rewrites the query string therefore ends on the timeout below
 * rather than on commit, which is the right trade for a progress hint.
 *
 * ── It never gets stuck ─────────────────────────────────────────────────────
 *
 * Every start arms a timeout. A click that turns out not to navigate at all —
 * a download, a new tab, a route that fails — clears itself rather than leaving
 * a half-finished bar on screen for ever.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** Nothing is shown for a navigation faster than this — no flicker on a prefetched page. */
const SHOW_AFTER_MS = 120;

/** How far the bar creeps while waiting. Never 100: that would be a lie. */
const CEILING = 92;
const TICK_MS = 180;

/** A navigation that has not committed by now is not going to. */
const GIVE_UP_MS = 20000;

export default function NavProgress() {
  const pathname = usePathname();
  const [value, setValue] = useState(0); // 0 = not running
  const [visible, setVisible] = useState(false);

  const timers = useRef({ show: null, creep: null, done: null, giveUp: null });
  const running = useRef(false);

  const clearTimers = () => {
    for (const key of Object.keys(timers.current)) {
      clearTimeout(timers.current[key]);
      clearInterval(timers.current[key]);
      timers.current[key] = null;
    }
  };

  // Declared before start(), which arms a timeout that calls it.
  const finish = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    clearTimers();

    setValue(100);
    // Long enough for the fill to reach the end, then the bar goes away.
    timers.current.done = setTimeout(() => {
      setVisible(false);
      setValue(0);
    }, 260);
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    clearTimers();
    setValue(8);

    // Held back, so a fast navigation shows nothing at all.
    timers.current.show = setTimeout(() => setVisible(true), SHOW_AFTER_MS);

    /* Slower as it goes: the first half of the bar is cheap and the last
       stretch should feel like it is still working, not like it has stalled. */
    timers.current.creep = setInterval(() => {
      setValue((v) => (v >= CEILING ? v : v + Math.max(0.6, (CEILING - v) / 12)));
    }, TICK_MS);

    timers.current.giveUp = setTimeout(finish, GIVE_UP_MS);
  }, [finish]);

  /* ── Start: any link press, and the back/forward buttons ─────────────── */
  useEffect(() => {
    const onClick = (event) => {
      // A modified click opens a tab or downloads; the page does not change.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target?.closest?.("a[href]");
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      // An anchor on this page, or something that is not a page at all.
      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || /^(mailto:|tel:|sms:|javascript:|blob:|data:)/i.test(href)) return;

      let url;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      // Another site, or the same page again: nothing is loading.
      if (url.origin !== window.location.origin) return;
      if (url.href === window.location.href) return;

      start();
    };

    const onPopState = () => start();

    // Capture, so a handler that stops propagation on its own link — a menu
    // that closes itself first — cannot hide the click from this.
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [start]);

  /* ── End: the new route committed ────────────────────────────────────── */
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    finish();
  }, [pathname, finish]);

  useEffect(() => clearTimers, []);

  if (!visible && value === 0) return null;

  return (
    <>
      {/* Fixed and on its own layer: it must sit above the header (z-50) and
          the sidebar, and it must never take part in any layout — the
          marketplace layout renders `children` bare on purpose. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      >
        <div
          className="h-full rounded-e-full bg-gradient-to-r from-brand-primary via-brand-primary to-brand-gold shadow-[0_0_10px_rgba(var(--brand-rgb),0.7)] transition-[width,opacity] duration-200 ease-out"
          style={{ width: `${value}%`, opacity: visible ? 1 : 0 }}
        />
      </div>

      {/* Announced once per navigation rather than on every tick. */}
      <span role="status" aria-live="polite" className="sr-only">
        {visible ? "Loading" : ""}
      </span>
    </>
  );
}
