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
import { OTP_DAILY_LIMIT } from '@/marketplace/lib/env';

/** Supabase's default code lifetime. Shown in the email, not enforced here. */
const EXPIRY_MINUTES = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * The per-address cap is OTP_DAILY_LIMIT codes in 24 hours, passed to the
 * function explicitly so the number lives in one place (lib/env) and the forms
 * can show the same figure the database enforces.
 *
 * Returns { remaining } when the send may go ahead, or { error, wait } when not:
 *   TOO_SOON     the one-minute cooldown (or the platform-wide ceiling)
 *   DAILY_LIMIT  this address has had its codes for the day
 *   SEND_FAILED  the throttle itself is unavailable
 */
async function reserveSend(email, purpose) {
  const db = getMarketplaceDb();

  // Counted first so the person can be told how many are left. The function
  // below still makes the real decision — this read is advisory, and two
  // simultaneous requests cannot both slip past the cap because of it.
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data: today, count, error: countError } = await db
    .from('auth_otp_sends')
    .select('sent_at', { count: 'exact' })
    .eq('email', email)
    .gt('sent_at', since)
    .order('sent_at', { ascending: true })
    .limit(1);

  const sent = countError ? null : count ?? 0;
  const secondsUntilSlot = () => {
    const oldest = today?.[0]?.sent_at;
    if (!oldest) return 24 * 60 * 60;
    return Math.max(60, Math.ceil((Date.parse(oldest) + DAY_MS - Date.now()) / 1000));
  };

  if (sent !== null && sent >= OTP_DAILY_LIMIT) {
    return { error: 'DAILY_LIMIT', wait: secondsUntilSlot(), remaining: 0 };
  }

  const { data, error } = await db.rpc('otp_send_allowed', {
    target: email,
    kind: purpose,
    per_address: OTP_DAILY_LIMIT,
    address_window: '24 hours',
  });

  if (error || typeof data !== 'number') {
    console.error(
      '[marketplace] otp_send_allowed failed — no code was sent. Run section 19 ' +
        'of src/marketplace/db/schema.sql. Cause:',
      error?.message ?? `unexpected result ${JSON.stringify(data)}`
    );
    return { error: 'SEND_FAILED' };
  }

  const remaining = sent === null ? null : Math.max(0, OTP_DAILY_LIMIT - sent);

  if (data > 0) {
    // The cooldown and the platform ceiling never ask for more than a minute,
    // so a longer wait can only be the daily window (reached by a request that
    // raced the count above).
    return data > 60
      ? { error: 'DAILY_LIMIT', wait: data, remaining: 0 }
      : { error: 'TOO_SOON', wait: data, remaining };
  }

  return { remaining: remaining === null ? null : Math.max(0, remaining - 1) };
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

  const slot = await reserveSend(address, purpose);
  if (slot.error) return slot;
  const { remaining } = slot;

  const admin = getMarketplaceAuthAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: purpose === 'recovery' ? 'recovery' : 'magiclink',
    email: address,
  });

  // No such account. The caller decides whether to admit that — for a password
  // reset it must not, and the send budget has deliberately been spent either
  // way so the form cannot be used to test which addresses exist.
  if (error) {
    if (isMissingUser(error)) return { error: 'NO_SUCH_USER', remaining };
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
      return { ok: true, deliveredTo: 'console', remaining };
    }

    return { error: 'SEND_FAILED' };
  }

  return { ok: true, remaining };
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
