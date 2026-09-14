"use client";

/**
 * Marketplace search — a modal, the way the main site does it
 * (MyComponents/Search/SearchModal.jsx), not a page.
 *
 * Search is something you do FROM somewhere. Sending it to its own route
 * throws away the page you were on, puts an entry in your history for a query
 * you were still typing, and makes "never mind" cost a Back. A dialog keeps
 * the grid behind it and closes on Escape.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [All] [Changan 1] [Faw 1] [Foton 1] [GAC 1]  │  brand chips
 *   │ ⌕ Search cars…                            ✕  │
 *   ├──────────────────────────────────────────────┤
 *   │ ▣  changan omega 2026 4wd-automatic          │
 *   │    Changan · 2026 · Lower Dir     SAR 9,000  │
 *   │ …                                            │
 *   │        See all 4 results for "changan" →     │
 *   └──────────────────────────────────────────────┘
 *
 * Own file, own actions, no import from @/MyComponents — the main site's
 * version is 947 lines wired to the Odoo GraphQL routes, flash offers and the
 * dealership's CarCard, none of which exist over here.
 *
 * Rows, not the full ListingCard: a card carries a save button, a compare
 * checkbox and a spec strip, and a list of six of them does not fit in a modal
 * that also has to show the box you are typing into.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X, Car, TrendingUp, Clock, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { searchCars, searchInitialData } from "../_actions/search";

const RECENT_KEY = "marketplaceRecentSearches";
const MAX_RECENT = 5;

export default function SearchModal({ open, onClose, locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [term, setTerm] = useState("");
  const [brandId, setBrandId] = useState("");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [brands, setBrands] = useState([]);
  const [popular, setPopular] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const timer = useRef(null);
  /**
   * Which request is the newest.
   *
   * Typing "changan" fires several searches and they can come back out of
   * order — a slow one for "cha" landing after a fast one for "changan" would
   * replace the right answer with a stale one. Each run takes a ticket and only
   * the current ticket is allowed to write.
   */
  const runId = useRef(0);

  /* ── Recent searches, from this browser ────────────────────────────────── */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      // localStorage does not exist on the server, so this list cannot be part
      // of the first render and has to arrive on mount. Read once, and only
      // this component writes it afterwards.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved)) setRecent(saved.filter((s) => typeof s === "string"));
    } catch {
      // A corrupted entry is not worth a broken modal.
    }
  }, []);

  const remember = useCallback((value) => {
    const q = String(value || "").trim();
    if (!q) return;
    setRecent((prev) => {
      const next = [q, ...prev.filter((item) => item !== q)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Private mode. The list simply does not persist.
      }
      return next;
    });
  }, []);

  /* ── On open: focus, and load the chips and the popular cars ───────────── */
  useEffect(() => {
    if (!open) return;

    // Radix moves focus to the dialog itself first; this runs after that.
    const id = setTimeout(() => inputRef.current?.focus(), 80);

    let alive = true;
    searchInitialData({ locale })
      .then((data) => {
        if (!alive) return;
        setBrands(data.brands ?? []);
        setPopular(data.popular ?? []);
      })
      .catch(() => {});

    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [open, locale]);

  /* ── The search itself, debounced ──────────────────────────────────────── */
  const run = useCallback(
    (q, brand) => {
      const ticket = ++runId.current;
      const trimmed = String(q).trim();

      if (trimmed.length < 2 && !brand) {
        setResults([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      searchCars({ q: trimmed, brandId: brand, locale })
        .then((data) => {
          if (ticket !== runId.current) return;
          setResults(data.cars ?? []);
          setTotal(data.total ?? 0);
          setLoading(false);
        })
        .catch(() => {
          if (ticket !== runId.current) return;
          setResults([]);
          setTotal(0);
          setLoading(false);
        });
    },
    [locale],
  );

  // 250ms: fast enough that the list has landed by the time you stop typing,
  // slow enough that a seven-letter make is one query and not seven.
  const onType = (value) => {
    setTerm(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(value, brandId), 250);
  };

  const pickBrand = (id) => {
    const next = id === brandId ? "" : id;
    setBrandId(next);
    clearTimeout(timer.current);
    run(term, next);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  /* ── Leaving ───────────────────────────────────────────────────────────── */

  // Deliberately NOT reset on close: reopening the modal with the last search
  // still in it is what someone who closed it by accident wants, and someone
  // starting fresh clears it with one keystroke.
  const go = (href, remembered) => {
    if (remembered) remember(remembered);
    onClose();
    router.push(href);
  };

  /** The full results page for whatever is currently in the box. */
  const allResultsHref = () => {
    const params = new URLSearchParams();
    if (term.trim()) params.set("q", term.trim());
    if (brandId) params.set("brand", brandId);
    const qs = params.toString();
    return `/${locale}/marketplace/cars${qs ? `?${qs}` : ""}`;
  };

  const submit = (e) => {
    e.preventDefault();
    // A brand chip with nothing typed is best answered by that brand's own
    // page, which has the model and trim pills on it.
    if (brandId && !term.trim()) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand?.slug) return go(`/${locale}/marketplace/brands/${brand.slug}`);
    }
    if (!term.trim() && !brandId) return;
    go(allResultsHref(), term);
  };

  const clearRecent = () => {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // Nothing to do; the list is already empty on screen.
    }
  };

  const searching = term.trim().length >= 2 || !!brandId;

  /* One row of a result list. Written inline in both places it is used rather
     than lifted out, because the two lists differ only in their heading. */
  const row = (car) => (
    <Link
      key={car.id}
      href={`/${locale}${car.path}`}
      onClick={() => {
        remember(term || car.title);
        onClose();
      }}
      className="flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-brand-primary/30 hover:bg-gray-50 dark:hover:bg-white/5"
    >
      <span className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-white/10">
        {car.image ? (
          /* A plain <img>: marketplace media is on its own Supabase host, which
             is not in next.config's remotePatterns, so next/image refuses it.
             Same call ListingCard makes. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={car.image} alt={car.imageAlt || ""} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <Car className="h-6 w-6 text-gray-400" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {car.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          {[car.brandName, car.year, car.city].filter(Boolean).join(" · ")}
        </span>
      </span>

      <span className="shrink-0 text-end">
        <span className="block text-sm font-bold text-brand-primary">{car.priceLabel}</span>
        {car.compareAtLabel ? (
          <span className="block text-[11px] text-gray-400 line-through">{car.compareAtLabel}</span>
        ) : null}
      </span>
    </Link>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      {/* p-0 and gap-0 because the header brings its own padding and tint, and
          the results scroll under it. `[&>button]:hidden` drops shadcn's own
          close button — this one has its own, inside the tinted header where
          it is visible, and two crosses a few pixels apart is what the filter
          sheet had wrong. */}
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="w-[calc(100vw-1.5rem)] max-w-2xl gap-0 overflow-hidden rounded-2xl p-0 sm:w-full [&>button]:hidden"
      >
        <DialogTitle className="sr-only">{t("البحث عن سيارات", "Search cars")}</DialogTitle>

        {/* ── Header ────────────────────────────────────────────────────────

            `min-w-0` on this and on the body below is load-bearing. shadcn's
            DialogContent is a GRID, and a grid item's default `min-width:auto`
            means it refuses to shrink below its content — so one result row
            (thumbnail + title + price) pushed the panel 43px wider than the
            phone it was on, which in Arabic put the price off the left edge of
            the screen entirely. */}
        <div className="min-w-0 border-b border-gray-100 bg-linear-to-br from-brand-primary/5 via-white to-brand-primary/10 p-4 dark:border-white/10 dark:from-brand-primary/10 dark:via-[#1a1a1a] dark:to-brand-primary/20">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {t("البحث عن سيارات", "Search cars")}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("إغلاق", "Close")}
              className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Brand chips. Scroll sideways rather than wrapping — 26 makes would
              otherwise push the input itself off the top of a phone. */}
          {brands.length === 0 ? (
            /* Chip-shaped, and the same 3rem-high row they will land in, so
               nothing under them jumps when they do. */
            <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {[72, 92, 64, 80, 88].map((w, i) => (
                <div
                  key={i}
                  style={{ width: w }}
                  className="h-[30px] shrink-0 animate-pulse rounded-full bg-brand-primary/10 dark:bg-white/10"
                />
              ))}
            </div>
          ) : (
            <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => pickBrand("")}
                className={chip(!brandId)}
              >
                {t("كل الماركات", "All brands")}
              </button>
              {brands.map((b) => (
                <button key={b.id} type="button" onClick={() => pickBrand(b.id)} className={chip(brandId === b.id)}>
                  {b.name} <span className="opacity-70">({b.count})</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-primary" />
            <input
              ref={inputRef}
              type="text"
              value={term}
              onChange={(e) => onType(e.target.value)}
              placeholder={t("ابحث عن سيارة، ماركة أو موديل...", "Search a car, brand or model...")}
              className="h-11 w-full rounded-xl border-2 border-gray-200 bg-white ps-10 pe-10 text-sm text-gray-900 outline-hidden transition-shadow placeholder:text-gray-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-white/10 dark:bg-[#111] dark:text-gray-100"
            />
            {loading ? (
              <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-primary" />
            ) : term ? (
              <button
                type="button"
                onClick={() => {
                  setTerm("");
                  setResults([]);
                  setTotal(0);
                  inputRef.current?.focus();
                }}
                aria-label={t("مسح", "Clear")}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-brand-primary"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </form>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="min-w-0 max-h-[55vh] min-h-[240px] overflow-y-auto p-4">
          {searching ? (
            results.length > 0 ? (
              <>
                <div className="space-y-1">{results.map(row)}</div>

                <button
                  type="button"
                  onClick={submit}
                  className="raised-solid mt-4 w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-white hover:bg-brand-dark"
                >
                  {t(
                    `عرض كل النتائج (${total}) ←`,
                    `See all ${total} ${total === 1 ? "result" : "results"} →`,
                  )}
                </button>
              </>
            ) : loading ? (
              <RowSkeleton count={3} />
            ) : (
              <div className="py-12 text-center">
                <Car className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t("لم يتم العثور على سيارات", "No cars found")}
                </p>
              </div>
            )
          ) : (
            <>
              {recent.length > 0 ? (
                <div className="mb-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                      <Clock className="h-4 w-4 text-brand-primary" />
                      {t("عمليات البحث الأخيرة", "Recent searches")}
                    </h3>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-xs text-gray-400 transition-colors hover:text-brand-primary"
                    >
                      {t("مسح", "Clear")}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {recent.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setTerm(q);
                          clearTimeout(timer.current);
                          run(q, brandId);
                        }}
                        className={chip(false)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {popular.length > 0 ? (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                    <TrendingUp className="h-4 w-4 text-brand-primary" />
                    {t("الأكثر مشاهدة", "Most viewed")}
                  </h3>
                  <div className="space-y-1">{popular.map(row)}</div>
                </div>
              ) : (
                <RowSkeleton count={4} />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Result rows, before they are results.
 *
 * A skeleton and not a spinner, because this is a list whose shape is already
 * known: the thumbnail, the two lines of text and the price land in exactly
 * these boxes. A spinner says "something is happening somewhere"; a skeleton
 * says "four cars are about to appear, here" — and it holds the panel's height
 * steady, so the modal does not resize under the cursor the moment they do.
 *
 * The title widths are staggered rather than uniform: a column of identical
 * grey bars reads as a rendering fault, a ragged one reads as text.
 */
function RowSkeleton({ count = 3 }) {
  const widths = ["70%", "55%", "80%", "62%", "74%", "58%"];

  return (
    <div className="space-y-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 p-2">
          <div className="h-14 w-20 shrink-0 rounded-lg bg-brand-primary/10 dark:bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 rounded bg-brand-primary/10 dark:bg-white/10" style={{ width: widths[i % widths.length] }} />
            <div className="h-2.5 w-2/5 rounded bg-brand-primary/10 dark:bg-white/10" />
          </div>
          <div className="h-4 w-16 shrink-0 rounded bg-brand-primary/10 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
}

/**
 * The chip, shared by the brand row and the recent-search row.
 *
 * Module scope so it is not rebuilt on every keystroke of a box that
 * re-renders on every keystroke by design.
 */
function chip(active) {
  return `shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "border-brand-primary bg-brand-primary text-white"
      : "border-gray-200 bg-white text-gray-700 hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:bg-[#1a1a1a] dark:text-gray-300"
  }`;
}
