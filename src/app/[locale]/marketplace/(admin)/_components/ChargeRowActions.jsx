"use client";

/**
 * Recording a payment against one charge, in a dialog that shows what is being
 * recorded.
 *
 * ── Why a dialog and not the row ────────────────────────────────────────────
 *
 * This was three fields squeezed into the card, and it read as a form with no
 * subject: the amount, the showroom and the reference the transfer should carry
 * were all somewhere above it, scrolled away on a phone. Marking money received
 * is the one action here that has to be right, so the dialog restates the whole
 * charge — who, what for, how much, when it fell due — beside the fields.
 *
 * ── The account is part of the record ───────────────────────────────────────
 *
 * The platform banks with more than one bank, so "paid" is not the whole answer:
 * WHICH account received it is what a bank statement is reconciled against. The
 * picker lists the accounts an admin configured, and the label is snapshotted
 * onto the charge (vendor_charges.paid_into).
 *
 * ── The date defaults to now and stays editable ─────────────────────────────
 *
 * An admin recording Thursday's transfer on Monday must be able to say so. Put
 * today in and it lands in the wrong month's collected figure, which nobody
 * notices until the month is being reconciled.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { PAYMENT_METHODS, accountKindLabel } from "@/marketplace/lib/billing";
import { recordPayment, undoPayment, voidCharge } from "../admin/_actions/billing";

const INITIAL = { ok: false, error: null };

/** `datetime-local` wants YYYY-MM-DDTHH:mm in LOCAL time, with no zone. */
const localNow = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ChargeRowActions({
  locale = "ar",
  charge,
  accounts = [],
  vendorName = "",
  carName = "",
  amountLabel = "",
  descriptionLabel = "",
  dueLabel = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  /* Read once, not as `charge.id` inside a callback: reactCompiler lifts a
     memoised callback's dependencies into the render path, so a bare
     dereference there runs on every render whether the callback fires or not.
     See the note in the buyer's ReviewForm, which crashed on exactly that. */
  const chargeId = charge?.id ?? null;

  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [method, setMethod] = useState("bank_transfer");
  const [paidInto, setPaidInto] = useState(accounts[0]?.label ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(localNow);
  const [reason, setReason] = useState("");

  const done = () => {
    setPayOpen(false);
    setVoidOpen(false);
    setReference("");
    setNote("");
    setReason("");
    router.refresh();
  };

  const pay = useActionResult(recordPayment, INITIAL, { onSuccess: done });
  const undo = useActionResult(undoPayment, INITIAL, { autoClearMs: 0, onSuccess: done });
  const drop = useActionResult(voidCharge, INITIAL, { autoClearMs: 0, onSuccess: done });

  const busy = pay.pending || undo.pending || drop.pending;

  const send = (runner, fields) => {
    const fd = new FormData();
    fd.set("chargeId", chargeId ?? "");
    for (const [k, v] of Object.entries(fields)) fd.set(k, v ?? "");
    runner.dismiss();
    startTransition(() => runner.formAction(fd));
  };

  const error = [pay, undo, drop]
    .map((r) => (r.result?.error ? errorText(r.result.error, locale, r.result.params) : null))
    .find(Boolean);

  const field =
    "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]";

  return (
    <>
      {error ? (
        <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {charge?.state === "due" ? (
          <>
            <Button type="button" size="sm" disabled={busy} className="gap-1.5" onClick={() => setPayOpen(true)}>
              <BanknoteIcon className="h-3.5 w-3.5" />
              {t("تسجيل دفعة", "Record payment")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              className="gap-1.5 text-red-600 hover:text-red-700"
              onClick={() => setVoidOpen(true)}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("إلغاء المستحق", "Cancel charge")}
            </Button>
          </>
        ) : null}

        {charge?.state === "paid" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="gap-1.5"
            onClick={() => send(undo, {})}
          >
            {undo.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {t("إلغاء تسجيل الدفعة", "Un-record payment")}
          </Button>
        ) : null}
      </div>

      {/* ── Record a payment ────────────────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={(next) => setPayOpen(Boolean(next))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("تسجيل دفعة", "Record a payment")}</DialogTitle>
            <DialogDescription>
              {t(
                "يُسجَّل المبلغ كمُستلم ويخرج من المستحقات فوراً. يمكن التراجع.",
                "This marks the money received and takes it out of outstanding at once. It can be undone."
              )}
            </DialogDescription>
          </DialogHeader>

          {/* What is being recorded, restated — the dialog covers the card it
              was opened from. */}
          <dl className="space-y-1 rounded-xl bg-brand-primary/5 p-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("الرقم", "Reference")}</dt>
              <dd className="font-mono" dir="ltr">
                {charge?.ref}
              </dd>
            </div>
            {vendorName ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("المعرض", "Showroom")}</dt>
                <dd className="truncate font-medium">{vendorName}</dd>
              </div>
            ) : null}
            {descriptionLabel ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("عن", "For")}</dt>
                <dd className="truncate">{descriptionLabel}</dd>
              </div>
            ) : null}
            {carName ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("السيارة", "Car")}</dt>
                <dd className="truncate">{carName}</dd>
              </div>
            ) : null}
            {dueLabel ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("الاستحقاق", "Due")}</dt>
                <dd className="tabular-nums">{dueLabel}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t pt-1 dark:border-white/10">
              <dt className="font-medium">{t("المبلغ", "Amount")}</dt>
              <dd className="font-bold tabular-nums text-brand-primary">{amountLabel}</dd>
            </div>
          </dl>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="text-muted-foreground">{t("طريقة الدفع", "Method")}</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy} className={field}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {isAr ? m.ar : m.en}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                <span className="text-muted-foreground">{t("تاريخ الدفع", "Paid on")}</span>
                <input
                  type="datetime-local"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  disabled={busy}
                  className={field}
                />
              </label>
            </div>

            {/* Only when there is a choice to make. One account, or none
                configured, is not a question worth asking. */}
            {accounts.length ? (
              <label className="block text-xs">
                <span className="text-muted-foreground">{t("وصل إلى", "Received into")}</span>
                <select value={paidInto} onChange={(e) => setPaidInto(e.target.value)} disabled={busy} className={field}>
                  <option value="">{t("غير محدد", "Not recorded")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.label}>
                      {a.label} · {accountKindLabel(a.kind, locale)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-xs">
              <span className="text-muted-foreground">
                {t("رقم الحوالة / المرجع (اختياري)", "Transfer number / reference (optional)")}
              </span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={busy}
                dir="ltr"
                className={`${field} font-mono`}
              />
            </label>

            <label className="block text-xs">
              <span className="text-muted-foreground">{t("ملاحظة (اختياري)", "Note (optional)")}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                rows={2}
                className={field}
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                className="gap-1.5"
                onClick={() => send(pay, { method, reference, paidAt, paidInto, note })}
              >
                {pay.pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BanknoteIcon className="h-3.5 w-3.5" />
                )}
                {t("تأكيد الاستلام", "Confirm payment")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPayOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel the charge ───────────────────────────────────────────── */}
      <Dialog open={voidOpen} onOpenChange={(next) => setVoidOpen(Boolean(next))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("إلغاء المستحق", "Cancel this charge")}</DialogTitle>
            <DialogDescription>
              {t(
                "يخرج من المستحقات ويظهر للمعرض مع السبب. لا يُحذف السجل.",
                "It leaves outstanding and the showroom is shown the reason. The record is kept."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="rounded-xl bg-brand-primary/5 p-3 text-xs">
              <span className="font-mono" dir="ltr">
                {charge?.ref}
              </span>
              {vendorName ? <span className="text-muted-foreground"> · {vendorName}</span> : null}
              <span className="ms-2 font-bold tabular-nums text-brand-primary">{amountLabel}</span>
            </p>

            <label className="block text-xs">
              <span className="text-muted-foreground">{t("السبب — يظهر للمعرض", "Reason — the showroom sees this")}</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 300))}
                disabled={busy}
                autoFocus
                className={field}
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy || !reason.trim()}
                onClick={() => send(drop, { reason })}
              >
                {drop.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("إلغاء المستحق", "Cancel the charge")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setVoidOpen(false)}>
                {t("تراجع", "Keep it")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
