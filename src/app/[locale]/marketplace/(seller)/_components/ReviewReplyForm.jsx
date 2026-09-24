"use client";

/**
 * The showroom's answer to one review.
 *
 * Collapsed to a link until it is wanted: a page of twenty reviews with twenty
 * open textareas is a wall of boxes, and the thing a seller comes here to do
 * most often is read.
 *
 * An existing reply opens with its words in the box, and clearing the box and
 * saving takes the reply down — one control for writing, changing and removing,
 * because from where the seller stands it is one thing: what we said back.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { REPLY_MAX } from "@/marketplace/lib/review";
import { replyToReview } from "../_actions/reviews";

const INITIAL = { ok: false, error: null };

export default function ReviewReplyForm({ locale = "ar", reviewId, vendorId = null, reply = "" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(reply ?? "");

  const save = useActionResult(replyToReview, INITIAL, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const fd = new FormData();
    fd.set("locale", locale);
    fd.set("reviewId", reviewId);
    fd.set("vendorId", vendorId ?? "");
    fd.set("reply", text);
    save.dismiss();
    startTransition(() => save.formAction(fd));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {reply ? t("تعديل الرد", "Edit your reply") : t("ردّ على التقييم", "Reply to this review")}
      </button>
    );
  }

  const error = save.result?.error ? errorText(save.result.error, locale, save.result.params) : null;

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, REPLY_MAX))}
        disabled={save.pending}
        rows={3}
        autoFocus
        placeholder={t(
          "شكراً على ملاحظتك…",
          "Thank you for the feedback…"
        )}
        className="w-full rounded-lg border bg-white p-3 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]"
      />

      {error ? (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={save.pending} className="gap-1.5">
          {save.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {/* An empty box means "take it down", and the button says so rather
              than letting a seller press Save and wonder what happened. */}
          {text.trim()
            ? reply
              ? t("حفظ الرد", "Save reply")
              : t("نشر الرد", "Publish reply")
            : t("حذف الرد", "Remove reply")}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={save.pending}
          onClick={() => {
            setText(reply ?? "");
            setOpen(false);
          }}
        >
          {t("إلغاء", "Cancel")}
        </Button>

        <span className="ms-auto text-[11px] text-muted-foreground tabular-nums">
          {text.length} / {REPLY_MAX}
        </span>
      </div>
    </form>
  );
}
