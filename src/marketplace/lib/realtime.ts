import 'server-only';

/**
 * Telling an open page that something happened — a showroom's dashboard, or
 * the buyer's own request list.
 *
 * ── Why this is not a database trigger ──────────────────────────────────────
 *
 * It was, twice, and neither worked on this project:
 *
 *   1. postgres_changes on `leads`. The channel reported SUBSCRIBED and
 *      delivered nothing — even to a client holding the SERVICE ROLE key, which
 *      bypasses RLS entirely. A schema-wide postgres_changes subscription on
 *      the same connection reported TIMED_OUT. That mechanism needs a
 *      publication, a replication slot and the realtime service's WAL reader,
 *      and one of those is not working here.
 *
 *   2. A trigger calling realtime.send(). Also silent — and worse, because the
 *      trigger has to swallow its own errors (a buyer's request must never fail
 *      because a badge could not be updated), so the reason was invisible.
 *
 * What DOES work, measured on this project: an HTTP POST to the realtime
 * broadcast endpoint. Subscribe on a private topic, POST, message arrives —
 * 202 and delivered. No publication, no replication slot, no WAL, no
 * realtime.send(), no partitioned realtime.messages insert.
 *
 * So the notification is sent from the server action that caused it, which is
 * also the honest place for it: the action knows what happened and why, where a
 * trigger only sees a row change.
 *
 * ── after(), not a bare fire-and-forget fetch ───────────────────────────────
 *
 * This was `fetch(...)` with no await, on the reasoning that a buyer pressing
 * Send should not queue behind a websocket fan-out. That reasoning is right and
 * the implementation was wrong: work a Server Function does not await is CUT
 * OFF when the response finishes. The POST was being abandoned before it left,
 * which is why a standalone Node probe delivered the message perfectly and the
 * running app delivered nothing — a script stays alive, a server action does
 * not.
 *
 * after() is the primitive for exactly this: it runs the callback once the
 * response is finished, so the buyer still waits for nothing, and the runtime
 * keeps the invocation alive until the POST completes. It also runs when the
 * action ends in a redirect() — which deleteLead does.
 *
 * ── It can never break the thing it reports on ──────────────────────────────
 *
 * Never throws and never retried. A lead is worth more than a chime: if this
 * fails the seller's badge is stale until their next page load or their next
 * visibility change, both of which recount anyway.
 */

import { after } from 'next/server';
import { marketplacePublicEnv } from '@/marketplace/lib/env';

/**
 * @param vendorId  the showroom whose dashboards should hear about it
 * @param event     'lead_new'     — a request arrived. The dashboard chimes.
 *                  'lead_changed' — read, moved, or cancelled. Badge only.
 * @param payload   deliberately thin. See below.
 */
function broadcast(topic: string, event: string, payload: Record<string, unknown>) {
  let url: string;
  let key: string | undefined;
  try {
    ({ url } = marketplacePublicEnv());
    key = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
  } catch {
    return;
  }
  if (!url || !key) return;

  /**
   * Nothing worth stealing travels over this.
   *
   * An id and a stage — no name, no number, no answer. The browser is told THAT
   * something changed and then re-reads through the ordinary RLS-protected
   * query, so the socket never becomes a second, weaker way to read a
   * showroom's pipeline or a person's history.
   *
   * `private: true` means delivery is gated by the policies on
   * realtime.messages (schema.sql §21.7 for a showroom, §21.9 for a buyer).
   * The topic itself is the sensitive part — knowing a showroom's lead volume
   * is worth something to a competitor — so it is never a public channel.
   */
  const body = JSON.stringify({
    messages: [{ topic, event, payload, private: true }],
  });

  const send = async () => {
    try {
      await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body,
        // Next caches fetches by default in some contexts; a notification must
        // never be served from a cache.
        cache: 'no-store',
      });
    } catch {
      // Offline, DNS, a 500 from realtime — all of them mean "the page updates
      // on its next poll" and none of them mean "fail the action".
    }
  };

  try {
    // AWAITED inside after(), which is the whole point: the response is
    // already sent, so nobody is waiting, but the runtime will not tear the
    // invocation down until this finishes.
    after(send);
  } catch {
    // after() throws outside a request scope — a script, a test, a cron. Fall
    // back to sending inline rather than not at all.
    send();
  }
}

/**
 * A showroom's open dashboards.
 *
 * @param vendorId  the showroom whose dashboards should hear about it
 * @param event     'lead_new'     — a request arrived. The dashboard chimes.
 *                  'lead_changed' — read, moved, or deleted. No chime.
 */
export function notifyVendorLeads(
  vendorId: string | null | undefined,
  event: string,
  payload: Record<string, unknown> = {},
) {
  if (!vendorId) return;
  broadcast(`leads:${vendorId}`, event, payload);
}

/**
 * One buyer's own request list.
 *
 * ── Why the buyer gets one at all ───────────────────────────────────────────
 *
 * The showroom moves a lead to "Price sent" and the buyer's page keeps saying
 * "waiting for the showroom" until they happen to reload it. A status that lags
 * is barely better than no status: it teaches someone that the page is
 * decoration, and they go back to ringing to find out what it should have told
 * them. Both sides of this transaction watch a screen, so both sides get told.
 *
 * @param buyerUserId  the person, not the lead — one topic per human, so a
 *                     buyer with four open requests holds one socket.
 * @param event        'request_changed' — a stage moved, or the lead is gone.
 */
export function notifyBuyerRequests(
  buyerUserId: string | null | undefined,
  event: string,
  payload: Record<string, unknown> = {},
) {
  if (!buyerUserId) return;
  broadcast(`buyer:${buyerUserId}`, event, payload);
}
