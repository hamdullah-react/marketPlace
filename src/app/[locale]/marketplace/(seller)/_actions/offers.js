'use server';

/**
 * A seller's offer on one of their cars.
 *
 * Four actions and no more: create or edit one, pause it, switch it back on,
 * delete it. There is no approval step and no platform-wide sale — a showroom
 * discounts its own car and that is the whole feature.
 *
 * ── Scoping ─────────────────────────────────────────────────────────────────
 *
 * Same rule as the CRM: every write is filtered by vendor_id AS WELL AS id,
 * and the vendor_id comes from vendorForAction(), never from the form. An id on
 * its own is how one showroom discounts another's cars by editing a POST body.
 *
 * The listing is checked the same way before an offer is written against it,
 * because listing_id DOES arrive from the form — it is the car the seller
 * picked — and a car that is not theirs must be refused rather than trusted.
 *
 * ── The price is not written here ───────────────────────────────────────────
 *
 * Nothing in this file touches listings.price. An offer is a row that the read
 * layer applies while it is running (schema.sql §25, src/marketplace/lib/
 * offer.js), so ending one is not a repair job — it just stops applying.
 */

import { revalidatePath } from 'next/cache';
import { parseInstant } from '@/marketplace/lib/datetime';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction, getUser } from '@/marketplace/auth/session';
import { discountedPrice } from '@/marketplace/lib/offer';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, errors: {}, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, errors: {}, token: stamp(), ...extra });

function refresh() {
  revalidatePath('/[locale]/marketplace/seller/offers', 'page');
  // The car itself renders the price, so both the grid and the detail page are
  // stale the moment an offer starts or stops.
  revalidatePath('/[locale]/marketplace/listing/[slug]', 'page');
  revalidatePath('/[locale]/marketplace/cars', 'page');
}

/**
 * The start or end of an offer, as an instant.
 *
 * ── This used to shift every offer by the seller's own offset ───────────────
 *
 * The old version took the picker's zone-less "2026-06-15T09:00" and called
 * new Date() on it, reasoning that JS reads a bare wall clock as local time,
 * "which is what the seller meant". It does — as local to WHOEVER PARSES IT,
 * and this is a server action. On a laptop in Riyadh the server and the seller
 * shared a zone and it was right; on Vercel the server is UTC, so an offer a
 * seller set to start at 09:00 started at 12:00 their time, and one set to end
 * at 23:59 on the last day of a campaign ran three hours into the next.
 *
 * Nothing reported it, because an offer that runs at the wrong hour still
 * looks like an offer.
 *
 * DateTimePicker now converts before submitting (lib/datetime.js), so what
 * arrives is an instant. A value with no zone is refused rather than guessed
 * at — see parseInstant.
 */
function when(value) {
  const date = parseInstant(value);
  return date ? date.toISOString() : null;
}

/**
 * Create or update. One action, because the form is the same either way and
 * two nearly-identical functions is how they drift apart.
 */
