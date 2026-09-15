import { NextResponse } from 'next/server';
import middlewareModule from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from './i18n/routing';

const createMiddleware = middlewareModule.default || middlewareModule;
const handleI18nRouting = createMiddleware(routing);

// ═══════════════════════════════════════════════════════════════════════════
//  THE MARKETPLACE'S OWN SESSION
//
//  Ported from the parent repo's src/proxy.js, which had to interleave this
//  with the dealership's NextAuth session, its non-www 301, its ?srsltid
//  stripping and its /car/ slug normalisation — all in one file, because Next
//  allows exactly one proxy per app. Two apps means two proxies, so none of
//  that is here and this file is only what the marketplace actually needs.
//
//  ── What it is for ────────────────────────────────────────────────────────
//
//    1. REFRESHING THE TOKEN. Supabase access tokens are short-lived and a
//       server component cannot write a cookie, so without a refresh here the
//       token expires mid-session and somebody is signed out by a page they
//       merely looked at.
//
//    2. Turning away the obviously logged-out before a dashboard renders.
//
//    3. THE PROFILE GATE. A signed-in person with no phone and no address is
//       held on /marketplace/complete-profile. requireUser() already does this
//       for the account and the seller dashboard, but the public pages never
//       call it and a layout check is not re-run on navigation — so this is
//       the only place that sees every request.
//
//  ── What it is NOT ────────────────────────────────────────────────────────
//
//  It is not the authorization check. Next's auth guide is explicit that Proxy
//  runs on every request including prefetches, so it may only read the cookie
//  optimistically and "should not be your only line of defense". A forged
//  cookie gets past this and does not get past Postgres, because every real
//  check is an RLS policy plus the guard in src/marketplace/auth/session.js.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Still anchored on /:locale/marketplace, because the route tree kept that
 * segment when it was copied across, so a file sits at the same path in both
 * repos and a fix can be applied by path. If the
 * segment is ever dropped for the subdomain, this becomes the whole app and
 * the test can go — it is the only line here that assumes the prefix.
 */
const MARKETPLACE_PATH = /^\/(?:en|ar)\/marketplace(?:\/|$)/;

/** Signed-in-only areas. Everything else in the marketplace stays public. */
const MARKETPLACE_PROTECTED = [
  '/marketplace/seller',
  '/marketplace/admin',
  '/marketplace/account',
];

/**
 * The pages an UNFINISHED profile may still reach.
 *
 * The gate sends people to /marketplace/complete-profile. If that page were
 * itself gated it would redirect to itself and the browser would bounce until
 * it gave up. The same goes for the auth doors: somebody whose session is
 * half-established must be able to reach sign-in, and the OAuth callback has
 * to finish exchanging its code before anybody asks it for a phone number.
 */
const PROFILE_EXEMPT = [
  '/marketplace/complete-profile',
  '/marketplace/login',
  '/marketplace/signup',
  '/marketplace/forgot-password',
  '/marketplace/auth/',
  '/marketplace/logout',
];

/**
 * Refreshes the Supabase token and decides whether this person may proceed.
 *
 * Returns the cookies the refresh produced — never a response of its own
 * unless it is turning somebody away, because the response for a marketplace
 * page is still the one next-intl builds below. The caller grafts the cookies
 * onto whatever it ends up returning; dropping them is the classic
 * Supabase-SSR bug where the user looks logged out on the server while the
 * browser insists they are signed in.
 */
async function marketplaceSession(request, pathname, locale) {
  const url = process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_ANON_KEY;

  // Not configured — let the request through untouched rather than locking the
  // site out of itself over a missing variable.
  if (!url || !anonKey) return { jar: [] };

  const jar = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const cookie of list) {
          // Onto the REQUEST, so anything reading it later in this pass sees
          // the fresh token…
          request.cookies.set(cookie.name, cookie.value);
          // …and collected, so the caller can put it on the response and the
          // browser keeps it for the next one.
          jar.push(cookie);
        }
      },
    },
  });

  // getUser(), not getSession(): this is the call that validates the token
  // with the auth server and triggers the refresh. getSession() only decodes
  // the cookie the browser sent, which proves nothing and refreshes nothing.
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  if (!user) {
    if (MARKETPLACE_PROTECTED.some((p) => pathname.includes(p))) {
      const login = request.nextUrl.clone();
      login.pathname = `/${locale}/marketplace/login`;
      login.search = '';
      // So signing in returns them to where they were going, rather than to
      // the marketplace home and a second navigation.
      login.searchParams.set('next', pathname);
      return { jar, redirect: NextResponse.redirect(login) };
    }
    return { jar };
  }

  /**
   * ── It fails OPEN, deliberately ───────────────────────────────────────────
   *
   * profile_complete() is created by schema.sql §23. If that has not been run,
   * or the database is briefly unreachable, this call errors — and blocking on
   * an error would lock every signed-in person out of the whole marketplace
   * over a missing function. So an error means "let them through", and the
   * requireUser() guard still holds the line in front of anything sensitive.
   */
  if (!PROFILE_EXEMPT.some((p) => pathname.includes(p))) {
    const { data: complete, error } = await supabase.rpc('profile_complete');

    if (!error && complete === false) {
      const finish = request.nextUrl.clone();
      finish.pathname = `/${locale}/marketplace/complete-profile`;
      finish.search = '';
      return { jar, redirect: NextResponse.redirect(finish) };
    }
  }

  return { jar };
}

