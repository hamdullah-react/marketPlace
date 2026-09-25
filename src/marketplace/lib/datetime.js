/**
 * Moving a date between a form and a server action without losing an hour.
 *
 * ── The bug this exists to end ──────────────────────────────────────────────
 *
 * `<input type="datetime-local">` and the dashboard's own DateTimePicker both
 * produce a WALL CLOCK with no zone: "2026-09-25T09:52". That string is not an
 * instant. It is an instant only once you know whose clock it was read from.
 *
 * Three server actions used to call `new Date(thatString)` and reason that JS
 * parses a zone-less string as local time, "which is what the user meant". The
 * first half is true and the second does not follow: in a SERVER ACTION the
 * local zone is the SERVER's. In development that is the developer's laptop, so
 * it agrees with the browser and everything looks right. On Vercel it is UTC.
 *
 * For an admin in Pakistan (UTC+5) recording a payment at 09:52, the server
 * read 09:52 UTC — five hours in the future — and refused the payment with "a
 * payment cannot be dated in the future". The same shift silently moved every
 * scheduled offer and every follow-up reminder by the viewer's offset, in the
 * direction nobody would notice until a discount started five hours late.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * The conversion happens in the BROWSER, which is the only place that knows
 * both the wall clock and the zone it was read in. The wire carries an
 * INSTANT — an ISO 8601 string with an offset — and the server does no
 * interpreting at all.
 *
 *   form input   "2026-09-25T09:52"      wall clock, browser's zone
 *   toInstant()  "2026-09-25T04:52:00Z"  an instant, unambiguous anywhere
 *
 * Nothing here is about formatting for a reader. Displaying a stored instant in
 * the viewer's language is `toLocaleDateString` at the point of render, which
 * the pages already do.
 */

/** Two digits, the only padding any of this needs. */
const pad = (n) => String(n).padStart(2, '0');

/**
 * A Date (or an ISO string) as the value a datetime-local input wants:
 * "YYYY-MM-DDTHH:mm", in the zone of whoever is looking at the screen.
 *
 * Browser-side. On the server it would produce the server's wall clock, which
 * is the whole mistake this file documents — so it returns '' for an
 * unparseable value rather than inventing one.
 */
export function toLocalInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value ?? '');
  if (!Number.isFinite(date.getTime())) return '';

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Right now, as that same input value. */
export const localNow = () => toLocalInput(new Date());

/**
 * A wall clock from a form → an instant to put on the wire.
 *
 * Browser-side, deliberately: `new Date("2026-09-25T09:52")` resolves against
 * the zone of the runtime doing the parsing, and in a browser that is the
 * viewer's own — which is exactly what they meant by the number they typed.
 *
 * A value that already carries a zone is passed through as an instant rather
 * than reinterpreted, so calling this twice cannot shift anything.
 *
 * Returns '' for an empty or unparseable value; an empty field is "not set",
 * not an error.
 */
export function toInstant(localValue) {
  const raw = String(localValue ?? '').trim();
  if (!raw) return '';

  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

/**
 * Server side: the instant a form sent, or null.
 *
 * ── Why a zone-less value is refused ────────────────────────────────────────
 *
 * Every first-party form now sends an instant. A value arriving here without a
 * zone is a wall clock whose owner is unknown, and there are only three things
 * to do with it: guess UTC, guess the server's zone, or say so. The first two
 * are the bug — each is right for one part of the world and silently wrong by
 * several hours for everyone else, and "silently wrong by several hours" is
 * how a payment lands in the wrong month.
 *
 * So it is refused, and the caller reports an invalid date. That is a loud,
 * fixable failure rather than a quiet, permanent one.
 */
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseInstant(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!HAS_ZONE.test(raw)) return null;

  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * How far ahead of the server a client's clock may be before a date counts as
 * "in the future".
 *
 * Five minutes, not zero. Even with instants on the wire, the moment being
 * recorded comes from a device whose clock is its own — a phone a few minutes
 * fast would otherwise be told its payment is dated in the future, which is
 * both true and useless. Five minutes absorbs ordinary skew and still catches
 * the mistake this guard is for: a date typed as next week or next month.
 */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Is this instant meaningfully ahead of now? */
export const isFuture = (date, now = Date.now()) =>
  date instanceof Date && date.getTime() > now + CLOCK_SKEW_MS;
