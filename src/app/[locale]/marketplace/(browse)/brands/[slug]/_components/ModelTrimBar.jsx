"use client";

/**
 * The model and trim pills under a brand's header.
 *
 * This is the brand page's filter — it has no rail, and it does not need one:
 * on a make you have already chosen, the only questions left are which model
 * and which trim, and those are a short enough list to lay out flat where you
 * can see all of them at once. A sidebar would put sixteen sections beside a
 * page whose answer is one of seven words.
 *
 *   Model   [ All (18) ] [ G700 (3) ] [ Dashing (4) ] [ T1 (3) ] …
 *   Trim    [ All (4) ]  [ Comfort (2) ] [ Luxury (2) ]
 *
 * Single-select, unlike the rail's checkboxes. A row that opens with "All"
 * highlighted is reading as one-of-these, and honouring that is better than
 * looking like a radio and behaving like a checkbox.
 *
 * ── Why the trim row waits ──────────────────────────────────────────────────
 *
 * Trim names are only unique WITHIN a model — two models can both have a "GT",
 * and they are different cars. So when several models are in play the trim is
 * prefixed with its model; when one model is selected the prefix is noise and
 * the row is just its trims.
 *
 * Every pill writes the same `?model=` / `?trim=` params the all-cars rail
 * writes, so the grid, the chips and the count on this page need no special
 * case for having arrived from here.
 */

import { useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ModelTrimBar({
  models = [],
  trimModels = [],
  total = 0,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedModel = searchParams.get("model") || "";
  const selectedTrim = searchParams.get("trim") || "";

  const nameOf = (n, fallback) =>
    (isAr ? n?.ar || n?.en : n?.en || n?.ar) || fallback;

  /**
   * Write the params and go.
   *
   * `page` is dropped on every change for the same reason the rail drops it:
   * staying on page 3 of a set that just shrank to four cars is the standard
   * way to land on an empty grid. In a transition so the pills stay clickable
   * while the server answers — `isPending` is what says so on screen.
   */
  const apply = useCallback(
    (mutate) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page");
      const qs = params.toString();
      startTransition(() =>
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }),
      );
    },
    [router, pathname, searchParams],
  );

  // Changing the model clears the trim: a trim belongs to exactly one model, so
  // keeping it across a model change is a guaranteed empty grid.
  const pickModel = (id) =>
    apply((p) => {
      if (id) p.set("model", id);
      else p.delete("model");
      p.delete("trim");
    });

  const pickTrim = (id) =>
    apply((p) => (id ? p.set("trim", id) : p.delete("trim")));

  /* The trims on offer right now: one model's, or every model's with the model
     named in front so "GT" and "GT" can be told apart. */
  const groups = selectedModel
    ? trimModels.filter((m) => m.id === selectedModel)
    : trimModels;

  const trims = groups.flatMap((m) =>
    m.trims.map((tr) => ({
      id: tr.id,
      count: tr.count,
      label:
        selectedModel || trimModels.length <= 1
          ? nameOf(tr.name, tr.slug)
          : `${nameOf(m.name, m.slug)} ${nameOf(tr.name, tr.slug)}`,
    })),
  );

  const trimTotal = trims.reduce((sum, tr) => sum + tr.count, 0);

  /**
   * Shown whenever the brand has anything to name — one model included.
   *
   * The first version hid the whole bar below two options, on the reasoning
   * that "All (1) | Bestune (1)" is two pills meaning the same thing. True, but
   * it is also the only place on the page that names the model and the trim:
   * the card below shows a photo and a price, and the header shows a count. A
   * row that says "this make is here as one Bestune B70 Comfort" is worth more
   * than the tidiness of hiding it.
   *
   * Nothing at all is still nothing — a brand with no model on its listings
   * gets no bar rather than a row containing only "All".
   */
  if (!models.length && !trims.length) return null;

  const pill = (active) =>
    `shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors ${
      active
        ? "border-brand-primary bg-brand-primary font-semibold text-white"
        : "border-gray-200 bg-white text-gray-700 hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:bg-[#1a1a1a] dark:text-gray-300"
    }`;

  return (
    <div className="mt-5 space-y-3 border-t border-gray-100 pt-5 dark:border-white/10">
      {models.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("الموديل", "Model")}
            </span>
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
            ) : null}
          </div>

          {/* Scrolls sideways rather than wrapping to four rows on a phone —
              a make with a dozen models would otherwise push the grid below
              the fold before a single car is visible. */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button type="button" onClick={() => pickModel("")} className={pill(!selectedModel)}>
              {t("الكل", "All")} <span className="opacity-70">({total})</span>
            </button>

            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickModel(m.id)}
                className={pill(selectedModel === m.id)}
              >
                {nameOf(m.name, m.slug)} <span className="opacity-70">({m.count})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {trims.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            {t("الفئة", "Trim")}
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button type="button" onClick={() => pickTrim("")} className={pill(!selectedTrim)}>
              {t("الكل", "All")} <span className="opacity-70">({trimTotal})</span>
            </button>

            {trims.map((tr) => (
              <button
                key={tr.id}
                type="button"
                onClick={() => pickTrim(tr.id)}
                className={pill(selectedTrim === tr.id)}
              >
                {tr.label} <span className="opacity-70">({tr.count})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
