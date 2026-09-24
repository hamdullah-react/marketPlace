"use client";

/**
 * Take a review down, put it back, or remove it outright.
 *
 * ── Hiding asks for a reason, and will not proceed without one ──────────────
 *
 * The sentence is shown to the buyer on their own account page, so it is not
 * paperwork: it is the only thing standing between "my review was removed" and
 * a person who never comes back. The button stays disabled until the box has
 * something in it, which is the same rule the server enforces — see
 * setReviewHidden, which returns REASON_REQUIRED.
 *
 * ── Delete is behind two presses and says what it costs ─────────────────────
 *
 * Hiding is reversible and deleting is not, so they cannot look alike. The
 * confirm names what will be lost, and the audit log keeps the rating and the
 * first of the text after the row is gone.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { setReviewHidden, deleteReviewAsAdmin } from "../admin/_actions/reviews";

const INITIAL = { ok: false, error: null };

export default function ReviewModerationActions({ locale = "ar", reviewId, hidden = false }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = () => {
    setAsking(false);
    setConfirmDelete(false);
    setReason("");
    router.refresh();
  };

  const visibility = useActionResult(setReviewHidden, INITIAL, { onSuccess: done });
  const remove = useActionResult(deleteReviewAsAdmin, INITIAL, { autoClearMs: 0, onSuccess: done });

  const busy = visibility.pending || remove.pending;

  const decide = (decision) => {
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    fd.set("decision", decision);
    fd.set("reason", reason);
    visibility.dismiss();
    startTransition(() => visibility.formAction(fd));
  };

  const drop = () => {
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    remove.dismiss();
    startTransition(() => remove.formAction(fd));
  };

  const error = visibility.result?.error
    ? errorText(visibility.result.error, locale, visibility.result.params)
    : remove.result?.error
      ? errorText(remove.result.error, locale, remove.result.params)
      : null;

  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {asking ? (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            disabled={busy}
            autoFocus
            placeholder={t(
              "السبب — يظهر لكاتب التقييم",
              "The reason — the author is shown this"
            )}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() => decide("hide")}
              className="gap-1.5"
            >
              {visibility.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
              {t("إخفاء", "Hide it")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
              {t("إلغاء", "Cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {hidden ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => decide("show")}
              className="gap-1.5"
            >
              {visibility.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              {t("إظهار", "Restore")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setAsking(true)}
              className="gap-1.5"
            >
              <EyeOff className="h-3.5 w-3.5" />
              {t("إخفاء", "Hide")}
            </Button>
          )}

          {confirmDelete ? (
            <>
              <span className="text-xs text-muted-foreground">
                {t("حذف نهائي، لا يمكن التراجع عنه.", "Permanent — this cannot be undone.")}
              </span>
              <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={drop}>
                {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("نعم، احذف", "Yes, delete")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                {t("تراجع", "Keep it")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              className="gap-1.5 text-red-600 hover:text-red-700"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("حذف", "Delete")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
