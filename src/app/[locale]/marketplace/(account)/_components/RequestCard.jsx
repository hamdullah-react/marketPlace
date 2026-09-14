"use client";

/**
 * One request in the buyer's list, and the owner of its own status.
 *
 * ── Why the card holds state at all ─────────────────────────────────────────
 *
 * It used to be server-rendered markup with two small client components bolted
 * on for the buttons. That worked and it FELT broken: pressing "I no longer
 * need this" did nothing visible until the server had written the row,
 * revalidated the path and streamed a new page down. On a phone on mobile data
 * that is a second of a person pressing a button that appears dead.
 *
 * The card now shows what it believes and corrects itself afterwards. No
 * websocket is involved — this is the buyer's own action reflected in the
 * buyer's own screen, which is a state problem and not a networking one.
 *
 * ── The two rules that keep optimism honest ─────────────────────────────────
 *
 *   1. a FAILED action puts it back. An optimistic update that never reverts is
 *      a lie with good timing, and here it would tell somebody their request
 *      was cancelled when the showroom is still going to ring them.
 *   2. the SERVER always wins. When a fresh `stage` arrives as a prop — the
 *      showroom moved it, or the page was revalidated — it replaces whatever
 *      this component thought. Local state is a head start, never a second
 *      source of truth.
 */

import { useState } from "react";
import Link from "next/link";
import { Car, Store, Phone, Loader2, X, Trash2, Check } from "lucide-react";
import { useOnChange } from "@/hooks/use-on-change";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { cancelRequest, removeRequest } from "../_actions/requests";
import {
  buyerStage, canBuyerCancel, BUYER_STEPS, reachedStep,
} from "@/marketplace/lib/lead-stages";

const MESSAGES = {
  NOT_SIGNED_IN: {
    ar: "انتهت جلستك. سجّل الدخول مرة أخرى.",
    en: "Your session has ended. Sign in again.",
  },
  NOT_FOUND: { ar: "لم يعد هذا الطلب موجوداً.", en: "That request no longer exists." },
  // The showroom got there first — sold it, or closed it — while this page was
  // open. Said plainly, because "could not save" would read as a bug.
  ALREADY_CLOSED: {
    ar: "أُغلق هذا الطلب بالفعل، فلم يعد بالإمكان إلغاؤه.",
    en: "This request has already been closed, so it can no longer be cancelled.",
  },
  STILL_OPEN: {
    ar: "هذا الطلب ما زال مفتوحاً. ألغِه أولاً.",
    en: "This request is still open. Cancel it first.",
  },
  SAVE_FAILED: { ar: "تعذّر تنفيذ ذلك.", en: "Could not do that." },
  HIDE_NOT_MIGRATED: { ar: "الحذف غير مفعّل بعد.", en: "Removing is not switched on yet." },
  LEADS_NOT_MIGRATED: { ar: "الطلبات غير مفعّلة بعد.", en: "Requests are not set up yet." },
};

