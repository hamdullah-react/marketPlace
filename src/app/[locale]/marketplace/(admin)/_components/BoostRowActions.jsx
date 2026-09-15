"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Square, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { decideBoost, deleteBoost } from "../admin/_actions/boosts";
import { errorText } from "@/marketplace/lib/errors";

/**
 * Approve / reject a waiting request, end a running boost early, or delete a
 * finished one from History.
 *
 * Rejecting asks for a reason — it is what the seller reads on their Promotions
 * page. Deleting asks for a second click, because it cannot be undone.
 */
export default function BoostRowActions({ locale = "ar", boostId, tab }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const decide = useActionResult(decideBoost, { ok: false, error: null }, {
    onSuccess: () => { setRejecting(false); setReason(""); router.refresh(); },
  });
  const remove = useActionResult(deleteBoost, { ok: false, error: null }, {
    onSuccess: () => { setConfirmDelete(false); router.refresh(); },
  });

  const go = (decision, note = "") => {
    decide.dismiss();
    const body = new FormData();
    body.set("boostId", boostId);
    body.set("decision", decision);
    if (note) body.set("note", note);
    startTransition(() => decide.formAction(body));
  };

  const destroy = () => {
    remove.dismiss();
    const body = new FormData();
    body.set("boostId", boostId);
    startTransition(() => remove.formAction(body));
  };

  const result = decide.result?.error ? decide.result : remove.result?.error ? remove.result : null;
  const error = result ? errorText(result.error, locale, result.params) : null;

  /* ── History: delete, with a confirm step ─────────────────────────────── */
  if (tab === "history") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {confirmDelete ? (
          <div className="flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={remove.pending}>
              {t("رجوع", "Back")}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={destroy} disabled={remove.pending} className="gap-1.5">
              {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {t("تأكيد الحذف", "Confirm delete")}
            </Button>
          </div>
        ) : (
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => { remove.dismiss(); setConfirmDelete(true); }}
            className="gap-1.5 text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("حذف", "Delete")}
          </Button>
        )}
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {tab === "pending" && rejecting ? (
        <div className="flex w-64 flex-col gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={t("سبب الرفض (يراه البائع)", "Reason (the seller sees this)")}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={decide.pending}>
              {t("رجوع", "Back")}
            </Button>
            <Button
              type="button" size="sm" variant="destructive" disabled={decide.pending}
              onClick={() => go("reject", reason.trim())} className="gap-1.5"
            >
              {decide.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              {t("تأكيد الرفض", "Confirm reject")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          {decide.pending ? <Loader2 className="h-4 w-4 animate-spin text-brand-primary" /> : null}

          {tab === "pending" ? (
            <>
              <Button
                type="button" size="sm" disabled={decide.pending} onClick={() => go("approve")}
                className="raised-solid gap-1.5 bg-brand-primary text-white hover:bg-brand-dark"
              >
                <Check className="h-3.5 w-3.5" />
                {t("موافقة", "Approve")}
              </Button>
              <Button
                type="button" size="sm" variant="outline" disabled={decide.pending}
                onClick={() => { decide.dismiss(); setRejecting(true); }} className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                {t("رفض", "Reject")}
              </Button>
            </>
          ) : (
            <Button
              type="button" size="sm" variant="outline" disabled={decide.pending} onClick={() => go("end")}
              className="gap-1.5 text-red-600 hover:text-red-700"
            >
              <Square className="h-3.5 w-3.5" />
              {t("إنهاء التمييز", "End now")}
            </Button>
          )}
        </div>
      )}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
