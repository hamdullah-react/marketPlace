"use client";

/**
 * The button on a pricing card, and the whole strategy behind it.
 *
 * ── A price page has FOUR kinds of reader, not two ───────────────────────────
 *
 * The naive version is "signed in → subscribe, signed out → login". It gets two
 * of the four wrong, and both wrong answers cost the platform the showroom:
 *
 *   guest    Sent to sign in, and TOLD WHY before they get there. A plain login
 *            wall on a pricing page reads as "we will not tell you the price" —
 *            which is why the prices are all still on screen behind this.
 *
 *   buyer    Signed in, but no showroom. Sending them to a renew action would
 *            fail with "you are not a seller", which is true and useless. They
 *            need the application form, and to be told that buying on the
 *            marketplace is free — most people who land here are buyers who
 *            followed a footer link and are wondering whether they must pay.
 *
 *   seller   A member of a showroom. Pressing this RAISES A CHARGE — the same
 *            action the blocked screen and the billing page use, so there is one
 *            renewal path in the app and not a second one that skips its rules.
 *
 *   waiting  A seller who already asked. There may only be one open renewal at a
 *            time (vendor_charges_one_open_renewal), so a second press could
 *            only ever fail — it says where their request is instead.
 *
 * ── Nothing here grants a single day ────────────────────────────────────────
 *
 * requestRenewal() raises a charge and tells them where to transfer. Access
 * moves when an admin records the payment. A seller who could grant their own
 * access would not need to pay, so this button cannot be the thing that opens
 * the dashboard — see the action's own note.
 */

import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { requestRenewal } from "../../(seller)/_actions/subscription";

const INITIAL = { ok: false, error: null };

export default function PlanCta({
  locale = "ar",
  planId,
  audience = "guest", // guest | buyer | seller | waiting
  /** The synthesised free-trial card. It is started, never bought. */
  trial = false,
  vendorId = null,
  featured = false,
  loginHref = "",
  applyHref = "",
  billingHref = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const ask = useActionResult(requestRenewal, INITIAL, { onSuccess: () => router.refresh() });

  const error = ask.result?.error ? errorText(ask.result.error, locale, ask.result.params) : null;

  /* The highlighted card gets the solid button; the rest get outlines. One
     primary action per screen is what makes a choice feel made for you. */
  const look = featured ? "" : "outline";

  /* ── The free card ─────────────────────────────────────────────────────
     Nothing here raises a charge, because the trial is not a purchase: it
     starts by itself when a showroom is created (the trigger in the VENDOR
     ACCESS section of schema.sql). So every branch is a LINK to the step that
     actually begins it, and a showroom that is already inside is told the
     truth rather than being sold something it has had since day one. */
  if (trial) {
    if (audience === "seller" || audience === "waiting") {
      return (
        <p className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary/5 px-4 py-2.5 text-center text-sm font-medium text-muted-foreground">
          <Check className="h-4 w-4 shrink-0 text-brand-primary" />
          {t("بدأت مع فتح معرضك", "Started when you opened your showroom")}
        </p>
      );
    }

    return (
      <Link
        href={audience === "buyer" ? applyHref : loginHref}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
      >
        {audience === "buyer" ? <Store className="h-4 w-4" /> : null}
        {t("ابدأ مجاناً", "Start free")}
        {audience === "buyer" ? null : (
          <ArrowRight className={`h-4 w-4 ${isAr ? "rotate-180" : ""}`} />
        )}
      </Link>
    );
  }

  if (audience === "waiting") {
    return (
      <Link
        href={billingHref}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <Clock className="h-4 w-4" />
        {t("لديك طلب قائم — تابعه", "You have a request — follow it")}
      </Link>
    );
  }

  if (audience === "guest") {
    return (
      <Link
        href={loginHref}
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
          featured
            ? "bg-brand-primary text-white hover:opacity-90"
            : "border border-brand-primary/40 text-brand-primary hover:bg-brand-primary/10"
        }`}
      >
        {t("ابدأ الاشتراك", "Get started")}
        <ArrowRight className={`h-4 w-4 ${isAr ? "rotate-180" : ""}`} />
      </Link>
    );
  }

  if (audience === "buyer") {
    return (
      <Link
        href={applyHref}
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
          featured
            ? "bg-brand-primary text-white hover:opacity-90"
            : "border border-brand-primary/40 text-brand-primary hover:bg-brand-primary/10"
        }`}
      >
        <Store className="h-4 w-4" />
        {t("افتح معرضاً أولاً", "Open a showroom first")}
      </Link>
    );
  }

  /* ── A seller ────────────────────────────────────────────────────────── */
  const send = () => {
    const fd = new FormData();
    fd.set("locale", locale);
    fd.set("vendorId", vendorId ?? "");
    fd.set("planId", planId);
    ask.dismiss();
    startTransition(() => ask.formAction(fd));
  };

  if (ask.result?.ok) {
    return (
      <div className="w-full">
        <p className="flex items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 dark:bg-green-950/40 dark:text-green-300">
          <Check className="h-4 w-4" />
          {t("تم إرسال الطلب", "Request sent")}
        </p>
        <Link
          href={billingHref}
          className="mt-2 block text-center text-xs font-medium text-brand-primary hover:underline"
        >
          {t("عرض تفاصيل التحويل", "See the transfer details")}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Button
        type="button"
        variant={look || undefined}
        disabled={ask.pending}
        onClick={send}
        className={`w-full gap-2 rounded-xl py-5 text-sm font-semibold ${
          featured ? "" : "border-brand-primary/40 text-brand-primary"
        }`}
      >
        {ask.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("اطلب هذه الخطة", "Request this plan")}
      </Button>

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-center text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
