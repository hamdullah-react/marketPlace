/**
 * Where every email link lands — confirmation, password reset, magic link.
 *
 * Supabase sends the user here with a one-time `code`; exchanging it is what
 * actually creates the session cookie. A route handler rather than a page
 * because it must SET a cookie, which server components cannot do, and because
 * there is nothing to render — it is a redirect with a side effect.
 */

import { NextResponse } from 'next/server';
import { getMarketplaceAuthServer } from '@/marketplace/auth/server';
import { postAuthDestination } from '@/marketplace/auth/session';

export async function GET(request, { params }) {
  const { locale } = await params;
  const url = new URL(request.url);
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
    return NextResponse.redirect(new URL(`/${locale}/marketplace/login?error=link`, url.origin));
  }

  const supabase = await getMarketplaceAuthServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired or already used — both mean "ask for a fresh one", which is the
    // login page's job, not an error page's.
    return NextResponse.redirect(new URL(`/${locale}/marketplace/login?error=link`, url.origin));
  }

  /**
   * Google supplies a name and a photo and never a Saudi mobile number, so a
   * one-click sign-in is exactly the route that arrives with nothing we can
   * ring. Same decision as the other three doors — see postAuthDestination.
   */
  return NextResponse.redirect(
    new URL(await postAuthDestination(next, locale), url.origin)
  );
}
