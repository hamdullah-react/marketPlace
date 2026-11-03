import 'server-only';
import { after } from 'next/server';
import { headers } from 'next/headers';
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
export async function touchPresence(userId, seenAt = null, origin = null) {
  if (!userId) return;

  if (seenAt) {
    const age = Date.now() - new Date(seenAt).getTime();
    if (Number.isFinite(age) && age < STAMP_EVERY_MS) return;
  }

  try {
    const patch = { last_seen_at: new Date().toISOString() };

    /**
     * ── Fill a MISSING country here, not only at sign-in ───────────────────
     *
     * recordSignInOrigin() is the only other thing that writes last_country,
     * and it runs exactly once: when somebody signs in. That left a hole big
     * enough to swallow the whole feature — everybody who was ALREADY signed
     * in when this shipped keeps a live session, never signs in again, and so
     * never gets a country. Their Status fills within minutes (this function
     * does that) and the Country column stays "—" indefinitely, which reads
     * as "broken" rather than "waiting for your next sign-in".
     *
     * So when the column is empty and the caller handed us an address, it is
     * resolved here. Only when it is EMPTY: this runs on every signed-in
     * request, and re-resolving a country we already hold would be a third
     * party call every five minutes per user, for an answer that does not
     * change. A person who travels keeps the country they signed in from
     * until they sign in again, which is what the column claims to be.
     */
    if (origin && !origin.haveCountry) {
      /**
       * The edge already knows — free, and nothing is rate limited.
       */
      if (origin.edgeCountry) {
        patch.last_country = origin.edgeCountry;

      /**
       * Otherwise ask, but ONLY for an address we have not already asked
       * about. This runs every few minutes for every signed-in person, so an
       * unconditional lookup would mean: provider goes down → nobody resolves
       * → everybody retries every five minutes → the retries themselves hold
       * the provider at its rate limit. A failure that causes more failures.
       *
       * last_ip is written on every attempt, so "have we asked about this
       * address" is answerable without another column. One lookup per person
       * per address: a failed one is retried when their address changes, and
       * again at their next sign-in, where recordSignInOrigin() always asks.
       */
      /**
       * Otherwise ask — but not for an address we have already asked about.
       *
       * `!origin.ip` is in the condition deliberately, and leaving it out was
       * a bug: with no forwarded address `origin.ip` is null, `null !== null`
       * is false, and the lookup was never attempted at all. The visible
       * effect was that only people who SIGNED IN got a country — because
       * recordSignInOrigin() does try with a null address — while anybody
       * with a live session sat at "—" for ever. One row resolved, six did
       * not, and the difference was who had logged in most recently.
       *
       * Asking with no address is free in production: lookupCountry() sees a
       * private (or absent) address, refuses to guess, and returns before it
       * makes any request — so this cannot become a retry loop against a
       * rate limit. In development it is what resolves this machine's own
       * address, which is the only way the column is testable before a
       * deploy.
       */
      } else if (!origin.ip || origin.ip !== origin.lastIp) {
        const country = await lookupCountry(origin.ip);
        if (country) patch.last_country = country;
      }

      /* Recorded whether or not the lookup worked — it is what bounds the
         retry above, and an address is what makes a missing country
         diagnosable rather than a mystery. */
      if (origin.ip) patch.last_ip = origin.ip;
    }

    const { error } = await getMarketplaceDb()
      .from('profiles')
      .update(patch)
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

/**
 * The country the EDGE already worked out, if anything in front of us did.
 *
 * ── Why this is tried before any lookup ────────────────────────────────────
 *
 * Cloudflare sends `CF-IPCountry` on every request, Vercel sends
 * `x-vercel-ip-country`, and several other proxies send something similar.
 * Where one of those is present it is strictly better than asking a third
 * party: it is free, instant, cannot be rate limited, needs no outbound
 * request from our server, and is resolved from the connecting address by
 * something that can actually see it.
 *
 * Measured against the alternative: ipapi.co answered six rapid calls with
 * HTTP 429. A single call works, and sign-ins are infrequent enough that it
 * usually will — but "usually" is how a column ends up half empty, which is
 * the problem this whole change exists to fix.
 *
 * clientIp() already reads `cf-connecting-ip`, so Cloudflare is in the picture
 * on at least some deployments; where it is, this is the whole answer.
 *
 * 'XX' and 'T1' are Cloudflare's own "unknown" and "Tor", and both mean we do
 * not know — returning them would put a country code in the column that is not
 * a country.
 */
export function clientCountry(headers) {
  const candidates = [
    headers.get('cf-ipcountry'),
    headers.get('x-vercel-ip-country'),
    headers.get('x-geo-country'),
    headers.get('x-country-code'),
  ];

  for (const value of candidates) {
    const code = String(value ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') return code;
  }
  return null;
}

/* A loopback or LAN address resolves to nothing, so it is not worth a request
   — this is every hit in local development. */
export function isPrivate(ip) {
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
/**
 * The services that turn an address into a country, tried in order.
 *
 * ── Why there is more than one ─────────────────────────────────────────────
 *
 * There used to be exactly one, ipapi.co, and in production it stopped
 * answering — the admin panel's own diagnosis reported "visitor addresses are
 * reaching the server, but the service that turns one into a country is not
 * responding". All three below answered correctly for the same addresses from
 * a developer machine, so the failure is specific to the server: a free tier
 * counted per source IP, an outbound rule, or a burst limit. Six rapid calls
 * were enough to earn a 429 here.
 *
 * Any single free, keyless geo service will do this eventually. Depending on
 * one of them is the actual bug; a chain costs nothing, because the second is
 * only ever reached when the first has already failed.
 *
 * Ordered cheapest-to-fail-fast first: api.country.is returns four fields and
 * publishes no hard rate limit, ipapi.co is the strictest, ipwho.is is the
 * backstop.
 *
 * `own` is the no-argument form, which answers for the CALLER's address. Only
 * the development fallback uses it — see lookupCountry.
 */
const GEO_PROVIDERS = [
  {
    name: 'country.is',
    url: (ip) => `https://api.country.is/${encodeURIComponent(ip)}`,
    own: 'https://api.country.is/',
  },
  {
    name: 'ipapi.co',
    url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/country/`,
    own: 'https://ipapi.co/country/',
  },
  {
    name: 'ipwho.is',
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}?fields=country_code`,
    own: 'https://ipwho.is/?fields=country_code',
  },
];

/** A two-letter code out of a plain-text or JSON body, or null. */
function readCountry(body) {
  const text = String(body ?? '').trim();
  if (!text) return null;

  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();

  try {
    const json = JSON.parse(text);
    /* `country` before `country_code`: api.country.is uses the first and
       ipwho.is the second, and a provider that sends both agrees with itself. */
    const code = json.country || json.country_code || json.countryCode;
    return typeof code === 'string' && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

export async function lookupCountry(ip) {
  /**
   * A private address means "we cannot know", and in production that is the
   * only honest answer — a datacentre's own country is not the visitor's, and
   * writing it would fill the column with a plausible wrong value, which is
   * worse than a blank one.
   *
   * In DEVELOPMENT every request arrives from 127.0.0.1, so the column would
   * be permanently empty and the feature untestable short of deploying it. So
   * on a dev server only, the lookup falls back to THIS MACHINE's address —
   * which is the developer's own country, and the right answer for the one
   * person signing in. Guarded on NODE_ENV rather than on a flag somebody
   * could leave switched on.
   */
  const privateAddress = isPrivate(ip);
  if (privateAddress && process.env.NODE_ENV === 'production') return null;

  /* An explicit provider replaces the chain rather than joining it: somebody
     who has configured their own has said which one to trust. */
  const chain = process.env.GEOIP_URL
    ? [{
        name: 'GEOIP_URL',
        url: (addr) => process.env.GEOIP_URL.replace('{ip}', encodeURIComponent(addr)),
        own: process.env.GEOIP_URL.replace('{ip}', ''),
      }]
    : GEO_PROVIDERS;

  const failures = [];

  for (const provider of chain) {
    const url = privateAddress ? provider.own : provider.url(ip);

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(2500),
        headers: { accept: 'text/plain, application/json' },
      });

      if (!res.ok) {
        failures.push(`${provider.name} ${res.status}`);
        continue;
      }

      const code = readCountry(await res.text());
      if (code) return code;
      failures.push(`${provider.name} unparsed`);
    } catch (err) {
      /* Timed out, blocked, offline. Try the next one. */
      failures.push(`${provider.name} ${err.name === 'TimeoutError' ? 'timeout' : err.name}`);
    }
  }

  /**
   * Logged, once we have asked everybody. The silence here was what made this
   * hard to diagnose from the outside: a blank column and nothing anywhere
   * saying which service refused, or whether one was even reached.
   */
  console.warn('[presence] no country for', ip, '—', failures.join(', '));
  return null;
}

/**
 * Where this sign-in came from. Called once per sign-in, never per page view:
 * an address is looked up when it is new, not on every request.
 */
export async function recordSignInOrigin(userId, ip, edgeCountry = null) {
  /**
   * A null `ip` is NOT a reason to give up, and this guard used to say it was.
   *
   * On a local dev server there is no x-forwarded-for header at all, so
   * clientIp() answers null and this returned before writing anything —
   * last_seen_at included. The country column could therefore never be
   * populated on the machine it was being built on. lookupCountry() handles a
   * missing address itself (see above), so the only thing a null means here is
   * that there is no address worth storing.
   */
  if (!userId) return;

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

    const patch = { last_seen_at: new Date().toISOString() };
    if (ip) patch.last_ip = ip;

    /**
     * The edge's answer wins, and costs nothing — see clientCountry(). Only
     * when nothing in front of us said anything do we spend a request on it,
     * and only when the address is new or we never resolved one before.
     */
    if (edgeCountry) {
      patch.last_country = edgeCountry;
    } else if (current?.last_ip !== ip || !current?.last_country) {
      const country = await lookupCountry(ip);
      if (country) patch.last_country = country;
    }

    const { error } = await db.from('profiles').update(patch).eq('id', userId);
    if (error && !notInstalled(error)) console.warn('[presence] origin write:', error.message);
  } catch (err) {
    console.warn('[presence] origin:', err.message);
  }
}

/**
 * Record a sign-in from inside a SERVER ACTION.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * recordSignInOrigin was wired into exactly one place: the OAuth callback
 * route, which handles Google. It is not the way most people get in. Password
 * sign-in and the emailed code are server actions, they mint a real session,
 * and neither of them recorded anything — so `last_country` stayed null for
 * every user who did not sign in with Google, and the admin's Country column
 * was blank for reasons that had nothing to do with the SQL not being run.
 *
 * session.js names the four doors ("Password sign-in, the emailed code, a
 * password reset and Google's callback") and says the rule has to live in one
 * place or be "right three times after the next change". It was already only
 * right once. This is the one line each door calls.
 *
 * `headers()` is read HERE, synchronously with the request, rather than inside
 * the `after` callback: by the time that runs the request store is gone.
 */
export async function noteSignIn(userId) {
  if (!userId) return;

  try {
    const headerBag = await headers();
    const ip = clientIp(headerBag);
    const country = clientCountry(headerBag);
    after(() => recordSignInOrigin(userId, ip, country));
  } catch (err) {
    /* Outside a request, or headers unavailable. Never the caller's problem —
       this is bookkeeping attached to somebody's sign-in, and a sign-in that
       failed because of it would be an absurd trade. */
    console.warn('[presence] could not note sign-in:', err.message);
  }
}
