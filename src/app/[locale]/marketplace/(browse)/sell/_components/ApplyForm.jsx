"use client";

/**
 * The vendor application.
 *
 * Short on purpose. Everything here is either needed to identify the showroom
 * or needed to phone them back about it; the rest — logo, banner, policies,
 * shipping — belongs in Settings once they are in, not in front of someone
 * deciding whether to bother.
 *
 * The CR and VAT numbers are optional at this stage for the same reason. Staff
 * can ask for them during review, and a required field that half of applicants
 * have to go and look up is a field that loses half of the applicants.
 */

import { Loader2, AlertCircle, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionResult } from "../../../(seller)/_components/useActionResult";
import { applyToSell } from "../_actions/apply";

const MESSAGES = {
  NOT_SIGNED_IN: {
    ar: "سجّل الدخول أولاً لتقديم الطلب.",
    en: "Sign in first to apply.",
  },
  VALIDATION: { ar: "أكمل الحقول المطلوبة.", en: "Fill in the required fields." },
  APPLY_FAILED: {
    ar: "تعذّر إرسال الطلب. حاول مرة أخرى.",
    en: "Could not submit the application. Try again.",
  },
};

const FIELD_ERRORS = {
  NAME_REQUIRED: { ar: "أدخل اسم المعرض.", en: "Enter the showroom name." },
  CITY_REQUIRED: { ar: "أدخل المدينة.", en: "Enter the city." },
  PHONE_REQUIRED: { ar: "أدخل رقم التواصل.", en: "Enter a contact number." },
};

export default function ApplyForm({ locale = "ar", email = "", phone = "", city = "" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const action = useActionResult(applyToSell, { ok: false, error: null, errors: {} }, {
    autoClearMs: 0,
  });

  const fieldError = (name) => {
    const code = action.result?.errors?.[name];
    if (!code) return null;
    return FIELD_ERRORS[code]?.[locale] ?? FIELD_ERRORS[code]?.en ?? code;
  };

  // VALIDATION already shows itself field by field; repeating it at the top
  // would be the same complaint twice.
  const banner =
    action.result?.error && action.result.error !== "VALIDATION"
      ? MESSAGES[action.result.error]?.[locale] ??
        MESSAGES[action.result.error]?.en ??
        t("حدث خطأ.", "Something went wrong.")
      : null;

  const row = "grid gap-2";

  return (
    <Card>
      <CardHeader>
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-brand-primary/10">
          <Store className="h-5 w-5 text-brand-primary" />
        </span>
        <CardTitle className="text-2xl">
          {t("افتح معرضك", "Open your showroom")}
        </CardTitle>
        <CardDescription>
          {t(
            "أخبرنا عن معرضك وابدأ فوراً — تُفتح لوحة البائع مباشرة بعد الإرسال.",
            "Tell us about your showroom and start straight away — your dashboard opens as soon as you submit."
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={action.formAction} className="flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />

          {/* One of the two is enough — the action mirrors whichever is given. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={row}>
              <Label htmlFor="nameAr">{t("اسم المعرض (عربي)", "Showroom name (Arabic)")}</Label>
              <Input id="nameAr" name="nameAr" dir="rtl" placeholder="معرض الرميح" />
            </div>
            <div className={row}>
              <Label htmlFor="nameEn">{t("اسم المعرض (إنجليزي)", "Showroom name (English)")}</Label>
              <Input id="nameEn" name="nameEn" dir="ltr" placeholder="Alromaih Motors" />
            </div>
          </div>
          {fieldError("nameAr") ? (
            <p className="-mt-3 text-xs text-red-600">{fieldError("nameAr")}</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={row}>
              <Label htmlFor="city">{t("المدينة", "City")} *</Label>
              <Input
                id="city"
                name="city"
                defaultValue={city}
                placeholder={t("الرياض", "Riyadh")}
                required
              />
              {fieldError("city") ? (
                <p className="text-xs text-red-600">{fieldError("city")}</p>
              ) : null}
            </div>
            <div className={row}>
              <Label htmlFor="contactPhone">{t("رقم التواصل", "Contact phone")} *</Label>
              <Input
                id="contactPhone"
                name="contactPhone"
                type="tel"
                dir="ltr"
                defaultValue={phone}
                placeholder="+966 5X XXX XXXX"
                required
              />
              {fieldError("contactPhone") ? (
                <p className="text-xs text-red-600">{fieldError("contactPhone")}</p>
              ) : null}
            </div>
          </div>

          <div className={row}>
            <Label htmlFor="contactEmail">{t("بريد التواصل", "Contact email")}</Label>
            {/* Prefilled from the account, and editable: the person applying is
                often not the inbox that should receive enquiries. */}
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              dir="ltr"
              defaultValue={email}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={row}>
              <Label htmlFor="crNumber">
                {t("السجل التجاري", "Commercial registration")}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  {t("(اختياري)", "(optional)")}
                </span>
              </Label>
              <Input id="crNumber" name="crNumber" dir="ltr" />
            </div>
            <div className={row}>
              <Label htmlFor="vatNumber">
                {t("الرقم الضريبي", "VAT number")}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  {t("(اختياري)", "(optional)")}
                </span>
              </Label>
              <Input id="vatNumber" name="vatNumber" dir="ltr" />
            </div>
          </div>

          <div className={row}>
            <Label htmlFor="bioAr">{t("نبذة عن المعرض", "About the showroom")}</Label>
            <textarea
              id="bioAr"
              name="bioAr"
              rows={3}
              className="rounded-lg border bg-background p-3 text-sm outline-hidden focus:border-brand-primary"
              placeholder={t(
                "منذ متى تعملون، وما نوع السيارات التي تبيعونها؟",
                "How long have you been trading, and what do you sell?"
              )}
            />
          </div>

          {banner ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {banner}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={action.pending}>
            {action.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("افتح المعرض", "Open my showroom")}
          </Button>

          {/* Says what the optional CR field is actually FOR. Without this the
              verified badge looks arbitrary, and the field looks pointless. */}
          <p className="text-center text-xs text-muted-foreground">
            {t(
              "تبدأ البيع فوراً. شارة «موثّق» تُضاف بعد أن يتحقق الفريق من سجلك التجاري.",
              "You can start selling immediately. The “Verified” badge is added once the team checks your commercial registration."
            )}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
