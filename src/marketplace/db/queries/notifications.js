import { getMarketplaceDb } from '@/marketplace/db/client';
import { after } from 'next/server';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { pushNotification } from '@/marketplace/lib/push';

/** Runs work after the response; inline when there is no request scope — a
 *  script, a test, a cron. The same shape lib/realtime.ts uses. */
function later(work) {
  try {
    after(work);
  } catch {
    work();
  }
}

/**
 * The bell: reading what happened, and recording it.
 *
 * ── Recording never fails the thing it describes ────────────────────────────
 *
 * A notification is a courtesy on top of an action that has already succeeded.
 * A buyer's request is saved, a payment is recorded, a promotion is approved —
 * and THEN we try to mention it. If that insert fails, for any reason, the
 * caller must not learn about it: failing a lead because a bell could not ring
 * would be the tail wagging the dog.
 *
 * So every writer here swallows its own error and logs. That is the opposite of
 * the rule everywhere else in this codebase, and it is deliberate.
 *
 * ── Read state is shared, and that is the point ─────────────────────────────
 *
 * See the NOTIFICATIONS section of schema.sql: a showroom is a queue three
 * people work between them, so "unread" means nobody here has seen it.
 */

/** The newest first. Twenty is a bell, not an archive. */
export async function getNotifications({ audience, vendorId = null, limit = 20 } = {}) {
  if (audience === 'vendor' && !vendorId) return { ready: true, items: [], unread: 0 };

  const db = getMarketplaceDb();

  const scope = (q) =>
    audience === 'vendor'
      ? q.eq('audience', 'vendor').eq('vendor_id', vendorId)
      : q.eq('audience', 'admin');

  /* Two reads rather than counting the page: the badge has to be the number of
     unread notifications, not the number of unread ones among the newest
     twenty — which is a different and always-smaller number the moment somebody
     goes on holiday. */
  const [list, count] = await Promise.all([
    scope(
      db.from('notifications').select('id, kind, data, href, read_at, created_at')
    )
      .order('created_at', { ascending: false })
      .limit(limit),
    scope(
      db.from('notifications').select('id', { count: 'exact', head: true })
    ).is('read_at', null),
  ]);

  if (list.error) {
    return { ready: !isMissingSchema(list.error), items: [], unread: 0 };
  }

  return {
    ready: true,
    items: list.data ?? [],
    unread: count.error ? 0 : (count.count ?? 0),
  };
}

/**
 * Record one.
 *
 * @param audience 'vendor' | 'admin'
 * @param vendorId required for 'vendor', ignored for 'admin'
 * @param kind     what happened — the app turns this into a sentence
 * @param data     the SNAPSHOT the sentence needs (a car's title, a name, an
 *                 amount). Never an id to be looked up later: the row it points
 *                 at may be gone by the time anybody reads this.
 * @param href     where the bell should go, locale-relative
 */
export async function recordNotification({ audience, vendorId = null, kind, data = {}, href = null }) {
  if (!kind) return { ok: false, error: 'NO_KIND' };
  if (audience === 'vendor' && !vendorId) return { ok: false, error: 'NO_VENDOR' };

  try {
    const { error } = await getMarketplaceDb().from('notifications').insert({
      audience,
      vendor_id: audience === 'vendor' ? vendorId : null,
      kind,
      data,
      href,
    });

    if (error) {
      // 42P01 — the NOTIFICATIONS section has not been run on this database.
      // Everything else works without it; the bell is simply empty.
      console.warn('[notifications] not recorded:', error.message);
      return { ok: false, error: 'SAVE_FAILED' };
    }

    /* ── And the same thing to a closed browser ───────────────────────────
       Every notification in the app arrives here, so this is the one place
       push has to be wired: the six events already recorded get it for free,
       and so will the seventh.

       NOT awaited. A push is an HTTP round trip to Google or Apple, times
       however many devices, and the buyer who just pressed Send is not waiting
       for that. later() runs it once the response has gone, and
       pushNotification swallows its own failures. */
    later(() => pushNotification({ audience, vendorId, kind, data, href }));

    return { ok: true };
  } catch (err) {
    console.warn('[notifications] not recorded:', err?.message ?? err);
    return { ok: false, error: 'SAVE_FAILED' };
  }
}

/**
 * Mark them read for the whole showroom (or the whole platform).
 *
 * Scoped at the DATABASE by audience and vendor, not by the ids the browser
 * sent: a list of ids from a client is a list of things it would LIKE to mark,
 * and one showroom must never be able to clear another's bell.
 */
export async function markNotificationsRead({ audience, vendorId = null, userId = null }) {
  if (audience === 'vendor' && !vendorId) return { ok: false, error: 'NO_VENDOR' };

  try {
    let q = getMarketplaceDb()
      .from('notifications')
      .update({ read_at: new Date().toISOString(), read_by: userId })
      .is('read_at', null);

    q = audience === 'vendor'
      ? q.eq('audience', 'vendor').eq('vendor_id', vendorId)
      : q.eq('audience', 'admin');

    const { error } = await q;
    if (error) {
      console.warn('[notifications] not marked read:', error.message);
      return { ok: false, error: 'SAVE_FAILED' };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[notifications] not marked read:', err?.message ?? err);
    return { ok: false, error: 'SAVE_FAILED' };
  }
}
