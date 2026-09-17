"use client";

/**
 * The hero's filter bar — brand, model, trim, area.
 *
 * ── Every option is real ────────────────────────────────────────────────────
 *
 * Nothing here is a hardcoded list. The options come from getCarFacets(), which
 * reads the LIVE listings and tallies what actually exists, so a make with no
 * cars on the platform never appears and a visitor cannot build a search that
 * returns nothing. The counts beside each option are the same tallies.
 *
 * That is also why there is no fetching in this component. The facets arrive
 * once from the server with the page, and the three cascades below are pure
 * filtering of data already in hand — picking a brand cannot spin, because
 * there is nothing to wait for.
 *
 * ── How the three relate ────────────────────────────────────────────────────
 *
 *   brand  →  facets.brands
 *   model  →  the selected brand's own `models`
 *   trim   →  facets.trimModels, matched to the selected model BY SLUG
 *
 * Trims are grouped by model upstream rather than listed flat, because "GT"
 * belongs to a model, not to a make — a flat list would put two unrelated GTs
 * on the same row with no way to tell them apart.
 *
 * Area is independent of the other three: a city is a fact about where the car
 * is, not about what it is, so narrowing the make must not empty it.
 *
 * ── Where it goes ───────────────────────────────────────────────────────────
 *
 * /marketplace/cars, which already reads ?brand= ?model= ?trim= ?city= and
 * accepts a slug or a uuid for each. So this control owns no search logic of
 * its own — it composes a URL the results page already understands, which is
 * what keeps the two from drifting apart.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, SlidersHorizontal, ChevronDown } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { localized } from "@/marketplace/lib/listing";

/**
 * The card's surface, and the ONLY definition of it.
 *
 * Exported because the Suspense fallback on the home page has to be the same
 * object — a skeleton that is a different colour or a different height makes
 * the hero flash and jump the moment the facets land. Two copies of a string
 * this long is two copies that will disagree; the skeleton lives here too, for
 * the same reason.
 *
 * The lighting itself is the `raised-card` utility in globals.css — see the
 * RAISED SURFACES block there for what each shadow layer is doing.
 */
export const CARD = "raised-card p-3 sm:p-5 rounded-xl sm:rounded-2xl";

/** "Any" has to be a real value — a Radix-style empty string is not selectable. */
const ANY = "__any";

