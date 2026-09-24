"use client";

/**
 * "Boost a car" — the seller's side of a promotion.
 *
 * Sends a REQUEST (listing_boosts, state pending) at the price of the chosen
 * length. Nothing is featured until an admin approves it on Admin → Boost
 * requests, and payment is arranged with the platform team after approval.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Loader2, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useActionResult } from "./useActionResult";
import { requestBoost } from "../_actions/boosts";
import { errorText } from "@/marketplace/lib/errors";

export default function BoostRequestForm({
  locale = "ar", vendorId = null, listings = [], plans = [], initialListingId = null,
  /* Prefilled from Settings → Contact (or the account) and sent with the
     request, so the platform team can reach the seller about payment. */
  defaultPhone = "", defaultEmail = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  // Preselected when the seller arrives from Listings → "Boost this car".
  const [pickedListing, setPickedListing] = useState(initialListingId ?? "");
  const [pickedDays, setPickedDays] = useState(null);

  const ask = useActionResult(requestBoost, { ok: false, error: null }, {
    autoClearMs: 8000,
    onSuccess: () => router.refresh(),
  });

  const date = (iso) =>
    new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short" });
  // A plain number in the reader's own digits — no currency is fixed in code.
  const money = (n) =>
    new Intl.NumberFormat(isAr ? "ar-SA" : "en", { maximumFractionDigits: 2 }).format(Number(n ?? 0));

  // Derived, not stored: after a request the page refreshes and the car just
  // sent becomes unavailable, so the selection moves on by itself.
  const available = listings.filter((l) => !l.pending && !l.activeUntil);
  const listingId = available.some((l) => l.id === pickedListing) ? pickedListing : (available[0]?.id ?? "");

  // Only the plans an admin has created and switched on — nothing built in.
  const days = plans.some((p) => p.days === pickedDays) ? pickedDays : (plans[0]?.days ?? null);

  /* Which plan costs least PER DAY — the badge on the cards below. Derived
     rather than stored: an admin repricing a plan moves the badge with it,
     and it can never sit on a plan that stopped being the best deal. */
  const bestValueDays = plans.length
    ? plans.reduce((best, p) => {
        if (!(p.days > 0)) return best;
        const rate = p.price / p.days;
        return best == null || rate < best.rate ? { days: p.days, rate } : best;
      }, null)?.days ?? null
    : null;
  const plan = plans.find((p) => p.days === days) ?? null;

  if (!listings.length) {
    return (
      <div className="raised-card rounded-xl p-5 text-sm">
        <p className="font-semibold text-brand-primary">{t("لا توجد سيارات منشورة", "No live cars yet")}</p>
        <p className="mt-1 text-muted-foreground">
          {t("يمكن ترويج السيارات المنشورة فقط.", "Only live cars can be promoted.")}
        </p>
        <Link
          href={`/${locale}/marketplace/seller/listings/new`}
          className="raised-solid mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white"
        >
          {t("إضافة سيارة", "Add a car")}
        </Link>
      </div>
    );
  }

  return (
    <div className="raised-card rounded-xl p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
        <Sparkles className="h-4 w-4 text-brand-gold" />
        {t("روّج لسيارة", "Boost a car")}
      </h2>

      {/* Keyed on the success token so the note clears after a request. */}
      <form
        key={ask.raw?.ok ? ask.raw.token : "boost-form"}
        action={ask.formAction}
        className="mt-4 grid gap-4"
      >
        <input type="hidden" name="vendorId" value={vendorId ?? ""} />
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="days" value={days ?? ""} />

        <div className="grid gap-2">
          <Label htmlFor="boost-listing">{t("السيارة", "Car")}</Label>
          <Select
            value={listingId || undefined}
            onValueChange={setPickedListing}
            disabled={available.length === 0}
            dir={isAr ? "rtl" : "ltr"}
          >
            <SelectTrigger id="boost-listing" className="raised h-10 w-full border-0">
              <SelectValue
                placeholder={t("كل سياراتك مروّجة أو بانتظار المراجعة", "All your cars are already boosted or waiting")}
              />
            </SelectTrigger>
            <SelectContent className="raised-card max-h-72 border-0">
              {listings.map((l) => (
                <SelectItem
                  key={l.id}
                  value={l.id}
                  disabled={l.pending || Boolean(l.activeUntil)}
                  className="raised-hover"
                >
                  {l.title}
                  {l.pending ? ` — ${t("بانتظار المراجعة", "waiting for review")}` : ""}
                  {l.activeUntil
                    ? ` — ${t(`مميزة حتى ${date(l.activeUntil)}`, `featured until ${date(l.activeUntil)}`)}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>{t("الخطة", "Plan")}</Label>
          {plans.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              {t(
                "لا توجد خطط تمييز متاحة بعد. سيضيفها فريق المنصة قريباً.",
                "No boost plans are available yet. The platform team will add them soon."
              )}
            </p>
          ) : (
            /* ── Pricing cards ───────────────────────────────────────────
               The plans as a pricing table, because that is what they are:
               the same choice, the same question ("which one is worth it?"),
               and the same answer a seller needs in front of them — what it
               costs, what a day of it costs, and what it buys.

               The per-day figure is the one that makes a long plan legible.
               Two pills reading "7 days · 150" and "30 days · 500" are not
               comparable at a glance; "21 a day" against "17 a day" is. It is
               computed here rather than stored, so it can never disagree with
               the price beside it.

               BEST VALUE is worked out, not configured: the lowest daily rate
               among the plans on offer. An admin who reprices does not have to
               remember to move a flag, and the badge cannot end up on a plan
               that stopped being the best deal months ago. */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {plans.map((p) => {
                const picked = days === p.days;
                const perDay = p.days > 0 ? p.price / p.days : null;
                const best = bestValueDays != null && p.days === bestValueDays && plans.length > 1;

                return (
                  <button
                    key={p.id ?? p.days}
                    type="button"
                    onClick={() => setPickedDays(p.days)}
                    aria-pressed={picked}
                    className={`relative flex flex-col rounded-xl p-4 text-start transition-transform ${
                      picked
                        ? "raised-card ring-2 ring-brand-primary"
                        : "raised-card hover:-translate-y-0.5"
                    }`}
                  >
                    {best ? (
                      <span className="absolute -top-2 end-3 rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-bold text-[#2a2100] shadow-sm">
                        {t("الأفضل قيمة", "Best value")}
                      </span>
                    ) : null}

                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-brand-gold" />
                      {t(`${p.days} يوم`, `${p.days} days`)}
                    </span>

                    {/* The number, at the size a price is read at. */}
                    <span className="mt-1.5 text-2xl font-bold tabular-nums text-brand-primary">
                      {money(p.price)}
                    </span>

                    {perDay != null ? (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {t(`${money(perDay)} / يوم`, `${money(perDay)} per day`)}
                      </span>
                    ) : null}

                    <ul className="mt-3 space-y-1 border-t pt-3 text-[11px] text-muted-foreground">
                      <li className="flex items-start gap-1.5">
                        <Check className="mt-px h-3 w-3 shrink-0 text-brand-primary" />
                        {t("في صف السيارات المميزة بالصفحة الرئيسية", "In the featured row on the home page")}
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Check className="mt-px h-3 w-3 shrink-0 text-brand-primary" />
                        {t("أعلى صفحة كل السيارات", "Top of the All cars page")}
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Check className="mt-px h-3 w-3 shrink-0 text-brand-primary" />
                        {t("شارة «مميز» على البطاقة", '"Featured" badge on the card')}
                      </li>
                    </ul>

                    {/* The state, said in words as well as by the ring —
                        a colour alone is not an answer for everyone. */}
                    <span
                      className={`mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold ${
                        picked ? "raised-solid bg-brand-primary text-white" : "raised text-brand-primary"
                      }`}
                    >
                      {picked ? <Check className="h-3.5 w-3.5" /> : null}
                      {picked ? t("مختارة", "Selected") : t("اختر", "Choose")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── How to reach you ─────────────────────────────────────────────
            Sent with the request and shown to the platform team, who contact
            the seller to arrange payment after approving. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="boost-phone">{t("رقم الجوال", "Mobile number")}</Label>
            <Input
              id="boost-phone"
              name="contactPhone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
              defaultValue={defaultPhone}
              placeholder="05XXXXXXXX"
              aria-invalid={ask.result?.field === "contactPhone" || undefined}
              className="raised h-10 border-0"
            />
            {ask.result?.field === "contactPhone" ? (
              <p className="text-xs text-red-600">{errorText(ask.result.error, locale)}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="boost-email">{t("البريد الإلكتروني", "Email")}</Label>
            <Input
              id="boost-email"
              name="contactEmail"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              defaultValue={defaultEmail}
              placeholder="name@example.com"
              aria-invalid={ask.result?.field === "contactEmail" || undefined}
              className="raised h-10 border-0"
            />
            {ask.result?.field === "contactEmail" ? (
              <p className="text-xs text-red-600">{errorText(ask.result.error, locale)}</p>
            ) : null}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">
            {t(
              "يتواصل معك فريق المنصة على هذا الرقم أو البريد لترتيب الدفع.",
              "The platform team uses this number or email to arrange payment with you."
            )}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="boost-note">{t("ملاحظة للفريق (اختياري)", "Note for the team (optional)")}</Label>
          <Textarea id="boost-note" name="note" maxLength={300} rows={2} />
        </div>

        {plan ? (
          <div className="raised rounded-lg px-3 py-2.5 text-sm">
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("الإجمالي", "Total")}</span>
              <span className="font-bold tabular-nums text-brand-primary">{money(plan.price)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "لا تدفع الآن — يتواصل معك فريق المنصة لترتيب الدفع بعد الموافقة.",
                "Nothing to pay now — the platform team contacts you to arrange payment after approval."
              )}
            </p>
          </div>
        ) : null}

        {ask.result?.ok ? (
          <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {t("أُرسل الطلب. سيراجعه فريق المنصة قريباً.", "Request sent. The platform team will review it shortly.")}
          </p>
        ) : ask.result?.error && !ask.result?.field ? (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {errorText(ask.result.error, locale, ask.result.params)}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={ask.pending || !listingId || !plan}
            className="raised-solid gap-2 bg-brand-primary text-white hover:bg-brand-dark"
          >
            {ask.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("إرسال طلب الترويج", "Send promotion request")}
          </Button>
        </div>
      </form>
    </div>
  );
}
