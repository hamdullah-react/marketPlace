"use client";

/**
 * The star picker and the box under it.
 *
 * One component for both jobs — rating a showroom for the first time and
 * changing a rating already left — because it is one form with one action
 * behind it. Which one it is depends on whether `review` was passed.
 *
 * ── The stars are buttons, and the keyboard reaches them ────────────────────
 *
 * A row of divs with an onClick is the usual way this gets built and it is
 * unusable without a mouse. These are real radio inputs with the circle hidden:
 * arrow keys move between them, the label is read out, and the form submits on
 * Enter like every other form on the site.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { BODY_MAX } from "@/marketplace/lib/review";
import { saveReview, deleteReview } from "../_actions/reviews";

const INITIAL = { ok: false, error: null };

export default function ReviewForm({
  locale = "ar",
  leadId = null,
  review = null,
  shopName = "",
  carName = "",
  open: openByDefault = false,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  /**
   * Read ONCE, safely, and never as `review.id` inside a callback.
   *
   * reactCompiler is on (next.config.mjs), and it lifts the values a memoised
   * callback closes over into the render path — `fd.set("reviewId", review.id)`
   * inside submit() compiled to `$[13] = review.id` at the top of the
   * component. So a null `review`, which is every "rate this deal" form on the
   * page, threw "Cannot read properties of null (reading 'id')" before anybody
   * pressed anything. Optional chaining here is what keeps it out of the
   * dependency list as a bare dereference.
   */
  const reviewId = review?.id ?? null;
  const editing = Boolean(reviewId);
  const [open, setOpen] = useState(openByDefault || editing);
  const [rating, setRating] = useState(Number(review?.rating) || 0);
  const [body, setBody] = useState(review?.body ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useActionResult(saveReview, INITIAL, {
    onSuccess: () => {
      if (!editing) setOpen(false);
      router.refresh();
    },
  });

  const remove = useActionResult(deleteReview, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      setConfirmDelete(false);
      router.refresh();
    },
  });

  const busy = save.pending || remove.pending;

  const submit = (event) => {
    event.preventDefault();
    const fd = new FormData();
    fd.set("locale", locale);
    fd.set("rating", String(rating));
    fd.set("body", body);
    if (editing) fd.set("reviewId", reviewId);
    else fd.set("leadId", leadId ?? "");
    save.dismiss();
    startTransition(() => save.formAction(fd));
  };

  const drop = () => {
    const fd = new FormData();
    fd.set("locale", locale);
    fd.set("reviewId", reviewId);
    remove.dismiss();
    startTransition(() => remove.formAction(fd));
  };

  const error = save.result?.error
    ? errorText(save.result.error, locale, save.result.params)
    : remove.result?.error
      ? errorText(remove.result.error, locale, remove.result.params)
      : null;

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Star className="h-3.5 w-3.5" />
        {t("قيّم المعرض", "Rate this showroom")}
      </Button>
    );
  }

  const name = [shopName, carName].filter(Boolean).join(" · ");

  return (
    <form onSubmit={submit} className="space-y-3">
      {name ? (
        <p className="text-xs text-muted-foreground">
          {t("تقييمك عن: ", "Your rating of: ")}
          <span className="font-medium text-brand-primary">{name}</span>
        </p>
      ) : null}

      <fieldset disabled={busy} className="flex items-center gap-1">
        <legend className="sr-only">{t("عدد النجوم", "How many stars")}</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer p-0.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-primary"
            title={`${n}`}
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={rating === n}
              onChange={() => setRating(n)}
              className="sr-only"
            />
            <Star
              className={`h-7 w-7 transition-transform hover:scale-110 ${
                n <= rating
                  ? "fill-[var(--gold)] text-[var(--gold)]"
                  : "fill-transparent text-gray-300 dark:text-gray-600"
              }`}
            />
            <span className="sr-only">
              {n} {t("من ٥", "of 5")}
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          disabled={busy}
          rows={4}
          placeholder={t(
            "كيف كانت التجربة؟ الرد، السعر، حالة السيارة…",
            "How was it? The response, the price, the state of the car…"
          )}
          className="w-full rounded-lg border bg-white p-3 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]"
        />
        <p className="mt-1 text-end text-[11px] text-muted-foreground tabular-nums">
          {body.length} / {BODY_MAX}
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {save.result?.ok ? (
        <p className="rounded-lg bg-green-50 p-2 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-400">
          {t("شكراً، تم نشر تقييمك.", "Thank you — your review is published.")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {/* Disabled until a star is picked: a review with no rating is the one
            thing this form cannot send, and saying so before the press is
            kinder than an error message after it. */}
        <Button type="submit" size="sm" disabled={busy || !rating} className="gap-1.5">
          {save.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {editing ? t("حفظ التعديل", "Save changes") : t("نشر التقييم", "Publish review")}
        </Button>

        {!editing ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            {t("إلغاء", "Cancel")}
          </Button>
        ) : null}

        {editing ? (
          confirmDelete ? (
            <>
              <span className="text-xs text-muted-foreground">
                {t("حذف التقييم نهائياً؟", "Delete this review for good?")}
              </span>
              <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={drop}>
                {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("نعم، احذف", "Yes, delete")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
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
          )
        ) : null}
      </div>
    </form>
  );
}