export default function HeroFilter({ facets, locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [brand, setBrand] = useState(ANY);
  const [model, setModel] = useState(ANY);
  const [trim, setTrim] = useState(ANY);
  const [city, setCity] = useState(ANY);
  /**
   * Pending, owned by React rather than by us.
   *
   * This was `useState(false)` with a `setGoing(true)` on submit and nothing
   * that ever set it back — a one-way latch. It looked fine going TO the
   * results, because the page was replaced. Coming back was the bug: React
   * restores this component with its client state intact, so `going` was still
   * true, and the button came back to the home page spinning and disabled for
   * good.
   *
   * useTransition's isPending is the same signal with an end to it: React
   * clears it when the navigation settles, and a restored component gets a
   * fresh transition that was never started. Same primitive LanguageSwitcher
   * uses for the same reason.
   */
  const [going, startGoing] = useTransition();

  /**
   * Whether the panel is open ON A PHONE.
   *
   * Only below sm. From sm up the card is always shown and this state is not
   * consulted at all — the CSS decides, not the JavaScript, so there is no
   * breakpoint listener to get out of step with the stylesheet and no flash of
   * the wrong state on first paint.
   *
   * It starts closed because the hero's job on a 390px screen is the
   * photograph and the headline; four dropdowns stacked two-up push both off
   * the top of the fold before a visitor has read either.
   */
  const [open, setOpen] = useState(false);

  const brands = facets?.brands ?? [];
  const cities = facets?.cities ?? [];

  const models = brand === ANY
    ? []
    : (brands.find((b) => b.slug === brand)?.models ?? []);

  /* Matched by slug: the brand's models carry the slug, and trimModels is keyed
     by the model's uuid but carries the slug too. Slug is the one field both
     sides agree on. */
  const trims = model === ANY
    ? []
    : ((facets?.trimModels ?? []).find((m) => m.slug === model)?.trims ?? []);

  /* Choosing a new make invalidates whatever model and trim were chosen under
     the old one — they belong to a car that is no longer being described. */
  const pickBrand = (value) => { setBrand(value); setModel(ANY); setTrim(ANY); };
  const pickModel = (value) => { setModel(value); setTrim(ANY); };

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (brand !== ANY) params.set("brand", brand);
    if (model !== ANY) params.set("model", model);
    if (trim !== ANY) params.set("trim", trim);
    if (city !== ANY) params.set("city", city);

    const qs = params.toString();
    const href = `/${locale}/marketplace/cars${qs ? `?${qs}` : ""}`;
    startGoing(() => router.push(href));
  };

  /**
   * One dropdown, drawn the same way four times.
   *
   * The project's shadcn Select (Radix underneath) rather than a bare <select>,
   * so these match every other dropdown in the app — the seller forms, the
   * catalog manager and the compare picker all use it — and so the open list
   * can be styled, which a native control's options cannot be.
   *
   * ANY is a real sentinel value because a Radix SelectItem may NOT carry an
   * empty string: Radix uses "" internally for the cleared state and throws on
   * render if an item claims it. CompareTable hit the same wall and solved it
   * the same way.
   *
   * The label is a <p> tied by aria-labelledby rather than a <label>: the
   * trigger is a button, not a form control, so wrapping it in a label would
   * associate nothing.
   */
  const field = (key, label, value, onChange, options, placeholder, disabled = false) => (
    <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
      <p
        id={`hero-${key}-label`}
        className="text-[9px] font-semibold uppercase tracking-[0.08em] text-brand-primary/70 dark:text-[var(--brand-on-dark)]/70 sm:text-[10px]"
      >
        {label}
      </p>
      <Select value={value} onValueChange={onChange} disabled={disabled} dir={isAr ? "rtl" : "ltr"}>
        <SelectTrigger
          aria-labelledby={`hero-${key}-label`}
          className="h-9 rounded-lg border-brand-primary/15 bg-white px-2.5 text-xs focus:ring-brand-primary/25 dark:border-white/10 dark:bg-white/10 dark:shadow-none sm:h-11 sm:rounded-xl sm:px-3 sm:text-sm"
        >
          {/* Explicit children, not just a placeholder. Radix resolves a
              SelectValue from its matching SelectItem on the CLIENT, so the
              server pass renders an empty trigger and the four labels pop in
              after hydration. Handing it the text directly means the bar is
              readable in the first frame. */}
          <SelectValue placeholder={placeholder}>
            {value === ANY
              ? placeholder
              : (options.find((o) => o.value === value)?.label ?? placeholder)}
          </SelectValue>
        </SelectTrigger>
        {/* Same treatment as the nav dropdown: a panel floating over the
            page is lit like every other floating panel. */}
        <SelectContent className="raised-card max-h-72 border-0">
          <SelectItem value={ANY} className="raised-hover rounded-md">{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="raised-hover rounded-md">
              {o.label}
              {o.count ? (
                <span className="ms-1.5 text-xs tabular-nums text-muted-foreground">({o.count})</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const asOptions = (rows) =>
    rows.map((r) => ({ value: r.slug, label: localized(r.name, locale) || r.slug, count: r.count }));

  return (
    <>
      {/* ── Phone trigger ───────────────────────────────────────
          A real <button> with aria-expanded and aria-controls rather than a div
          that toggles a class — a screen reader has to be able to know the panel
          below it exists and whether it is showing.

          Same raised treatment as the card it opens, so the two read as one
          object in two states rather than a button and an unrelated panel. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="hero-filter-panel"
        /* A compact pill centred over the photo, not a full-width bar — on a
           phone the bar was the largest thing in the hero after the picture. */
        className="raised mx-auto flex w-fit items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold sm:hidden"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("الفلاتر", "Filter")}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <form
        id="hero-filter-panel"
        onSubmit={submit}
        /* hidden/sm:block, not a conditional render: the panel stays in the DOM
           so a screen reader can follow aria-controls to it, and so opening it
           costs no mount. */
        className={`${open ? "mt-2 block" : "hidden"} sm:mt-0 sm:block ${CARD}`}
      >
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5 lg:items-end">
        {field(
          "brand", t("الماركة", "Brand"), brand, pickBrand,
          asOptions(brands),
          t("كل الماركات", "All brands")
        )}

        {field(
          "model", t("الموديل", "Model"), model, pickModel,
          asOptions(models),
          brand === ANY ? t("اختر الماركة أولاً", "Pick a brand first") : t("كل الموديلات", "All models"),
          brand === ANY
        )}

        {field(
          "trim", t("الفئة", "Trim"), trim, setTrim,
          asOptions(trims),
          model === ANY
            ? t("اختر الموديل أولاً", "Pick a model first")
            : trims.length
              ? t("كل الفئات", "All trims")
              : t("لا توجد فئات", "No trims listed"),
          model === ANY || trims.length === 0
        )}

        {field(
          "area", t("المنطقة", "Area"), city, setCity,
          cities.map((c) => ({ value: c.value, label: c.value, count: c.count })),
          t("كل المناطق", "All areas")
        )}

        {/* Spans both columns on a phone, where it sits under two half-width
            selects and a half-width button would look like a fifth field. */}
        <button
          type="submit"
          disabled={going}
          className="raised-solid col-span-2 flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-primary px-5 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(var(--brand-rgb),0.35),0_6px_12px_-4px_rgba(var(--brand-rgb),0.45)] transition-all hover:bg-brand-dark active:translate-y-px active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] disabled:opacity-70 dark:text-[var(--brand-ink)] sm:h-11 sm:rounded-xl sm:px-6 sm:text-sm lg:col-span-1"
        >
          {going ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t("اعرض النتائج", "Show results")}
        </button>
        </div>
      </form>
    </>
  );
}

/**
 * The card's shape before the options arrive.
 *
 * Same surface, same paddings, same field heights — so the only thing that
 * changes when the facets land is the text inside the fields.
 */
export function HeroFilterSkeleton() {
  return (
    <>
    {/* The phone gets the pill, as the real control does, so the hero does not
        jump from a whole panel to a small button when it arrives. */}
    <div className="mx-auto h-[30px] w-24 animate-pulse rounded-full bg-white/70 sm:hidden dark:bg-white/10" />
    <div className={`hidden sm:block ${CARD}`}>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5 lg:items-end">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={i === 4 ? "col-span-2 lg:col-span-1" : ""}>
            <div className="mb-1.5 h-2.5 w-16 animate-pulse rounded bg-brand-primary/15 dark:bg-white/10" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-white/70 dark:bg-white/5 sm:h-11 sm:rounded-xl" />
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
