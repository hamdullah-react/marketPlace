"use client";

/**
 * Watches for the moment an admin switches this showroom back on.
 *
 * ── Why it matters that this is instant ─────────────────────────────────────
 *
 * The seller is on the phone to the platform team while they look at this
 * screen. "It is done" has to mean the page they are staring at opens, not
 * "press refresh" — and a seller who presses refresh and sees the same wall
 * rings back, which is the support call this whole screen exists to prevent.
 *
 * ── A full reload, not router.refresh() ─────────────────────────────────────
 *
 * Their access is decided by requireVendor() on the SERVER, and the answer
 * changes what the router should be showing at all: this page redirects to the
 * dashboard the moment it is allowed. A hard reload re-runs every guard from
 * the top with no stale client cache in the way — and it happens once, in front
 * of somebody who is waiting for it.
 *
 * The same message reaches the seller dashboard through useLiveLeads, where it
 * does the reverse: a showroom blocked mid-session is taken out at once instead
 * of carrying on until its next navigation.
 */

import { useEffect, useState } from "react";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";

export default function LiveAccess({ vendorId }) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!vendorId) return undefined;

    const supabase = getMarketplaceAuthClient();
    if (!supabase) return undefined;

    let cancelled = false;
    let channel = null;
    let authSub = null;

    (async () => {
      /* The socket has to carry this user's token: a private channel resolves
         owns_vendor() through auth.uid(), which is null on a socket holding the
         bare anon key. Set explicitly rather than racing supabase-js's own
         listener — see LiveRequests, same reasoning. */
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        // Attempted anyway: it receives nothing, which is the right outcome for
        // a browser that cannot prove who it is.
      }

      if (cancelled) return;

      authSub = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      channel = supabase
        .channel(`leads:${vendorId}`, { config: { private: true } })
        .on("broadcast", { event: "access_changed" }, () => {
          window.location.reload();
        })
        .subscribe((state) => setLive(state === "SUBSCRIBED"));
    })();

    return () => {
      cancelled = true;
      authSub?.data?.subscription?.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [vendorId]);

  /**
   * The fallback, and it is not optional here.
   *
   * A socket that never connected — a refused policy, a proxy eating
   * websockets, a phone that slept — would leave a paid-up seller sitting in
   * front of a wall indefinitely. Polling every thirty seconds costs one request
   * on ONE screen that somebody is actively waiting at, and it comes back to the
   * front the moment they switch tabs back.
   */
  useEffect(() => {
    if (live) return undefined;

    const id = setInterval(() => window.location.reload(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") window.location.reload();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live]);

  return null;
}
