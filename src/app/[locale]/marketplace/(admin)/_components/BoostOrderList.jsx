"use client";

/**
 * The running promotions, in the order a visitor meets them — and draggable.
 *
 * Approving a boost says a car is featured. It does not say whether it is the
 * FIRST featured car, and that is the thing a showroom is actually paying for.
 * Dragging a row here writes listings.featured_rank (see reorderFeatured), and
 * the home page's featured row and the top of All Cars read that column.
 *
 * ── Dragging, without a drag-and-drop library ───────────────────────────────
 *
 * The browser's own drag events. A list of running promotions is a handful of
 * rows, and @dnd-kit is 40 kB in an admin panel to move three of them.
 *
 * The arrow buttons are not a fallback nobody uses — they are how this works at
 * all with a keyboard, on a phone, and with a screen reader, none of which can
 * express an HTML5 drag. Every drag has an equivalent press.
 *
 * ── Saved optimistically ────────────────────────────────────────────────────
 *
 * The list reorders on drop and the write follows. A failed save says so and
 * puts the old order back, rather than leaving the screen disagreeing with the
 * database.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, ChevronUp, ChevronDown, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { reorderFeatured } from "../admin/_actions/boosts";
import BoostRowActions from "./BoostRowActions";
import { errorText } from "@/marketplace/lib/errors";

const move = (list, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
};

export default function BoostOrderList({ locale = "ar", rows = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [list, setList] = useState(rows);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  /* The server is the source of truth: a refresh, another admin's change or an
     ended boost all arrive as new rows and replace what is on screen.
     Adjusted DURING the render that brings the new rows rather than in an
     effect — an effect would paint the stale order first and then correct it,
     which is a visible jump, and React flags the cascading render it causes.
     `seen` is also what a refused save goes back to: it is the last order the
     server confirmed, which is exactly what the database still holds. */
  const [seen, setSeen] = useState(rows);
  if (rows !== seen) {
    setSeen(rows);
    setList(rows);
  }

  const save = useActionResult(reorderFeatured, { ok: false, error: null }, {
    autoClearMs: 2500,
    // The saved order comes back as new rows, which the block above adopts.
    onSuccess: () => router.refresh(),
  });

  /**
   * A refused save must not leave the screen showing an order nobody has.
   *
   * DERIVED, not written back: setting state from an effect would paint the
   * rejected order first and correct it a frame later, and React flags the
   * cascading render. `seen` is the last order the server confirmed, which is
   * what the database still holds after a failed write.
   */
  const failed = save.raw?.ok === false && Boolean(save.raw?.error);
  const shown = failed ? seen : list;

  const commit = (next) => {
    setList(next);
    const body = new FormData();
    body.set("order", JSON.stringify(next.map((r) => r.id)));
    startTransition(() => save.formAction(body));
  };

  const onDrop = (index) => {
    setOver(null);
    if (dragging == null || dragging === index) return;
    commit(move(shown, dragging, index));
    setDragging(null);
  };

  const error = save.result?.ok === false && save.result?.error ? save.result : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3 text-sm">
        <GripVertical className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
        <p className="text-gray-700 dark:text-gray-300">
          {t(
            "اسحب لترتيب السيارات المميزة. رقم ١ يظهر أولاً في الصفحة الرئيسية وفي أعلى صفحة كل السيارات.",
            "Drag to order the featured cars. Number 1 shows first on the home page and at the top of All Cars."
          )}
        </p>
        {save.pending ? (
          <span className="ms-auto flex items-center gap-1.5 text-xs text-brand-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("جارٍ الحفظ", "Saving")}
          </span>
        ) : save.result?.ok ? (
          <span className="ms-auto flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("حُفظ الترتيب", "Order saved")}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorText(error.error, locale, error.params)}
        </p>
      ) : null}

      <ol className="space-y-2">
        {shown.map((row, index) => (
          <li
            key={row.id}
            draggable
            onDragStart={() => setDragging(index)}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={(e) => { e.preventDefault(); setOver(index); }}
            onDragLeave={() => setOver((o) => (o === index ? null : o))}
            onDrop={(e) => { e.preventDefault(); onDrop(index); }}
            className={`raised-card flex flex-wrap items-center gap-3 rounded-xl p-3 transition-shadow ${
              dragging === index ? "opacity-50" : ""
            } ${over === index && dragging !== index ? "ring-2 ring-brand-primary" : ""}`}
          >
            {/* Position, and the thing you grab. */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-extrabold tabular-nums ${
                  index === 0 ? "bg-brand-gold text-[#2a2100]" : "raised text-brand-primary"
                }`}
              >
                {index + 1}
              </span>
              <GripVertical
                className="h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing"
                aria-hidden="true"
              />
            </span>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.image || "/alromaih/placeholder-car.png"}
              alt=""
              loading="lazy"
              className="h-11 w-14 shrink-0 rounded-md border object-cover"
            />

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-brand-primary">{row.title}</span>
              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                {[row.vendorName, row.endsLabel].filter(Boolean).join(" · ")}
              </span>
            </span>

            {/* The keyboard and touch equivalent of the drag. */}
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => commit(move(shown, index, index - 1))}
                disabled={index === 0 || save.pending}
                aria-label={t(`انقل ${row.title} للأعلى`, `Move ${row.title} up`)}
                className="raised-hover flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-40"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => commit(move(shown, index, index + 1))}
                disabled={index === shown.length - 1 || save.pending}
                aria-label={t(`انقل ${row.title} للأسفل`, `Move ${row.title} down`)}
                className="raised-hover flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-40"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </span>

            <span className="shrink-0">
              <BoostRowActions locale={locale} boostId={row.id} tab="active" />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
