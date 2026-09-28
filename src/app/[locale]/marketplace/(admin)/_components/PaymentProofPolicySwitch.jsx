"use client";

/**
 * "Require a transfer receipt with every request" — on, or off.
 *
 * ── Why this is its own component ───────────────────────────────────────────
 *
 * It started inside the payment-accounts panel, which is where it belongs by
 * subject and is not where anybody looked for it: an admin deciding how
 * renewals should work opens Subscriptions, not Finance → Payment methods, and
 * a setting nobody can find is a setting that does not exist.
 *
 * So it is rendered in both places. That is one SETTING shown twice, not two
 * settings: both call the same action against the same stored value, and
 * whichever screen is open when the other is changed re-reads it. The thing
 * worth avoiding is two switches that can disagree, and there is only one here.
 *
 * ── The consequence is the label ────────────────────────────────────────────
 *
 * "Required" and "optional" say nothing about what changes. What changes is
 * whether an admin's queue fills with intentions — a showroom pressing Renew
 * and then not transferring anything — so the sentence under the switch says
 * that, in whichever state it is currently in.
 */

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { savePaymentProofPolicy } from "../admin/_actions/billing";

const INITIAL = { ok: false, error: null };

export default function PaymentProofPolicySwitch({ locale = "ar", requireProof = false }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  /* autoClearMs 0: a refused change has to stay on screen. The switch springs
     back to its stored position on the refresh, so without the sentence the
     only feedback is a toggle that moved and moved back. */
  const policy = useActionResult(savePaymentProofPolicy, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => router.refresh(),
  });

  const error = policy.result?.error
    ? errorText(policy.result.error, locale, policy.result.params)
    : null;

  return (
    <div className="rounded-xl border p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-3">
        <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t("اشتراط إيصال التحويل مع الطلب", "Require a transfer receipt with every request")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {requireProof
              ? t(
                  "لا يصلك طلب التجديد أو الترويج — ولا إشعار به — إلا بعد أن يرفق المعرض صورة التحويل. يبقى المستحق في سجل المالية تحت تبويب «بانتظار الإيصال».",
                  "A renewal or promotion request does not reach you — and does not notify you — until the showroom attaches the transfer. The charge stays in the Finance ledger under the “Awaiting receipt” tab."
                )
              : t(
                  "يصلك الطلب فور إرساله، ويُرسل الإيصال متى ناسب المعرض.",
                  "A request reaches you as soon as it is made, and the receipt follows whenever the showroom sends it."
                )}
          </p>
        </div>

        <Switch
          checked={requireProof}
          disabled={policy.pending}
          aria-label={t("اشتراط الإيصال", "Require a receipt")}
          onCheckedChange={(next) => {
            const fd = new FormData();
            fd.set("requireProof", String(Boolean(next)));
            policy.dismiss();
            startTransition(() => policy.formAction(fd));
          }}
        />

        {policy.pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Switching it ON un-queues requests that are already open and have no
          receipt. Said before the press, not discovered after it. */}
      {!requireProof ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t(
            "عند التفعيل، تخرج الطلبات المفتوحة بلا إيصال من قائمة انتظارك — وتعود إن أوقفته. لا يُعدّل أي مستحق.",
            "Turning this on takes open requests with no receipt out of your queue — and turning it off brings them straight back. No charge is altered either way."
          )}
        </p>
      ) : null}
    </div>
  );
}