/**
 * ── The languages an admin has switched on (Admin → Settings) ─────────────
 *
 * Read from the public site_languages table with the anon key and kept for a
 * minute per server instance, so this is one small request a minute rather
 * than one per page. Fails OPEN: no table, no network, no configuration — every
 * language stays reachable, exactly as before the setting existed.
 */
const LANGUAGE_TTL_MS = 60_000;
let languageCache = { at: 0, value: null };

async function languagePolicy() {
  const url = process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  if (Date.now() - languageCache.at < LANGUAGE_TTL_MS) return languageCache.value;

  let value = null;
  try {
    const res = await fetch(`${url}/rest/v1/site_languages?select=code,enabled,is_default`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const rows = await res.json();
      const enabled = rows.filter((r) => r.enabled && (r.code === 'ar' || r.code === 'en')).map((r) => r.code);
      if (enabled.length) {
        value = { enabled, defaultLocale: rows.find((r) => r.is_default && r.enabled)?.code ?? enabled[0] };
      }
    }
  } catch {
    value = null;
  }

  languageCache = { at: Date.now(), value };
  return value;
}

/** Staff areas keep both languages whatever the public site offers. */
const LANGUAGE_EXEMPT = ['/marketplace/admin', '/marketplace/seller', '/marketplace/auth/', '/marketplace/logout'];

/** Carries a refreshed token onto whichever response is going back. */
function withCookies(response, jar) {
  for (const { name, value, options } of jar) response.cookies.set(name, value, options);
  return response;
}

export default async function proxy(request) {
  const { pathname, origin } = request.nextUrl;

  const locale = pathname.startsWith('/en') ? 'en' : 'ar';

  /**
   * The front door. Arabic is defaultLocale, so a bare `/` is the Arabic
   * marketplace, and `/ar` or `/en` on their own are the same page one segment
   * short.
   *
   * This is a proxy redirect rather than a page that calls redirect(), which is
   * where it started. Under Cache Components a page whose whole body throws
   * NEXT_REDIRECT cannot be validated — 16.3 reports `Could not validate
   * 'instant' because an error prevented the target segment from rendering`,
   * because there is no UI to prerender, only a throw. Answering at the edge
   * costs no render at all and never reaches that check.
   */
  if (pathname === '/' || pathname === '/ar' || pathname === '/en') {
    // A bare `/` goes to the admin's default language; `/ar` or `/en` keep
    // theirs unless that language is switched off.
    const policy = await languagePolicy();
    const asked = pathname === '/' ? null : locale;
    const target = asked && (!policy || policy.enabled.includes(asked)) ? asked : policy?.defaultLocale ?? locale;
    return NextResponse.redirect(`${origin}/${target}/marketplace`, { status: 307 });
  }

  // A public page in a language the admin switched off → the same page in the
  // default language.
  if (MARKETPLACE_PATH.test(pathname) && !LANGUAGE_EXEMPT.some((p) => pathname.includes(p))) {
    const policy = await languagePolicy();
    if (policy && !policy.enabled.includes(locale)) {
      const moved = request.nextUrl.clone();
      moved.pathname = pathname.replace(/^\/(en|ar)/, `/${policy.defaultLocale}`);
      return NextResponse.redirect(moved, { status: 307 });
    }
  }

  // The marketplace's Supabase session. Its refreshed cookies ride along on
  // whatever response is returned at the end.
  let marketplaceJar = [];
  if (MARKETPLACE_PATH.test(pathname)) {
    const outcome = await marketplaceSession(request, pathname, locale);
    marketplaceJar = outcome.jar;
    // The redirect carries the cookies too: a token refreshed on the way to
    // the login page must not be thrown away by the redirect that follows it.
    if (outcome.redirect) return withCookies(outcome.redirect, marketplaceJar);
  }

  if (pathname.startsWith('/en') || pathname.startsWith('/ar')) {
    return withCookies(handleI18nRouting(request), marketplaceJar);
  }

  return withCookies(NextResponse.next(), marketplaceJar);
}

export const config = {
  matcher: [
    '/',
    '/en/:path*',
    '/ar/:path*',
    '/api/:path*',
    '/((?!_next|.*\\..*).*)',
  ],
};
