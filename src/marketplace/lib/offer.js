/**
 * Seller offers — deciding whether one is running, and what it costs.
 *
 * The whole feature turns on one question asked at READ time: is this offer
 * live right now? Nothing schedules anything (schema.sql §25 explains why at
 * length), so this file is the clock for the entire feature — the seller
 * dashboard, the card, the listing page and the price a buyer is quoted all
 * come through here.
 *
 * Pure, and deliberately takes `now` as an argument. A price that depends on
 * the wall clock is untestable otherwise, and this is the code that decides
 * what a customer pays.
 */

/**
 * Is this offer live at `now`?
 *
 * Three independent gates, and all three matter:
 *
 *   active     the seller's off switch. Separate from the dates so "stop it
 *              now" does not mean editing a timestamp and guessing a timezone.
 *   starts_at  null means "already started". A scheduled offer must not leak
 *              before its date — the same comparison covers both ends, so it
 *              cannot.
 *   ends_at    null means "until I turn it off". Exclusive: an offer ending at
 *              midnight is over AT midnight, not a millisecond after.
 */
export function isOfferLive(offer, now = Date.now()) {
  if (!offer || offer.active === false) return false;

  const at = now instanceof Date ? now.getTime() : Number(now);

  if (offer.starts_at) {
    const starts = new Date(offer.starts_at).getTime();
    // An unparseable date is treated as NOT started. The alternative is
    // discounting a car because a timestamp was malformed.
    if (!Number.isFinite(starts) || starts > at) return false;
  }

  if (offer.ends_at) {
    const ends = new Date(offer.ends_at).getTime();
    if (!Number.isFinite(ends) || ends <= at) return false;
  }

  return true;
}

/**
 * The one live offer on a listing, or null.
 *
 * §25's exclusion constraint means at most one CAN be live at a time, so this
 * does not choose between candidates — it finds the one. It still scans rather
 * than taking [0], because the rows arrive with the listing and include the
 * scheduled and the finished ones.
 */
export function findLiveOffer(offers, now = Date.now()) {
  if (!Array.isArray(offers)) return null;
  return offers.find((o) => isOfferLive(o, now)) ?? null;
}

/**
 * What the car costs while the offer runs.
 *
 * Returns null when the offer does not actually lower the price. A "discount"
 * that leaves the price the same, or pushes it up, is a mistake somewhere —
 * showing it as an offer would be advertising a saving that is not there.
 */
export function discountedPrice(price, offer) {
  const base = Number(price);
  const value = Number(offer?.discount_value);

  if (!Number.isFinite(base) || !Number.isFinite(value) || value <= 0) return null;

  const raw = offer.discount_type === 'amount' ? base - value : base - (base * value) / 100;

  // Never below zero: a 120% discount, or an amount larger than the car, is a
  // typo — and a negative price would flow into the lead and the order.
  const floored = Math.max(0, raw);

  // Two places, because the column is numeric(12,2). Rounding at the last
  // moment keeps 33.333% off a whole number from drifting.
  const final = Math.round(floored * 100) / 100;

  return final < base ? final : null;
}

/**
 * The same discount, applied to a price that is not the listing's.
 *
 * A colour can carry its own price (schema.sql §31), and an offer discounts
 * whatever is being bought — so a car on 10% off is 10% off in pearl white too,
 * from pearl white's higher base.
 *
 * Delegates to discountedPrice rather than repeating the arithmetic: the zero
 * floor and the two-decimal rounding are the parts that must not drift between
 * two copies, and a second implementation in a client component is exactly how
 * a buyer ends up seeing a different number from the one the server computed.
 *
 * Takes the SHAPED offer (discountType / discountValue), which is what reaches
 * the browser — shapeOffer has already renamed the raw columns by then.
 */
export function priceWithOffer(base, shaped) {
  if (!shaped) return null;
  return discountedPrice(base, {
    discount_type: shaped.discountType,
    discount_value: shaped.discountValue,
  });
}

/**
 * Everything the UI needs about a running offer, in one shape.
 *
 * `locale` is not used for money here on purpose — formatting lives in
 * listing.js beside every other price, so a card cannot end up with an offer
 * price formatted one way and the ordinary price another.
 */
export function shapeOffer(offer, price, now = Date.now()) {
  if (!isOfferLive(offer, now)) return null;

  const final = discountedPrice(price, offer);
  if (final == null) return null;

  const base = Number(price);
  const saving = Math.round((base - final) * 100) / 100;

  return {
    id: offer.id,
    label: offer.label ?? null,
    discountType: offer.discount_type,
    discountValue: Number(offer.discount_value),
    price: final,
    was: base,
    saving,
    // Rounded, and from the ACTUAL saving rather than the entered percentage —
    // a fixed-amount offer has a percentage too, and a percentage offer that
    // hit the zero floor no longer matches the number the seller typed.
    percent: base > 0 ? Math.round((saving / base) * 100) : 0,
    startsAt: offer.starts_at ?? null,
    endsAt: offer.ends_at ?? null,
  };
}

/**
 * How a seller's own offer is doing, for the dashboard list.
 *
 * A seller needs to tell "not started yet" from "over" from "I switched it
 * off", and those are three different rows that all fail isOfferLive().
 */
export function offerStatus(offer, now = Date.now()) {
  if (!offer) return 'ended';

  const at = now instanceof Date ? now.getTime() : Number(now);

  if (offer.active === false) return 'paused';

  if (offer.ends_at && new Date(offer.ends_at).getTime() <= at) return 'ended';
  if (offer.starts_at && new Date(offer.starts_at).getTime() > at) return 'scheduled';

  return 'running';
}
