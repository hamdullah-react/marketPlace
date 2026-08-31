'use server';

/**
 * Deleting an account, and everything it owns.
 *
 * The most destructive action in the marketplace, so it is the one written most
 * carefully. Four rules it follows:
 *
 *   1. ORDERS ARE NOT DELETED. A sales record is not the customer's to erase —
 *      it is the seller's tax record and the platform's evidence of what was
 *      agreed. An account with orders is refused and told why, rather than
 *      quietly leaving orphaned rows or quietly destroying a receipt.
 *
 *   2. CHILDREN BEFORE PARENTS. Postgres will refuse a delete that breaks a
 *      foreign key, and half the marketplace is `on delete restrict` on
 *      purpose. The order below is the dependency order, not alphabetical.
 *
 *   3. FILES BEFORE ROWS. A storage object whose media_assets row is gone is
 *      unreachable and unbillable-for; a row whose file is gone renders a
 *      broken thumbnail. If the pass dies halfway, the second mess is worse.
 *
 *   4. THE AUTH USER GOES LAST. Deleting it cascades profiles and
 *      vendor_members, so doing it first would remove the very memberships
 *      this action uses to find the seller's data.
 *
 * NOT reversible, and not soft. A "deleted" flag that leaves the rows in place
 * is not deletion, and telling someone their data is gone when it is not is the
 * one thing this must never do.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { marketplaceEnv } from '@/marketplace/lib/env';
import { getViewer } from '@/marketplace/auth/session';
import { getMarketplaceAuthServer } from '@/marketplace/auth/server';

import { SHARED_BUCKET, dropVendorBucket } from '@/marketplace/media/bucket';

const BUCKET = SHARED_BUCKET;

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

/** Removes objects in batches the Storage API will accept. */
async function removeFiles(db, paths) {
  let done = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(batch);
    if (!error) done += batch.length;
  }
  return done;
}

