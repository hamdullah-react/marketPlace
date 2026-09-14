"use client";

/**
 * The form that stands between signing in and using the marketplace.
 *
 * Deliberately short. It asks for four things, three of them one line each, and
 * it says why in one sentence at the top — a gate that does not explain itself
 * reads as an obstacle, and the person on the other side of it has just signed
 * up and has nothing invested yet.
 */

import Link from "next/link";
import { Loader2, Phone, MapPin, AlertCircle } from "lucide-react";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { saveEssentials } from "../_actions/profile";

const MESSAGES = {
  NOT_SIGNED_IN: {
    ar: "انتهت جلستك. سجّل الدخول مرة أخرى.",
    en: "Your session has ended. Sign in again.",
  },
  CHECK_FIELDS: { ar: "راجع الحقول المميزة بالأحمر.", en: "Check the fields marked in red." },
  SAVE_FAILED: { ar: "تعذّر الحفظ. حاول مرة أخرى.", en: "Could not save. Try again." },
  PHONE_REQUIRED: { ar: "رقم الجوال مطلوب.", en: "Your mobile number is required." },
  PHONE_INVALID: { ar: "أدخل رقم جوال سعودي صحيح.", en: "Enter a valid Saudi mobile number." },
  REQUIRED: { ar: "هذا الحقل مطلوب.", en: "This field is required." },
  TOO_LONG: { ar: "هذه القيمة طويلة جداً.", en: "That is too long." },
};

export default function CompleteProfileForm({
  locale = "ar",
  // Prefilled from the profile and from Google, so most people are typing an
  // address and nothing else.
  phone = "",
  fullName = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const save = useActionResult(saveEssentials, { ok: false, error: null }, { autoClearMs: 0 });

  const msg = (code) =>
    code ? MESSAGES[code]?.[locale] ?? MESSAGES[code]?.en ?? code : null;

  const fieldError = (name) => msg(save.result?.errors?.[name]);
  const problem = save.result?.error ? msg(save.result.error) : null;

  /* One class for every input, so a field cannot drift out of step with the
     others — and a red ring when that field is the one being complained about,
     rather than one banner for a form with four inputs. */
  const input = (name) =>
    `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-brand-primary dark:bg-white/5 ${
      fieldError(name)
        ? "border-red-400 dark:border-red-500"
        : "border-gray-200 dark:border-white/10"
    }`;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Why they are here ──────────────────────────────────────────────
          Said before the first field, not after the last. */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("أكمل بياناتك", "One more step")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t(
            fullName
              ? `مرحباً ${fullName}. يحتاج البائع رقمك وعنوانك للتواصل معك وتوصيل طلبك.`
              : "يحتاج البائع رقمك وعنوانك للتواصل معك وتوصيل طلبك.",
            fullName
              ? `Welcome, ${fullName}. Sellers reach you on your number, and orders are delivered to your address.`
              : "Sellers reach you on your number, and orders are delivered to your address."
          )}
        </p>
      </div>

      {problem ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{problem}</span>
        </div>
      ) : null}

      <form action={save.formAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />

        {/* ── The number ─────────────────────────────────────────────────── */}
        <Field
          name="phone"
          error={fieldError("phone")}
          label={t("رقم الجوال", "Mobile number")}
          hint={t("مثال: 0512345678", "For example: 0512345678")}
        >
          <div className="relative">
            <Phone className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-gray-400 ltr:left-3 rtl:right-3" />
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              defaultValue={phone}
              placeholder="05XXXXXXXX"
              className={`${input("phone")} ltr:pl-9 rtl:pr-9`}
            />
          </div>
        </Field>

        {/* ── The address ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
          <MapPin className="h-3.5 w-3.5" />
          {t("العنوان", "Address")}
        </div>

        <Field name="city" error={fieldError("city")} label={t("المدينة", "City")}>
          <input
            id="city"
            name="city"
            autoComplete="address-level2"
            placeholder={t("الرياض", "Riyadh")}
            className={input("city")}
          />
        </Field>

        <Field name="district" error={fieldError("district")} label={t("الحي", "District")}>
          <input
            id="district"
            name="district"
            autoComplete="address-level3"
            placeholder={t("العليا", "Al Olaya")}
            className={input("district")}
          />
        </Field>

        <Field name="street" error={fieldError("street")} label={t("الشارع", "Street")}>
          <input
            id="street"
            name="street"
            autoComplete="address-line1"
            placeholder={t("طريق الملك فهد", "King Fahd Road")}
            className={input("street")}
          />
        </Field>

        {/* Optional, and labelled as such — an unmarked optional field is one
            people stop to worry about. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="building" className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t("رقم المبنى", "Building")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("(اختياري)", "(optional)")}
              </span>
            </label>
            <input id="building" name="building" className={input("building")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="postalCode" className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t("الرمز البريدي", "Postcode")}{" "}
              <span className="font-normal text-muted-foreground">
                {t("(اختياري)", "(optional)")}
              </span>
            </label>
            <input
              id="postalCode"
              name="postalCode"
              inputMode="numeric"
              dir="ltr"
              className={input("postalCode")}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={save.pending}
          className="raised-solid mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("حفظ ومتابعة", "Save and continue")}
        </button>
      </form>

      {/* No "skip". The gate exists because a lead nobody can ring is worse
          than no lead, so the only way past it is through it — but browsing
          stays open, and that is the honest way out for someone not ready. */}
      <Link
        href={`/${locale}/marketplace/cars`}
        className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {t("تصفّح السيارات أولاً", "Browse cars first")}
      </Link>
    </div>
  );
}

/**
 * One labelled field.
 *
 * MODULE SCOPE, not declared inside CompleteProfileForm. A component defined
 * inside another is a new TYPE on every render, so React tears the old one
 * down and mounts a fresh one rather than updating it — and these inputs are
 * UNCONTROLLED. The form re-renders exactly once: when the server action comes
 * back with validation errors. So the nested version blanked every box the
 * moment it told the person their phone number was wrong, which is the worst
 * possible moment to lose an address they had just typed.
 *
 * The error text is passed in rather than looked up, because a module-scope
 * component cannot see the action result.
 */
function Field({ name, label, children, hint, error }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-xs font-medium text-gray-700 dark:text-gray-300">
        {label} <span className="text-red-500">*</span>
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
