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

/**
 * Who a notification is for, as a filter.
 *
 * Three audiences, and the two that name somebody must actually name them — a
 * 'vendor' query with no vendor id, or a 'buyer' query with no user id, would
 * otherwise read every showroom's or every buyer's notifications. That is the
 * one mistake this function exists to make impossible, so it is written once
 * here and used by every reader and writer below.
 */
const addressed = (q, audience, vendorId, userId) => {
  if (audience === 'vendor') return q.eq('audience', 'vendor').eq('vendor_id', vendorId);
  if (audience === 'buyer') return q.eq('audience', 'buyer').eq('user_id', userId);
  return q.eq('audience', 'admin');
};

/** True when the audience names somebody and nobody was named. */
const unaddressed = (audience, vendorId, userId) =>
  (audience === 'vendor' && !vendorId) || (audience === 'buyer' && !userId);

/** The newest first. Twenty is a bell, not an archive. */
export async function getNotifications({ audience, vendorId = null, userId = null, limit = 20 } = {}) {
  if (unaddressed(audience, vendorId, userId)) return { ready: true, items: [], unread: 0 };

  const db = getMarketplaceDb();

  const scope = (q) => addressed(q, audience, vendorId, userId);

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
export async function recordNotification({
  audience,
  vendorId = null,
  /** Required for audience 'buyer' — a buyer is a person, not a desk. */
  userId = null,
  kind,
  data = {},
  href = null,
}) {
  if (!kind) return { ok: false, error: 'NO_KIND' };
  if (unaddressed(audience, vendorId, userId)) {
    return { ok: false, error: audience === 'buyer' ? 'NO_USER' : 'NO_VENDOR' };
  }

  try {
    const { error } = await getMarketplaceDb().from('notifications').insert({
      audience,
      // The database enforces this shape too; writing it out here means a bad
      // call fails on the constraint rather than quietly addressing a row to
      // everybody.
      vendor_id: audience === 'vendor' ? vendorId : null,
      user_id: audience === 'buyer' ? userId : null,
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
    later(() => pushNotification({ audience, vendorId, userId, kind, data, href }));

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
  if (unaddressed(audience, vendorId, userId)) {
    return { ok: false, error: audience === 'buyer' ? 'NO_USER' : 'NO_VENDOR' };
  }

  try {
    let q = getMarketplaceDb()
      .from('notifications')
      .update({ read_at: new Date().toISOString(), read_by: userId })
      .is('read_at', null);

    q = addressed(q, audience, vendorId, userId);

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

/**
 * Tell the buyers who know this showroom that it has listed something.
 *
 * ── Who counts, and why it is not "every buyer" ─────────────────────────────
 *
 * The request was "when a new car is added, notify the buyer". Notifying every
 * buyer on the marketplace would be the last notification most of them ever
 * receive from us: Chrome lets a person block a site's notifications for good
 * with one press, and a stranger pushed about a car they never asked about
 * presses it. The permission is the asset, and it is spent once.
 *
 * So this goes to buyers with an actual relationship to THIS showroom:
 *
 *   · they saved one of its cars   (saved_listings — a deliberate act)
 *   · they sent it a request       (leads — they have already talked to it)
 *
 * Both are warm, both are finite, and both are things the buyer did. There is a
 * third audience the schema was built for — saved_searches, with its `notify`
 * flag — and it is deliberately NOT used: nothing in the app has ever created
 * one, so it would address nobody while looking like a feature.
 *
 * ── Capped, and quiet about it ──────────────────────────────────────────────
 *
 * A showroom uploading forty cars in an afternoon must not send one buyer forty
 * notifications. The cap is on how many PEOPLE one listing reaches; the pacing
 * of a bulk upload is a separate problem and is noted rather than pretended
 * away — see the caller.
 */
export async function notifyShowroomFollowers({ vendorId, listing, vendorName, href, limit = 200 }) {
  if (!vendorId || !listing?.id) return { ok: false, error: 'NO_VENDOR' };

  try {
    const db = getMarketplaceDb();

    /* Two reads rather than one clever join: PostgREST cannot express "the
       union of the buyers of these two tables", and two indexed reads of a few
       hundred rows each are cheaper than the view it would take to. */
    const [saved, asked] = await Promise.all([
      db
        .from('saved_listings')
        .select('user_id, listings!inner ( vendor_id )')
        .eq('listings.vendor_id', vendorId)
        .limit(1000),
      db
        .from('leads')
        .select('buyer_user_id')
        .eq('vendor_id', vendorId)
        .is('deleted_at', null)
        .limit(1000),
    ]);

    const people = new Set();
    for (const row of saved.data ?? []) if (row.user_id) people.add(row.user_id);
    for (const row of asked.data ?? []) if (row.buyer_user_id) people.add(row.buyer_user_id);

    /* buyer_user_id is TEXT and predates Supabase auth on this database, so it
       can hold an id from the old scheme. notifications.user_id is a real
       foreign key to auth.users, and a bad id would fail the whole insert —
       so anything that is not a uuid is dropped rather than risking the batch. */
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const recipients = [...people].filter((id) => UUID.test(id)).slice(0, limit);

    if (!recipients.length) return { ok: true, sent: 0 };

    const data = { car: listing.name ?? null, vendor: vendorName ?? null };

    /* One insert for the rows, then the pushes. recordNotification() one at a
       time would be a round trip each, and a showroom with two hundred past
       customers would hold the publish open for all of them. */
    const { error } = await db.from('notifications').insert(
      recipients.map((userId) => ({
        audience: 'buyer',
        user_id: userId,
        kind: 'new_car',
        data,
        href,
      }))
    );

    if (error) {
      console.warn('[notifications] new_car not recorded:', error.message);
      return { ok: false, error: 'SAVE_FAILED' };
    }

    // After the response, like every other push in the app.
    later(async () => {
      for (const userId of recipients) {
        await pushNotification({ audience: 'buyer', userId, kind: 'new_car', data, href });
      }
    });

    return { ok: true, sent: recipients.length };
  } catch (err) {
    console.warn('[notifications] new_car not recorded:', err?.message ?? err);
    return { ok: false, error: 'SAVE_FAILED' };
  }
}

/**
 * Tell the platform that somebody has joined — once, whichever door they used.
 *
 * ── Why this is idempotent rather than "called in the right place" ──────────
 *
 * There are three ways to become a user here: confirm an emailed code, come
 * back through the Google callback, or be created by an admin. The email path
 * and the OAuth callback both run on every SIGN-IN as well as the first one, so
 * "notify on sign-in" would announce the same person every morning.
 *
 * The check is therefore against what has already been said: if an admin
 * notification already names this user id, nothing is sent. That makes the
 * call safe from any number of places, which is the only way a rule like this
 * survives a fourth sign-up path being added later.
 */
export async function notifyNewUser({ userId, name = null, email = null }) {
  if (!userId) return { ok: false, error: 'NO_USER' };

  try {
    const db = getMarketplaceDb();

    const { data: already } = await db
      .from('notifications')
      .select('id')
      .eq('audience', 'admin')
      .eq('kind', 'user_joined')
      .eq('data->>userId', userId)
      .limit(1);

    if (already?.length) return { ok: true, skipped: 'ALREADY' };

    /* The id is stored in `data` rather than in user_id: this row is addressed
       to the PLATFORM, and user_id on an admin notification would mean "this
       is for that person". Who it is ABOUT and who it is FOR are different
       questions, and the shape check in schema.sql enforces the distinction. */
    return await recordNotification({
      audience: 'admin',
      kind: 'user_joined',
      data: { userId, name, email },
      href: '/marketplace/admin/customers',
    });
  } catch (err) {
    console.warn('[notifications] user_joined not recorded:', err?.message ?? err);
    return { ok: false, error: 'SAVE_FAILED' };
  }
}
