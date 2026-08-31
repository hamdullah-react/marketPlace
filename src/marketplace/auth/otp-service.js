import 'server-only';

/**
 * Minting and delivering email codes, without Supabase's mailer.
 *
 * The split of responsibility, which is the whole design:
 *
 *   Supabase  decides what a valid code is, when it expires, and that it can
 *             be used once. None of that is reimplemented here — verifyOtp on
 *             the ordinary cookie client is still what checks a code.
 *   this file  gets the code out of Supabase without an email being sent, and
 *             puts it in an email of our own.
 *
 * admin.generateLink() is the seam. It returns the same `email_otp` Supabase
 * would have mailed and sends nothing, and unlike the mail endpoints it is not
 * throttled at all — measured on this project: twelve calls in a row, all 200.
 *
 * That last part cuts both ways. Supabase's two-per-hour ceiling was also the
 * only thing stopping an anonymous visitor from posting a stranger's address
 * into the form a thousand times, so otp_send_allowed() (schema.sql §19) has to
 * replace it before any of this is safe to expose.
 */

import { getMarketplaceAuthAdmin } from '@/marketplace/auth/admin';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { sendOtpEmail, mailerConfig } from '@/marketplace/auth/mailer';

/** Supabase's default code lifetime. Shown in the email, not enforced here. */
const EXPIRY_MINUTES = 15;

const isMissingUser = (error) =>
  /user_not_found|not found/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`);

const isDuplicate = (error) =>
  /email_exists|already been registered|already registered/i.test(
    `${error?.code ?? ''} ${error?.message ?? ''}`
  );

/**
 * Asks the database whether this address may be sent a code, and records it.
 *
 * Fails CLOSED. If the function is missing — section 19 of schema.sql not run —
 * nothing sends, and the server log says exactly why. The alternative is a
 * publicly reachable endpoint that mails arbitrary addresses on demand, which
 * is not a thing to leave switched on by accident.
 *
 * Returns seconds to wait, 0 meaning go ahead.
 */
async function reserveSend(email, purpose) {
  const db = getMarketplaceDb();
  const { data, error } = await db.rpc('otp_send_allowed', { target: email, kind: purpose });

  if (error) {
    console.error(
      '[marketplace] otp_send_allowed failed — no code was sent. Run section 19 ' +
        'of src/marketplace/db/schema.sql. Cause:',
      error.message
    );
    return -1;
  }

  return typeof data === 'number' ? data : -1;
}

/**
 * Pulls a fresh code out of Supabase for an address that already has an
 * account, and emails it.
 *
 * `purpose` is both the email wording and the token type, and the two must
 * agree with what the verifying action passes to verifyOtp:
 *
 *   signup   -> magiclink tokens. Verifying one confirms the address as a side
 *               effect, which is exactly what a confirmation code is for, and
 *               unlike a 'signup' token it can be reissued without the password
 *               — which is what the resend button needs.
 *   recovery -> recovery tokens, the only type updateUser({password}) accepts
 *               as authorisation.
 */
export async function sendCode({ email, purpose, locale = 'ar' }) {
  const address = email.toLowerCase();

  const wait = await reserveSend(address, purpose);
  if (wait < 0) return { error: 'SEND_FAILED' };
  if (wait > 0) return { error: 'TOO_SOON', wait };

  const admin = getMarketplaceAuthAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: purpose === 'recovery' ? 'recovery' : 'magiclink',
    email: address,
  });

  // No such account. The caller decides whether to admit that — for a password
  // reset it must not, and the send budget has deliberately been spent either
  // way so the form cannot be used to test which addresses exist.
  if (error) {
    if (isMissingUser(error)) return { error: 'NO_SUCH_USER' };
    console.error('[marketplace] generateLink failed:', error.message);
    return { error: 'SEND_FAILED' };
  }

  const code = data?.properties?.email_otp ?? data?.email_otp;
  if (!code) {
    console.error('[marketplace] generateLink returned no email_otp');
    return { error: 'SEND_FAILED' };
  }

  try {
    await sendOtpEmail({ to: address, code, purpose, locale, minutes: EXPIRY_MINUTES });
  } catch (cause) {
    const reason = cause?.message ?? String(cause);
    const { host, from } = mailerConfig();
    console.error(`[marketplace] SMTP send failed via ${host} as ${from}: ${reason}`);

    /**
     * Development only: put the code in the terminal instead.
     *
     * Without this, a broken mail account stops all work on sign-up, password
     * reset and everything behind them — and mail accounts break for reasons
     * that have nothing to do with the code: an unverified sending domain, a
     * trial that was never lifted, a key someone else rotated.
     *
     * Gated on NODE_ENV alone, with no env flag to switch it on, because a flag
     * is a thing that can be set in production by mistake. Next hard-codes
     * NODE_ENV to 'production' in the build and refuses to let .env override
     * it, so this branch cannot exist in a deployed marketplace.
     */
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `\n[marketplace] DEV FALLBACK — the ${purpose} code for ${address} is: ${code}\n` +
          '              Nothing was emailed. Fix the mail account with:\n' +
          '              node scripts/marketplace-mail-test.cjs you@example.com\n'
      );
      return { ok: true, deliveredTo: 'console' };
    }

    return { error: 'SEND_FAILED' };
  }

  return { ok: true };
}

/**
 * Creates the account and sends its confirmation code.
 *
 * Three cases, and the middle one is the one that is easy to get wrong:
 *
 *   no account yet         create it, unconfirmed, and send a code.
 *   account, unconfirmed   nobody has proven they own that inbox, so this is
 *                          treated as the same person trying again: the
 *                          password is replaced and a new code goes out. It
 *                          grants nothing — the code still lands in the real
 *                          owner's inbox — and it is what Supabase's own signUp
 *                          does. Refusing instead would let anyone permanently
 *                          block an address by signing up with it first.
 *   account, confirmed     taken. Say so; there is no secret here, the sign-in
 *                          form would reveal the same thing.
 */
export async function registerAndSendCode({ email, password, fullName, locale = 'ar' }) {
  const address = email.toLowerCase();
  const admin = getMarketplaceAuthAdmin();
  const metadata = { full_name: fullName, locale };

  const { error: createError } = await admin.auth.admin.createUser({
    email: address,
    password,
    // The whole point: no email leaves Supabase, because we are about to send
    // our own. handle_new_user() still fires and writes the profile row.
    email_confirm: false,
    user_metadata: metadata,
  });

  if (createError) {
    if (!isDuplicate(createError)) {
      console.error('[marketplace] createUser failed:', createError.message);
      return { error: 'SIGNUP_FAILED' };
    }

    // Existing account — find out which of the two cases it is. generateLink is
    // the cheapest way to turn an address into an id; the token it mints along
    // the way is simply discarded.
    const { data: probe, error: probeError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: address,
    });

    const id = probe?.user?.id ?? probe?.properties?.user_id ?? probe?.id;
    if (probeError || !id) return { error: 'EMAIL_TAKEN' };

    const { data: existing } = await admin.auth.admin.getUserById(id);
    if (existing?.user?.email_confirmed_at) return { error: 'EMAIL_TAKEN' };

    const { error: updateError } = await admin.auth.admin.updateUserById(id, {
      password,
      user_metadata: metadata,
    });
    if (updateError) {
      if (/password/i.test(updateError.message)) return { error: 'PASSWORD_TOO_SHORT' };
      console.error('[marketplace] updateUserById failed:', updateError.message);
      return { error: 'SIGNUP_FAILED' };
    }
  }

  return sendCode({ email: address, purpose: 'signup', locale });
}
