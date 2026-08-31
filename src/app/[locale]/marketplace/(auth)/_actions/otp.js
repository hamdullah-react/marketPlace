'use server';

/**
 * Email codes, for confirming a new account and for resetting a password.
 *
 * ── Why codes and not links ─────────────────────────────────────────────────
 *
 * A link has to open in a browser that shares the session with the one that
 * asked for it. On a phone that is often not true: the mail app opens its own
 * in-app browser, the link is consumed there, and the person is left staring at
 * a sign-in form in the browser they started in, having "already" confirmed. A
 * code is read in one app and typed in another, which is exactly the thing a
 * second device is good at.
 *
 * ── Why the app sends them itself ───────────────────────────────────────────
 *
 * Supabase's built-in mailer sends two emails per hour for the entire project
 * and reaches team addresses only. Pointing Supabase at our SMTP would fix the
 * volume but move the Arabic and English wording into a dashboard.
 *
 * So: Supabase mints the token and remains the authority on whether a code is
 * valid, unexpired and unused; @/marketplace/auth/otp-service pulls that token
 * out without an email being sent and delivers it over the same ZeptoMail
 * account the dealership site already uses. Verification below is unchanged —
 * still verifyOtp, still the ordinary cookie client, still a real session.
 *
 * The rate limiting that came free with Supabase's mailer does not come free
 * with ours; otp_send_allowed() in schema.sql section 19 replaces it.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { postAuthDestination } from '@/marketplace/auth/session';
import { getMarketplaceAuthServer } from '@/marketplace/auth/server';
import { sendCode } from '@/marketplace/auth/otp-service';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

/**
 * Digits only, and never longer than Supabase could issue.
 *
 * The exact length is a PER-PROJECT setting — Authentication → Sign In /
 * Providers → Email → "Email OTP Length" — and this project is on 8, not the
 * documented default of 6. So the check is a RANGE, not an equality: Supabase
 * is the authority on whether a code is correct, and a hard-coded 6 would
 * reject every real code before it left this server, reporting "wrong code"
 * when the code was right.
 */
const OTP_MIN = 6;
const OTP_MAX = 10;
const cleanCode = (raw) => (raw ?? '').replace(/\D/g, '').slice(0, OTP_MAX);

function safeNext(value, locale) {
  const fallback = `/${locale}/marketplace`;
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

/**
 * Turns Supabase's verification errors into the two that matter.
 *
 * A wrong code and an expired one need different actions from the user —
 * retype it, or ask for a new one — and collapsing them into "invalid" makes
 * someone retype a code that can never work.
 */
function codeError(message = '') {
  if (/expired/i.test(message)) return 'CODE_EXPIRED';
  return 'CODE_INVALID';
}

/* ── Sign-up confirmation ────────────────────────────────────────────────── */

export async function verifySignupOtp(prevState, formData) {
  const email = str(formData, 'email').toLowerCase();
  const locale = str(formData, 'locale') || 'ar';
  const code = cleanCode(str(formData, 'code'));

  if (!email) return bad('CREDENTIALS_REQUIRED');
  if (code.length < OTP_MIN) return bad('CODE_INVALID');

  const supabase = await getMarketplaceAuthServer();

  // 'magiclink' because that is what the confirmation code was minted as — see
  // sendCode(). Verifying one both signs the person in and stamps
  // email_confirmed_at, which is the entire job of a confirmation code.
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'magiclink' });

  if (error) return bad(codeError(error.message));

  revalidatePath('/[locale]/marketplace', 'layout');
  redirect(await postAuthDestination(safeNext(str(formData, 'next'), locale), locale));
}

/** Another code for an account that exists but has never been confirmed. */
export async function resendSignupOtp(prevState, formData) {
  const email = str(formData, 'email').toLowerCase();
  const locale = str(formData, 'locale') || 'ar';

  if (!email) return bad('CREDENTIALS_REQUIRED');

  const result = await sendCode({ email, purpose: 'signup', locale });

  // NO_SUCH_USER is swallowed here too. This button is reachable from the
  // sign-in form, where admitting that an address has no account would turn a
  // leaked email list into a list of confirmed customers.
  if (result.error && result.error !== 'NO_SUCH_USER') {
    return bad(result.error, { wait: result.wait ?? null });
  }

  return ok({ sent: true, email });
}

/* ── Password reset ──────────────────────────────────────────────────────── */

/** Step 1: send a code. Always reports success — see the note above. */
export async function sendRecoveryOtp(prevState, formData) {
  const email = str(formData, 'email').toLowerCase();
  const locale = str(formData, 'locale') || 'ar';

  if (!email) return bad('CREDENTIALS_REQUIRED');

  const result = await sendCode({ email, purpose: 'recovery', locale });

  // Two failures ARE reported, because staying quiet about them is a lie: the
  // mail genuinely did not go, and the person would sit waiting for an email
  // that is never coming. Neither leaks anything — a throttle spends its budget
  // whether or not the address has an account, and our SMTP being down says
  // nothing at all about who is registered.
  //
  // NO_SUCH_USER is the only one still swallowed, and it is the only one that
  // would answer "does this person have an account here".
  if (result.error === 'TOO_SOON') return bad('TOO_SOON', { wait: result.wait ?? null });
  if (result.error === 'SEND_FAILED') return bad('SEND_FAILED');

  return ok({ sent: true, email });
}

/**
 * Step 2: check the code and set the new password, in ONE action.
 *
 * Deliberately not two. Verifying a recovery code signs the user in, so
 * stopping between the two steps would leave a browser authenticated by a code
 * that was only ever meant to authorise a password change — someone who
 * abandons the form halfway is left silently logged in.
 */
export async function resetPasswordWithOtp(prevState, formData) {
  const email = str(formData, 'email').toLowerCase();
  const locale = str(formData, 'locale') || 'ar';
  const code = cleanCode(str(formData, 'code'));
  const password = str(formData, 'password');

  if (!email) return bad('CREDENTIALS_REQUIRED');
  if (code.length < OTP_MIN) return bad('CODE_INVALID');
  if (password.length < 8) return bad('PASSWORD_TOO_SHORT');

  const supabase = await getMarketplaceAuthServer();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email, token: code, type: 'recovery',
  });
  if (verifyError) return bad(codeError(verifyError.message));

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    // The session exists at this point but the password did not change. Sign
    // out rather than leave someone logged in by a code they used to fail.
    await supabase.auth.signOut();
    return bad(/password/i.test(updateError.message) ? 'PASSWORD_TOO_SHORT' : 'SAVE_FAILED');
  }

  revalidatePath('/[locale]/marketplace', 'layout');
  redirect(`/${locale}/marketplace/account`);
}
