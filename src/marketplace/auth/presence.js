import 'server-only';
import { getMarketplaceDb } from '@/marketplace/db/client';

/**
 * Who is here, and where from — the two facts Admin → Customers could not
 * answer. See schema.sql §33 for why there is no logout time.
 *
 * ── Nothing here may ever break a page ──────────────────────────────────────
 *
 * Every function swallows its own errors and returns quietly. This is
 * bookkeeping for one admin screen; a person browsing cars must not see an
 * error, or wait a millisecond longer, because a presence stamp failed. The
 * callers run it through `after()`, so the response has already been sent by
 * the time any of it executes.
 *
 * The columns may also simply not exist yet — schema.sql §33 is run by hand —
 * so a 42703 ("column does not exist") is treated as "this feature is not
 * switched on here" rather than as a fault. The gallery and the session reader
 * both already do this; it is what lets code ship before SQL is run.
 */

/** Long enough that a reader clicking through ten cars writes once. */
const STAMP_EVERY_MS = 5 * 60 * 1000;

/** True when the column is missing, i.e. §33 has not been run on this database. */
const notInstalled = (error) => error?.code === '42703';

/**
 * Record that this person is here, at most once every few minutes.
 *
 * `seenAt` is whatever the caller already read — the session reads the profile
 * on every request anyway, so passing it back avoids a second round trip just
 * to find out whether a write is due.
 */
export async function touchPresence(userId, seenAt = null) {
  if (!userId) return;

  if (seenAt) {
    const age = Date.now() - new Date(seenAt).getTime();
    if (Number.isFinite(age) && age < STAMP_EVERY_MS) return;
  }

  try {
    const { error } = await getMarketplaceDb()
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId);

    if (error && !notInstalled(error)) {
      console.warn('[presence] could not stamp last_seen_at:', error.message);
    }
  } catch (err) {
    console.warn('[presence] could not stamp last_seen_at:', err.message);
  }
}

/**
 * The caller's IP, read from the proxy headers.
 *
 * Behind Coolify / nginx the socket address is the container's, so the real
 * address only exists in a forwarded header — the same reason the auth
 * callback has to rebuild its own public origin. x-forwarded-for is a CHAIN
 * ("client, proxy1, proxy2") and the client is the first entry.
 *
 * A header is caller-controlled, so this is only ever used for a support
 * question or a country label. It must never be used to decide access.
 */
export function clientIp(headers) {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || headers.get('cf-connecting-ip') || null;
}

/* A loopback or LAN address resolves to nothing, so it is not worth a request
   — this is every hit in local development. */
function isPrivate(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  const second = Number(ip.split('.')[1]);
  return ip.startsWith('172.') && second >= 16 && second <= 31;
}

/**
 * IP → ISO country code.
 *
 * ipapi.co is free for this volume and needs no key, which is why it is the
 * default rather than a bundled MaxMind database: a sign-in is not frequent
 * enough to justify shipping and updating a 60 MB file. Swap it by pointing
 * GEOIP_URL at anything that answers with the code in its body or as
 * `country`/`country_code` in JSON.
 *
 * Two seconds, and a failure is a null. Nobody's sign-in is delayed because a
 * third party is slow — and this runs after the response regardless.
 */
export async function lookupCountry(ip) {
  if (isPrivate(ip)) return null;

  const url = process.env.GEOIP_URL
    ? process.env.GEOIP_URL.replace('{ip}', encodeURIComponent(ip))
    : `https://ipapi.co/${encodeURIComponent(ip)}/country/`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2000),
      headers: { accept: 'text/plain, application/json' },
    });
    if (!res.ok) return null;

    const body = (await res.text()).trim();
    if (!body) return null;

    /* Plain two-letter body, or JSON from whatever was configured instead. */
    if (/^[A-Za-z]{2}$/.test(body)) return body.toUpperCase();
    try {
      const json = JSON.parse(body);
      const code = json.country_code || json.country || json.countryCode;
      return typeof code === 'string' && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null;
    } catch {
      return null;
    }
  } catch {
    /* Timed out, offline, rate-limited — all the same answer: we do not know. */
    return null;
  }
}

/**
 * Where this sign-in came from. Called once per sign-in, never per page view:
 * an address is looked up when it is new, not on every request.
 */
export async function recordSignInOrigin(userId, ip) {
  if (!userId || !ip) return;

  try {
    const db = getMarketplaceDb();

    /* Already seen from this address — keep the country we resolved before
       rather than spending another lookup on the same answer. */
    const { data: current, error: readError } = await db
      .from('profiles')
      .select('last_ip, last_country')
      .eq('id', userId)
      .maybeSingle();

    if (readError) {
      if (!notInstalled(readError)) console.warn('[presence] origin read:', readError.message);
      return;
    }

    const patch = { last_ip: ip, last_seen_at: new Date().toISOString() };
    if (current?.last_ip !== ip || !current?.last_country) {
      const country = await lookupCountry(ip);
      if (country) patch.last_country = country;
    }

    const { error } = await db.from('profiles').update(patch).eq('id', userId);
    if (error && !notInstalled(error)) console.warn('[presence] origin write:', error.message);
  } catch (err) {
    console.warn('[presence] origin:', err.message);
  }
}
