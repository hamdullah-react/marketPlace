"use client";

/**
 * Pending promotion requests, live — the admin's version of useLiveLeads.
 *
 * Same three layers, for the same reasons that hook documents at length:
 *
 *   1. a websocket on the admin's personal topic (`buyer:<userId>`), which
 *      chimes the instant a showroom sends a request — see notifyAdmins()
 *   2. a poll of the pending count, every 8s while the socket is down and every
 *      60s while it is up, which chimes on a rise if the socket missed it
 *   3. a recount when the tab comes back to the front
 *
 * The count is re-asked from the database rather than kept as a running total,
 * so a request decided by another admin or in another tab is never counted
 * twice. The anon client carries the admin's session; listing_boosts_staff_all
 * is what lets it read.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";
import { useOnChange } from "@/hooks/use-on-change";
import { ting, unlockAudio } from "../../(seller)/_components/useLiveLeads";

/**
 * @param onRevoked  called once this person is no longer an admin — their role
 *                   was removed or their account deleted — so the panel can
 *                   leave. Fired by a `role_changed` message for speed, and by
 *                   an is_admin() check on every poll in case that was missed.
 */
export function useLiveBoosts(userId, { initial = 0, onBoost, onRevoked } = {}) {
  const [count, setCount] = useState(initial);
  const [live, setLive] = useState(false);

  const handler = useRef(onBoost);
  const revoked = useRef(onRevoked);
  const countRef = useRef(count);
  const left = useRef(false);

  // Written on commit, not during render — see useLiveLeads.
  useEffect(() => {
    handler.current = onBoost;
    revoked.current = onRevoked;
    countRef.current = count;
  });

  // Leaves once, however many signals arrive together.
  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    revoked.current?.();
  }, []);

  /**
   * Still an admin? Asked of the database with this browser's session.
   *
   * Only a definite `false` counts. A network error or an unreachable server
   * must never throw an admin out of the panel.
   */
  const checkRole = useCallback(async () => {
    try {
      const { data, error } = await getMarketplaceAuthClient().rpc("is_admin");
      if (!error && data === false) leave();
    } catch {
      // Offline — try again on the next tick.
    }
  }, [leave]);

  // A fresh server count (navigation, router.refresh) wins.
  useOnChange(initial, (next) => setCount(next));

  // The chime can only play once the page has had a gesture.
  useEffect(() => {
    const opts = { once: true, passive: true };
    window.addEventListener("pointerdown", unlockAudio, opts);
    window.addEventListener("keydown", unlockAudio, opts);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const recount = useCallback(async ({ announce = false } = {}) => {
    try {
      const { count: fresh, error } = await getMarketplaceAuthClient()
        .from("listing_boosts")
        .select("id", { count: "exact", head: true })
        .eq("state", "pending");

      if (error || typeof fresh !== "number") return;

      if (announce && fresh !== countRef.current) {
        // A rise is a new request the socket did not deliver — chime for it.
        if (fresh > countRef.current) ting();
        handler.current?.();
      }
      setCount(fresh);
    } catch {
      // Keep the last good number rather than announcing an empty queue.
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    const supabase = getMarketplaceAuthClient();
    let cancelled = false;
    let channel = null;
    let authSub = null;

    (async () => {
      // The private topic needs the admin's token on the socket, not the anon
      // key — set it before subscribing so the join cannot race the session.
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        // Subscribe anyway; the poll below still works.
      }

      if (cancelled) return;

      authSub = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      channel = supabase
        .channel(`buyer:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "boost_new" }, () => {
          setCount((n) => n + 1);
          ting();
          handler.current?.();
          recount();
        })
        .on("broadcast", { event: "boost_changed" }, () => {
          handler.current?.();
          recount();
        })
        // Another admin removed this person's role, or deleted the account.
        .on("broadcast", { event: "role_changed" }, () => leave())
        .subscribe((state) => {
          setLive(state === "SUBSCRIBED");
          // A reconnect may have missed events; recount closes the gap.
          if (state === "SUBSCRIBED") {
            recount();
            checkRole();
          }
        });
    })();

    return () => {
      cancelled = true;
      authSub?.data?.subscription?.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, recount, checkRole, leave]);

  useEffect(() => {
    if (!userId) return;
    const every = live ? 60000 : 8000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        recount({ announce: true });
        checkRole();
      }
    }, every);
    return () => clearInterval(id);
  }, [userId, live, recount, checkRole]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        recount({ announce: true });
        checkRole();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [recount, checkRole]);

  return { count, live };
}
