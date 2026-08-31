'use server';

/**
 * Applying to sell.
 *
 * The one write in the marketplace that a plain buyer is allowed to make
 * against the vendors table, and the doorway into the seller dashboard:
 *
 *   signed-in buyer → this action → vendors row (state 'approved')
 *                                 + vendor_members row (role 'owner')
 *                   → the dashboard opens immediately
 *
 * The membership row is what grants access; `state` only gates it. That split
 * is deliberate: revoking one person's access is a single delete that leaves
 * the showroom and its cars alone.
 *
 * ── Approved on submission, not after review ────────────────────────────────
 *
 * A queue between filling in a form and being able to use the product loses
 * sellers who would have listed a car that evening. So the showroom opens
 * straight away.
 *
 * What is NOT granted is `verified`. That stays false until a human has
 * actually checked the CR number, and it is what the badge on a showroom page
 * means. Approval says "you may list cars"; verification says "we checked who
 * you are" — collapsing the two would make the badge worthless, and the badge
 * is the part buyers rely on.
 *
 * Staff keep every lever: suspending a showroom takes effect on the next query,
 * because my_vendor_ids() filters on state rather than reading a cached role.
 *
 * ── What the applicant cannot set ───────────────────────────────────────────
 *
 * `state`, `verified` and `owner_user_id` are all forced here and none is read
 * from the form. `commission_rate` is never touched at all. Those four are the
 * platform's opinion of a seller, not the seller's own.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getViewer } from '@/marketplace/auth/session';
import { slugify } from '@/marketplace/lib/slug';
import { ensureVendorBucket } from '@/marketplace/media/bucket';
import { i18n } from '@/marketplace/lib/listing';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const bad = (error, errors = {}) => ({ ok: false, error, errors, token: stamp() });

/**
 * A slug nobody else has.
 *
 * vendors.slug is unique, and two showrooms called "Riyadh Motors" is an
 * ordinary thing rather than an error to show an applicant. So a numeric
 * suffix is added until one is free, and the loop is bounded — a runaway here
 * would be an unkillable request rather than a failed application.
 */
async function freeSlug(db, base) {
  const stem = slugify(base) || 'showroom';

  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? stem : `${stem}-${n + 1}`;
    const { data } = await db.from('vendors').select('id').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
  }

  // Fifty collisions means something is wrong with the stem, not with the
  // name — fall back to something that cannot collide.
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function applyToSell(prevState, formData) {
  const viewer = await getViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const locale = str(formData, 'locale') || 'ar';

  const nameAr = str(formData, 'nameAr');
  const nameEn = str(formData, 'nameEn');
  const city = str(formData, 'city');
  const contactEmail = str(formData, 'contactEmail') || viewer.email || '';
  const contactPhone = str(formData, 'contactPhone');
  const crNumber = str(formData, 'crNumber');
  const vatNumber = str(formData, 'vatNumber');
  const bioAr = str(formData, 'bioAr');
  const bioEn = str(formData, 'bioEn');

  const errors = {};
  // One name is enough to apply — a showroom that trades only in Arabic should
  // not have to invent an English one to get through the form. i18n() mirrors
  // whichever was given into the other.
  if (!nameAr && !nameEn) errors.nameAr = 'NAME_REQUIRED';
  if (!city) errors.city = 'CITY_REQUIRED';
  if (!contactPhone) errors.contactPhone = 'PHONE_REQUIRED';
  if (Object.keys(errors).length) return bad('VALIDATION', errors);

  const db = getMarketplaceDb();

  // Already has a showroom. Not an error to correct — send them to it, rather
  // than letting a second submission create a duplicate they did not want.
  const { data: existing } = await db
    .from('vendor_members')
    .select('vendor_id')
    .eq('user_id', viewer.userId)
    .limit(1)
    .maybeSingle();

  if (existing) redirect(`/${locale}/marketplace/sell/apply/status`);

  const { data: vendor, error } = await db
    .from('vendors')
    .insert({
      slug: await freeSlug(db, nameEn || nameAr),
      name: i18n(nameAr, nameEn),
      bio: bioAr || bioEn ? i18n(bioAr, bioEn) : null,
      // Forced, not read. See the note at the top of the file.
      state: 'approved',
      approved_at: new Date().toISOString(),
      // Never from the form, and never true here — a seller cannot mark
      // themselves verified by filling in a field.
      verified: false,
      owner_user_id: viewer.userId,
      city,
      contact_email: contactEmail || null,
      contact_phone: contactPhone,
      cr_number: crNumber || null,
      vat_number: vatNumber || null,
    })
    .select('id')
    .single();

  if (error) return bad('APPLY_FAILED', {});

  /**
   * The membership, written second.
   *
   * If it fails the vendor row exists with nobody attached, which staff can see
   * and fix — the other order would grant a membership to a showroom that does
   * not exist. Neither is good; this one is recoverable.
   */
  const { error: memberError } = await db
    .from('vendor_members')
    .insert({ vendor_id: vendor.id, user_id: viewer.userId, role: 'owner' });

  if (memberError) return bad('APPLY_FAILED', {});

  /**
   * The showroom's storage, made with the showroom.
   *
   * Deliberately NOT fatal. A seller whose registration succeeded and whose
   * bucket did not is a seller with a dashboard and no photo uploads — bad, but
   * recoverable, and the upload route calls ensureVendorBucket() again on first
   * use. Failing the registration here would instead leave them with a vendors
   * row, a membership, and an error telling them to start over.
   */
  try {
    await ensureVendorBucket(db, vendor.id);
  } catch (cause) {
    console.error('[marketplace] bucket not created for', vendor.id, cause?.message ?? cause);
  }

  // The header gains the seller links and getVendorOptions() starts returning
  // the new showroom; neither happens on its own because both are rendered in
  // the layout.
  revalidatePath('/[locale]/marketplace', 'layout');

  // Straight into the dashboard. The status page still exists for a showroom
  // that is later suspended or rejected — it is just no longer the first thing
  // a new seller sees.
  redirect(`/${locale}/marketplace/seller`);
}
