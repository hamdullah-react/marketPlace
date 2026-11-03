import 'server-only';

/**
 * Reads for the admin panel. Service-role only — every caller is behind
 * requireAdmin() or adminForAction().
 *
 * Emails live in auth.users, which PostgREST does not expose, so users are
 * listed through the auth admin API and joined to profiles by id.
 */

import { io } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { isPrivate } from '@/marketplace/auth/presence';
import { getMarketplaceAuthAdmin } from '@/marketplace/auth/admin';
import { countPendingBoosts } from './boosts';

/** The auth API has no search, so a search scans at most this many users. */
const SCAN_PAGES = 25;
const SCAN_PAGE_SIZE = 200;

const headCount = (query) => query.then(({ count, error }) => (error ? null : count ?? 0));

export async function getAdminStats() {
  const db = getMarketplaceDb();
  const count = (table) => db.from(table).select('id', { count: 'exact', head: true });

  const [users, admins, vendors, live, featured, pendingBoosts] = await Promise.all([
    headCount(count('profiles')),
    headCount(count('profiles').eq('role', 'admin')),
    headCount(count('vendors').eq('state', 'approved')),
    headCount(count('listings').eq('state', 'live')),
    headCount(count('listings').eq('state', 'live').eq('is_featured', true)),
    countPendingBoosts(),
  ]);

  return { users, admins, vendors, live, featured, pendingBoosts };
}

/**
 * How recently somebody was here, as one of five bands.
 *
 * `null` means never seen — which on a database without schema.sql §33 is
 * every row, and the page says "—" rather than claiming they never visited.
 */
function presenceBand(lastSeenAt, now) {
  if (!lastSeenAt) return 'unknown';
  const minutes = (now - new Date(lastSeenAt).getTime()) / 60000;
  if (!Number.isFinite(minutes)) return 'unknown';
  if (minutes < 10) return 'online';
  if (minutes < 60) return 'recent';
  if (minutes < 60 * 24) return 'today';
  if (minutes < 60 * 24 * 7) return 'week';
  return 'inactive';
}

function shapeUser(user, profile, memberships = [], now = 0) {
  return {
    id: user.id,
    email: user.email ?? '',
    name: profile?.full_name || user.user_metadata?.full_name || '',
    phone: profile?.phone || user.phone || '',
    role: profile?.role ?? 'buyer',
    avatarUrl: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    confirmed: Boolean(user.email_confirmed_at),
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    /* Null on a database without §33, which the page renders as "—". */
    lastSeenAt: profile?.last_seen_at ?? null,
    country: profile?.last_country ?? null,
    /* The BAND, worked out here rather than in the page.
       Two reasons. `Date.now()` in a component body is impure and the lint
       rule react-hooks/purity rejects it — correctly, because a value that
       changes every render is not something React can reason about. And a
       band is the only thing an operator reads at a glance: the stamp is
       throttled to once every few minutes, so a precise minute would claim a
       accuracy this number has not got. The exact timestamp still travels, for
       the tooltip. */
    presence: presenceBand(profile?.last_seen_at, now),
    /**
     * Whether an ADDRESS was recorded, not the address itself.
     *
     * This is what tells "the geo lookup failed" apart from "the server never
     * saw the visitor's IP", which are two completely different problems with
     * one identical symptom — a blank Country column. The page turns it into
     * a sentence (see countryDiagnosis); the value itself stays on the server,
     * because an operator needs the ANSWER, not everybody's IP address in a
     * table they did not ask for.
     */
    hasIp: Boolean(profile?.last_ip),
    /**
     * Whether the address we recorded is an INTERNAL one — 10.x, 172.16-31.x,
     * 192.168.x, loopback.
     *
     * Without this the panel misreads the commonest proxy misconfiguration as
     * a third-party outage: a reverse proxy that forwards its own container
     * address rather than the visitor's still produces a `last_ip`, so "an
     * address arrived" is true and "the lookup failed" looks like the
     * explanation — when in fact nothing was ever asked, because a private
     * address cannot be resolved and we refuse to guess.
     */
    privateIp: Boolean(profile?.last_ip && isPrivate(profile.last_ip)),
    showrooms: memberships
      .filter((m) => m.vendors)
      .map((m) => ({ id: m.vendors.id, slug: m.vendors.slug, name: m.vendors.name, state: m.vendors.state, role: m.role })),
  };
}

/**
 * The profile columns, in two tiers.
 *
 * Same shape as the session reader's: ask for the presence fields, and fall
 * back to the originals on a 42703 so this page keeps working — showing a dash
 * where the data would be — on a database where §33 has not been run yet.
 */
const PROFILE_FULL = 'id, role, full_name, phone, last_seen_at, last_country, last_ip';
const PROFILE_BASE = 'id, role, full_name, phone';

async function readProfiles(db, ids) {
  const full = await db.from('profiles').select(PROFILE_FULL).in('id', ids);
  if (full.error?.code !== '42703') return full;
  return db.from('profiles').select(PROFILE_BASE).in('id', ids);
}

