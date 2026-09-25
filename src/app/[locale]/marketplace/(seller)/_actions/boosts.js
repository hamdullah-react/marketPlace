'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { sendBoostRequestEmail } from '@/marketplace/auth/mailer';
import { isAllowedPhone } from '@/marketplace/lib/phone';
import { getSiteSettings, getSiteLanguages } from '@/marketplace/db/queries/site';
import { SITE_URL } from '@/marketplace/lib/sitePages';
import { vendorForAction } from '@/marketplace/auth/session';
import { getBoostPlans } from '@/marketplace/db/queries/boosts';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { recordNotification } from '@/marketplace/db/queries/notifications';
import { notifyAdmins } from '@/marketplace/lib/realtime';

/**
 * A seller asking for one of their cars to be featured.
 *
 * The request is all a seller can do. Featuring itself — is_featured and
 * featured_until on the listing — is written only by an admin approving it
 * (admin/_actions/boosts.js), and the listings_protect_promotion trigger
 * refuses those columns to anyone else.
 */

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

/**
 * Emails the platform team about a new request.
 *
 * To the contact email in Admin → Settings; when that is empty, to every admin
 * account, so an unconfigured site still hears about it. Never throws: it runs
 * after the response, and a mail server problem is logged, not shown to a
 * seller whose request has already been saved.
 */
async function emailBoostRequest(db, r) {
  try {
    const [site, languages] = await Promise.all([getSiteSettings(), getSiteLanguages()]);

    let to = site.contactEmail ? [site.contactEmail] : [];
    if (!to.length) {
      const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin');
      const emails = await Promise.all(
        (admins ?? []).map((a) =>
          db.auth.admin.getUserById(a.id).then((res) => res.data?.user?.email ?? null).catch(() => null)
        )
      );
      to = emails.filter(Boolean);
    }
    if (!to.length) {
      console.warn('[boosts] No one to email about a new request. Add a contact email in Admin → Settings.');
      return;
    }

    const { data: vendor } = await db.from('vendors').select('name').eq('id', r.vendorId).maybeSingle();

    await sendBoostRequestEmail({
      to: to.join(', '),
      request: {
        carName: r.carName,
        vendorName: vendor?.name ?? null,
        days: r.days,
        price: r.price,
        note: r.note,
        phone: r.phone,
        email: r.email,
        adminUrl: `${SITE_URL}/${languages.defaultLocale ?? 'ar'}/marketplace/admin/content/featured`,
      },
    });
  } catch (err) {
    console.error('[boosts] Request email not sent:', err.message);
  }
}

const refresh = () => {
  revalidatePath('/[locale]/marketplace/seller/listings', 'page');
  revalidatePath('/[locale]/marketplace/seller/promotions', 'page');
  revalidatePath('/[locale]/marketplace/admin', 'layout');
};

