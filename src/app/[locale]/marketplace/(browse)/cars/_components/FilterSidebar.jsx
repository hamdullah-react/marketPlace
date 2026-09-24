"use client";

/**
 * The filter rail: a purple gradient header over a grey column of white
 * section cards, exactly like the main site's
 * (MyComponents/AllCars/types/FilterSidebar.jsx).
 *
 * This file is now only the FRAME and the URL plumbing. Every filter lives in
 * its own file under FilterComponents/, the same way the main site splits them
 * — so adding "colour" means adding ColorFilter.jsx and one line here, not
 * editing a four-hundred-line switchboard.
 *
 * Writes straight to the URL. searchParams are the only filter state, so a
 * filtered view is shareable and the server re-renders the grid; there is no
 * client store that can disagree with the address bar.
 *
 * ── Two exports, one panel ──────────────────────────────────────────────────
 *
 * The rail is a column of the page; the mobile trigger is a full-width button
 * ABOVE the results, which is a different place in the document. So this file
 * exports both, and they share one <FilterPanel> and one request-memoised
 * facets query — being two components costs one query, not two.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Filter, Search, RefreshCw, X, SlidersHorizontal, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  PriceFilter, BrandsFilter, TrimsFilter, YearFilter, SeatsFilter, ColorsFilter,
  MileageFilter, ConditionFilter, TransmissionFilter, FuelFilter,
  OffersFilter, SpecialFeaturesFilter, DynamicFacets, SpecFacets,
  CityFilter, VendorFilter,
} from "./FilterComponents";
import {
  FILTER_KEYS, KIND_PREFIX, kindsFromParams, SPEC_PREFIX, specsFromParams,
} from "./FilterComponents/constants";
import { useResultsTotal } from "./resultsCount";

/**
 * Open on arrival — the three a buyer narrows by first, matching the main
 * site's expandedSections default. Everything else is one tap away and the
 * rail stays short enough to see the bottom of.
 */
const OPEN_BY_DEFAULT = { price: true, brands: true, year: true };

/* ── The rail ─────────────────────────────────────────────────────────────── */

export default function FilterSidebar({ facets, locale = "ar", total = 0, currency = null }) {
  return (
    <div className="sticky top-[100px] hidden h-[calc(100vh-8rem)] self-start rounded-xl shadow-md lg:block">
      <FilterPanel facets={facets} locale={locale} total={total} currency={currency} />
    </div>
  );
}

/* ── The phone's version ──────────────────────────────────────────────────── */

