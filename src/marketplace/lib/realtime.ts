import 'server-only';

/**
 * Telling an open page that something happened — a showroom's dashboard, the
 * buyer's own request list, or an admin's panel.
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
 * Work a Server Function does not await is CUT OFF when the response finishes,
 * so a bare `fetch(...)` was abandoned before it left. after() runs the callback
 * once the response is finished — nobody waits for it — and the runtime keeps
 * the invocation alive until it completes. It also runs when the action ends
 * in a redirect().
 *
 * ── It can never break the thing it reports on ──────────────────────────────
 *
 * Never throws and never retried. Every listener also polls, so a lost message
 * means "updates a few seconds later", never "wrong".
 */

import { after } from 'next/server';
import { marketplacePublicEnv } from '@/marketplace/lib/env';
import { getMarketplaceDb } from '@/marketplace/db/client';

type Payload = Record<string, unknown>;

function target(): { url: string; key: string } | null {
  try {
    const { url } = marketplacePublicEnv();
    const key = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? { url, key } : null;
  } catch {
    return null;
  }
}

/**
 * One message, sent now.
 *
 * Nothing worth stealing travels over this — an id and a decision at most. The
 * browser is told THAT something changed and re-reads through the ordinary
 * RLS-protected query, so the socket never becomes a second, weaker way to read
 * anything.
 *
 * `private: true` means delivery is gated by the policies on realtime.messages
 * (schema.sql §21.7 for a showroom topic, §21.9 for a person's own topic).
 */
async function sendNow(topic: string, event: string, payload: Payload) {
  const t = target();
  if (!t) return;

  try {
    await fetch(`${t.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: t.key,
        Authorization: `Bearer ${t.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: true }] }),
      // A notification must never be served from a cache.
      cache: 'no-store',
    });
  } catch {
    // Offline, DNS, a 500 from realtime — all mean "the page catches up on its
    // next poll", none mean "fail the action".
  }
}

/** Runs work after the response; inline when there is no request scope. */
function later(work: () => Promise<void>) {
  try {
    after(work);
  } catch {
    // after() throws outside a request scope — a script, a test, a cron.
    work();
  }
}

/**
 * A showroom's open dashboards.
 *
 * @param event  'lead_new'      — a request arrived. The dashboard chimes.
 *               'lead_changed'  — read, moved, or deleted. No chime.
 *               'boost_changed' — an admin approved, rejected or ended one of
 *                                 this showroom's promotions. Chimes.
 */
export function notifyVendorLeads(
  vendorId: string | null | undefined,
  event: string,
  payload: Payload = {},
) {
  if (!vendorId) return;
  later(() => sendNow(`leads:${vendorId}`, event, payload));
}

/**
 * One person's own topic.
 *
 * @param event  'request_changed' — a buyer's request moved stage, or is gone.
 */
export function notifyBuyerRequests(
  buyerUserId: string | null | undefined,
  event: string,
  payload: Payload = {},
) {
  if (!buyerUserId) return;
  later(() => sendNow(`buyer:${buyerUserId}`, event, payload));
}

/**
 * One signed-in person, about their own account.
 *
 * @param event  'role_changed' — their admin role was removed or their account
 *                                deleted. An open admin panel leaves at once.
 */
export function notifyUser(
  userId: string | null | undefined,
  event: string,
  payload: Payload = {},
) {
  if (!userId) return;
  later(() => sendNow(`buyer:${userId}`, event, payload));
}

/**
 * Every admin's open panel.
 *
 * Sent on each admin's PERSONAL topic, `buyer:<userId>` — the one topic a
 * signed-in person is already allowed to listen on (schema.sql §21.9). That
 * means no new realtime policy and no SQL to run; the event names keep it apart
 * from a buyer's own request updates on the same topic.
 *
 * The admin list is read inside after(), so the seller who pressed "Send" does
 * not wait for it.
 *
 * @param event  'boost_new'     — a showroom asked for a promotion. Chimes.
 *               'boost_changed' — a request was cancelled or decided.
 */
export function notifyAdmins(event: string, payload: Payload = {}) {
  later(async () => {
    try {
      const { data } = await getMarketplaceDb().from('profiles').select('id').eq('role', 'admin');
      await Promise.all((data ?? []).map((p) => sendNow(`buyer:${p.id}`, event, payload)));
    } catch {
      // Admin panels poll; they catch up on their own.
    }
  });
}
