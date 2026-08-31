'use server';

/**
 * Sign in, sign up, sign out.
 *
 * Supabase Auth does the work; these actions exist so the credentials are
 * posted to the SERVER and the session cookie is written there. Signing in from
 * the browser client would work too, but then the cookie is set by JavaScript
 * after the fact and the first server render of the page you land on still
 * thinks you are logged out.
 *
 * Every failure returns the SAME message for a wrong email as for a wrong
 * password. Telling them apart is an account-existence oracle: it turns a
 * leaked email list into a list of confirmed customers.
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { postAuthDestination } from '@/marketplace/auth/session';
import { getMarketplaceAuthServer } from '@/marketplace/auth/server';
import { registerAndSendCode } from '@/marketplace/auth/otp-service';

/**
 * Where Google and the email links should come BACK to.
 *
 * Read off the incoming request, not from NEXT_PUBLIC_SITE_URL. That variable
 * is the production domain, so building the callback from it sent everyone who
 * signed in on localhost — or on a preview deploy — to
 * https://www.alromaihcars.com/en/marketplace/auth/callback, which does not
 * exist there. A 404 at the end of a successful sign-in.
 *
 * The request already knows which host the user is on, and it is right in all
 * three environments with nothing to configure.
 *
 * A spoofed Host header cannot turn this into an open redirect: Supabase only
 * honours a redirect that matches its own Redirect URLs allow-list, which is
 * where localhost and the production domain are registered.
 */
async function requestOrigin() {
  const h = await headers();
  // x-forwarded-* first — behind a proxy the plain Host is the internal one.
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? '';

  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

/**
 * Where to go after signing in.
 *
 * Taken from the form, and checked: an open redirect is a phishing primitive —
 * a link to OUR login that lands on someone else's page carries our domain's
 * credibility with it. Only a same-site absolute path is allowed, and `//host`
 * is rejected too because the browser reads it as protocol-relative.
 */
function safeNext(value, locale) {
  const fallback = `/${locale}/marketplace`;
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export async function signIn(prevState, formData) {
  const email = str(formData, 'email').toLowerCase();
  const password = str(formData, 'password');
  const locale = str(formData, 'locale') || 'ar';

  if (!email || !password) return bad('CREDENTIALS_REQUIRED');

  const supabase = await getMarketplaceAuthServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately one message. See the note at the top of the file.
    if (/email not confirmed/i.test(error.message)) return bad('EMAIL_NOT_CONFIRMED');
    return bad('BAD_CREDENTIALS');
  }

  // The whole marketplace renders differently once signed in — the header, the
  // seller links, saved cars. Without this the cached shell says "Sign in"
  // until something else happens to invalidate it.
  revalidatePath('/[locale]/marketplace', 'layout');

  // A phone number and an address come before anything else, and this is where
  // that is least in the way — see postAuthDestination.
  redirect(await postAuthDestination(safeNext(str(formData, 'next'), locale), locale));
}

export async function signUp(prevState, formData) {
  const email = str(formData, 'email').toLowerCase();
  const password = str(formData, 'password');
  const fullName = str(formData, 'fullName');
  const locale = str(formData, 'locale') || 'ar';

  if (!email || !password) return bad('CREDENTIALS_REQUIRED');
  if (!fullName) return bad('NAME_REQUIRED');

  // Supabase enforces its own minimum, but checking here means the user is told
  // before the round trip, and in their own language.
  if (password.length < 8) return bad('PASSWORD_TOO_SHORT');

  /**
   * Note what is NOT here: supabase.auth.signUp().
   *
   * That call creates the account and immediately asks Supabase to email a
   * confirmation — and Supabase's built-in mailer sends two emails an hour for
   * the whole project, to team addresses only. The third person to sign up got
   * "Could not create the account" for an account that was perfectly creatable.
   *
   * registerAndSendCode creates the user with the service role (which mails
   * nothing), pulls the confirmation code out of Supabase, and sends it over
   * our own SMTP. Everything the trigger and the RLS policies see is identical;
   * only the postman changed.
   */
  const result = await registerAndSendCode({ email, password, fullName, locale });
  if (result.error) return bad(result.error, { wait: result.wait ?? null });

  // No session, on purpose. The address is unconfirmed until the code is
  // entered, and handing out a session first would make the code decorative.
  // The email travels back so the code screen can address it and post it to
  // verifyOtp — Supabase needs the address alongside the digits, and asking the
  // user to retype it is asking them to make a typo.
  return { ok: true, error: null, token: stamp(), confirmEmail: true, email };
}

/**
 * Google.
 *
 * Runs on the SERVER, where signInWithOAuth does not navigate — it returns the
 * URL to send the browser to, and this redirects there. Doing it in the browser
 * client instead would work, but the session would then be established by
 * JavaScript after the redirect, and the first server render of the page they
 * land on would still think they were signed out.
 *
 * The round trip comes back to the same /auth/callback route the email
 * confirmation link uses: both arrive with a one-time `code`, and exchanging it
 * is what writes the cookie. One landing place, one exchange, no second path to
 * keep in step.
 */
export async function signInWithGoogle(prevState, formData) {
  const locale = str(formData, 'locale') || 'ar';
  const next = safeNext(str(formData, 'next'), locale);
  const origin = await requestOrigin();

  const supabase = await getMarketplaceAuthServer();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/${locale}/marketplace/auth/callback?next=${encodeURIComponent(next)}`,
      // Asked for explicitly so a user who picked the wrong account once is not
      // silently signed straight back into it with no way to switch.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error || !data?.url) return bad('GOOGLE_FAILED', { detail: error?.message });

  redirect(data.url);
}

/**
 * Sign out.
 *
 * ONE parameter, unlike every other action in this file, and the difference is
 * load-bearing.
 *
 * React passes a server action the FormData ALONE when it is handed straight to
 * `<form action={…}>`, and passes `(prevState, formData)` only when it has been
 * wrapped by useActionState. The header uses the bare form, so with a
 * two-parameter signature the FormData arrived as `prevState`, `formData` was
 * undefined, and the first line threw on `undefined.get('locale')` — the click
 * did nothing and the user stayed signed in.
 *
 * If this ever moves behind useActionState, the signature has to change back.
 */
export async function signOut(formData) {
  const locale = (typeof formData?.get === 'function' && String(formData.get('locale') || '').trim()) || 'ar';

  const supabase = await getMarketplaceAuthServer();
  await supabase.auth.signOut();

  // The header, the seller links and anything else drawn from the session are
  // rendered in the layout, which does not re-run on its own.
  revalidatePath('/[locale]/marketplace', 'layout');
  redirect(`/${locale}/marketplace`);
}

/* requestPasswordReset lived here. It was the link-based reset, superseded by
   sendRecoveryOtp in _actions/otp.js, and nothing imported it any more — but a
   function exported from a 'use server' file is a live HTTP endpoint whether or
   not any component calls it. Left in place it would have been an unthrottled,
   unauthenticated way to make Supabase's mailer send, which is the exact thing
   the code flow exists to stop relying on. Deleted rather than commented out. */
