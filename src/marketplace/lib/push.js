import 'server-only';
import webpush from 'web-push';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { notificationText } from '@/marketplace/lib/notifications';

/**
 * Sending a notification to a device whose browser is closed.
 *
 * ── One sender, because there is already one recorder ───────────────────────
 *
 * Every notification in the app goes through recordNotification(), so this is
 * called from exactly there. Six events are wired today and the seventh will be
 * too, for free — which is the whole reason the record was built first.
 *
 * ── It never fails the thing it describes, and never blocks it ──────────────
 *
 * Same rule as the record itself: a push is a courtesy on top of an action that
 * has already succeeded. Worse here, because a push is an HTTP round trip to
 * Google, Apple or Mozilla, times however many devices — a seller's request
 * must not wait on that, and must certainly not fail on it.
 *
 * So the caller does not await this, and everything inside is caught.
 *
 * ── Language ────────────────────────────────────────────────────────────────
 *
 * The payload carries the finished sentence, because a service worker has no
 * session and cannot look anything up (see public/sw.js). Which language that
 * sentence is in is therefore decided HERE, at send time.
 *
 * It used to be hardcoded 'ar', with a comment calling that "the platform's own
 * default". It was not: the platform's default lives in
 * site_settings.default_locale, an admin sets it, and on this deployment it is
 * English — so every push arrived in Arabic on a dashboard whose every label was
 * English. A hardcoded language is a setting nobody can change.
 *
 * Resolved per RECIPIENT, in the order that knows most about them:
 *
 *   a showroom   its own Store settings → the platform's → Arabic
 *   the platform the platform's → Arabic
 *
 * 'both' is an authoring choice, not a reading one — a notification is one
 * sentence and cannot be in two languages — so it falls through to the next
 * answer rather than being treated as a language.
 */

let configured = null;

/** Reads the keys once. Absent keys mean push is simply off, not broken. */
function ready() {
  if (configured !== null) return configured;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys are not set — web push is off.');
    configured = false;
    return configured;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.warn('[push] VAPID keys rejected:', err?.message ?? err);
    configured = false;
  }

  return configured;
}

/** 'ar' or 'en' only — 'both' and anything unrecognised are not a language. */
const oneLanguage = (value) => (value === 'ar' || value === 'en' ? value : null);

/**
 * Which language this notification should be written in.
 *
 * Two small reads, on a path that already runs after the response and is
 * allowed to fail quietly — a push in the wrong language is better than no
 * push, so every step falls through rather than throwing.
 */
async function readLocale(db, audience, vendorId, userId = null) {
  let platform = null;

  try {
    const { data } = await db
      .from('site_settings')
      .select('default_locale')
      .eq('id', true)
      .maybeSingle();
    platform = oneLanguage(data?.default_locale);
  } catch {
    // The column arrives with the WEBSITE CONTENT section; without it the
    // platform simply has no stated preference.
  }

  if (audience === 'buyer' && userId) {
    try {
      const { data } = await db.from('profiles').select('locale').eq('id', userId).maybeSingle();
      // A buyer is one person and their profile says which language they chose
      // when they signed up — the most specific answer there is.
      const own = oneLanguage(data?.locale);
      if (own) return own;
    } catch {
      // No profile row yet. The platform's answer still stands.
    }
  }

  if (audience === 'vendor' && vendorId) {
    try {
      const { data } = await db.from('vendors').select('settings').eq('id', vendorId).maybeSingle();
      const own = oneLanguage(data?.settings?.default_locale);
      // The showroom's own choice outranks the platform's — it is their staff
      // reading it.
      if (own) return own;
    } catch {
      // No settings, or an old shape. The platform's answer still stands.
    }
  }

  return platform ?? 'ar';
}

/**
 * Push one recorded notification to every device of its audience.
 *
 * @param audience 'vendor' | 'admin'
 * @param vendorId required for 'vendor'
 * @param kind     the same kind the row stores
 * @param data     the same snapshot the row stores
 * @param href     locale-relative, e.g. /marketplace/seller/leads
 */
export async function pushNotification({
  audience,
  vendorId = null,
  userId = null,
  kind,
  data = {},
  href = null,
}) {
  if (!ready()) return { ok: false, error: 'PUSH_OFF' };

  const db = getMarketplaceDb();

  let query = db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('audience', audience);

  /* A showroom's devices belong to the showroom; a buyer's belong to the
     person. Addressing one by the other's key would push a buyer's message to
     a showroom's desk. */
  if (audience === 'vendor') query = query.eq('vendor_id', vendorId);
  else if (audience === 'buyer') query = query.eq('user_id', userId);

  const { data: devices, error } = await query;

  if (error) {
    // 42P01 — the WEB PUSH section has not been run. Everything else works.
    console.warn('[push] no subscriptions read:', error.message);
    return { ok: false, error: 'SAVE_FAILED' };
  }
  if (!devices?.length) return { ok: true, sent: 0 };

  const locale = await readLocale(db, audience, vendorId, userId);
  const { title, body } = notificationText(kind, data, { locale });

  const payload = JSON.stringify({
    title,
    body,
    kind,
    url: href ? `/${locale}${href}` : '/',
    // So the phone lays the text out the right way round.
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    lang: locale,
  });

  const dead = [];

  const results = await Promise.allSettled(
    devices.map((d) =>
      webpush
        .sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          payload,
          { TTL: 60 * 60 * 24 }
        )
        .catch((err) => {
          /* 404 and 410 are the push service saying this address is gone for
             good — uninstalled, permission revoked, site data cleared. Any
             other code (429, 500, a timeout) is temporary and the row stays:
             deleting on a transient failure would silently unsubscribe
             somebody because Google had a bad minute. */
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            dead.push(d.endpoint);
            return null;
          }
          throw err;
        })
    )
  );

  if (dead.length) {
    await db
      .from('push_subscriptions')
      .delete()
      .in('endpoint', dead)
      .then(
        () => {},
        (err) => console.warn('[push] could not remove dead endpoints:', err?.message ?? err)
      );
  }

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) console.warn(`[push] ${failed}/${devices.length} sends failed.`);

  return { ok: true, sent: devices.length - failed - dead.length, removed: dead.length };
}
