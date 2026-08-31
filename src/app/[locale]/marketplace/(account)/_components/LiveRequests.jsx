"use client";

/**
 * Keeps the buyer's request list current without them touching anything.
 *
 * ── Why the buyer gets this too ─────────────────────────────────────────────
 *
 * The page shows a status now, and a status that only changes on reload is
 * barely better than none: the showroom rings, sends a price, marks it sold,
 * and the buyer's screen still says "waiting for the showroom". They learn the
 * page is decoration and go back to ringing to find out what it should have
 * told them — which is the exact behaviour showing a status was meant to stop.
 *
 * ── Renders nothing ─────────────────────────────────────────────────────────
 *
 * There is no badge and no dot here. A seller needs to know whether their feed
 * is live because leads are their job; a buyer with three requests does not
 * need a connection indicator, they need the page to be right. So this is a
 * listener with no markup, and the only visible effect is that rows change by
 * themselves.
 *
 * ── One topic per PERSON ────────────────────────────────────────────────────
 *
 * `buyer:<user_id>`, not one per request. Somebody with four open enquiries
 * holds one socket, and a request they send while the page is open is covered
 * without resubscribing. Delivery is gated by the policy in schema.sql §21.9,
 * which checks auth.uid() against the id in the topic — so this can only ever
 * receive its own owner's events.
 *
 * ── And a poll behind it ────────────────────────────────────────────────────
 *
 * Same reasoning as the seller's dashboard, learned the hard way: the socket
 * has a long list of things that can quietly stop it — a policy that was never
 * run, a token, a CSP, an extension eating the WebSocket. router.refresh() on a
 * timer needs none of them. It is slower and it is not clever, and it means a
 * buyer is never looking at a status that is simply wrong.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";

export default function LiveRequests({ userId }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!userId) return;

    let supabase;
    try {
      supabase = getMarketplaceAuthClient();
    } catch {
      // No public env in the bundle. The poll below still runs.
      return;
    }

    let cancelled = false;
    let channel = null;
    let authSub = null;

    (async () => {
      /**
       * The socket has to carry the BUYER'S token.
       *
       * A private channel resolves auth.uid() through the policy; on a socket
       * holding the bare anon key that is null, the policy returns false, and
       * the subscription is refused. supabase-js sets this from its own auth
       * listener, but the session comes out of a cookie and resolves
       * asynchronously — subscribing on mount can win that race. Setting it
       * explicitly removes the race rather than usually winning it.
       */
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        // Attempted anyway: it will receive nothing, which is the correct
        // outcome for a browser that cannot prove who it is.
      }

      if (cancelled) return;

      // A refreshed token has to reach the socket too, or this stops receiving
      // an hour in with no visible error.
      authSub = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      channel = supabase
        .channel(`buyer:${userId}`, { config: { private: true } })
        // A stage moved, or the showroom deleted the lead. Either way the
        // answer is the same: re-read the list from the server. The payload is
        // deliberately not trusted to patch the page — it carries an id and a
        // stage, and the row it belongs to is rendered from an RLS-protected
        // query, not from a socket message.
        .on("broadcast", { event: "request_changed" }, () => router.refresh())
        .subscribe((state) => setLive(state === "SUBSCRIBED"));
    })();

    return () => {
      cancelled = true;
      authSub?.data?.subscription?.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, router]);

  /**
   * The fallback, and the catch-up.
   *
   * Slower when the socket is joined, because then this is only covering events
   * it dropped while believing itself healthy. Never while the tab is in the
   * background — nobody is reading it, and the visibility handler below catches
   * everything up the moment they come back.
   */
  useEffect(() => {
    const every = live ? 60000 : 15000;

    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    /**
     * And coming BACK to this list with the browser button.
     *
     * Next serves back/forward navigations from the client cache by design —
     * its docs say staleTimes "doesn't change back/forward caching behavior",
     * to keep the scroll position — so a buyer who opens a car, presses Back,
     * and lands on a status from before the showroom rang them is looking at a
     * snapshot, not at their request. Refreshing on restore replaces the
     * server-rendered half and keeps the scroll.
     */
    const onRestore = () => router.refresh();
    const onPageShow = (e) => { if (e.persisted) router.refresh(); };
    window.addEventListener("popstate", onRestore);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("popstate", onRestore);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [live, router]);

  return null;
}