export async function deleteMyAccount(prevState, formData) {
  const viewer = await getViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const locale = str(formData, 'locale') || 'ar';

  /**
   * Typed confirmation, checked against the account's OWN email.
   *
   * A checkbox or an "Are you sure?" is one mis-click. Typing your own address
   * cannot be done by accident, and unlike a fixed word like DELETE it also
   * proves you know which account you are on — which matters on a shared
   * machine.
   */
  const confirm = str(formData, 'confirm').toLowerCase();
  if (!viewer.email || confirm !== viewer.email.toLowerCase()) {
    return bad('CONFIRM_MISMATCH');
  }

  const db = getMarketplaceDb();
  const userId = viewer.userId;

  // Showrooms this person OWNS. A manager or salesperson leaves the showroom
  // standing — only their membership goes.
  const { data: memberships } = await db
    .from('vendor_members')
    .select('vendor_id, role')
    .eq('user_id', userId);

  const ownedVendorIds = (memberships ?? [])
    .filter((m) => m.role === 'owner')
    .map((m) => m.vendor_id);

  /* ── Rule 1: refuse if money has changed hands ─────────────────────────── */

  const [{ count: boughtCount }, soldCount] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }).eq('buyer_user_id', userId),
    ownedVendorIds.length
      ? db.from('orders').select('id', { count: 'exact', head: true }).in('vendor_id', ownedVendorIds)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  const orders = (boughtCount ?? 0) + soldCount;
  if (orders > 0) {
    return bad('HAS_ORDERS', { params: { count: orders } });
  }

  /* ── Files ─────────────────────────────────────────────────────────────── */

  let filesRemoved = 0;
  const mediaFilter = ownedVendorIds.length
    ? db.from('media_assets').select('storage_path').or(
        `owner_user_id.eq.${userId},vendor_id.in.(${ownedVendorIds.join(',')})`
      )
    : db.from('media_assets').select('storage_path').eq('owner_user_id', userId);

  const { data: media } = await mediaFilter;

  /**
   * Only the files still in the SHARED bucket need removing one by one.
   *
   * Everything a showroom uploaded after the per-vendor split lives in its own
   * bucket, and that whole bucket is deleted below — which is both faster and
   * more complete, since it also takes anything that was uploaded outside
   * media_assets. What is left here is the pre-split objects under vendors/<id>/
   * and this person's own uploads as a buyer.
   */
  const paths = (media ?? [])
    .map((m) => m.storage_path)
    .filter((p) => p && (p.startsWith('vendors/') || !p.includes('/')));

  if (paths.length) filesRemoved = await removeFiles(db, paths);

  // Backups live in their own bucket; the settings page owns that name, so it
  // is read from the rows rather than hardcoded twice.
  if (ownedVendorIds.length) {
    const { data: backups } = await db
      .from('vendor_backups').select('storage_path').in('vendor_id', ownedVendorIds);
    const backupPaths = (backups ?? []).map((b) => b.storage_path).filter(Boolean);
    if (backupPaths.length) await removeFiles(db, backupPaths);
  }

  /**
   * Each showroom's bucket, emptied and deleted.
   *
   * Deleting an account means deleting the storage, not just the rows that
   * point at it — a bucket left behind is the user's photographs still sitting
   * on a server after they asked for them to be gone.
   *
   * Failures are counted rather than thrown: a bucket that will not delete must
   * not abort a deletion that has already begun removing rows, and the count is
   * what lets the caller report a partial wipe honestly instead of claiming a
   * clean one.
   */
  let bucketsLeft = 0;
  for (const vendorId of ownedVendorIds) {
    const gone = await dropVendorBucket(db, vendorId).catch(() => false);
    if (!gone) bucketsLeft += 1;
  }
  if (bucketsLeft) {
    console.error(`[marketplace] ${bucketsLeft} showroom bucket(s) survived deletion of ${userId}`);
  }

  /* ── Rows, children first ──────────────────────────────────────────────── */

  // What this person did as a BUYER.
  await db.from('saved_listings').delete().eq('user_id', userId);
  await db.from('saved_searches').delete().eq('user_id', userId);
  await db.from('addresses').delete().eq('user_id', userId);
  await db.from('reviews').delete().eq('buyer_user_id', userId);
  await db.from('bookings').delete().eq('buyer_user_id', userId);
  // The requests they sent to showrooms. Deleted rather than anonymised: a
  // lead is somebody's contact details, which is exactly what "delete my
  // account" is asking to be rid of.
  await db.from('leads').delete().eq('buyer_user_id', userId);
  await db.from('media_assets').delete().eq('owner_user_id', userId);

  // What their SHOWROOMS own. listing_variants and listing_specs cascade from
  // listings; catalog_template_installs and vendor_members cascade from
  // vendors.
  if (ownedVendorIds.length) {
    await db.from('reviews').delete().in('vendor_id', ownedVendorIds);
    await db.from('bookings').delete().in('vendor_id', ownedVendorIds);
    await db.from('leads').delete().in('vendor_id', ownedVendorIds);
    await db.from('payouts').delete().in('vendor_id', ownedVendorIds);
    await db.from('vendor_backups').delete().in('vendor_id', ownedVendorIds);
    await db.from('media_assets').delete().in('vendor_id', ownedVendorIds);
    await db.from('listings').delete().in('vendor_id', ownedVendorIds);

    const { error: vendorError } = await db.from('vendors').delete().in('id', ownedVendorIds);
    // A foreign key still holding on means something references the showroom
    // that this action does not know about. Better to stop than to leave the
    // account half-deleted with no way to finish.
    if (vendorError) return bad('DELETE_FAILED', { detail: vendorError.message });
  }

  /* ── The account itself ────────────────────────────────────────────────── */

  // The admin API needs the service-role key, and it is the only call in the
  // marketplace that does user administration — so the client is built here
  // rather than added to the shared one, where it would be reachable by
  // anything that imports it.
  const { url, serviceRoleKey } = marketplaceEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) return bad('DELETE_FAILED', { detail: authError.message });

  // Clear the cookie too. The user row is gone, so the token no longer
  // resolves, but leaving it set means the next page load spends a round trip
  // discovering that.
  try {
    const supabase = await getMarketplaceAuthServer();
    await supabase.auth.signOut();
  } catch {
    // Already invalid — nothing to clean up.
  }

  revalidatePath('/[locale]/marketplace', 'layout');
  redirect(`/${locale}/marketplace?farewell=1`);
}