async function joinProfiles(users) {
  const ids = users.map((u) => u.id);
  if (!ids.length) return [];

  /**
   * ── The clock, read ONCE and only at request time ───────────────────────
   *
   * presenceBand() compares `last_seen_at` against now, and this project runs
   * with cacheComponents: a bare `Date.now()` anywhere a prerender can reach
   * fails the build of the route with "Next.js encountered the unstable value
   * Date.now() while prerendering" — which is exactly what the Customers page
   * started doing when the Status column was added.
   *
   * `await io()` is the documented suspension point for reading a synchronous
   * source like the clock (next/dist/docs/.../functions/io.md), and it is
   * preferred over connection(), which also blocks prefetches. Here rather
   * than inside presenceBand so there is one suspension and one timestamp for
   * the whole page — twenty users banded against twenty slightly different
   * "now"s would be a table that cannot be reasoned about.
   */
  await io();
  const now = Date.now();

  const db = getMarketplaceDb();
  const [{ data: profiles }, { data: members }] = await Promise.all([
    /* The presence columns arrive with schema.sql §33 and PostgREST fails the
       WHOLE select when one is missing, so the richer read falls back to the
       fields that have always existed. Without the fallback this page would
       show every user as a buyer on a database where §33 has not been run. */
    readProfiles(db, ids),
    db.from('vendor_members').select('user_id, role, vendors ( id, slug, name, state )').in('user_id', ids),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const membersByUser = new Map();
  for (const m of members ?? []) {
    const list = membersByUser.get(m.user_id) ?? [];
    list.push(m);
    membersByUser.set(m.user_id, list);
  }

  return users.map((u) => shapeUser(u, profileById.get(u.id), membersByUser.get(u.id), now));
}

/** One page of users, newest first, optionally filtered by email/name/phone. */
export async function listUsers({ page = 1, perPage = 20, q = '' } = {}) {
  const auth = getMarketplaceAuthAdmin().auth.admin;
  const needle = String(q ?? '').trim().toLowerCase();

  let users = [];
  let total = 0;

  if (!needle) {
    const { data, error } = await auth.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users = data?.users ?? [];
    total =
      typeof data?.total === 'number'
        ? data.total
        : (await headCount(getMarketplaceDb().from('profiles').select('id', { count: 'exact', head: true }))) ?? users.length;
  } else {
    const matched = [];
    for (let p = 1; p <= SCAN_PAGES; p++) {
      const { data, error } = await auth.listUsers({ page: p, perPage: SCAN_PAGE_SIZE });
      if (error) throw new Error(`listUsers: ${error.message}`);
      const batch = data?.users ?? [];
      for (const u of batch) {
        const hay = `${u.email ?? ''} ${u.user_metadata?.full_name ?? ''} ${u.phone ?? ''}`.toLowerCase();
        if (hay.includes(needle)) matched.push(u);
      }
      if (batch.length < SCAN_PAGE_SIZE) break;
    }
    total = matched.length;
    users = matched.slice((page - 1) * perPage, page * perPage);
  }

  return { users: await joinProfiles(users), total };
}

/** Everyone with a platform role. */
export async function listAdmins() {
  const { data, error } = await getMarketplaceDb()
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'staff'])
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listAdmins: ${error.message}`);

  const auth = getMarketplaceAuthAdmin().auth.admin;
  const users = (
    await Promise.all((data ?? []).map(async (p) => (await auth.getUserById(p.id)).data?.user ?? null))
  ).filter(Boolean);

  return joinProfiles(users);
}

/** An account by exact email, or null. */
export async function findUserByEmail(email) {
  const wanted = String(email ?? '').trim().toLowerCase();
  if (!wanted) return null;

  const auth = getMarketplaceAuthAdmin().auth.admin;
  for (let p = 1; p <= SCAN_PAGES; p++) {
    const { data, error } = await auth.listUsers({ page: p, perPage: SCAN_PAGE_SIZE });
    if (error) throw new Error(`findUserByEmail: ${error.message}`);
    const batch = data?.users ?? [];
    const hit = batch.find((u) => (u.email ?? '').toLowerCase() === wanted);
    if (hit) return hit;
    if (batch.length < SCAN_PAGE_SIZE) break;
  }
  return null;
}

/**
 * A row in audit_log. Never throws: a failed audit write must not undo an
 * admin decision that already happened, but it is logged.
 */
export async function writeAudit(viewer, action, entity, entityId, before = null, after = null) {
  const { error } = await getMarketplaceDb().from('audit_log').insert({
    actor: viewer?.email ?? 'system',
    actor_id: viewer?.userId ?? null,
    action,
    entity,
    entity_id: entityId ? String(entityId) : null,
    before,
    after,
  });
  if (error) console.error(`[audit] ${action} not recorded:`, error.message);
}