export async function requestBoost(prevState, formData) {
  const { viewer, vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const listingId = str(formData, 'listingId');
  const days = Number(str(formData, 'days'));
  const note = str(formData, 'note').slice(0, 300) || null;

  /* How the platform team reaches the seller about payment. Required, and held
     to the same rules as Settings → Contact, so a request cannot arrive with a
     number nobody can call. */
  const contactPhone = str(formData, 'contactPhone').replace(/[\s-]/g, '');
  const contactEmail = str(formData, 'contactEmail').slice(0, 254);

  if (!listingId) return bad('NOT_FOUND');
  if (!Number.isInteger(days) || days < 1) return bad('BOOST_DAYS');
  // The countries Admin → Settings → Contact accepts, not a Saudi-only rule.
  const { phoneCountries } = await getSiteSettings().catch(() => ({ phoneCountries: ['SA'] }));

  if (!contactPhone) return bad('PHONE_REQUIRED', { field: 'contactPhone' });
  if (!isAllowedPhone(contactPhone, phoneCountries)) return bad('PHONE_INVALID', { field: 'contactPhone' });
  if (!contactEmail) return bad('EMAIL_REQUIRED', { field: 'contactEmail' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return bad('EMAIL_INVALID', { field: 'contactEmail' });

  try {
    const db = getMarketplaceDb();

    const { data: listing, error: readError } = await db
      .from('listings')
      .select('id, state, name')
      .eq('id', listingId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (readError) return bad('SAVE_FAILED', { detail: readError.message });
    if (!listing) return bad('NOT_FOUND');
    if (listing.state !== 'live') return bad('BOOST_NOT_LIVE');

    // Only a plan an admin has created and switched on can be requested, and
    // its price is SNAPSHOTTED on the request — editing or deleting the plan
    // later must not change what an existing request was quoted.
    const { ready, plans } = await getBoostPlans({ activeOnly: true });
    if (!ready) return bad('BOOST_SETUP');
    const plan = plans.find((p) => p.days === days);
    if (!plan) return bad(plans.length ? 'BOOST_DAYS' : 'BOOST_NO_PLANS');

    const request = {
      listing_id: listingId,
      vendor_id: vendorId,
      days,
      note,
      requested_by: viewer?.userId ?? null,
      price: plan.price,
    };

    let { error } = await db
      .from('listing_boosts')
      .insert({ ...request, contact_phone: contactPhone, contact_email: contactEmail });

    // 42703: the contact columns are not on this database yet (schema.sql,
    // listing_boosts contact_phone / contact_email). The request still goes in
    // without them rather than every seller being refused until the SQL runs.
    if (error?.code === '42703') {
      ({ error } = await db.from('listing_boosts').insert(request));
    }

    if (error) {
      if (isMissingSchema(error)) return bad('BOOST_SETUP');
      // listing_boosts_one_pending: a request is already waiting.
      if (error.code === '23505') return bad('BOOST_PENDING');
      return bad('SAVE_FAILED', { detail: error.message });
    }

    refresh();
    // Every open admin panel chimes and shows the new request.
    notifyAdmins('boost_new', { listingId });

    await recordNotification({
      audience: 'admin',
      kind: 'boost_requested',
      /* The car only. The showroom's own name is not in scope here and the
         admin's bell links straight to the queue, where it is on the row. */
      data: { car: listing.name },
      href: '/marketplace/admin/content/featured',
    });
    // …and the team gets an email, sent after the response so it can never
    // slow down or fail the seller's request.
    after(() =>
      emailBoostRequest(db, {
        vendorId,
        carName: listing.name,
        days,
        price: plan.price,
        note,
        phone: contactPhone,
        email: contactEmail,
      })
    );
    return ok({ requested: days });
  } catch (err) {
    return bad('SAVE_FAILED', { detail: err.message });
  }
}

export async function cancelBoostRequest(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const boostId = str(formData, 'boostId');
  if (!boostId) return bad('NOT_FOUND');

  const { data, error } = await getMarketplaceDb()
    .from('listing_boosts')
    .update({ state: 'cancelled' })
    .eq('id', boostId)
    .eq('vendor_id', vendorId)
    .eq('state', 'pending')
    .select('id');

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'SAVE_FAILED', { detail: error.message });
  if (!data?.length) return bad('BOOST_NOT_PENDING');

  refresh();
  notifyAdmins('boost_changed', { id: boostId });
  return ok({ cancelled: boostId });
}

/**
 * Removes one of the seller's own requests from their list — a waiting one, or
 * one that is rejected, cancelled or over.
 *
 * NOT a running boost: that is a live placement on the marketplace, and the
 * record of it is what the platform team ends, not something to erase mid-run.
 */
export async function deleteBoostRequest(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const boostId = str(formData, 'boostId');
  if (!boostId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: boost, error } = await db
    .from('listing_boosts')
    .select('id, state, ends_at')
    .eq('id', boostId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (error) return bad(isMissingSchema(error) ? 'BOOST_SETUP' : 'DELETE_FAILED', { detail: error.message });
  if (!boost) return bad('NOT_FOUND');

  if (boost.state === 'approved' && boost.ends_at && Date.parse(boost.ends_at) > Date.now()) {
    return bad('BOOST_RUNNING');
  }

  const { error: deleteError } = await db
    .from('listing_boosts')
    .delete()
    .eq('id', boostId)
    .eq('vendor_id', vendorId);

  if (deleteError) return bad('DELETE_FAILED', { detail: deleteError.message });

  refresh();
  // A waiting request vanishing changes every admin's queue.
  if (boost.state === 'pending') notifyAdmins('boost_changed', { id: boostId });
  return ok({ deleted: boostId });
}
