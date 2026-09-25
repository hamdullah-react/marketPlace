"use client";

/**
 * Drop one charge, from a list that is not the Finance ledger.
 *
 * ── Why this exists next to ChargeRowActions ────────────────────────────────
 *
 * That component is the full ledger control — record a payment, un-record it,
 * cancel, delete — and it carries three dialogs and a payment form with it. The
 * renewals queue on Subscriptions is a one-line summary per row, and hanging all
 * of that off it would be a form inside a list item.
 *
 * So this is the one action, with the confirmation IN PLACE rather than in a
 * dialog: the row is the subject, it is one line long, and a modal restating a
 * line the reader can already see is ceremony.
 *
 * ── Two presses, always ─────────────────────────────────────────────────────
 *
 * Nothing here is recoverable, so nothing here happens on one press. The second
 * press is the confirmation and the wording says what goes.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { deleteCharge } from "../admin/_actions/billing";

const INITIAL = { ok: false, error: null };

export default function DeleteChargeButton({ locale = "ar", chargeId, label = "" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [asking, setAsking] = useState(false);

  const erase = useActionResult(deleteCharge, INITIAL, {
    // A refusal — a charge somebody paid a moment ago — has to stay readable.
    autoClearMs: 0,
    onSuccess: () => {
      setAsking(false);
      router.refresh();
    },
  });

  const error = erase.result?.error ? errorText(erase.result.error, locale, erase.result.params) : null;

  const send = () => {
    const fd = new FormData();
    fd.set("chargeId", chargeId ?? "");
    erase.dismiss();
    startTransition(() => erase.formAction(fd));
  };

  if (!asking) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAsking(true)}
          aria-label={label ? t(`حذف ${label}`, `Delete ${label}`) : t("حذف", "Delete")}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {error ? (
          <span className="text-[11px] text-red-700 dark:text-red-300">{error}</span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground">
        {t("حذف الطلب نهائياً؟", "Delete the request for good?")}
      </span>
      <button
        type="button"
        disabled={erase.pending}
        onClick={send}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        {erase.pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {t("نعم", "Yes")}
      </button>
      <button
        type="button"
        disabled={erase.pending}
        onClick={() => {
          erase.dismiss();
          setAsking(false);
        }}
        className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-brand-primary disabled:opacity-60"
      >
        {t("تراجع", "Keep it")}
      </button>
    </span>
  );
}
