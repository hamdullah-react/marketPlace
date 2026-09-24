"use client";

/**
 * Pick a plan, ask to renew, then see what you asked for.
 *
 * ── Two states, and the second one is the important one ─────────────────────
 *
 * Before: the plans, as cards, one press each.
 *
 * After: the reference to put on the transfer, the amount, and what it buys.
 * That is the state a seller is actually in for most of the time this panel is
 * on screen — they have asked, they are going to the bank, and they need to know
 * what to quote. A panel that only handled the choosing would send them back to
 * the phone to ask "what was my number again".
 *
 * ── It promises nothing about time ──────────────────────────────────────────
 *
 * The wording is careful: asking raises a charge, and access moves when the
 * platform confirms the money. Anything warmer than that would have a seller
 * refreshing a dashboard that is not going to open yet, and blaming the app for
 * a bank transfer that has not cleared.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { localized, formatPrice } from "@/marketplace/lib/listing";
import { requestRenewal, cancelRenewal } from "../_actions/subscription";

const INITIAL = { ok: false, error: null };

export default function RenewalPanel({
  locale = "ar",
  vendorId = null,
  plans = [],
  openRenewal = null,
  /* The platform's currency, from site settings. A client bundle has its own
     module scope and never sees the server's settings, so this arrives as a
     prop; undefined falls back inside formatPrice rather than crashing. */
  currency = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [picked, setPicked] = useState(plans[0]?.id ?? null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const ask = useActionResult(requestRenewal, INITIAL, { onSuccess: () => router.refresh() });
  const drop = useActionResult(cancelRenewal, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      setConfirmCancel(false);
      router.refresh();
    },
  });

  const busy = ask.pending || drop.pending;

  const send = (runner, fields) => {
    const fd = new FormData();
    fd.set("locale", locale);
    fd.set("vendorId", vendorId ?? "");
    for (const [k, v] of Object.entries(fields)) fd.set(k, String(v ?? ""));
    runner.dismiss();
    startTransition(() => runner.formAction(fd));
  };

  const error = [ask, drop]
    .map((r) => (r.result?.error ? errorText(r.result.error, locale, r.result.params) : null))
    .find(Boolean);

  const money = (n) => formatPrice(n, locale, currency);

  /* ── Already asked ───────────────────────────────────────────────────── */
  if (openRenewal) {
    return (
      <div className="rounded-xl bg-brand-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
          <Clock className="h-4 w-4" />
          {t("طلب تجديد قائم", "Renewal requested")}
        </p>

        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t("الرقم المرجعي", "Reference")}</dt>
            <dd className="font-mono font-medium" dir="ltr">
              {openRenewal.ref}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("المبلغ", "Amount")}</dt>
            <dd className="font-bold tabular-nums text-brand-primary">{money(openRenewal.amount)}</dd>
          </div>
          {openRenewal.access_days ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t("يمنح", "Buys")}</dt>
              <dd className="font-medium tabular-nums">
                {t(`${openRenewal.access_days} يوم`, `${openRenewal.access_days} days`)}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "حوّل المبلغ واكتب الرقم المرجعي في بيان التحويل. يُفتح الوصول بمجرد تأكيد الفريق للدفعة — تلقائياً، دون تحديث الصفحة.",
            "Transfer the amount and put the reference on it. Access opens as soon as the team confirms the payment — by itself, with no refresh."
          )}
        </p>

        {error ? (
          <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmCancel ? (
            <>
              <span className="text-xs text-muted-foreground">
                {t("سحب الطلب؟ يمكنك إرسال غيره.", "Withdraw it? You can ask again.")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => send(drop, { chargeId: openRenewal.id })}
              >
                {drop.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("نعم، اسحب", "Yes, withdraw")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>
                {t("تراجع", "Keep it")}
              </Button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
              {t("سحب الطلب", "Withdraw the request")}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── No plans published ──────────────────────────────────────────────── */
  if (!plans.length) {
    return (
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        {t(
          "لم تُنشر خطط الاشتراك بعد. تواصل مع فريق المنصة للتجديد.",
          "No subscription plans have been published yet. Contact the platform team to renew."
        )}
      </p>
    );
  }

  /* ── Choosing ───────────────────────────────────────────────────────── */
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const on = picked === plan.id;
          const perDay = Number(plan.days) > 0 ? Number(plan.price) / Number(plan.days) : null;

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setPicked(plan.id)}
              aria-pressed={on}
              className={`raised-card rounded-xl p-4 text-start transition-colors ${
                on ? "ring-2 ring-brand-primary" : ""
              }`}
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-primary">
                {on ? <CheckCircle2 className="h-4 w-4" /> : null}
                {localized(plan.name, locale) || t(`${plan.days} يوم`, `${plan.days} days`)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {t(`${plan.days} يوم`, `${plan.days} days`)}
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-brand-primary">{money(plan.price)}</p>

              {/* The comparable number. Three plans priced per period are three
                  numbers a seller has to divide in their head. */}
              {perDay != null ? (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {money(perDay)} {t("/ يوم", "/ day")}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !picked}
          className="gap-1.5"
          onClick={() => send(ask, { planId: picked })}
        >
          {ask.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t("طلب التجديد", "Request renewal")}
        </Button>

        <span className="text-xs text-muted-foreground">
          {t(
            "يُصدر مستحقاً برقم مرجعي للتحويل — لا يُخصم أي مبلغ الآن.",
            "This raises a charge with a reference to transfer against. Nothing is taken now."
          )}
        </span>
      </div>
    </div>
  );
}
