"use client";

/**
 * Sign in and sign up, one component.
 *
 * shadcn's login-01 block is the layout — Card, Label, Input, full-width
 * Button, the "don't have an account?" line underneath. The registry has no
 * signup block (login-01..05 are all it ships), so the sign-up side is the same
 * card with a name field and a confirm field, rather than a second design
 * invented next to the first.
 *
 * One component rather than two because the two forms differ by three fields
 * and a heading. Two files would be one file plus a copy of its error handling,
 * its locale strings and its submit button, kept in step by hand.
 */

import { useState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, MailCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { signIn, signUp, signInWithGoogle } from "../_actions/auth";
import { verifySignupOtp, resendSignupOtp } from "../_actions/otp";
import CodeField from "./CodeField";
import { otpLength } from "@/marketplace/lib/env";
import { waitMessage, dailyLimitMessage, quotaNote } from "./otpQuota";

const MESSAGES = {
  BAD_CREDENTIALS: {
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    en: "That email or password is not right.",
  },
  CREDENTIALS_REQUIRED: {
    ar: "أدخل البريد الإلكتروني وكلمة المرور.",
    en: "Enter your email and password.",
  },
  EMAIL_NOT_CONFIRMED: {
    ar: "لم يتم تأكيد بريدك بعد — افتح الرابط الذي أرسلناه لك.",
    en: "Your email is not confirmed yet — open the link we sent you.",
  },
  EMAIL_TAKEN: {
    ar: "هذا البريد مسجّل بالفعل. سجّل الدخول بدلاً من ذلك.",
    en: "That email is already registered. Sign in instead.",
  },
  NAME_REQUIRED: { ar: "أدخل اسمك.", en: "Enter your name." },
  PASSWORD_TOO_SHORT: {
    ar: "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
    en: "Your password must be at least 8 characters.",
  },
  PASSWORDS_DIFFER: { ar: "كلمتا المرور غير متطابقتين.", en: "The two passwords do not match." },
  SIGNUP_FAILED: { ar: "تعذّر إنشاء الحساب.", en: "Could not create the account." },
  GOOGLE_FAILED: {
    ar: "تعذّر الاتصال بجوجل. حاول مرة أخرى.",
    en: "Could not reach Google. Try again.",
  },
  CODE_INVALID: {
    ar: "الرمز غير صحيح. تحقّق من الأرقام.",
    en: "That code is not right. Check the digits again.",
  },
  // A different problem with a different fix, so a different message: retyping
  // an expired code can never work.
  CODE_EXPIRED: {
    ar: "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
    en: "That code has expired. Ask for a new one.",
  },
  TOO_SOON: {
    ar: "انتظر قليلاً قبل طلب رمز جديد.",
    en: "Wait a moment before asking for another code.",
  },
  EMAIL_LIMIT: {
    ar: "أُرسلت رسائل كثيرة خلال وقت قصير. حاول بعد قليل.",
    en: "Too many emails have gone out just now. Try again in a little while.",
  },
  SEND_FAILED: { ar: "تعذّر إرسال الرمز.", en: "Could not send the code." },
};

/**
 * Google's mark, inline.
 *
 * Four paths in its own brand colours, because that is what Google's branding
 * terms require and because a monochrome stand-in reads as a disabled button.
 * Inline rather than a file: an <img> here is a second request for under a
 * kilobyte.
 */
function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" />
    </svg>
  );
}

/** A throttle error in words, with the exact wait when the server gave one. */
function limitMessage(result, locale) {
  if (result?.error === "DAILY_LIMIT") return dailyLimitMessage(result.wait, locale);
  if (result?.error === "TOO_SOON") return waitMessage(result.wait, locale);
  return null;
}