export async function saveOffer(prevState, formData) {
  const vendor = await vendorForAction();
  if (!vendor?.vendorId) return bad('NOT_A_SELLER');

  const db = getMarketplaceDb();
  const id = str(formData, 'id');
  const listingId = str(formData, 'listingId');
  const discountType = str(formData, 'discountType') === 'amount' ? 'amount' : 'percent';
  const rawValue = str(formData, 'discountValue');
  const offerNameId = str(formData, 'offerNameId');
  const startsAt = when(str(formData, 'startsAt'));
  const endsAt = when(str(formData, 'endsAt'));

  const errors = {};

  if (!listingId) errors.listingId = 'REQUIRED';

  const value = Number(rawValue);
  if (!rawValue) errors.discountValue = 'REQUIRED';
  else if (!Number.isFinite(value) || value <= 0) errors.discountValue = 'MUST_BE_POSITIVE';
  else if (discountType === 'percent' && value >= 100) errors.discountValue = 'PERCENT_TOO_BIG';

  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    errors.endsAt = 'END_BEFORE_START';
  }

  // An offer that has already finished cannot be created. It is always a
  // mistake, and it would sit in the list looking like it had failed.
  if (endsAt && new Date(endsAt).getTime() <= Date.now()) errors.endsAt = 'ALREADY_PAST';

  if (Object.keys(errors).length) return bad('CHECK_FIELDS', { errors });

  /**
   * The car must be THIS seller's, and it must still exist.
   *
   * Selecting the price at the same time so the discount can be checked
   * against the actual car rather than against a number from the form.
   */
  const { data: listing, error: listingError } = await db
    .from('listings')
    .select('id, price, name')
    .eq('id', listingId)
    .eq('vendor_id', vendor.vendorId)
    .maybeSingle();

  if (listingError) return bad('SAVE_FAILED');
  if (!listing) return bad('CAR_NOT_FOUND');

  // A discount that does not lower the price is not an offer. Caught here so
  // the seller is told, rather than saving a row the read layer will ignore
  // and leaving them to wonder why nothing changed on the car.
  const preview = discountedPrice(listing.price, {
    discount_type: discountType,
    discount_value: value,
  });
  if (preview == null) {
    return bad('CHECK_FIELDS', { errors: { discountValue: 'NO_SAVING' } });
  }

  /**
   * The name is a catalog row, and BOTH halves are stored.
   *
   * `offer_name_id` is the grouping key — it is what makes "every Ramadan
   * offer" a query rather than a guess. `label` is the text as it read when
   * the seller chose it, so renaming the catalog row next year cannot rewrite
   * what a showroom advertised this year, and deleting it (ON DELETE SET NULL)
   * leaves the offer still showing its name.
   *
   * Read from the database rather than from the form: the form could send any
   * text alongside any id, and the snapshot has to be the row that was really
   * picked.
   */
  let label = null;
  let nameId = null;

  if (offerNameId) {
    const { data: chosen } = await db
      .from('offer_names')
      .select('id, name')
      .eq('id', offerNameId)
      .eq('active', true)
      .maybeSingle();

    // A name that has been deleted or deactivated since the form loaded is not
    // an error worth stopping a price change for — the offer saves unnamed.
    if (chosen) {
      nameId = chosen.id;
      label = chosen.name ?? null;
    }
  }

  const row = {
    vendor_id: vendor.vendorId,
    listing_id: listing.id,
    offer_name_id: nameId,
    label,
    discount_type: discountType,
    discount_value: value,
    starts_at: startsAt,
    ends_at: endsAt,
  };

  /**
   * `active` is NOT in `row`, and that is the point.
   *
   * It used to be, set to true, which meant editing a PAUSED offer silently
   * turned it back on: a seller who stopped a discount, then corrected its end
   * date, would have put the car back on sale without being asked. Pausing is
   * its own action (setOfferActive) and only that action may change it.
   *
   * A new offer still starts on — the column defaults to true — so the insert
   * says so explicitly and the update says nothing at all.
   */
  const result = id
    ? await db.from('listing_offers').update(row).eq('id', id).eq('vendor_id', vendor.vendorId).select('id')
    : await db
        .from('listing_offers')
        .insert({ ...row, active: true, created_by: (await getUser())?.id ?? null })
        .select('id');

  if (result.error) {
    /**
     * 23P01 is the exclusion constraint: another offer already covers this car
     * for part of the same period (schema.sql §25). That is the one failure a
     * seller can actually fix, so it gets its own message instead of the
     * generic one.
     */
    if (result.error.code === '23P01') return bad('OVERLAPS');
    return bad('SAVE_FAILED');
  }

  if (id && !result.data?.length) return bad('NOT_FOUND');

  refresh();
  return ok({ id: result.data?.[0]?.id ?? id });
}

/**
 * Pause and resume, which is what a seller reaches for rather than editing a
 * date into the past to make something stop.
 */
export async function setOfferActive(prevState, formData) {
  const vendor = await vendorForAction();
  if (!vendor?.vendorId) return bad('NOT_A_SELLER');

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  const active = str(formData, 'active') === 'on' || str(formData, 'active') === 'true';

  const { data, error } = await getMarketplaceDb()
    .from('listing_offers')
    .update({ active })
    .eq('id', id)
    .eq('vendor_id', vendor.vendorId)
    .select('id');

  if (error) {
    // Resuming can collide with an offer created while this one was paused.
    if (error.code === '23P01') return bad('OVERLAPS');
    return bad('SAVE_FAILED');
  }
  if (!data?.length) return bad('NOT_FOUND');

  refresh();
  return ok({ id, active });
}

/**
 * Deleted outright, not soft-deleted.
 *
 * Unlike a lead (§21.3.1), an offer holds nothing that cannot be retyped in
 * fifteen seconds — no customer, no phone number, no history. A recycle bin
 * here would be ceremony around a row whose entire content is "10% until
 * Friday".
 */
export async function deleteOffer(prevState, formData) {
  const vendor = await vendorForAction();
  if (!vendor?.vendorId) return bad('NOT_A_SELLER');

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  const { data, error } = await getMarketplaceDb()
    .from('listing_offers')
    .delete()
    .eq('id', id)
    .eq('vendor_id', vendor.vendorId)
    .select('id');

  if (error) return bad('SAVE_FAILED');
  if (!data?.length) return bad('NOT_FOUND');

  refresh();
  return ok({ id });
}
