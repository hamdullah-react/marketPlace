/**
 * The rules of a review, in one file.
 *
 * Who may write one, how long they have, what a rating may be and how a name is
 * shortened for a public page. The form asks these questions to decide what to
 * render, the server action asks them again to decide what to accept, and the
 * account page asks them to build the "you can review these" list. Three
 * callers, one answer — a second copy of "may this person review" is how a
 * button appears for a deal the server then refuses.
 */

/** A showroom that never opens its requests must not be able to silence them. */
export const REVIEW_WAIT_HOURS = 48;

/** How long after a deal a buyer may still review it. */
export const REVIEW_WINDOW_DAYS = 180;

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const BODY_MAX = 1500;
export const REPLY_MAX = 1000;

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * The stage the showroom has to have moved a lead to before it counts as
 * acknowledged. `new` is "nobody has looked at it yet".
 */
const ACKNOWLEDGED = ['contacted', 'quoted', 'won', 'lost'];

/** Only a deal the showroom itself marked won carries the verified badge. */
export const isVerifiedDeal = (lead) => lead?.stage === 'won';

/**
 * May this buyer review this deal, and if not, why not.
 *
 * Returns a REASON rather than a boolean so the account page can say "you can
 * review this in 12 hours" instead of leaving a row out with no explanation.
 *
 * `blocked` codes, and what each one means:
 *   NO_LEAD    there is no request behind this at all
 *   TOO_SOON   sent less than REVIEW_WAIT_HOURS ago and not yet acknowledged
 *   TOO_LATE   the deal is older than REVIEW_WINDOW_DAYS
 *   REVIEWED   this deal already has a review
 */
export function reviewEligibility(lead, { now = Date.now(), reviewed = false } = {}) {
  if (!lead) return { ok: false, reason: 'NO_LEAD', availableAt: null };
  if (reviewed) return { ok: false, reason: 'REVIEWED', availableAt: null };

  const sent = Date.parse(lead.created_at ?? '');
  const age = Number.isFinite(sent) ? now - sent : 0;

  if (Number.isFinite(sent) && age > REVIEW_WINDOW_DAYS * DAY) {
    return { ok: false, reason: 'TOO_LATE', availableAt: null };
  }

  /* Acknowledged by the showroom — they replied, quoted, closed it either way.
     Something happened between these two people and the buyer may say what. */
  if (ACKNOWLEDGED.includes(lead.stage)) return { ok: true, reason: null, availableAt: null };

  /* Still `new`. Waiting is itself an experience worth rating, but not
     instantly: a buyer must not be able to send a request and one-star a
     showroom that has had no chance to pick up the phone. */
  if (age >= REVIEW_WAIT_HOURS * HOUR) return { ok: true, reason: null, availableAt: null };

  return {
    ok: false,
    reason: 'TOO_SOON',
    availableAt: Number.isFinite(sent) ? new Date(sent + REVIEW_WAIT_HOURS * HOUR).toISOString() : null,
  };
}

/** 1–5, or null when it is not a rating at all. */
export function normalizeRating(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= RATING_MIN && n <= RATING_MAX ? n : null;
}

/**
 * "Abdul Wahid" → "Abdul W."
 *
 * A review is public and a full name beside a city and a car is more of a
 * person than a buyer signed up to publish. The first name is enough to read
 * like a human wrote it; the surname is cut to an initial.
 */
export function shortName(full, fallback = 'A buyer') {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

/** The 5→1 histogram, an average and how many are still unanswered. */
export function summarize(rows) {
  const buckets = [0, 0, 0, 0, 0]; // [0] is five stars, so bars read top-down
  let sum = 0;
  let unanswered = 0;

  for (const row of rows ?? []) {
    const rating = normalizeRating(row.rating);
    if (!rating) continue;
    buckets[RATING_MAX - rating] += 1;
    sum += rating;
    if (!row.vendor_reply) unanswered += 1;
  }

  const total = buckets.reduce((a, b) => a + b, 0);
  return {
    total,
    average: total ? sum / total : 0,
    buckets,
    unanswered,
    /* The share who would recommend — 4 and 5 stars. A single average hides
       the difference between "everyone thought it was fine" and "half loved it,
       half were furious", which is the more useful thing to know. */
    positive: total ? Math.round(((buckets[0] + buckets[1]) / total) * 100) : 0,
  };
}
