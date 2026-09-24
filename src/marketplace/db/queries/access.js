import 'server-only';

/**
 * Subscriptions — who is still inside, who runs out when, and what it costs.
 *
 * The RULE lives in lib/access.js and is applied by the guards in
 * auth/session.js. This file only fetches the rows those decisions are made
 * from, plus the admin's list.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';
import { isMissingSchema } from './engagement';
import { accessState } from '@/marketplace/lib/access';

const ACCESS_COLUMNS =
  'id, slug, name, state, logo_url, city, contact_phone, contact_email, approved_at, created_at, ' +
  'access_until, access_blocked, access_block_reason, access_blocked_at';

/** The renewal plans an admin has published. Empty until they create one. */
export async function getVendorPlans({ activeOnly = true } = {}) {
  let query = getMarketplaceDb()
    .from('vendor_plans')
    .select('id, name, days, price, active, sort')
    .order('sort', { ascending: true })
    .order('days', { ascending: true });

  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

/**
 * Every showroom and where it stands — the admin's subscriptions screen.
 *
 * Sorted by WHEN THEY RUN OUT rather than by name: the screen's job is "who
 * needs chasing", and that is the top of a list ordered by date. Blocked ones
 * come first because they are the ones somebody is waiting on.
 *
 * `paidBefore` is read from the charges rather than guessed from the date — it
 * is what makes "Free trial" and "Active" distinguishable, and the honest
 * source for that is whether a subscription charge was ever raised.
 */
export async function listVendorAccess() {
  const db = getMarketplaceDb();

  const read = (columns) =>
    db.from('vendors').select(columns).is('deleted_at', null).eq('state', 'approved');

  let { data, error } = await read(ACCESS_COLUMNS);

  /* 42703 — the VENDOR ACCESS section has not been run. The screen says so
     rather than showing every showroom as "Not set", which would look like a
     configuration somebody had chosen. */
  if (error?.code === '42703') return { ready: false, items: [] };
  if (error) return { ready: !isMissingSchema(error), items: [] };

  const rows = data ?? [];

  const paid = new Set();
  const { data: subs } = await db
    .from('vendor_charges')
    .select('vendor_id, state')
    .eq('kind', 'subscription')
    .eq('state', 'paid');

  for (const row of subs ?? []) paid.add(row.vendor_id);

  const now = Date.now();

  const items = rows
    .map((vendor) => ({
      ...vendor,
      access: accessState(vendor, now),
      paidBefore: paid.has(vendor.id),
    }))
    .sort((a, b) => {
      // Blocked first, then soonest to run out. A null date sorts last: it is
      // not urgent, it is unconfigured.
      if (a.access.state === 'blocked' && b.access.state !== 'blocked') return -1;
      if (b.access.state === 'blocked' && a.access.state !== 'blocked') return 1;

      const at = a.access_until ? Date.parse(a.access_until) : Infinity;
      const bt = b.access_until ? Date.parse(b.access_until) : Infinity;
      return at - bt;
    });

  return { ready: true, items };
}

/** One showroom's access row, for an action that has to read before it writes. */
export async function getVendorAccess(vendorId) {
  if (!vendorId) return null;

  const { data, error } = await getMarketplaceDb()
    .from('vendors')
    .select('id, slug, name, access_until, access_blocked, access_block_reason')
    .eq('id', vendorId)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

/**
 * The renewal this showroom is already waiting on, or null.
 *
 * One unpaid subscription charge at a time (see the RENEWAL section), so this is
 * what turns the Renew button into "requested — waiting for the platform to
 * confirm your payment", and what the seller quotes on their transfer.
 */
export async function getOpenRenewal(vendorId) {
  if (!vendorId) return null;

  const { data, error } = await getMarketplaceDb()
    .from('vendor_charges')
    .select('id, ref, amount, access_days, description, issued_at, due_at')
    .eq('vendor_id', vendorId)
    .eq('kind', 'subscription')
    .eq('state', 'due')
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 42703 / 42P01 — the RENEWAL or BILLING section has not been run. No open
  // request is the truthful answer either way.
  if (error) return null;
  return data ?? null;
}

/**
 * Renewals waiting to be confirmed, across every showroom.
 *
 * The admin's most time-critical queue: each row is a seller who believes they
 * have paid and is sitting in front of a locked dashboard. Oldest first.
 */
export async function listOpenRenewals() {
  const { data, error } = await getMarketplaceDb()
    .from('vendor_charges')
    .select('id, ref, vendor_id, amount, access_days, issued_at, vendors ( id, slug, name, contact_phone )')
    .eq('kind', 'subscription')
    .eq('state', 'due')
    .order('issued_at', { ascending: true });

  if (error) return [];
  return data ?? [];
}