export function MobileFilters({ facets, locale = "ar", total = 0, currency = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const activeCount = FILTER_KEYS.filter((k) => searchParams.get(k)).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* Solid brand green with white text, set explicitly. It used to add
            `raised` over the Button default, which swapped the green fill for
            a pale panel but left the default white text — so on a phone the
            button was a blank bar with no words on it. */}
        <Button className="raised-solid mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 font-bold text-white hover:bg-brand-dark lg:hidden">
          <SlidersHorizontal className="h-4 w-4" />
          <span>{t("فلترة النتائج", "Filter Results")}</span>
          {activeCount > 0 ? (
            <Badge className="rounded-[5px] border-white/30 bg-white/20 text-white hover:bg-white/20">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>

      {/* p-0 because the panel inside brings its own gradient header — a sheet
          padding it would put a white margin around a coloured bar.

          `[&>button:last-child]:hidden` removes shadcn's own close button.
          SheetContent renders one, absolutely positioned at top-right, as its
          last child — and it landed directly on top of the white X in our
          purple header, so the sheet had TWO crosses a few pixels apart. Ours
          stays because it is the one styled for a coloured bar; theirs is
          `text-foreground opacity-70`, which is near-invisible on purple.
          Nothing is lost: Escape and a tap on the overlay still close the
          sheet, both from Radix. */}
      <SheetContent
        side="bottom"
        dir={isAr ? "rtl" : "ltr"}
        className="h-[calc(100vh-4rem)] rounded-t-[20px] border-0 p-0 [&>button:last-child]:hidden"
      >
        <SheetTitle className="sr-only">{t("الفلاتر", "Filters")}</SheetTitle>
        <FilterPanel
          facets={facets}
          locale={locale}
          total={total}
          isMobile
          onClose={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/* ── What both of them show ───────────────────────────────────────────────── */

function FilterPanel({ facets, locale, total, isMobile = false, onClose, currency = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(OPEN_BY_DEFAULT);
  const [term, setTerm] = useState(searchParams.get("q") || "");
  const [isPending, startTransition] = useTransition();

  /**
   * The count on the button is the FILTERED one, published by the grid.
   *
   * `total` — the number this panel is handed — is every car on the platform,
   * because the rail is rendered without the searchParams so that it does not
   * have to wait on the results query. It is the right value to show before
   * the grid has answered and the wrong one after, which is exactly what
   * useResultsTotal does with it. See resultsCount.js.
   */
  const liveTotal = useResultsTotal(total);

  const get = (key) => searchParams.get(key) || "";
  const list = (key) => get(key).split(",").filter(Boolean);
  /* The named params PLUS however many generic attributes are set — a count
     that ignored attr_* would read "2 filters" over a grid narrowed by four. */
  const activeCount =
    FILTER_KEYS.filter((k) => searchParams.get(k)).length +
    Object.keys(kindsFromParams(searchParams)).length +
    Object.keys(specsFromParams(searchParams)).length;

  const chosenKinds = kindsFromParams(searchParams);
  const chosenSpecs = specsFromParams(searchParams);

  const toggleKindValue = (kind, value) => toggleMulti(`${KIND_PREFIX}${kind}`)(value);
  const toggleSpecValue = (slug, value) => toggleMulti(`${SPEC_PREFIX}${slug}`)(value);

  /* A numeric spec's from/to, as one param: `spec_engine-capacity_range=1.4-2.0`.
     Both ends in one key so clearing the filter is one delete rather than two
     that can half-fail and leave a range with only a floor. */
  const commitSpecRange = (slug, min, max) =>
    apply((p) => {
      const key = `${SPEC_PREFIX}${slug}_range`;
      if (min === "" && max === "") p.delete(key);
      else p.set(key, `${min || ""}-${max || ""}`);
    });

  const specRanges = {};
  for (const [k, v] of searchParams.entries()) {
    if (!k.startsWith(SPEC_PREFIX) || !k.endsWith("_range")) continue;
    const slug = k.slice(SPEC_PREFIX.length, -"_range".length);
    const [min, max] = String(v).split("-");
    specRanges[slug] = { min: min || "", max: max || "" };
  }

  /* The three the catalog gives a dedicated section, lifted out of the generic
     list so they keep their own icon and their own grid — and so they are not
     drawn twice. Everything else falls through to SpecFacets. */
  const DEDICATED_SPECS = { transmission: true, "fuel-type": true, seats: true };
  const specFacets = facets.specs ?? [];
  const specBySlug = Object.fromEntries(specFacets.map((f) => [f.slug, f]));
  const genericSpecs = specFacets.filter((f) => !DEDICATED_SPECS[f.slug]);

  const toggleSection = (key) => (v) => setOpen((o) => ({ ...o, [key]: v }));

  /** Every filter change resets to page 1 — staying on page 4 of a narrower
   *  result set is the classic way to land on an empty grid.
   *
   *  Inside startTransition so the rail stays live while the grid re-queries:
   *  without it the click that ticks a checkbox blocks until the server
   *  answers, and ticking three brands in a row feels like three stalls.
   *  `isPending` is what the counts read to show they are catching up.
   *
   *  `replace` is for the search box, which commits on every keystroke —
   *  pushing there would bury the page the visitor arrived from under one
   *  history entry per letter typed. */
  const apply = useCallback(
    (mutate, { replace = false } = {}) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page");
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        if (replace) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    },
    [router, pathname, searchParams]
  );

  const setSingle = (key, value, opts) =>
    apply((p) => (value == null || value === "" ? p.delete(key) : p.set(key, String(value))), opts);

  /**
   * The search box's debounce.
   *
   * A ref, not state: changing it must not re-render, and the timer has to
   * survive the re-render that setTerm causes or every keystroke would be
   * debouncing a timer that no longer exists.
   */
  const searchTimer = useRef(null);
  const onSearchChange = (value) => {
    setTerm(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSingle("q", value, { replace: true }), 350);
  };
  // Nothing should navigate after the panel is gone — closing the phone's
  // sheet mid-word would otherwise fire one last search into a component
  // that has already unmounted.
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const toggleMulti = (key) => (value) =>
    apply((p) => {
      const current = (p.get(key) || "").split(",").filter(Boolean);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length) p.set(key, next.join(","));
      else p.delete(key);
    });

  const resetAll = () => {
    clearTimeout(searchTimer.current);
    setTerm("");
    startTransition(() => router.push(pathname, { scroll: false }));
  };

  const priceLo = Math.floor(facets.priceRange?.[0] ?? 0);
  const priceHi = Math.ceil(facets.priceRange?.[1] ?? 0);

  return (
    <div className="raised-card flex h-full flex-col overflow-hidden rounded-xl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-linear-to-r from-[var(--brand-primary)] to-[var(--brand-dark)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-white sm:h-5 sm:w-5" />
            <h2 className="text-base font-bold text-white sm:text-lg">{t("الفلاتر", "Filters")}</h2>
            {activeCount > 0 ? (
              <Badge className="rounded-[5px] border-white/30 bg-white/20 text-white hover:bg-white/20">
                {activeCount}
              </Badge>
            ) : null}
          </div>

          {isMobile ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("إغلاق", "Close")}
              className="rounded-[5px] p-2 text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {/* Searches the CARS, not the brand list below it.

            The main site's box narrows its own Brands section, which works
            there because that section is forty makes long. Here it writes `q`
            and filters the grid, which is what someone typing a model name
            into a box at the top of a filter rail is actually after.

            It commits AS YOU TYPE, debounced 350ms. It used to wait for Enter
            or a blur, which meant typing "changan" and watching the count sit
            at 4 — the box looked broken, because a search box that has your
            text in it and has changed nothing reads as one. 350ms is long
            enough that a whole word is one query rather than seven, and short
            enough to land before you look up from the keyboard.

            Enter still commits immediately (and cancels the pending timer), so
            nobody who expects Enter to work is made to wait for it. */}
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 sm:h-4 sm:w-4" />
          <Input
            value={term}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              clearTimeout(searchTimer.current);
              setSingle("q", e.currentTarget.value, { replace: true });
            }}
            placeholder={t("ابحث عن سيارة...", "Search cars...")}
            className="h-9 rounded-[5px] border-0 bg-white ps-9 pe-9 text-xs text-gray-900 sm:h-10 sm:ps-10 sm:pe-10 sm:text-sm placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-white/50"
          />
          {isPending ? (
            <Loader2 className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-primary" />
          ) : null}
        </div>

        {activeCount > 0 ? (
          <Button
            onClick={resetAll}
            variant="outline"
            className="mt-3 w-full gap-2 rounded-[5px] border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            {t("إعادة تعيين الكل", "Reset All")}
          </Button>
        ) : null}
      </div>

      {/* ── The sections ─────────────────────────────────────────────────── */}
      {/* min-h-0 is load-bearing: a flex child will not shrink below its own
          content without it, so the rail would grow past its fixed height and
          the scroll area would never scroll. */}
      <ScrollArea className="min-h-0 flex-1 bg-gray-50 dark:bg-[#111]">
        <div className="space-y-3 p-4">
          <PriceFilter
            currency={currency}
            range={[priceLo, priceHi]}
            minValue={get("min_price")}
            maxValue={get("max_price")}
            onCommitRange={([lo, hi]) =>
              apply((p) => {
                // A handle left at the end of its track is not a filter —
                // pinning min_price to the cheapest car on the site would put a
                // chip over the grid that says nothing and cannot be satisfied.
                if (lo > priceLo) p.set("min_price", String(lo));
                else p.delete("min_price");
                if (hi < priceHi) p.set("max_price", String(hi));
                else p.delete("max_price");
              })
            }
            isExpanded={!!open.price}
            onToggle={toggleSection("price")}
            locale={locale}
          />

          <BrandsFilter
            options={facets.brands ?? []}
            selectedBrands={list("brand")}
            selectedModels={list("model")}
            onToggleBrand={toggleMulti("brand")}
            onToggleModel={toggleMulti("model")}
            isExpanded={!!open.brands}
            onToggle={toggleSection("brands")}
            locale={locale}
          />

          <TrimsFilter
            options={facets.trimModels ?? []}
            selected={list("trim")}
            onToggleValue={toggleMulti("trim")}
            isExpanded={!!open.trims}
            onToggle={toggleSection("trims")}
            locale={locale}
          />

          <YearFilter
            options={facets.years ?? []}
            selected={list("year")}
            onToggleValue={toggleMulti("year")}
            isExpanded={!!open.year}
            onToggle={toggleSection("year")}
            locale={locale}
          />

          <SeatsFilter
            options={specBySlug.seats?.values ?? []}
            selected={chosenSpecs.seats ?? []}
            onToggleValue={(v) => toggleSpecValue("seats", v)}
            isExpanded={!!open.seats}
            onToggle={toggleSection("seats")}
            locale={locale}
          />

          <ColorsFilter
            options={facets.colors ?? []}
            selected={list("color")}
            onToggleValue={toggleMulti("color")}
            isExpanded={!!open.colors}
            onToggle={toggleSection("colors")}
            locale={locale}
          />

          <MileageFilter
            max={facets.maxMileage}
            value={get("max_mileage")}
            onCommit={(v) => setSingle("max_mileage", v)}
            isExpanded={!!open.mileage}
            onToggle={toggleSection("mileage")}
            locale={locale}
          />

          <ConditionFilter
            options={facets.conditions ?? []}
            selected={list("condition")}
            onToggleValue={toggleMulti("condition")}
            isExpanded={!!open.condition}
            onToggle={toggleSection("condition")}
            locale={locale}
          />

          <TransmissionFilter
            options={specBySlug.transmission?.values ?? []}
            selected={chosenSpecs.transmission ?? []}
            onToggleValue={(v) => toggleSpecValue("transmission", v)}
            isExpanded={!!open.transmission}
            onToggle={toggleSection("transmission")}
            locale={locale}
          />

          <FuelFilter
            options={specBySlug["fuel-type"]?.values ?? []}
            selected={chosenSpecs["fuel-type"] ?? []}
            onToggleValue={(v) => toggleSpecValue("fuel-type", v)}
            isExpanded={!!open.fuel}
            onToggle={toggleSection("fuel")}
            locale={locale}
          />

          <SpecFacets
            facets={genericSpecs}
            selected={chosenSpecs}
            ranges={specRanges}
            onToggleValue={toggleSpecValue}
            onCommitRange={commitSpecRange}
            expanded={open}
            onToggleSection={(slug, v) => setOpen((o) => ({ ...o, [slug]: v }))}
            locale={locale}
          />

          <DynamicFacets
            facets={facets.kinds ?? []}
            selected={chosenKinds}
            onToggleValue={toggleKindValue}
            expanded={open}
            onToggleSection={(kind, v) => setOpen((o) => ({ ...o, [kind]: v }))}
            locale={locale}
          />

          <OffersFilter
            options={facets.offers ?? []}
            selected={list("offer")}
            onToggleValue={toggleMulti("offer")}
            isExpanded={!!open.offers}
            onToggle={toggleSection("offers")}
            locale={locale}
          />

          <SpecialFeaturesFilter
            features={facets.features ?? {}}
            hasOffer={get("has_offer") === "1"}
            isFeatured={get("featured") === "1"}
            onHasOfferChange={(on) => setSingle("has_offer", on ? "1" : null)}
            onIsFeaturedChange={(on) => setSingle("featured", on ? "1" : null)}
            isExpanded={!!open.features}
            onToggle={toggleSection("features")}
            locale={locale}
          />

          <CityFilter
            options={facets.cities ?? []}
            selected={get("city")}
            onSelect={(v) => setSingle("city", v)}
            isExpanded={!!open.city}
            onToggle={toggleSection("city")}
            locale={locale}
          />

          <VendorFilter
            options={facets.vendors ?? []}
            selected={get("vendor")}
            onSelect={(v) => setSingle("vendor", v)}
            isExpanded={!!open.vendor}
            onToggle={toggleSection("vendor")}
            locale={locale}
          />
        </div>
      </ScrollArea>

      {/* ── Footer, phone only ─────────────────────────────────────────────

          The apply button. Filters take effect the moment they are tapped —
          each one writes the URL and the grid behind the sheet re-queries — so
          this does not "submit" anything; it confirms the count and gets out
          of the way. Which is why it says how many cars are waiting rather
          than "Apply": the number is the reason to press it.

          Two things it now does that it did not:

            · the count is live. It was `total`, the platform-wide figure the
              rail is handed, so it read "Show 4 cars" over a sheet filtered
              down to one. It now reads what the grid actually matched.

            · it says so while it is catching up. A tick and a re-query is
              ~300ms of the number being stale, and a button that silently
              shows the old count for a third of a second is how a filter comes
              to look like it did nothing.

          `sticky bottom-0` on top of the flex footer so it survives the
          browser chrome on a short phone — the panel is h-[calc(100vh-4rem)]
          and iOS Safari's toolbar eats into that. */}
      {isMobile ? (
        <div className="sticky bottom-0 shrink-0 border-t border-gray-200 bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-[#0f0f0f]">
          <Button
            onClick={onClose}
            className="h-10 w-full gap-2 rounded-lg bg-linear-to-b from-[var(--brand-primary)] to-[var(--brand-dark)] text-sm font-bold sm:h-12 sm:text-base text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(var(--brand-rgb),0.35),0_8px_16px_-5px_rgba(var(--brand-rgb),0.45)] transition-all active:translate-y-px active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("جارٍ التحديث…", "Updating…")}
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {t(
                  liveTotal === 1 ? "عرض سيارة واحدة" : `عرض ${liveTotal} سيارة`,
                  `Show ${liveTotal} ${liveTotal === 1 ? "car" : "cars"}`,
                )}
              </>
            )}
            {activeCount > 0 ? (
              <Badge className="rounded-[5px] border-white/30 bg-white/20 text-white hover:bg-white/20">
                {activeCount}
              </Badge>
            ) : null}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
