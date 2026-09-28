import { getMarketplaceDb } from '@/marketplace/db/client';
import { isMissingSchema } from './engagement';

/**
 * Reading the conversation between a showroom and the platform.
 *
 * ── Every function here refuses to throw ────────────────────────────────────
 *
 * The same rule as queries/proofs.js, and it matters more here because the
 * drawer that reads these hangs off the dashboard shell: a database where the
 * MESSAGES section has not been run must render a dashboard with no messaging
 * in it, not a dashboard that will not render. So a missing table comes back as
 * `ready: false` and an empty list, and every caller can treat that as "nothing
 * to show" without a try/catch of its own.
 */

export const CHAT_BUCKET = 'marketplace-chat';

const MESSAGE_FIELDS =
  'id, conversation_id, vendor_id, sender, sender_user_id, sender_name, body, attachments, created_at';

const CONVERSATION_FIELDS =
  'id, vendor_id, last_message_at, last_message_preview, last_sender, admin_read_at, vendor_read_at';

/**
 * A short-lived link to one attachment.
 *
 * The bucket is private (see the MESSAGES section of schema.sql), so there is
 * no permanent address to store and nothing to put in an `<img src>`. An hour
 * is long enough to read a document and short enough that a link copied out of
 * the page stops working.
 *
 * ── `download` decides what the BROWSER does with it ────────────────
 *
 * Passing a filename makes Supabase add `?download=`, which comes back with
 * Content-Disposition: attachment — the file is saved rather than rendered.
 * That is the right default for a chat attachment: a PDF or a spreadsheet
 * opened in a tab is a file somebody then has to find again, and a document
 * rendered by the browser on our own origin is a wider surface than one written
 * to disk.
 *
 * Omitting it returns the inline URL, which is what an `<img>` in the thread
 * needs — a preview cannot be a download. Both go through the same route, which
 * is what keeps the permission check in one place.
 */
export async function signAttachment(path, seconds = 60 * 60, { download = null } = {}) {
  if (!path) return null;

  try {
    const { data, error } = await getMarketplaceDb()
      .storage.from(CHAT_BUCKET)
      .createSignedUrl(path, seconds, download ? { download } : undefined);

    return error ? null : (data?.signedUrl ?? null);
  } catch {
    return null;
  }
}

/** One showroom's thread, created on first use rather than on sign-up. */
export async function getConversation(vendorId) {
  if (!vendorId) return { ready: true, conversation: null };

  try {
    const { data, error } = await getMarketplaceDb()
      .from('conversations')
      .select(CONVERSATION_FIELDS)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (error) return { ready: !isMissingSchema(error), conversation: null };
    return { ready: true, conversation: data ?? null };
  } catch {
    return { ready: false, conversation: null };
  }
}

/**
 * The messages in one showroom's thread.
 *
 * ── Newest first in the QUERY, oldest first in the ANSWER ───────────────────
 *
 * A thread is read downwards, so the caller wants them in the order they were
 * said. But "the last fifty" has to be taken from the END, and a database can
 * only take a limit from the start of an ordering — so it is sorted descending,
 * limited, and reversed here. Sorting ascending and limiting would hand back
 * the first fifty messages ever sent, which on a year-old thread is the part
 * nobody is looking at.
 *
 * `search` filters rather than paginates: a showroom looking for the message
 * about its bank details wants every one that mentions them, not the newest
 * fifty of them.
 */
export async function listMessages(vendorId, { limit = 100, search = '' } = {}) {
  if (!vendorId) return { ready: true, items: [] };

  try {
    let query = getMarketplaceDb()
      .from('messages')
      .select(MESSAGE_FIELDS)
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(limit);

    const term = String(search ?? '').trim();
    /* The wildcards are ours; the term is escaped so a seller searching for
       "50%" does not match every message. */
    if (term) query = query.ilike('body', `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

    const { data, error } = await query;

    if (error) return { ready: !isMissingSchema(error), items: [] };
    return { ready: true, items: (data ?? []).reverse() };
  } catch {
    return { ready: false, items: [] };
  }
}

/**
 * Every showroom's thread, for the admin's list.
 *
 * Conversations that exist, newest first — a showroom nobody has ever written
 * to has no row, and inventing one for it would fill the list with silence. The
 * admin starts a new thread by picking the showroom, which is what
 * `listMessageableVendors` below is for.
 */
export async function listConversations({ limit = 100 } = {}) {
  try {
    const { data, error } = await getMarketplaceDb()
      .from('conversations')
      .select(`${CONVERSATION_FIELDS}, vendors ( id, slug, name, logo_url, city, contact_phone )`)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) return { ready: !isMissingSchema(error), items: [] };
    return { ready: true, items: data ?? [] };
  } catch {
    return { ready: false, items: [] };
  }
}

/**
 * The showrooms an admin may start a conversation with.
 *
 * APPROVED and not deleted — the same population the subscriptions screen works
 * with. A pending applicant has no dashboard to read a reply in, so offering to
 * message them would be offering to talk into a room with nobody in it.
 */
export async function listMessageableVendors({ limit = 500 } = {}) {
  try {
    const { data, error } = await getMarketplaceDb()
      .from('vendors')
      .select('id, slug, name, logo_url, city, contact_phone')
      .eq('state', 'approved')
      .is('deleted_at', null)
      .limit(limit);

    if (error) return { ready: !isMissingSchema(error), items: [] };
    return { ready: true, items: data ?? [] };
  } catch {
    return { ready: false, items: [] };
  }
}

/**
 * How many messages are unread, per conversation, for one side.
 *
 * Wraps the `conversation_unread` function — see the MESSAGES section of
 * schema.sql for why this is a function rather than a query. Returns a Map of
 * vendorId → count and a total, because the two callers want different things:
 * the admin's list marks each row, the header shows one number.
 */
export async function unreadCounts(side, vendorId = null) {
  const empty = { ready: true, byVendor: new Map(), total: 0 };
  if (side !== 'admin' && side !== 'vendor') return empty;

  try {
    const { data, error } = await getMarketplaceDb().rpc('conversation_unread', {
      side,
      target: vendorId,
    });

    if (error) return { ...empty, ready: !isMissingSchema(error) };

    const byVendor = new Map();
    let total = 0;

    for (const row of data ?? []) {
      const n = Number(row.unread ?? 0);
      if (!n) continue;
      byVendor.set(row.vendor_id, n);
      total += n;
    }

    return { ready: true, byVendor, total };
  } catch {
    return { ...empty, ready: false };
  }
}
