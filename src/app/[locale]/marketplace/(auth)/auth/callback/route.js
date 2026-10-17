/**
 * Where every email link lands — confirmation, password reset, magic link.
 *
 * Supabase sends the user here with a one-time `code`; exchanging it is what
 * actually creates the session cookie. A route handler rather than a page
 * because it must SET a cookie, which server components cannot do, and because
 * there is nothing to render — it is a redirect with a side effect.
 */

import { NextResponse } from 'next/server';
import { notifyNewUser } from '@/marketplace/db/queries/notifications';
import { getMarketplaceAuthServer } from '@/marketplace/auth/server';
import { postAuthDestination } from '@/marketplace/auth/session';

/**
 * The PUBLIC origin, which is not necessarily the one in `request.url`.
 *
 * Behind a reverse proxy — Coolify, Vercel, anything — the request arrives at
 * the container on its internal address, so `new URL(request.url).origin` is
 * `http://localhost:3001`. Every redirect built against it sent the person
 * there: they signed in on sauda.digital and landed on a localhost URL their
 * browser could not open. The session had been created correctly; only the
 * last hop was wrong, which is what made it look like a sign-in failure.
 *
 * Order matters, and it is not the obvious one:
 *
 *   1. NEXT_PUBLIC_BASE_URL. Configured by us, so it cannot be influenced by
 *      the request — and this route is an open-redirect target if it can be.
 *      A forged X-Forwarded-Host would otherwise send a freshly signed-in
 *      person to somebody else's site carrying our link's credibility.
 *   2. x-forwarded-host, for a deployment that has not set the variable.
 *   3. host, then request.url — the local-development path, where there is no
 *      proxy and all three agree anyway.
 */
function publicOrigin(request) {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* A malformed variable must not take sign-in down; fall through. */
    }
  }

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return new URL(request.url).origin;

  const proto =
    request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function GET(request, { params }) {
  const { locale } = await params;
  const url = new URL(request.url);
  /* `url` is still the right thing to read the query string from — only its
     ORIGIN is untrustworthy behind a proxy. */
  const origin = publicOrigin(request);
  const code = url.searchParams.get('code');

  // Same rule as the sign-in action: a same-site absolute path only, never
  // `//host`, which the browser reads as protocol-relative and would send the
  // user to another origin carrying our link's credibility.
  const requested = url.searchParams.get('next');
  const next =
    requested && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : `/${locale}/marketplace`;

  if (!code) {
    return NextResponse.redirect(new URL(`/${locale}/marketplace/login?error=link`, origin));
  }

  const supabase = await getMarketplaceAuthServer();
  const { data: session, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired or already used — both mean "ask for a fresh one", which is the
    // login page's job, not an error page's.
    return NextResponse.redirect(new URL(`/${locale}/marketplace/login?error=link`, origin));
  }

  /* A Google sign-in is also how somebody joins, and this route runs on every
     one of them — the first and the four hundredth. notifyNewUser() is the
     thing that knows the difference, so it is safe to call from here. */
  const person = session?.user;
  if (person?.id) {
    await notifyNewUser({
      userId: person.id,
      name: person.user_metadata?.full_name ?? person.user_metadata?.name ?? null,
      email: person.email ?? null,
    });
  }

  /**
   * Google supplies a name and a photo and never a Saudi mobile number, so a
   * one-click sign-in is exactly the route that arrives with nothing we can
   * ring. Same decision as the other three doors — see postAuthDestination.
   */
  return NextResponse.redirect(
    new URL(await postAuthDestination(next, locale), origin)
  );
}
