"use client";

/**
 * Leaves the dashboard the moment this person stops belonging to it.
 *
 * ── The server was already immediate. This reaches the OPEN TAB ────────────
 *
 * requireVendor() reads vendor_members on every request, so a removed member
 * is locked out of their very next page load with no help from this file.
 * What that cannot do is reach a tab that is simply sitting there — a
 * salesperson who has just been let go, with the leads list open in front of
 * them, keeps seeing it until they happen to click something.
 *
 * ── It has no authority, deliberately ──────────────────────────────────────
 *
 * On the message, this calls router.refresh() and nothing else. The refresh
 * re-runs the server layout, requireVendor() finds no membership, and the
 * SERVER redirects — the same decision it would have made on any other
 * request. Nothing here decides whether the person may stay.
 *
 * That matters because the message arrives over a channel, and a channel is
 * reachable by the person being removed. If this component redirected on its
 * own, "am I still a member" would be answered in a browser the removed
 * person controls — and the inverse, suppressing the message, would be a way
 * to keep a dashboard open. Refreshing is the only safe thing a client can do
 * with this news, and it is enough.
 *
 * ── The topic ──────────────────────────────────────────────────────────────
 *
 * `buyer:<userId>` — one person's own channel, whose policy is simply
 * auth.uid() = the id in the topic (schema.sql §21.9). It needs no new SQL,
 * and a member cannot listen to anybody else's. The event name is distinct
 * from `role_changed`, which already means "your ADMIN role went" and makes
 * the admin panel leave: somebody who is both an admin and a salesperson must
 * not be thrown out of the admin panel because a showroom changed their job.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";

export default function MembershipWatch({ userId }) {
  const router = useRouter();
  const refresh = useRef(router.refresh);

  /* Written on commit rather than during render — the same rule useLiveLeads
     and useLiveBoosts follow. */
  useEffect(() => {
    refresh.current = router.refresh;
  });

  useEffect(() => {
    if (!userId) return undefined;

    const supabase = getMarketplaceAuthClient();
    if (!supabase) return undefined;

    let cancelled = false;
    let channel = null;
    let authSub = null;

    (async () => {
      /* A PRIVATE topic is authorised by the policy on realtime.messages, so
         the socket has to carry this person's token rather than the anon key.
         Set before subscribing, or the join races the session and is refused
         with CHANNEL_ERROR — the same sequence useLiveBoosts follows. */
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        /* Subscribe anyway. Losing this costs a prompt, not the lockout: the
           server still refuses them on their next request. */
      }

      if (cancelled) return;

      /* A refreshed token must reach the socket too, or the subscription dies
         quietly at the first rotation and the tab stops listening. */
      authSub = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      channel = supabase
        .channel(`buyer:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "membership_changed" }, () => {
          /* Removed, promoted or demoted — all three mean the shell this
             person is looking at was built from something that is no longer
             true. The server works out which. */
          refresh.current?.();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      authSub?.data?.subscription?.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
