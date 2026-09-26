import { getMarketplaceDb } from '@/marketplace/db/client';
import { after } from 'next/server';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { pushNotification } from '@/marketplace/lib/push';
import { notifyAdmins, notifyVendorLeads } from '@/marketplace/lib/realtime';

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
    /* ── And a chime on any dashboard that is already open ─────────────
       Push reaches a CLOSED app; this reaches an open one, instantly, without
       waiting on Google and without needing notification permission at all.

       Broadcast from here rather than from each action because that is what
       stopped working: promotions and renewals each had a hand-wired event and
       chimed, a new user had none and was silent. One place, every kind, so
       the next event added is audible without anybody remembering this file.

       The dashboards coalesce (see ting), so an action that also broadcasts
       its own event still only makes one noise. */
    later(() => {
      if (audience === 'admin') notifyAdmins('admin_alert', { kind });
      else if (audience === 'vendor') notifyVendorLeads(vendorId, 'vendor_alert', { kind });
    });

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
 * Tell every buyer that an article has been published.
 *
 * ── Everybody, unlike new_car ───────────────────────────────────────────────
 *
 * notifyShowroomFollowers is careful about WHO: only people who saved a car or
 * sent a request to that showroom, because "a showroom you know has listed
 * something" is a claim about a relationship, and sending it to strangers would
 * be a lie as well as spam.
 *
 * An article is the opposite. It is written for buyers in general — what to
 * check before buying, how to read a price — so there is no relationship to
 * respect and no smaller group that is the right one. Every buyer account is
 * told, and the wording claims nothing about them.
 *
 * ── Announced ONCE, ever ────────────────────────────────────────────────────
 *
 * Publishing, unpublishing to fix a typo, and publishing again is one article,
 * not two, and a bell that goes off each time teaches people to ignore it. The
 * guard is the same one notifyNewUser uses: ask what has already been said. If
 * a blog_published row already names this slug, nothing is sent.
 *
 * That makes the call safe from anywhere, which matters because two different
 * actions can put an article live — saving it with the switch on, and the
 * publish item in the list's row menu.
 *
 * ── Capped, and the cap is a real limit ─────────────────────────────────────
 *
 * This is the one notification in the app addressed to everybody, so it is the
 * one that grows with the marketplace. The rows are inserted in chunks so a
 * single statement never carries thousands, and `limit` is a ceiling rather
 * than a page: past it, nobody else is told. A platform that outgrows this
 * wants a queue, not a bigger number here — said plainly so the day it matters
 * is not a surprise.
 */
export async function notifyNewArticle({ post, href, limit = 2000 }) {
  if (!post?.slug) return { ok: false, error: 'NO_POST' };

  try {
    const db = getMarketplaceDb();

    /* Already announced — see the note above. head:true so this costs a count
       and not the rows. */
    const { count, error: seen } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('audience', 'buyer')
      .eq('kind', 'blog_published')
      .eq('data->>slug', post.slug);

    // A failed CHECK must not become a second announcement.
    if (seen) {
      console.warn('[notifications] blog_published check failed:', seen.message);
      return { ok: false, error: 'SAVE_FAILED' };
    }
    if ((count ?? 0) > 0) return { ok: true, sent: 0, already: true };

    /* Buyers only. Staff and admins have the panel that published it, and
       telling somebody about their own action is noise. */
    const { data: people, error: read } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'buyer')
      .limit(limit);

    if (read) {
      console.warn('[notifications] blog_published recipients failed:', read.message);
      return { ok: false, error: 'SAVE_FAILED' };
    }

    const recipients = (people ?? []).map((row) => row.id).filter(Boolean);
    if (!recipients.length) return { ok: true, sent: 0 };

    /* The slug rides along so the guard above has something to match on, and
       the title and excerpt are SNAPSHOTS — an article renamed next month must
       not rewrite a notification somebody has already read. Both languages,
       because the sentence is built in the reader's own. */
    const data = {
      slug: post.slug,
      title: post.title ?? null,
      excerpt: post.excerpt ?? null,
    };

    const CHUNK = 500;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const { error } = await db.from('notifications').insert(
        recipients.slice(i, i + CHUNK).map((userId) => ({
          audience: 'buyer',
          user_id: userId,
          kind: 'blog_published',
          data,
          href,
        }))
      );

      if (error) {
        console.warn('[notifications] blog_published not recorded:', error.message);
        return { ok: false, error: 'SAVE_FAILED' };
      }
    }

    // After the response, like every other push in the app.
    later(async () => {
      for (const userId of recipients) {
        await pushNotification({ audience: 'buyer', userId, kind: 'blog_published', data, href });
      }
    });

    return { ok: true, sent: recipients.length };
  } catch (err) {
    console.warn('[notifications] blog_published not recorded:', err?.message ?? err);
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
