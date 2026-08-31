"use client";

/**
 * The shortlist, floating above the page.
 *
 * Appears the moment a car is ticked and stays until the list is empty, so a
 * visitor building a comparison across a long grid can always see what they
 * have and how many more they may add.
 *
 * Renders NOTHING when the list is empty — not an empty bar, not a collapsed
 * one. A permanent strip along the bottom of every browse page is a cost paid
 * by every visitor for a feature most of them are not using, and on a phone it
 * is a cost measured in the space where the content was.
 *
 * ── Hidden on the compare page ──────────────────────────────────────────────
 *
 * Once you are looking at the comparison, the bar is a second control for the
 * thing already on screen — and worse, one that can disagree with it, because
 * the page's cars come from the URL and the bar's come from localStorage. So it
 * hides itself there and the page's own toolbar is the only way to change what
 * is being compared.
 */

import { useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Scale, Trash2, Loader2 } from "lucide-react";
import {
  subscribe, getSnapshot, getServerSnapshot, remove, clear, comparePath, MAX,
} from "./compareStore";

export default function CompareBar({ locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  if (!list.length) return null;
  if (pathname?.includes("/marketplace/compare")) return null;

  const href = comparePath(list, locale);
  const ready = list.length >= 2;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:p-4">
      <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-brand-primary/15 bg-white/95 p-2.5 shadow-2xl backdrop-blur-sm dark:border-white/10 dark:bg-[#1a1a1a]/95">
        {/* ── What is ticked ───────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {list.map((car) => (
            <div
              key={car.slug}
              className="relative flex shrink-0 items-center gap-2 rounded-xl border bg-white p-1.5 pe-7 dark:border-white/10 dark:bg-white/5"
            >
              <div className="h-9 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-light/40 dark:bg-white/5">
                {car.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={car.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>

              <div className="min-w-0 max-w-[8rem]">
                <p className="truncate text-[11px] font-medium leading-tight">{car.title}</p>
                {car.priceLabel ? (
                  <p className="truncate text-[11px] text-brand-primary">{car.priceLabel}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => remove(car.slug)}
                aria-label={t("إزالة", "Remove")}
                className="absolute end-1 top-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* An empty slot, so "you may add another" is visible rather than
              something the visitor has to infer from a counter. */}
          {list.length < MAX ? (
            <div className="flex h-[52px] shrink-0 items-center rounded-xl border border-dashed px-3 text-[11px] text-muted-foreground dark:border-white/15">
              {t(`أضف ${MAX - list.length} أخرى`, `Add ${MAX - list.length} more`)}
            </div>
          ) : null}
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={clear}
            aria-label={t("مسح الكل", "Clear all")}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* Disabled below two cars, with the reason on the button rather than
              in a tooltip nobody on a phone can open. */}
          {ready ? (
            <Link
              href={href}
              onClick={() => startTransition(() => {})}
              className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scale className="h-4 w-4" />
              )}
              {t("قارن", "Compare")}
            </Link>
          ) : (
            <span className="rounded-xl bg-gray-100 px-4 py-2.5 text-xs font-medium text-muted-foreground dark:bg-white/10">
              {t("اختر سيارة أخرى", "Pick one more")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