export default function RequestCard({ row, locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /* ── What this card believes ─────────────────────────────────────────────
     Seeded from the server and overwritten by it whenever it changes. */
  const [stage, setStage] = useState(row.stage);
  const [gone, setGone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // During render, not in an effect: an effect would paint the old stage once
  // before correcting it, which on a card that says "Cancelled" is a flash of
  // the state the buyer just left. See hooks/use-on-change.
  useOnChange(row.stage, (next) => setStage(next));

  const cancel = useActionResult(cancelRequest, { ok: false, error: null }, {
    autoClearMs: 0,
    onAny: (result) => {
      if (result?.ok) setConfirming(false);
      // Rule 1: put it back. The showroom may have sold it a second before this
      // was pressed, in which case the request is not the buyer's to withdraw.
      else setGone(false);
    },
  });

  const remove = useActionResult(removeRequest, { ok: false, error: null }, {
    autoClearMs: 0,
    onAny: (result) => { if (!result?.ok) setGone(false); },
  });

  const err = (r) =>
    r?.error
      ? MESSAGES[r.error]?.[locale] ?? MESSAGES[r.error]?.en ?? MESSAGES.SAVE_FAILED[locale]
      : null;

  const problem = err(cancel.result) || err(remove.result);

  /**
   * Removed from the list the instant it is pressed.
   *
   * It comes BACK if the server refuses — see the onAny above — which is the
   * only reason hiding it early is acceptable rather than merely quick.
   */
  if (gone && !problem) return null;

  const title = row.listing_title?.[locale] || row.listing_title?.en || null;
  const vendorName =
    row.vendors?.name?.[locale] || row.vendors?.name?.en || row.vendors?.name?.ar || null;

  const badge = buyerStage(stage);
  const at = reachedStep(stage);
  const stopped = stage === "cancelled" || stage === "lost";

  const when = (iso, opts) => {
    try {
      return new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", opts);
    } catch { return ""; }
  };

  return (
    <li className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-gray-100">
              <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{title}</span>
            </p>
          ) : null}

          {vendorName ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Store className="h-3.5 w-3.5 shrink-0" />
              {row.vendors?.slug ? (
                <Link
                  href={`/${locale}/marketplace/vendors/${row.vendors.slug}`}
                  className="hover:text-brand-primary hover:underline"
                >
                  {vendorName}
                </Link>
              ) : (
                vendorName
              )}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.tone}`}>
            {isAr ? badge.ar : badge.en}
          </span>
          <time dateTime={row.created_at} className="whitespace-nowrap text-xs text-muted-foreground">
            {when(row.created_at, { day: "numeric", month: "short", year: "numeric" })}
          </time>
        </div>
      </div>

      {/* ── Where it has got to ──────────────────────────────────────────────
          A line of four, because four is what someone reads at a glance and
          they are the four things that actually happen: sent, rang, priced,
          done. A request that ENDED is not a position on this line — showing
          it stuck at step two would invite waiting for a step three that is
          never coming — so those get a sentence instead.
          ------------------------------------------------------------------ */}
      {stopped ? null : (
        <ol className="mt-3 flex items-center gap-1.5" aria-label={t("حالة الطلب", "Request status")}>
          {BUYER_STEPS.map((step, i) => {
            const done = i <= at;
            return (
              <li key={step.key} className="flex flex-1 items-center gap-1.5">
                <span
                  aria-current={i === at ? "step" : undefined}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] transition-colors ${
                    done
                      ? "bg-brand-primary text-white"
                      : "border border-gray-300 text-transparent dark:border-white/20"
                  }`}
                >
                  {i < at ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                <span
                  className={`truncate text-[10px] ${
                    i === at
                      ? "font-medium text-brand-primary"
                      : done
                        ? "text-muted-foreground"
                        : "text-gray-400 dark:text-gray-600"
                  }`}
                >
                  {t(step.ar, step.en)}
                </span>
                {i < BUYER_STEPS.length - 1 ? (
                  <span
                    className={`h-px flex-1 transition-colors ${
                      i < at ? "bg-brand-primary" : "bg-brand-primary/10 dark:bg-white/10"
                    }`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {row.message ? (
        <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
          {row.message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        {stage === "cancelled" ? (
          <p className="text-xs text-muted-foreground">
            {row.cancelled_at
              ? t(
                  `ألغيت هذا الطلب في ${when(row.cancelled_at, { day: "numeric", month: "long" })}.`,
                  `You cancelled this on ${when(row.cancelled_at, { day: "numeric", month: "long" })}.`
                )
              : t("ألغيت هذا الطلب.", "You cancelled this request.")}
          </p>
        ) : row.contact_phone ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            {t("سيتصل بك البائع على", "The seller will call you on")}{" "}
            <span dir="ltr" className="tabular-nums">{row.contact_phone}</span>
          </p>
        ) : (
          <span />
        )}

        {/* Two controls belonging to two different moments: while the showroom
            might still act, the only useful offer is a way to stop them; once
            it is over, the only thing left is tidying the list. */}
        {canBuyerCancel(stage) ? (
          confirming ? null : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-red-600 hover:underline"
            >
              {t("لم أعد بحاجة إليه", "I no longer need this")}
            </button>
          )
        ) : (
          <form
            action={remove.formAction}
            // Optimistic: the card leaves before the round trip, and comes back
            // if the server refuses.
            onSubmit={() => setGone(true)}
          >
            <input type="hidden" name="leadId" value={row.id} />
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              disabled={remove.pending}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-red-600 hover:underline disabled:opacity-50"
            >
              {remove.pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {/* Two labels, because the button does two different things and
                  a label that promises the wrong one is a lie either way.
                  A cancelled request is deleted outright, for the showroom
                  too; a completed or closed one is the showroom's record and
                  is only removed from this list. */}
              {stage === "cancelled"
                ? t("احذف الطلب نهائياً", "Delete this request")
                : t("احذفه من قائمتي", "Remove from my list")}
            </button>
          </form>
        )}
      </div>

      {/* ── Confirming the cancellation ─────────────────────────────────────
          Two steps, because there is no undo: this DELETES the request, on the
          showroom's screen as well as this one. Not a browser confirm(), which
          cannot be translated and cannot be styled to look like the rest. */}
      {confirming ? (
        <form
          action={cancel.formAction}
          onSubmit={() => setGone(true)}
          className="mt-3 rounded-xl border border-gray-200 p-3 dark:border-white/10"
        >
          <input type="hidden" name="leadId" value={row.id} />
          <input type="hidden" name="locale" value={locale} />

          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-gray-700 dark:text-gray-300">
              {t(
                "سيُحذف هذا الطلب نهائياً من عندك ومن المعرض. يمكنك إرسال طلب جديد في أي وقت.",
                "This deletes the request for you and for the showroom. You can send a new one at any time."
              )}
            </p>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              aria-label={t("تراجع", "Back")}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={cancel.pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {cancel.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("نعم، احذف الطلب", "Yes, delete it")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-muted-foreground hover:text-gray-700"
            >
              {t("تراجع", "Keep it")}
            </button>
          </div>
        </form>
      ) : null}

      {problem ? <p className="mt-2 text-xs text-red-600">{problem}</p> : null}
    </li>
  );
}
