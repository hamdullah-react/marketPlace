"use client";

/**
 * The comparison table — laid out band for band like the main site's compare
 * page (app/[locale]/(main)/compare-cars/ComparePageClient.jsx), because a
 * buyer who has used alromaihcars.com should not have to learn this page
 * twice:
 *
 *   1. a centred pair of pills — "Add Car to Compare" (dashed) and
 *      "Change Cars" — with Share opposite
 *   2. the car cards: a carousel with dots and arrows on a phone, a centred
 *      grid with a VS badge between them on a desktop
 *   3. "Key Specifications" — a solid purple bar over the handful of rows a
 *      buyer actually decides on
 *   4. "Specifications" — a second bar over the category accordions, closed
 *      on arrival
 *
 * ── Two blocks, not one grid ────────────────────────────────────────────────
 *
 * The cards sit in their own centred container and the specs in real tables
 * below, exactly as the main site does it. That is a deliberate reversal of
 * the earlier one-grid version here: a card sharing a column with the values
 * gets whatever width the table gives it, which on a desktop was three times
 * the size the card was drawn at. The table carries its own headings instead —
 * the sticky label column at the start of each row and, on a phone, the name
 * strip that follows the carousel — so nothing depends on the cards lining up.
 *
 * ── The URL is the state ────────────────────────────────────────────────────
 *
 * Adding and removing pushes a new path. Nothing local can drift out of step
 * with what is displayed, back steps through the comparisons a visitor built,
 * and the address bar is always the link to share.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnChange } from "@/hooks/use-on-change";
import {
  X, Plus, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Sparkles, Share2, Loader2, Filter, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Carousel, CarouselContent, CarouselItem,
} from "@/components/ui/carousel";
import ListingCard from "../../../_components/ListingCard";

/**
 * The card row, one static string per car count — the main site's widths.
 *
 * Tailwind resolves classes by scanning the source, so a computed
 * `md:grid-cols-${n}` would be in the markup and in no stylesheet, and the row
 * would silently collapse to one column. Three literals is the price of that,
 * and there are only ever three.
 */
const CARD_GRID = {
  1: "md:grid-cols-1 max-w-sm",
  2: "md:grid-cols-2 max-w-2xl",
  3: "md:grid-cols-2 lg:grid-cols-3 max-w-5xl",
};

/**
 * What the spec table refuses to shrink below before it starts scrolling.
 *
 * `table-fixed w-full` alone would squeeze three cars into a phone and never
 * scroll, because there would be nothing wider than the viewport to scroll to.
 */
const TABLE_MIN = {
  1: "min-w-[18rem]",
  2: "min-w-[26rem]",
  3: "min-w-[34rem]",
};

/**
 * Answers that mean "it does not have it".
 *
 * A yes/no spec is not a boolean upstream — see schema.sql §14 — so "No" and
 * "Not available" arrive as text and have to be recognised to render as a
 * cross. Anything else present renders as a tick.
 */
const NEGATIVE = new Set([
  "no", "none", "n/a", "na", "false", "0", "not available", "-",
  "لا", "غير متوفر", "لا يوجد",
]);