export default function AuthForm({ mode = "signin", locale = "ar", next = "" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const isSignUp = mode === "signup";

  const [showPassword, setShowPassword] = useState(false);
  // Named rather than assumed — see otpLength(). This project sends eight.
  const codeLen = otpLength();
  // Checked here, not on the server: the server never sees the second field, and
  // a round trip to be told the two boxes in front of you differ is a round trip
  // for nothing.
  const [mismatch, setMismatch] = useState(false);

  const action = useActionResult(isSignUp ? signUp : signIn, { ok: false, error: null }, {
    // Errors are what this form is for — a mistyped password should stay on
    // screen until it is fixed, not fade after four seconds.
    autoClearMs: 0,
  });

  // Its own result slot, because Google being unreachable and a wrong password
  // are different problems; sharing one would let the newer overwrite the one
  // the user is still reading.
  const google = useActionResult(signInWithGoogle, { ok: false, error: null }, {
    autoClearMs: 0,
  });

  // The confirmation step. Separate hooks so a failed code and a rate-limited
  // resend can both be on screen, saying different things.
  const verify = useActionResult(verifySignupOtp, { ok: false, error: null }, {
    autoClearMs: 0,
  });
  // No auto-clear: the "codes left today" count and a limit message must stay
  // readable, not fade after four seconds.
  const resend = useActionResult(resendSignupOtp, { ok: false, error: null }, {
    autoClearMs: 0,
  });

  const failed = action.result?.error ? action.result : google.result;

  const error = mismatch
    ? MESSAGES.PASSWORDS_DIFFER[locale] ?? MESSAGES.PASSWORDS_DIFFER.en
    : failed?.error
      ? limitMessage(failed, locale) ??
        MESSAGES[failed.error]?.[locale] ??
        MESSAGES[failed.error]?.en ??
        t("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")
      : null;

  const otherHref = `/${locale}/marketplace/${isSignUp ? "login" : "signup"}${
    next ? `?next=${encodeURIComponent(next)}` : ""
  }`;

  /* ── Sign-up succeeded but needs a confirmed email ────────────────────────
     A "check your inbox" card, not a toast: the next step happens in another
     application, and a message that disappears takes the instruction with it.
     ---------------------------------------------------------------------- */
  if (action.result?.ok && action.result?.confirmEmail) {
    const sentTo = action.result.email ?? "";

    const failedCode = verify.result?.error
      ? verify.result
      : resend.result?.error
        ? resend.result
        : null;

    // Latest count the server reported: the resend's if there was one, else the
    // sign-up's own send.
    const remaining =
      typeof resend.result?.remaining === "number"
        ? resend.result.remaining
        : action.result.remaining ?? null;
    const outOfCodes = remaining === 0;

    // The throttle knows exactly how long to wait; say so instead of "a moment".
    const codeMessage = failedCode
      ? limitMessage(failedCode, locale) ||
        MESSAGES[failedCode.error]?.[locale] ||
        MESSAGES[failedCode.error]?.en ||
        null
      : null;

    return (
      <Card>
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 dark:bg-green-950/50">
            <MailCheck className="h-6 w-6 text-green-600" />
          </span>
          <CardTitle className="text-2xl">{t("أدخل الرمز", "Enter your code")}</CardTitle>
          <CardDescription>
            {t(`أرسلنا رمزاً من ${codeLen} أرقام إلى `, `We sent a ${codeLen}-digit code to `)}
            <span className="font-medium text-foreground" dir="ltr">{sentTo}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form action={verify.formAction} className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="email" value={sentTo} />

            <CodeField disabled={verify.pending} />

            {codeMessage ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {codeMessage}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={verify.pending}>
              {verify.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("تأكيد", "Confirm")}
            </Button>
          </form>

          {/* Its own form: resending must not carry the half-typed code, and
              must not be blocked by the code field being empty. */}
          <form action={resend.formAction} className="flex flex-col items-center gap-1 text-center">
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
                  : t("لم يصلك الرمز؟ أرسله مرة أخرى", "Did not get it? Send another code")}
            </button>
            <p className="text-xs text-muted-foreground">{quotaNote(remaining, locale)}</p>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            {t("الرابط في نفس الرسالة يعمل أيضاً.", "The link in the same email works too.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          {isSignUp ? t("إنشاء حساب", "Create an account") : t("تسجيل الدخول", "Login")}
        </CardTitle>
        <CardDescription>
          {isSignUp
            ? t(
                "أنشئ حساباً لحفظ السيارات والتواصل مع البائعين.",
                "Create an account to save cars and message sellers."
              )
            : t(
                "أدخل بريدك الإلكتروني للدخول إلى حسابك.",
                "Enter your email below to login to your account."
              )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          action={action.formAction}
          onSubmit={(e) => {
            if (!isSignUp) return;
            // The Google button is a submit button in THIS form, so it lands
            // here too — and formNoValidate suppresses the browser's checks,
            // not this one. Someone signing up with Google has no password to
            // confirm, and blocking them over an empty second box would be a
            // dead button with no explanation.
            if (e.nativeEvent.submitter?.dataset.oauth !== undefined) return;

            const form = e.currentTarget;
            const differ = form.password.value !== form.confirm.value;
            setMismatch(differ);
            // The action never runs, so no request is made and nothing is
            // logged with a password in it.
            if (differ) e.preventDefault();
          }}
        >
          {/* Carried through the form so the action can build locale-correct
              redirects without reading the URL it was posted from. */}
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={next} />

          <div className="flex flex-col gap-6">
            {isSignUp ? (
              <div className="grid gap-2">
                <Label htmlFor="fullName">{t("الاسم", "Name")}</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder={t("محمد الرميح", "Mohammed Alromaih")}
                  required
                />
              </div>
            ) : null}

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
              {isSignUp ? (
                <p className="text-xs text-muted-foreground">
                  {t("سنرسل رمز تأكيد إلى بريدك. ", "We will email you a confirmation code. ")}
                  {quotaNote(null, locale)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">{t("كلمة المرور", "Password")}</Label>
                {!isSignUp ? (
                  <Link
                    href={`/${locale}/marketplace/forgot-password`}
                    className="ms-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    {t("نسيت كلمة المرور؟", "Forgot your password?")}
                  </Link>
                ) : null}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  dir="ltr"
                  className="pe-10"
                  required
                />
                {/* A password field you cannot read is where most sign-up
                    failures come from, and it is worse on a phone keyboard. */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={t("إظهار كلمة المرور", "Show password")}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {isSignUp ? (
                <p className="text-xs text-muted-foreground">
                  {t("8 أحرف على الأقل.", "At least 8 characters.")}
                </p>
              ) : null}
            </div>

            {isSignUp ? (
              <div className="grid gap-2">
                <Label htmlFor="confirm">{t("تأكيد كلمة المرور", "Confirm password")}</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  dir="ltr"
                  required
                  onChange={() => (mismatch ? setMismatch(false) : null)}
                />
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={action.pending || google.pending}>
              {action.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSignUp ? t("إنشاء الحساب", "Create account") : t("تسجيل الدخول", "Login")}
            </Button>

            {/* ── Google ────────────────────────────────────────────────────
                `formAction` posts THIS form to a different action — that is how
                one form carries two submit buttons. A nested <form> would be
                invalid HTML and React will not render it.

                `formNoValidate` is what makes it work at all: email and
                password are `required`, so without it the browser refuses to
                submit and demands a password from someone who came here
                precisely so they would not need one.
                ------------------------------------------------------------ */}
            <div className="relative text-center text-sm">
              <span className="absolute inset-x-0 top-1/2 border-t" aria-hidden="true" />
              <span className="relative bg-card px-2 text-muted-foreground">
                {t("أو", "Or continue with")}
              </span>
            </div>

            <Button
              type="submit"
              variant="outline"
              className="w-full gap-2"
              formAction={google.formAction}
              formNoValidate
              data-oauth=""
              disabled={action.pending || google.pending}
            >
              {google.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
              {t("المتابعة عبر جوجل", isSignUp ? "Sign up with Google" : "Login with Google")}
            </Button>
          </div>

          <div className="mt-4 text-center text-sm">
            {isSignUp
              ? t("لديك حساب بالفعل؟ ", "Already have an account? ")
              : t("ليس لديك حساب؟ ", "Don't have an account? ")}
            <Link href={otherHref} className="underline underline-offset-4">
              {isSignUp ? t("تسجيل الدخول", "Login") : t("إنشاء حساب", "Sign up")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
