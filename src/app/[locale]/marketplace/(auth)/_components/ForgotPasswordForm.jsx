"use client";

/**
 * Resetting a password, in two screens.
 *
 *   1. the address        → a code goes out by email
 *   2. the code + the new password, together
 *
 * Step two is ONE form on purpose. Verifying a recovery code signs the person
 * in, so splitting it would leave anyone who abandons the page halfway silently
 * logged in by a code that was only ever meant to authorise a password change.
 *
 * Step one always reports success, whether or not the address has an account.
 * Saying "no such user" turns a leaked email list into a list of confirmed
 * customers; the person who owns the inbox learns the truth either way.
 */

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { sendRecoveryOtp, resetPasswordWithOtp } from "../_actions/otp";
import CodeField from "./CodeField";
import { otpLength } from "@/marketplace/lib/env";
import { waitMessage, dailyLimitMessage, quotaNote } from "./otpQuota";

const MESSAGES = {
  CREDENTIALS_REQUIRED: { ar: "أدخل بريدك الإلكتروني.", en: "Enter your email address." },
  CODE_INVALID: {
    ar: "الرمز غير صحيح. تحقّق من الأرقام.",
    en: "That code is not right. Check the digits again.",
  },
  CODE_EXPIRED: {
    ar: "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
    en: "That code has expired. Ask for a new one.",
  },
  PASSWORD_TOO_SHORT: {
    ar: "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
    en: "Your password must be at least 8 characters.",
  },
  TOO_SOON: {
    ar: "انتظر قليلاً قبل طلب رمز جديد.",
    en: "Wait a moment before asking for another code.",
  },
  EMAIL_LIMIT: {
    ar: "أُرسلت رسائل كثيرة خلال وقت قصير. حاول بعد قليل.",
    en: "Too many emails have gone out just now. Try again in a little while.",
  },
  // Reported rather than swallowed: our mail server being down says nothing
  // about who has an account, and silence would leave someone waiting for an
  // email that was never going to arrive.
  SEND_FAILED: {
    ar: "تعذّر إرسال الرمز الآن. حاول مرة أخرى بعد قليل.",
    en: "We could not send the code just now. Try again shortly.",
  },
  SAVE_FAILED: { ar: "تعذّر تغيير كلمة المرور.", en: "Could not change the password." },
};

export default function ForgotPasswordForm({ locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [showPassword, setShowPassword] = useState(false);
  // See otpLength(): a per-project Supabase setting, 8 here, not the usual 6.
  const codeLen = otpLength();

  const send = useActionResult(sendRecoveryOtp, { ok: false, error: null }, { autoClearMs: 0 });
  const reset = useActionResult(resetPasswordWithOtp, { ok: false, error: null }, { autoClearMs: 0 });
  // Step two's "send another code" gets its own slot. Sharing step one's would
  // mean a refused resend (daily limit) flips `send.result.ok` to false and
  // throws the person back to the email screen mid-reset.
  const resend = useActionResult(sendRecoveryOtp, { ok: false, error: null }, { autoClearMs: 0 });

  const msg = (r) => {
    if (!r?.error) return null;
    if (r.error === "DAILY_LIMIT") return dailyLimitMessage(r.wait, locale);
    // The throttle knows exactly how long; say so instead of "a moment".
    if (r.error === "TOO_SOON") {
      const exact = waitMessage(r.wait, locale);
      if (exact) return exact;
    }
    return MESSAGES[r.error]?.[locale] ?? MESSAGES[r.error]?.en ?? null;
  };

  /* ── Step 2 ────────────────────────────────────────────────────────────── */
  if (send.result?.ok) {
    const sentTo = send.result.email ?? "";
    const error = msg(reset.result);
    const resendError = msg(resend.result);
    const remaining =
      typeof resend.result?.remaining === "number"
        ? resend.result.remaining
        : send.result.remaining ?? null;
    const outOfCodes = remaining === 0;

    return (
      <Card>
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 dark:bg-green-950/50">
            <MailCheck className="h-6 w-6 text-green-600" />
          </span>
          <CardTitle className="text-2xl">{t("كلمة مرور جديدة", "New password")}</CardTitle>
          <CardDescription>
            {t("إذا كان لهذا البريد حساب، فقد أرسلنا رمزاً إلى ", "If that address has an account, we sent a code to ")}
            <span className="font-medium text-foreground" dir="ltr">{sentTo}</span>
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={reset.formAction} className="flex flex-col gap-5">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="email" value={sentTo} />

            <div className="grid gap-2">
              <Label className="text-center">{t("الرمز", "Code")}</Label>
              {/* No autosubmit here: the code is only half of what this form
                  needs, and submitting on the sixth digit would post an empty
                  password every time. */}
              <CodeField disabled={reset.pending} autoSubmit={false} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">{t("كلمة المرور الجديدة", "New password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dir="ltr"
                  className="pe-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={t("إظهار كلمة المرور", "Show password")}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("8 أحرف على الأقل.", "At least 8 characters.")}
              </p>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={reset.pending}>
              {reset.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("تغيير كلمة المرور", "Change password")}
            </Button>
          </form>

          {/* Reuses step one's form, so a resend is the same code path that
              sent the first one — no second "send" action to keep in step. */}
          <form action={resend.formAction} className="mt-4 flex flex-col items-center gap-1 text-center">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="email" value={sentTo} />
            <button
              type="submit"
              disabled={resend.pending || outOfCodes}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-brand-primary hover:underline disabled:pointer-events-none disabled:opacity-60"
            >
              {outOfCodes
                ? t("وصلت إلى حد الرموز اليومي", "Daily code limit reached")
                : resend.result?.ok
                  ? t("أُرسل رمز جديد ✓", "New code sent ✓")
                  : t("أرسل رمزاً جديداً", "Send another code")}
            </button>
            {resendError ? (
              <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {resendError}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{quotaNote(remaining, locale)}</p>
          </form>
        </CardContent>
      </Card>
    );
  }

  /* ── Step 1 ────────────────────────────────────────────────────────────── */
  const error = msg(send.result);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          {t("إعادة تعيين كلمة المرور", "Reset your password")}
        </CardTitle>
        <CardDescription>
          {t(
            `أدخل بريدك الإلكتروني وسنرسل لك رمزاً من ${codeLen} أرقام.`,
            `Enter your email and we will send you a ${codeLen}-digit code.`
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={send.formAction}>
          <input type="hidden" name="locale" value={locale} />

          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">{t("البريد الإلكتروني", "Email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="m@example.com"
                dir="ltr"
                required
              />
              <p className="text-xs text-muted-foreground">{quotaNote(null, locale)}</p>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={send.pending}>
              {send.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("إرسال الرمز", "Send code")}
            </Button>
          </div>

          <div className="mt-4 text-center text-sm">
            <Link href={`/${locale}/marketplace/login`} className="underline underline-offset-4">
              {t("العودة لتسجيل الدخول", "Back to sign in")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
