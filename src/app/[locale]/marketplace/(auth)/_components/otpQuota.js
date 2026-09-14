/**
 * Wording for the email-code limits, shared by the sign-up code screen and the
 * password-reset form so both tell the person the same thing.
 *
 * Two different limits, two different messages:
 *   TOO_SOON     the one-minute gap between sends — wait seconds
 *   DAILY_LIMIT  OTP_DAILY_LIMIT codes per address per 24 hours — wait hours
 */

import { OTP_DAILY_LIMIT } from "@/marketplace/lib/env";

/**
 * The action returns `wait` in seconds. Rounded up, because telling a person to
 * wait 59 seconds and refusing them at 59 seconds is worse than saying a minute.
 */
export function waitMessage(seconds, locale) {
  if (!seconds || seconds < 1) return null;
  const isAr = locale === "ar";

  if (seconds < 90) {
    const s = Math.ceil(seconds);
    return isAr
      ? `انتظر ${s} ثانية قبل طلب رمز جديد.`
      : `Wait ${s} seconds before asking for another code.`;
  }

  const m = Math.ceil(seconds / 60);
  return isAr
    ? `انتظر ${m} دقيقة قبل طلب رمز جديد.`
    : `Wait ${m} minutes before asking for another code.`;
}

/** The daily cap was hit. Says the cap and when it lifts. */
export function dailyLimitMessage(seconds, locale) {
  const isAr = locale === "ar";
  const base = isAr
    ? `وصلت إلى الحد الأقصى وهو ${OTP_DAILY_LIMIT} رموز في اليوم.`
    : `You have reached the limit of ${OTP_DAILY_LIMIT} codes per day.`;

  if (!seconds || seconds < 1) {
    return `${base} ${isAr ? "حاول مرة أخرى غداً." : "Try again tomorrow."}`;
  }

  if (seconds < 3600) {
    const m = Math.ceil(seconds / 60);
    return `${base} ${isAr ? `حاول مرة أخرى بعد ${m} دقيقة.` : `Try again in ${m} minutes.`}`;
  }

  const h = Math.ceil(seconds / 3600);
  return `${base} ${isAr ? `حاول مرة أخرى بعد ${h} ساعة.` : `Try again in ${h} hour${h === 1 ? "" : "s"}.`}`;
}

/**
 * The up-front notice. With no count yet it states the rule; once the server
 * has reported how many are left, it says that instead.
 */
export function quotaNote(remaining, locale) {
  const isAr = locale === "ar";

  if (typeof remaining !== "number") {
    return isAr
      ? `يمكنك طلب ${OTP_DAILY_LIMIT} رموز كحد أقصى في اليوم.`
      : `You can request up to ${OTP_DAILY_LIMIT} codes per day.`;
  }

  if (remaining <= 0) {
    return isAr
      ? `استخدمت جميع الرموز المتاحة اليوم (${OTP_DAILY_LIMIT}).`
      : `You have used all ${OTP_DAILY_LIMIT} codes for today.`;
  }

  return isAr
    ? `تبقّى لك ${remaining} من ${OTP_DAILY_LIMIT} رموز اليوم.`
    : `${remaining} of ${OTP_DAILY_LIMIT} codes left today.`;
}
