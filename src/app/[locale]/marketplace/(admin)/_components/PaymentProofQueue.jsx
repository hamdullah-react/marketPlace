"use client";

/**
 * Receipts waiting to be looked at — Admin → Finance.
 *
 * ── Accepting is what calls the money in ────────────────────────────────────
 *
 * This is not a tidying screen. Accepting a receipt records the payment, which
 * extends a subscription by the days the charge carries or starts the promotion
 * the charge paid for. That is why the accept button says what will happen
 * rather than "OK", and why the panel shows the charge's own amount beside the
 * one the showroom claims to have sent: those two disagreeing is the single
 * most common reason to refuse, and an admin should not have to open another
 * tab to notice it.
 *
 * ── The screenshot is fetched through a signed link ─────────────────────────
 *
 * Receipts are in a private bucket, so there is no permanent src to put in an
 * <img>. The route mints an hour-long signature at click time and checks who is
 * asking — see /api/marketplace/payments/[id]/view. Opened in a new tab rather
 * than inlined, so a bank statement is never sitting on screen behind somebody.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Check, Clock, ExternalLink, Loader2, Receipt, Store, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { reviewPaymentProof } from "../admin/_actions/billing";
import { errorText } from "@/marketplace/lib/errors";
import { PAYMENT_METHODS, methodLabel, kindLabel } from "@/marketplace/lib/billing";
import { formatPrice, localized } from "@/marketplace/lib/listing";
import { toLocalInput, toInstant } from "@/marketplace/lib/datetime";

const INITIAL = { ok: false, error: null };

export default function PaymentProofQueue({
  locale = "ar",
  items = [],
  accounts = [],
  currency = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [reviewing, setReviewing] = useState(null);

  if (!items.length) return null;

  const money = (n) => formatPrice(n, locale, currency);

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleString(isAr ? "ar-SA-u-ca-gregory" : "en-GB", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          timeZone: "Asia/Riyadh",
        })
      : "—";

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
          <Receipt className="h-4 w-4 text-brand-gold" />
          {t("إيصالات بانتظار المراجعة", "Receipts waiting for you")}
        </h2>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          {items.length}
        </span>
        <p className="w-full text-xs text-muted-foreground">
          {t(
            "معارض تقول إنها حوّلت المبلغ. قبول الإيصال يسجّل الدفعة — فتبدأ المدة أو الترويج في الحال.",
            "Showrooms saying they have transferred the money. Accepting a receipt records the payment — which is what starts their days or their promotion."
          )}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((proof) => {
          const charge = proof.vendor_charges;
          const vendor = proof.vendors;
          // The disagreement worth noticing before anything else.
          const mismatch =
            proof.amount != null &&
            charge?.amount != null &&
            Number(proof.amount) !== Number(charge.amount);

          return (
            <div key={proof.id} className="raised-card grid gap-2 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {charge?.ref}
                </span>
                {charge?.kind ? (
                  <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-medium text-brand-primary">
                    {kindLabel(charge.kind, locale)}
                  </span>
                ) : null}
                <span className="ms-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {when(proof.created_at)}
                </span>
              </div>

              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {localized(vendor?.name, locale) || vendor?.slug}
              </p>

              {/* The two numbers, side by side. */}
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-black/[0.03] p-2 text-xs dark:bg-white/5">
                <div>
                  <p className="text-muted-foreground">{t("قيمة الفاتورة", "Charge")}</p>
                  <p className="font-bold tabular-nums text-brand-primary">{money(charge?.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("المبلغ المُرسل", "They say they sent")}</p>
                  <p
                    className={`font-bold tabular-nums ${
                      mismatch ? "text-amber-700 dark:text-amber-400" : "text-brand-primary"
                    }`}
                  >
                    {proof.amount != null ? money(proof.amount) : "—"}
                  </p>
                </div>
              </div>

              {mismatch ? (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {t(
                    "المبلغ المُرسل لا يطابق قيمة الفاتورة. تحقّق قبل القبول.",
                    "The amount they sent does not match the charge. Check before accepting."
                  )}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{methodLabel(proof.method, locale)}</span>
                {proof.reference ? (
                  <span className="font-mono" dir="ltr">{proof.reference}</span>
                ) : null}
                {proof.paid_at ? <span>{when(proof.paid_at)}</span> : null}
              </div>

              {proof.note ? (
                <p className="rounded-lg bg-black/[0.03] p-2 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">
                  {proof.note}
                </p>
              ) : null}

              <div className="mt-1 flex flex-wrap gap-2">
                <a
                  href={`/api/marketplace/payments/${proof.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="raised-hover inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("عرض الإيصال", "Open the receipt")}
                </a>

                <Button
                  type="button"
                  size="sm"
                  className="ms-auto gap-1.5"
                  onClick={() => setReviewing({ proof, decision: "accept" })}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("قبول وتسجيل الدفعة", "Accept and record")}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600 hover:text-red-700"
                  onClick={() => setReviewing({ proof, decision: "reject" })}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("رفض", "Refuse")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {reviewing ? (
        <ReviewDialog
          key={`${reviewing.proof.id}-${reviewing.decision}`}
          locale={locale}
          accounts={accounts}
          currency={currency}
          {...reviewing}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </section>
  );
}

function ReviewDialog({ locale, proof, decision, accounts, currency, onClose }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const charge = proof.vendor_charges;
  const accepting = decision === "accept";

  const [method, setMethod] = useState(proof.method || "bank_transfer");
  const [account, setAccount] = useState(accounts[0]?.label ?? "");

  const run = useActionResult(reviewPaymentProof, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  const error = run.result?.error ? errorText(run.result.error, locale, run.result.params) : null;

  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("proofId", proof.id);
    fd.set("decision", decision);

    if (accepting) {
      fd.set("method", method);
      fd.set("paidInto", account);
      const typed = fd.get("paidAtLocal");
      fd.delete("paidAtLocal");
      // An instant, for the reason recordPayment spells out.
      fd.set("paidAt", typed ? toInstant(typed) ?? "" : "");
    }

    startTransition(() => run.formAction(fd));
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className={`flex items-center gap-2 text-start ${
              accepting ? "text-brand-primary" : "text-red-700 dark:text-red-400"
            }`}
          >
            {accepting ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {accepting
              ? t("قبول الإيصال وتسجيل الدفعة", "Accept and record the payment")
              : t("رفض الإيصال", "Refuse this receipt")}
          </DialogTitle>
          <DialogDescription className="text-start">
            {accepting
              ? t(
                  `ستُسجَّل الفاتورة ${charge?.ref} كمدفوعة${
                    charge?.access_days ? ` وتُضاف ${charge.access_days} يوماً للاشتراك` : ", ويبدأ الترويج"
                  }.`,
                  `${charge?.ref} is marked paid${
                    charge?.access_days
                      ? ` and ${charge.access_days} days are added to their subscription`
                      : ", and their promotion starts"
                  }.`
                )
              : t(
                  "يُعرض سببك للمعرض، ويمكنه إرسال إيصال آخر بعده.",
                  "Your reason is shown to the showroom, and they can send another receipt afterwards."
                )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3">
          {accepting ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("طريقة الدفع", "Method")}</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {methodLabel(m.key, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="reference">{t("رقم العملية", "Reference")}</Label>
                  <Input
                    id="reference"
                    name="reference"
                    dir="ltr"
                    defaultValue={proof.reference ?? ""}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="paidAtLocal">{t("تاريخ الدفع", "Paid on")}</Label>
                  <Input
                    id="paidAtLocal"
                    name="paidAtLocal"
                    type="datetime-local"
                    defaultValue={toLocalInput(proof.paid_at ? new Date(proof.paid_at) : new Date())}
                    className="mt-1"
                  />
                </div>

                {accounts.length ? (
                  <div>
                    <Label>{t("وصل إلى حساب", "Landed in")}</Label>
                    <Select value={account} onValueChange={setAccount}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.label} value={a.label}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div>
                <Label htmlFor="note">{t("ملاحظة داخلية (اختياري)", "Internal note (optional)")}</Label>
                <Input id="note" name="note" className="mt-1" />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="reviewNote">{t("سبب الرفض", "Why it was refused")}</Label>
              <Textarea
                id="reviewNote"
                name="reviewNote"
                rows={3}
                required
                placeholder={t(
                  "مثال: الصورة غير واضحة، أو المبلغ أقل من قيمة الفاتورة.",
                  "For example: the screenshot is unreadable, or the amount is less than the charge."
                )}
                className="mt-1"
              />
            </div>
          )}

          {error ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              type="submit"
              variant={accepting ? "default" : "destructive"}
              disabled={run.pending}
              className="gap-1.5"
            >
              {run.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {accepting ? t("قبول وتسجيل", "Accept and record") : t("رفض", "Refuse")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
