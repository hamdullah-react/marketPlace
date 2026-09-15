"use client";

/**
 * Actions on one row of the seller's "Your requests": cancel a waiting request,
 * and delete any request that is not currently running.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useActionResult } from "./useActionResult";
import { cancelBoostRequest, deleteBoostRequest } from "../_actions/boosts";
import { errorText } from "@/marketplace/lib/errors";

const INITIAL = { ok: false, error: null };

export default function BoostRequestActions({
  locale = "ar", boostId, vendorId = null, canCancel = false, canDelete = false,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const cancel = useActionResult(cancelBoostRequest, INITIAL, { onSuccess: () => router.refresh() });
  const remove = useActionResult(deleteBoostRequest, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => { setConfirmOpen(false); router.refresh(); },
  });

  const body = () => {
    const fd = new FormData();
    fd.set("boostId", boostId);
    fd.set("vendorId", vendorId ?? "");
    return fd;
  };

  const msg = (r) => (r?.error ? errorText(r.error, locale, r.params) : null);
  const busy = cancel.pending || remove.pending;

  if (!canCancel && !canDelete) return null;

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center justify-end gap-2">
          {canCancel ? (
            <Button
              type="button" size="sm" variant="outline" disabled={busy} className="gap-1.5"
              onClick={() => { cancel.dismiss(); startTransition(() => cancel.formAction(body())); }}
            >
              {cancel.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              {t("إلغاء", "Cancel")}
            </Button>
          ) : null}

          {canDelete ? (
            <Button
              type="button" size="sm" variant="outline" disabled={busy}
              aria-label={t("حذف الطلب", "Delete request")}
              className="gap-1.5 text-red-600 hover:text-red-700"
              onClick={() => { remove.dismiss(); setConfirmOpen(true); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("حذف", "Delete")}
            </Button>
          ) : null}
        </div>
        {msg(cancel.result) ? <span className="text-xs text-red-600">{msg(cancel.result)}</span> : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {t("حذف الطلب", "Delete request")}
            </DialogTitle>
            <DialogDescription>
              {canCancel
                ? t("سيُلغى الطلب ويُحذف من قائمتك.", "The request is withdrawn and removed from your list.")
                : t("سيُحذف هذا الطلب من سجلك نهائياً.", "This request is removed from your history for good.")}
            </DialogDescription>
          </DialogHeader>

          {msg(remove.result) ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {msg(remove.result)}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("رجوع", "Back")}
            </Button>
            <Button
              type="button" variant="destructive" disabled={remove.pending} className="gap-2"
              onClick={() => startTransition(() => remove.formAction(body()))}
            >
              {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("حذف", "Delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