export default function CompareTable({
  locale = "ar",
  cars = [],
  overview = [],
  keySpecs = [],
  groups = [],
  missing = [],
  pickable = [],
  max = 3,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Which car is being added, and which is being taken out.
   *
   * Every add and remove is a navigation — the comparison lives in the URL —
   * and a navigation takes as long as the server takes. compare/loading.js
   * covers that with a page skeleton, but only once the router has committed
   * to the new route; the moment between the tap and that commit is this
   * component's to fill, and an unmarked tap in that gap is exactly what
   * "nothing is happening" feels like.
   */
  const [adding, setAdding] = useState(null);
  const [removing, setRemoving] = useState(null);

  /* Cleared when the navigation lands, whatever the outcome. Tying this to
     `pending` rather than to a timer means a slow server holds the spinner for
     as long as it is actually slow, and a fast one never flashes it.

     During render rather than in an effect: an effect paints the spinner one
     more time after the new table has already arrived. See hooks/use-on-change. */
  useOnChange(pending, (nowPending) => {
    if (!nowPending) {
      setAdding(null);
      setRemoving(null);
    }
  });

  /* Closed on arrival, like the main site. A visitor lands on the cards and
     the key specs — the categories are there to be opened, not to be scrolled
     past. */
  const [open, setOpen] = useState(() => new Set());

  /* The picker's own filters. "all" rather than "" because a Radix SelectItem
     may not carry an empty value — it uses that internally for the cleared
     state and throws on render. */
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [city, setCity] = useState("all");

  /* The phone carousel, and the name strip that follows it. */
  const [carouselApi, setCarouselApi] = useState(null);
  const [activeCar, setActiveCar] = useState(0);

  useEffect(() => {
    if (!carouselApi) return;
    const sync = () => setActiveCar(carouselApi.selectedScrollSnap());
    sync();
    carouselApi.on("select", sync);
    return () => carouselApi.off("select", sync);
  }, [carouselApi]);

  const scrollToCard = useCallback(
    (index) => carouselApi?.scrollTo(index),
    [carouselApi]
  );

  const go = (slugs) =>
    startTransition(() => {
      router.push(
        slugs.length
          ? `/${locale}/marketplace/compare/${slugs.join("/")}`
          : `/${locale}/marketplace/compare`
      );
    });

  const add = (car) => {
    // The car, not just its slug: the overlay shows the one that was picked,
    // which is the difference between "loading" and "loading THAT one".
    setAdding(car);
    setPicking(false);
    go([...cars.map((c) => c.slug), car.slug]);
  };

  const remove = (slug) => {
    setRemoving(slug);
    go(cars.map((c) => c.slug).filter((s) => s !== slug));
  };

  const share = async () => {
    const url = window.location.href;
    const title = cars.map((c) => c.title).join(t(" مقابل ", " vs "));

    // The share sheet where there is one — on a phone this is the whole point,
    // and it puts the link into WhatsApp in one tap rather than three.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* Dismissed, or refused. Fall through to the clipboard. */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A browser that refuses both still leaves the address bar. */
    }
  };

  /* What the toggle leaves standing. A comparison of one car has nothing to
     differ FROM, so the toggle is hidden below rather than emptying the page. */
  const visibleOverview = useMemo(
    () => (onlyDiffs ? overview.filter((r) => r.differs) : overview),
    [overview, onlyDiffs]
  );

  const visibleKeySpecs = useMemo(
    () => (onlyDiffs ? keySpecs.filter((r) => r.differs) : keySpecs),
    [keySpecs, onlyDiffs]
  );

  const visibleGroups = useMemo(() => {
    if (!onlyDiffs) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.differs) }))
      .filter((g) => g.items.length > 0);
  }, [groups, onlyDiffs]);

  const differenceCount =
    overview.filter((r) => r.differs).length +
    keySpecs.filter((r) => r.differs).length +
    groups.reduce((n, g) => n + g.items.filter((i) => i.differs).length, 0);

  /* Built from what is actually offered rather than from a fixed list, so a
     filter can never name a brand with no cars behind it. */
  const brands = useMemo(
    () => [...new Set(pickable.map((c) => c.brand?.name).filter(Boolean))].sort(),
    [pickable]
  );
  const cities = useMemo(
    () => [...new Set(pickable.map((c) => c.city).filter(Boolean))].sort(),
    [pickable]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pickable.filter((c) => {
      if (brand !== "all" && c.brand?.name !== brand) return false;
      if (city !== "all" && c.city !== city) return false;
      if (!needle) return true;
      // Searched across the four things a person types when they are looking
      // for a car they have already seen: its name, its make, who is selling
      // it, and where it is.
      return [c.title, c.brand?.name, c.vendor?.name, c.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [pickable, query, brand, city]);

  const filtered = query.trim() !== "" || brand !== "all" || city !== "all";
  const resetFilters = () => {
    setQuery("");
    setBrand("all");
    setCity("all");
  };

  const count = Math.min(cars.length, max);
  const cardGrid = CARD_GRID[count] ?? CARD_GRID[1];
  const tableMin = TABLE_MIN[count] ?? TABLE_MIN[1];
  const canAdd = cars.length < max;

  // ── Nothing chosen yet ────────────────────────────────────────────────────
  if (!cars.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary/10">
          <Sparkles className="h-7 w-7 text-brand-primary" />
        </div>
        <h2 className="text-2xl font-bold text-brand-primary">
          {t("قارن بين السيارات", "Compare cars")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {t(
            `اختر حتى ${max} سيارات لعرض المواصفات والأسعار والبائعين جنباً إلى جنب.`,
            `Pick up to ${max} cars to see their specs, prices and sellers side by side.`
          )}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => setPicking(true)} disabled={!pickable.length}>
            <Plus className="h-4 w-4" />
            {t("اختر سيارة", "Pick a car")}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/${locale}/marketplace/cars`}>
              {t("تصفّح كل السيارات", "Browse all cars")}
            </Link>
          </Button>
        </div>

        {pickable.length ? null : (
          <p className="mt-6 text-xs text-muted-foreground">
            {t("لا توجد سيارات منشورة بعد.", "There are no published cars to compare yet.")}
          </p>
        )}

        {renderPicker()}
      </div>
    );
  }

  return (
    <div className="pb-16">
      {/* ── Cars the link named that the database no longer has ────────────── */}
      {missing.length ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {t(
            `${missing.length} سيارة في هذا الرابط لم تعد متاحة، وتم استبعادها.`,
            `${missing.length} car${missing.length > 1 ? "s" : ""} in this link ${
              missing.length > 1 ? "are" : "is"
            } no longer available and ${missing.length > 1 ? "have" : "has"} been left out.`
          )}
        </div>
      ) : null}

      {/* ── One car so far ─────────────────────────────────────────────────── */}
      {cars.length === 1 ? (
        <div className="mx-auto mb-5 max-w-2xl rounded-xl border border-green-200 bg-green-50 p-3 text-center dark:border-green-900/50 dark:bg-green-950/30 md:p-4">
          <h2 className="text-base font-semibold text-green-900 dark:text-green-200 md:text-lg">
            {t("ممتاز! تم اختيار السيارة الأولى", "Great! First car selected")}
          </h2>
          <p className="text-sm text-green-800 dark:text-green-300">
            {t("الآن اختر سيارة أخرى لبدء المقارنة", "Now select another car to start comparison")}
          </p>
        </div>
      ) : null}

      {/* ── Action pills, centred, with Share opposite ─────────────────────── */}
      <div className="relative mb-4 flex flex-wrap items-center justify-center gap-2 md:gap-3">
        {canAdd ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={pending || !pickable.length}
            className="flex items-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 py-2 text-gray-600 transition-all hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/5 dark:text-gray-300 md:gap-2 md:px-4 md:py-2.5"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
            ) : (
              <Plus className="h-4 w-4 md:h-5 md:w-5" />
            )}
            <span className="text-xs font-medium md:text-sm">
              {t("أضف سيارة للمقارنة", "Add Car to Compare")}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-600 transition-all hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/5 dark:text-gray-300 md:gap-2 md:px-4 md:py-2.5"
        >
          <span className="text-xs font-medium md:text-sm">
            {canAdd
              ? t("تغيير السيارات", "Change Cars")
              : t(`الحد ${max} سيارات`, `${max} cars is the limit`)}
          </span>
        </button>

        {/* Absolute only from lg up. On a narrow screen it takes its place in
            the wrap instead, because a button pinned to the end of a row that
            has wrapped sits on top of the row below it. */}
        {cars.length >= 2 ? (
          <button
            type="button"
            onClick={share}
            className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-white transition-all hover:bg-brand-dark md:gap-2 md:px-4 md:py-2.5 lg:absolute lg:end-0"
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            <span className="text-xs font-medium md:text-sm">
              {copied ? t("تم النسخ", "Copied") : t("مشاركة", "Share")}
            </span>
          </button>
        ) : null}
      </div>

      {/* ── Mobile: one card at a time, with the next one peeking ──────────── */}
      <div className="block md:hidden">
        <Carousel
          setApi={setCarouselApi}
          opts={{ align: "start", loop: false, direction: isAr ? "rtl" : "ltr" }}
          className="w-full"
        >
          {/* No margin or padding of our own on the track or the slides.
              CarouselContent already carries -ml-4 and CarouselItem pl-4, and a
              `-ms-2` next to a `-ml-4` is two utilities setting the same
              computed margin — which of them wins is stylesheet order, not
              class order, so the gutter would be whatever Tailwind happened to
              emit last. The built-in 1rem gutter is the one that is defined. */}
          <CarouselContent>
            {cars.map((car) => (
              <CarouselItem key={car.id} className="basis-[80%] sm:basis-[70%]">
                <div className="relative">
                  <ListingCard
                    listing={car}
                    locale={locale}
                    cardSpecs={car.cardSpecs ?? []}
                    compact
                  />
                  {removeButton(car, "top-2 start-2 p-2.5")}
                  {removingOverlay(car)}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        {cars.length > 1 ? (
          <>
            <div className="mt-3 flex justify-center gap-2">
              {cars.map((car, index) => (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => scrollToCard(index)}
                  aria-label={car.title}
                  className={`h-2.5 rounded-full transition-all ${
                    activeCar === index ? "w-6 bg-brand-primary" : "w-2.5 bg-gray-300"
                  }`}
                />
              ))}
            </div>

            <div className="mt-3 flex justify-center gap-4">
              <button
                type="button"
                onClick={() => carouselApi?.scrollPrev()}
                disabled={activeCar === 0}
                aria-label={t("السابق", "Previous")}
                className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/10 dark:bg-white/5"
              >
                {isAr ? (
                  <ChevronRight className="h-5 w-5 text-brand-primary" />
                ) : (
                  <ChevronLeft className="h-5 w-5 text-brand-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => carouselApi?.scrollNext()}
                disabled={activeCar === cars.length - 1}
                aria-label={t("التالي", "Next")}
                className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/10 dark:bg-white/5"
              >
                {isAr ? (
                  <ChevronLeft className="h-5 w-5 text-brand-primary" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-brand-primary" />
                )}
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Desktop: side by side, with VS between a pair ──────────────────── */}
      <div className={`mx-auto hidden gap-6 md:grid ${cardGrid}`}>
        {cars.map((car, index) => (
          <div key={car.id} className="group relative">
            <ListingCard
              listing={car}
              locale={locale}
              cardSpecs={car.cardSpecs ?? []}
              compact
            />
            {removeButton(car, "top-3 start-3 p-2")}
            {removingOverlay(car)}

            {/* Only between a PAIR. With three cars the badge would have to sit
                between two of them and not the third, which would say something
                about the comparison that is not true. */}
            {cars.length === 2 && index === 0 ? (
              <div className="absolute -end-6 top-1/2 z-10 -translate-y-1/2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-brand-primary bg-white shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/Vs.svg" alt="VS" width={24} height={24} />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* ── The specifications ─────────────────────────────────────────────── */}
      <div className="py-4 md:py-8">
        {/* On a phone the cards scroll one at a time, so the tables below need
            their own heading of who is who — and tapping one moves the
            carousel, so the two halves of the page stay in step. */}
        {cars.length > 1 ? (
          <div className="mb-4 overflow-hidden rounded-2xl bg-white p-3 shadow-xs dark:bg-[#141414] md:hidden">
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {cars.map((car, index) => (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => scrollToCard(index)}
                  className={`w-[45vw] max-w-[160px] shrink-0 rounded-xl border-2 p-3 text-center transition-all ${
                    activeCar === index
                      ? "border-brand-primary bg-brand-primary text-white shadow-md"
                      : "border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
                  }`}
                >
                  <p
                    className={`truncate text-xs font-semibold ${
                      activeCar === index ? "text-white" : "text-brand-primary"
                    }`}
                  >
                    {car.brand?.name || car.vendor?.name || ""}
                  </p>
                  <p
                    className={`truncate text-[10px] ${
                      activeCar === index
                        ? "text-white/80"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {car.title}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Only offered where there is a second car to differ from. */}
        {cars.length > 1 ? (
          <div className="mb-3 flex justify-end">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {t("الاختلافات فقط", "Differences only")}
              </span>
              <Switch checked={onlyDiffs} onCheckedChange={setOnlyDiffs} />
              <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 font-medium text-brand-primary">
                {differenceCount}
              </span>
            </label>
          </div>
        ) : null}

        {/* ── Key Specifications ───────────────────────────────────────────── */}
        {visibleOverview.length || visibleKeySpecs.length ? (
          <div className="mb-4 md:mb-8">
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-white shadow-xs md:mb-6 md:px-6 md:py-4">
              <Sparkles className="h-4 w-4 md:h-5 md:w-5" />
              <h2 className="text-base font-bold md:text-lg">
                {t("المواصفات الرئيسية", "Key Specifications")}
              </h2>
            </div>

            <div className="overflow-hidden rounded-xl bg-white shadow-xs dark:bg-[#141414]">
              <div className="max-w-full overflow-x-auto">
                <table className={`w-full table-fixed ${tableMin}`}>
                  <tbody>
                    {visibleOverview.map((row) => (
                      <SpecRow
                        key={row.key}
                        row={row}
                        cars={cars}
                        tone="bg-white dark:bg-[#141414]"
                      />
                    ))}
                    {visibleKeySpecs.map((row) => (
                      <SpecRow
                        key={row.key}
                        row={row}
                        cars={cars}
                        tone="bg-white dark:bg-[#141414]"
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Specifications, by category ──────────────────────────────────── */}
        {visibleGroups.length ? (
          <div className="mb-3 rounded-xl bg-brand-primary px-4 py-3 text-white shadow-xs md:mb-6 md:px-6 md:py-4">
            <h2 className="text-base font-bold md:text-lg">
              {t("المواصفات", "Specifications")}
            </h2>
          </div>
        ) : null}

        {visibleGroups.map((group) => {
          const isOpen = open.has(group.key);
          return (
            <div
              key={group.key}
              className="mb-3 overflow-hidden rounded-xl bg-white shadow-xs dark:bg-[#141414] md:mb-6"
            >
              <button
                type="button"
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between p-3 text-start transition-colors hover:bg-gray-50 dark:hover:bg-white/5 md:p-5"
              >
                <div className="flex min-w-0 items-center gap-2 md:gap-3">
                  {group.icon ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={group.icon}
                      alt=""
                      className="h-8 w-8 shrink-0 object-contain md:h-10 md:w-10"
                    />
                  ) : null}
                  <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 md:text-base">
                    {group.name}
                  </h3>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 shrink-0 text-gray-500" />
                ) : (
                  <ChevronDown className="h-5 w-5 shrink-0 text-gray-500" />
                )}
              </button>

              {isOpen ? (
                <div className="max-w-full overflow-x-auto border-t dark:border-white/10">
                  <table className={`w-full table-fixed ${tableMin}`}>
                    <tbody>
                      {group.items.map((item) => (
                        <SpecRow
                          key={item.key}
                          row={item}
                          cars={cars}
                          tone="bg-gray-50/80 dark:bg-white/5"
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}

        {visibleGroups.length || visibleKeySpecs.length || visibleOverview.length ? null : (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">
            {onlyDiffs
              ? t("لا توجد اختلافات.", "These cars are identical on every row.")
              : t(
                  "لم يضف البائعون مواصفات لهذه السيارات بعد.",
                  "The sellers have not added specifications for these cars yet."
                )}
          </div>
        )}
      </div>

      {renderPicker()}

      {/* ── Adding ──────────────────────────────────────────────────────────
          The card that was just picked, held up while the new comparison is
          built. It names the car rather than saying "Loading", because the
          question in a visitor's head at that moment is whether the tap
          landed on the one they meant.
          ---------------------------------------------------------------- */}
      {adding ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-[#141414] md:p-6">
            <div className="flex flex-col items-center gap-4">
              {adding.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={adding.image}
                  alt=""
                  className="h-24 w-full rounded-xl object-contain"
                />
              ) : (
                <div className="h-24 w-24 animate-pulse rounded-xl bg-gray-200 dark:bg-white/10" />
              )}

              <div className="w-full text-center">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {adding.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("جاري الإضافة إلى المقارنة…", "Adding to the comparison…")}
                </p>
              </div>

              <div className="flex gap-2">
                <span className="h-2 w-2 animate-bounce rounded-full bg-brand-primary [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-brand-primary [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-brand-primary [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  // ── The remove control ────────────────────────────────────────────────────
  /**
   * A solid red disc in the card's top-start corner, the same control the main
   * site uses.
   *
   * z-30 is not decoration. The card paints its discount badge in that corner
   * at z-20, so anything at or below that is hidden on exactly the cars a
   * person is most likely to be comparing — which is how an earlier version of
   * this button became invisible. Solid red on white over a shadow reads over
   * whatever it lands on.
   */
  function removeButton(car, place) {
    return (
      <button
        type="button"
        onClick={() => remove(car.slug)}
        disabled={pending}
        aria-label={t("إزالة من المقارنة", "Remove from comparison")}
        title={t("إزالة من المقارنة", "Remove from comparison")}
        className={`absolute z-30 rounded-full bg-red-500 text-white opacity-90 shadow-lg transition-all hover:bg-red-600 hover:opacity-100 disabled:cursor-not-allowed ${place}`}
      >
        <X className="h-4 w-4" />
      </button>
    );
  }

  /**
   * The card being taken out, greyed while the new comparison is built.
   *
   * Over the card it belongs to rather than over the page, because removing is
   * a thing that happens to ONE column and the others stay readable while it
   * does. z-40, above the remove button that started it — the control has done
   * its job and a second tap on it would only queue a navigation to a URL that
   * is already being built.
   */
  function removingOverlay(car) {
    if (removing !== car.slug) return null;

    return (
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-[10px] bg-white/80 backdrop-blur-xs dark:bg-black/70">
        <Loader2 className="mb-2 h-8 w-8 animate-spin text-red-500 md:h-10 md:w-10" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {t("جاري الإزالة…", "Removing…")}
        </p>
      </div>
    );
  }

  // ── The picker ────────────────────────────────────────────────────────────
  function renderPicker() {
    return (
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="flex h-[90vh] max-h-[90vh] w-[96vw] flex-col sm:max-w-[92rem]"
        >
          <DialogHeader className="text-start">
            <DialogTitle className="text-start text-brand-primary">
              {t("أضف سيارة للمقارنة", "Add a car to compare")}
            </DialogTitle>
            <DialogDescription className="text-start">
              {t(
                "السيارات المعروضة في السوق الآن.",
                "The cars listed on the marketplace right now."
              )}
            </DialogDescription>
          </DialogHeader>

          {/* ── Find it ──────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-b pb-3 dark:border-white/10">
            <div className="relative min-w-0 flex-1 basis-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("ابحث بالاسم أو الماركة أو المعرض…", "Search by name, make, seller…")}
                className="ps-9"
              />
            </div>

            {/* Offered only where there is something to choose between — one
                brand in the list is not a filter, it is a label. */}
            {brands.length > 1 ? (
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger className="w-[10rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? "rtl" : "ltr"}>
                  <SelectItem value="all">{t("كل الماركات", "All makes")}</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {cities.length > 1 ? (
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="w-[10rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir={isAr ? "rtl" : "ltr"}>
                  <SelectItem value="all">{t("كل المدن", "All cities")}</SelectItem>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <span className="text-xs text-muted-foreground">
              {t(`${shown.length} سيارة`, `${shown.length} car${shown.length === 1 ? "" : "s"}`)}
            </span>

            {filtered ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="h-3.5 w-3.5" />
                {t("مسح", "Clear")}
              </Button>
            ) : null}
          </div>

          {/* The real card, so a car looks the same here as it does in the grid
              it was chosen from. Wrapped in a button rather than given an
              onClick of its own: the card is a link to the listing, and the
              wrapper is what turns a whole card into "pick this one". */}
          {/* Four across at the widest, not six. Six fitted more cars on the
              screen at once but drew each one at roughly half the width it was
              designed at, and a chooser whose cards are too small to read is
              not a faster chooser — the search box above is what makes a long
              list quick. */}
          <div className="grid min-h-0 flex-1 auto-rows-max gap-3 overflow-y-auto px-1 py-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((car) => (
              <button
                key={car.id}
                type="button"
                onClick={() => add(car)}
                disabled={pending}
                className="group/pick relative rounded-xl text-start outline-hidden transition-transform focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-wait"
              >
                {/* Covers the card so a click anywhere on it picks rather than
                    navigating — the card's own links stay underneath, unreached,
                    which is what keeps this a chooser and not a way out. */}
                <span className="absolute inset-0 z-20 rounded-xl" />
                <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-brand-primary/0 opacity-0 transition-all group-hover/pick:bg-brand-primary/10 group-hover/pick:opacity-100">
                  <span className="flex items-center gap-1.5 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                    <Plus className="h-3.5 w-3.5" />
                    {t("أضف", "Add")}
                  </span>
                </span>

                <ListingCard
                  listing={car}
                  locale={locale}
                  cardSpecs={car.cardSpecs ?? []}
                  compact
                />
              </button>
            ))}

            {shown.length ? null : (
              <div className="col-span-full py-14 text-center">
                <p className="text-sm text-muted-foreground">
                  {filtered
                    ? t("لا توجد سيارة تطابق البحث.", "No car matches that search.")
                    : t("لا توجد سيارات أخرى لإضافتها.", "There are no other cars to add.")}
                </p>
                {filtered ? (
                  <Button variant="outline" size="sm" className="mt-3" onClick={resetFilters}>
                    {t("مسح البحث", "Clear the search")}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}

/**
 * One row of a spec table: a sticky label cell, then a cell per car.
 *
 * Module scope, not declared inside CompareTable — a component defined inside
 * another is a new type on every render, so React would unmount and remount
 * every cell in the table each time the toggle moved.
 *
 * The label column is `sticky start-0`, not `left-0`: this page is Arabic half
 * the time, and a column pinned to the physical left of an RTL table pins
 * itself to the far end of the scroll, which is the one place it is no use.
 */
function SpecRow({ row, cars, tone }) {
  return (
    <tr className="border-b last:border-0 dark:border-white/10">
      <td
        className={`sticky start-0 z-10 w-[120px] p-3 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] md:w-[150px] md:p-4 ${
          row.differs ? "bg-brand-light/60 dark:bg-brand-primary/20" : tone
        }`}
      >
        <div className="flex items-center gap-1.5 md:gap-2">
          {row.icon ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={row.icon}
              alt=""
              className="h-6 w-6 shrink-0 object-contain md:h-8 md:w-8"
            />
          ) : null}
          <span
            className={`line-clamp-2 text-xs font-medium md:text-sm ${
              row.differs ? "text-brand-primary" : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {row.label}
          </span>
        </div>
      </td>

      {cars.map((car) => (
        <td
          key={car.id}
          className={`p-3 text-center text-xs md:p-4 md:text-sm ${
            row.differs ? "bg-brand-light/15 dark:bg-brand-primary/5" : ""
          }`}
        >
          <Value
            value={row.values?.[car.id]}
            row={row}
            isWinner={row.winner === car.id}
          />
        </td>
      ))}
    </tr>
  );
}

/** A tick, a cross, a dash, or the words — in that order of preference. */
function Value({ value, row, isWinner }) {
  if (value == null || value === "") {
    return <span className="text-gray-400">–</span>;
  }

  const text = String(value).trim();
  const yesno =
    row.displayType === "yesno" ||
    row.displayType === "boolean" ||
    value === true ||
    text.toLowerCase() === "true";

  if (yesno) {
    return NEGATIVE.has(text.toLowerCase()) ? (
      <X className="mx-auto h-4 w-4 text-red-500" />
    ) : (
      <Check className="mx-auto h-4 w-4 text-green-600" />
    );
  }

  if (isWinner) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">
        <Check className="h-3 w-3 shrink-0" />
        {text}
      </span>
    );
  }

  return <span className="text-gray-900 dark:text-gray-100">{text}</span>;
}
