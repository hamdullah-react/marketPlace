"use client";

/**
 * "I have paid" — the receipt a showroom sends for one charge.
 *
 * ── What this promises, and what it does not ────────────────────────────────
 *
 * Sending it does NOT pay the charge, start a promotion or reopen a closed
 * dashboard. It puts a claim in front of an admin, who looks at the screenshot
 * and accepts it. The copy says so plainly, because a showroom that believes it
 * has just paid and finds itself still locked out an hour later will ring
 * somebody — and be right to.
 *
 * ── One waiting receipt per charge ──────────────────────────────────────────
 *
 * When one is already under review the button is replaced by its state, so the
 * question "did it go through" is answered without pressing anything. A refused
 * one shows the reason and the button comes back — which is the entire purpose
 * of making a rejection carry a note.
 */

import { startTransition, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Check, Clock, FileUp, Loader2, Paperclip, Send, X,
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
import { useActionResult } from "./useActionResult";
import { submitPaymentProof } from "../_actions/payment-proof";
import { errorText } from "@/marketplace/lib/errors";
import { PAYMENT_METHODS, methodLabel } from "@/marketplace/lib/billing";
import { toLocalInput, toInstant } from "@/marketplace/lib/datetime";

const INITIAL = { ok: false, error: null };

const MAX_BYTES = 8 * 1024 * 1024;

export default function PaymentProofDialog({
  locale = "ar",
  vendorId,
  charge,
  /* The most recent receipt for this charge, whatever its state — null when
     none has been sent. The page reads them all in one query rather than one
     per row (see latestProofsByCharge). */
  proof = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [method, setMethod] = useState("bank_transfer");
  const [tooBig, setTooBig] = useState(false);
  const fileInput = useRef(null);

  const send = useActionResult(submitPaymentProof, INITIAL, {
    onSuccess: () => {
      setOpen(false);
      setFile(null);
      router.refresh();
    },
  });

  const waiting = proof?.state === "submitted";
  const refused = proof?.state === "rejected";

  const error = send.result?.error
    ? errorText(send.result.error, locale, send.result.params)
    : null;

  const pick = (e) => {
    const chosen = e.target.files?.[0] ?? null;
    setTooBig(Boolean(chosen && chosen.size > MAX_BYTES));
    setFile(chosen);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!file || tooBig) return;

    const fd = new FormData(e.currentTarget);
    fd.set("vendorId", vendorId);
    fd.set("chargeId", charge.id);
    fd.set("method", method);
    fd.set("file", file);

    /* The date leaves as an INSTANT. A zone-less wall clock is read by whoever
       parses it, and that is the server — which is how a payment made at 09:52
       in Riyadh was once rejected as being in the future. */
    const typed = fd.get("paidAtLocal");
    fd.delete("paidAtLocal");
    fd.set("paidAt", typed ? toInstant(typed) ?? "" : "");

    startTransition(() => send.formAction(fd));
  };

  /* ── Already under review ───────────────────────────────────────────────── */
  if (waiting) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t(
          "أُرسل الإيصال وهو قيد المراجعة. ستصلك رسالة عند اعتماده.",
          "Your receipt is with us and is being reviewed. You will be told when it is accepted."
        )}
      </p>
    );
  }

  return (
    <>
      {/* A refusal is shown ABOVE the button, with the reason, so the next
          attempt is a different one. */}
      {refused ? (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">{t("لم يُقبل الإيصال السابق: ", "Your last receipt was not accepted: ")}</strong>
            {proof.review_note}
          </span>
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant={refused ? "default" : "outline"}
        className="w-full gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {refused
          ? t("أرسل إيصالاً آخر", "Send another receipt")
          : t("لقد دفعت — أرسل الإيصال", "I have paid — send the receipt")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-start text-brand-primary">
              {t("إرسال إيصال الدفع", "Send the payment receipt")}
            </DialogTitle>
            <DialogDescription className="text-start">
              {t(
                `للفاتورة ${charge.ref}. هذا إشعار للإدارة بأنك حوّلت المبلغ — تُسجّل الدفعة بعد مراجعة الإيصال، وعندها تبدأ المدة أو الترويج.`,
                `For ${charge.ref}. This tells the platform you have transferred the money — the payment is recorded once somebody has looked at the receipt, and that is when your days or your promotion begin.`
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="grid gap-3">
            {/* ── The picture ──────────────────────────────────────────── */}
            <div>
              <Label>{t("صورة الحوالة", "Screenshot of the transfer")}</Label>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
                className="hidden"
                onChange={pick}
              />

              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed p-3 text-start text-sm transition-colors hover:border-brand-primary dark:border-white/15"
              >
                <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {file
                    ? file.name
                    : t("اختر صورة أو ملف PDF", "Choose an image or a PDF")}
                </span>
                {file ? (
                  <X
                    className="h-4 w-4 shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setTooBig(false);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  />
                ) : null}
              </button>

              <p className={`mt-1 text-xs ${tooBig ? "text-red-600" : "text-muted-foreground"}`}>
                {tooBig
                  ? t(
                      "الملف أكبر من ٨ ميجابايت. لقطة الشاشة أصغر بكثير من صورة الشاشة بالكاميرا.",
                      "That file is over 8MB. A screenshot is far smaller than a photo of your screen."
                    )
                  : t(
                      "لا يراها إلا فريق المنصة. تُحفظ في مكان خاص لأنها تحمل رقم حسابك.",
                      "Only the platform team can see it. It is kept privately, because it carries your account number."
                    )}
              </p>
            </div>

            {/* ── How, and which transfer ──────────────────────────────── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t("طريقة الدفع", "How you paid")}</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Each entry is {key, ar, en} — the key is what is stored
                        and methodLabel is what reads it back. */}
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {methodLabel(m.key, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reference">{t("رقم العملية", "Transfer reference")}</Label>
                <Input id="reference" name="reference" dir="ltr" className="mt-1" />
              </div>

              <div>
                <Label htmlFor="paidAtLocal">{t("تاريخ التحويل", "When you sent it")}</Label>
                <Input
                  id="paidAtLocal"
                  name="paidAtLocal"
                  type="datetime-local"
                  defaultValue={toLocalInput(new Date())}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="amount">{t("المبلغ المحوّل", "Amount you sent")}</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  dir="ltr"
                  defaultValue={charge.amount ?? ""}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="note">{t("ملاحظة (اختياري)", "Anything to add (optional)")}</Label>
              <Textarea id="note" name="note" rows={2} className="mt-1" />
            </div>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" disabled={send.pending || !file || tooBig} className="gap-1.5">
                {send.pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t("إرسال الإيصال", "Send receipt")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
