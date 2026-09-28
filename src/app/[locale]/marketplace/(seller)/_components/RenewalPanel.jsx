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
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import PlanCard from "../../_components/PlanCard";
import PaymentProofDialog from "./PaymentProofDialog";
import { localized, formatPrice } from "@/marketplace/lib/listing";
import { requestRenewal, cancelRenewal } from "../_actions/subscription";

const INITIAL = { ok: false, error: null };

export default function RenewalPanel({
  locale = "ar",
  vendorId = null,
  plans = [],
  openRenewal = null,
  /* The receipt already sent against that renewal, if any. Null means none has
     been — which is the state the panel has to be loudest about. */
  openRenewalProof = null,
  /* The platform's rule. When it is on, asking is only half the request: the
     platform does not see it until the receipt arrives, and saying so is the
     difference between a showroom waiting patiently for nothing and one that
     finishes the job. */
  requireProof = false,
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
        {/* Two different states wearing one heading would be the whole bug:
            "requested" reads as "with them", and under the receipt rule it is
            not with them at all until step 2 is done. */}
        {requireProof && !openRenewalProof ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {t("لم يصل طلبك بعد — ينقصه الإيصال", "Your request has not reached us yet — it needs the receipt")}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <Clock className="h-4 w-4" />
            {t("طلب تجديد قائم", "Renewal requested")}
          </p>
        )}

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

        {/* ── The step that is NOT optional ────────────────────────
            Asking to renew raises a charge and does nothing else. A showroom
            that presses the button, transfers the money at its bank and then
            waits is waiting for something that will not happen: nobody on the
            platform knows the transfer exists until the receipt arrives.

            That used to be a sentence in the same grey as everything around it,
            and it was read as a description of a process running by itself
            rather than as an instruction. So it is now two numbered steps with
            the button inside the second one — and the panel says plainly, in
            amber, when the receipt has not been sent. */}
        <ol className="mt-3 grid gap-2 text-xs">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 font-bold text-brand-primary">
              1
            </span>
            <span className="text-muted-foreground">
              {t(
                "حوّل المبلغ إلى حساب المنصة، واكتب الرقم المرجعي في بيان التحويل.",
                "Transfer the amount to the platform’s account, putting the reference on the transfer."
              )}
            </span>
          </li>

          <li className="flex gap-2">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold ${
                openRenewalProof
                  ? "bg-brand-primary/10 text-brand-primary"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              2
            </span>
            <span className={openRenewalProof ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}>
              <strong className="font-semibold">
                {t("أرسل إيصال التحويل — خطوة لازمة. ", "Send us the transfer receipt — this step is required. ")}
              </strong>
              {requireProof
                ? t(
                    "لا يصل طلبك إلى فريق المنصة قبله. بمجرد إرساله يدخل الطلب قائمة المراجعة، ويُفتح الوصول فور اعتماده — تلقائياً، دون تحديث الصفحة.",
                    "Your request does not reach the platform team until you do. Once it is sent the request joins their queue, and access opens the moment it is accepted — by itself, with no refresh."
                  )
                : t(
                    "لا تُسجّل الدفعة ولا تبدأ المدة قبل أن يراها الفريق. يُفتح الوصول فور اعتماده — تلقائياً، دون تحديث الصفحة.",
                    "The payment is not recorded and your days do not start until somebody here has seen it. Access opens the moment it is accepted — by itself, with no refresh."
                  )}
            </span>
          </li>
        </ol>

        {/* The button for step 2, right under it. vendorId may be null on a
            panel rendered for a showroom the viewer only reads; the dialog
            refuses that on the server anyway. */}
        <div className="mt-3">
          <PaymentProofDialog
            locale={locale}
            vendorId={vendorId}
            charge={{ ...openRenewal, state: "due" }}
            proof={openRenewalProof}
          />
        </div>

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
        {plans.map((plan) => (
          /* The same card again, as the control itself. A seller choosing what
             to pay for should be reading the SAME words the pricing page sold
             them — the old picker showed a name, a length and a price, which is
             the one moment a description is most worth having. */
          <PlanCard
            key={plan.id}
            plan={plan}
            locale={locale}
            currency={currency}
            compact
            selectable
            selected={picked === plan.id}
            onSelect={() => setPicked(plan.id)}
          />
        ))}
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
          {requireProof
            ? t(
                "يُصدر مستحقاً برقم مرجعي للتحويل — لا يُخصم أي مبلغ الآن، ويكتمل الطلب بإرسال إيصال التحويل.",
                "This raises a charge with a reference to transfer against. Nothing is taken now, and the request is completed by sending the transfer receipt."
              )
            : t(
                "يُصدر مستحقاً برقم مرجعي للتحويل — لا يُخصم أي مبلغ الآن.",
                "This raises a charge with a reference to transfer against. Nothing is taken now."
              )}
        </span>
      </div>
    </div>
  );
}
