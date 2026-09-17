"use client";

/**
 * The fold of the listing page: gallery on the left, buy panel on the right.
 *
 * Matched band for band against the main site's car page — car-gallery.jsx
 * (the 10-column 7/3 grid), CarGallery.jsx (tabs, frame, arrows, thumbnails,
 * fullscreen) and the panel pieces under Car-Details-page/components
 * (CarHeader, CarActions, ColorSelection, QuickPricePreview + CashPrice). A
 * buyer moving between alromaihcars.com and the marketplace should not be able
 * to tell that the second one is a different application.
 *
 * Gallery and panel are ONE component because they share one piece of state:
 * the selected colour. The swatches live in the panel and the photos they
 * select live in the gallery, exactly as the main site has it, so splitting
 * them would mean lifting that state into a third wrapper for nothing.
 *
 * Deliberately NOT carried over, per the brief:
 *   - the Special Offer / You Save banner (needs compare_at; no listing has one)
 *   - Monthly Payment, Calculate, Apply for Finance
 * A marketplace listing sells through the seller, so those two buttons are
 * Send enquiry / Call seller — same shape, same weight, different job.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useOnChange } from "@/hooks/use-on-change";
import { thumbUrl, THUMB } from "@/marketplace/lib/image";
import { priceWithOffer } from "@/marketplace/lib/offer";
import LeadPanel from "./LeadPanel";
import {
  ChevronLeft, ChevronRight, ImageOff, Maximize2, Car, Sofa, X, Images,
  Heart, Share2, ShieldCheck,
} from "lucide-react";

/** Same formatter the main site's CashPrice uses — grouped, no decimals. */
const money = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n) || 0);

export default function ListingFold({
  listing,
  variants = [],
  trims = null,
  locale = "ar",
  // Who is looking. Shaped by the page, not read here — a client component
  // cannot ask the session, and passing the whole viewer would serialise ids
  // and roles into the HTML of a page every visitor can read.
  viewer = { signedIn: false, ownsListing: false, phone: "", alreadySentAt: null },
  // Whatever this showroom asks buyers, from Dashboard → Lead form. Passed
  // through untouched; the panel renders them and the action re-validates.
  leadFields = [],
  // Which of the five presets the seller chose for it, and the accent, corner
  // and density they set on top.
  leadStyle = "classic",
  leadTheme = null,
  // The seller's own tabs, when they grouped a long form into sections.
  leadTabs = [],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /* A colour earns a swatch when it has photos of its OWN, or a price of its
     own (schema.sql §31).

     Photos alone was the whole rule until a colour could cost something:
     falling back to the listing's shared photos means picking White and being
     shown the silver car, which reads as a bug to every buyer who tries it.

     But a colour that MOVES THE PRICE is worth showing whether or not anyone
     photographed the car in it — the alternative is a seller pricing red at
     1,500 and no buyer ever seeing the colour exists. The gallery keeps the
     listing's own photos in that case (the `source` fallback below), and the
     line under the swatches says so rather than leaving it to be noticed. */
  const swatches = variants.filter((v) => v.hasOwnMedia || v.price != null);

  /* Variant photos are picked out of the MEDIA LIBRARY, where nothing is filed
     as exterior or interior — only photos uploaded through the listing form
     carry a category. So a colour is opened by default only when its photos
     are categorised; otherwise the page opens on the listing's own gallery,
     which is, and the swatch still switches to the colour on click. */
  const categorised = (list = []) =>
    list.some((p) => p?.category === "exterior" || p?.category === "interior");

  const [variantId, setVariantId] = useState(
    () => swatches.find((v) => categorised(v.media))?.id ?? null
  );
  const [view, setView] = useState("exterior");
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeVariant = swatches.find((v) => v.id === variantId) ?? null;

  /**
   * What THIS colour costs.
   *
   * listing.price has already had any running offer applied on the server, and
   * listing.compareAt is the pre-offer figure. A colour with its own price
   * (schema.sql §31) starts from a different base, so both have to be worked
   * out again for it — and the offer still applies, because a car on 10% off is
   * 10% off in pearl white too.
   *
   * `?? null` on the variant price rather than a truthiness test: a colour
   * priced at 0 is nonsense the schema forbids, but `0 || x` would silently
   * fall through to the car's price and hide it rather than showing it.
   */
  const pricing = (() => {
    const base = activeVariant?.price ?? null;
    if (base == null) {
      return { price: listing.price, compareAt: listing.compareAt, own: false };
    }

    const discounted = priceWithOffer(base, listing.offer);
    if (discounted == null) {
      // No offer, or one that does not actually lower this colour's price.
      return { price: base, compareAt: activeVariant.compareAt ?? null, own: true };
    }

    // With an offer running the struck-through figure is the higher of the
    // colour's own "was" and its pre-offer price — the same rule normalizeListing
    // applies to the car, so the two cannot disagree.
    return {
      price: discounted,
      compareAt: Math.max(base, activeVariant.compareAt ?? 0) || null,
      own: true,
    };
  })();

  /* An empty array is truthy, so `a || b` never falls through — a variant
     carrying an empty media list would blank the gallery instead of dropping
     back to the listing's own photos. Pick the first source with entries. */
  const source =
    [activeVariant?.media, listing.media].find((l) => Array.isArray(l) && l.length > 0) || [];

  const TABS = [
    { key: "exterior", icon: Car, label: t("خارجي", "Exterior") },
    { key: "interior", icon: Sofa, label: t("داخلي", "Interior") },
  ];
  const tabs = TABS.filter((tab) => source.some((p) => p?.category === tab.key));
  /* No categories in the active set means no tabs — and then the whole set IS
     the gallery. Filtering by a category nothing carries is what blanked the
     frame the moment a colour was selected. */
  /**
   * The tab actually on screen, which is not always the one last clicked.
   *
   * `view` is the REQUEST. `tabs` only lists categories this colour actually
   * has photos in, so a buyer sitting on Interior who picks a colour shot only
   * from outside has asked for a tab that no longer exists. That used to be
   * repaired by an effect — render an empty frame, notice, setView, render
   * again — so the gallery blinked empty on the way. Derived here instead, it
   * is simply never empty, and `view` stays whatever they last chose so the
   * tab comes back on its own when a colour that has it is selected again.
   */
  const activeTab = tabs.some((tb) => tb.key === view) ? view : (tabs[0]?.key ?? view);
  const photos = tabs.length ? source.filter((p) => p?.category === activeTab) : source;
  const current = photos[index] ?? null;

  // Reset the frame whenever the set of photos underneath it changes. During
  // render rather than in an effect, so the frame never paints the previous
  // colour's photo for a beat before jumping. See hooks/use-on-change.
  useOnChange(`${activeTab} ${variantId}`, () => setIndex(0));

  // ← / → move through the gallery; Esc leaves fullscreen.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && full) return setFull(false);
      if (photos.length <= 1) return;
      if (e.key === "ArrowLeft") setIndex((i) => (i > 0 ? i - 1 : photos.length - 1));
      else if (e.key === "ArrowRight") setIndex((i) => (i < photos.length - 1 ? i + 1 : 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, full]);

  const step = (d) => photos.length && setIndex((i) => (i + d + photos.length) % photos.length);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    // Native sheet on mobile, clipboard everywhere else. Both can be refused,
    // and a refusal is a choice, not a failure — nothing to report.
    try {
      if (navigator.share) await navigator.share({ title: listing.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* dismissed */ }
  };

  const scrollThumbs = (delta) =>
    document.getElementById("mk-thumbs")?.scrollBy({ left: delta, behavior: "smooth" });

  return (
    <div className="grid grid-cols-1 gap-3 lg:gap-4 xl:grid-cols-10 xl:items-stretch">
      {/* ══ Gallery ═══════════════════════════════════════════════════════ */}
      <div className="flex min-w-0 flex-col gap-3 xl:col-span-7">
        {/* ── Exterior / Interior ────────────────────────────────────────
            One segmented control, centred over the frame. Only when the
            listing holds both — one tab is not a choice. */}
        {tabs.length > 1 ? (
          <div className="flex justify-center">
            <div className="raised-card flex gap-0.5 overflow-hidden rounded-full p-0.5 sm:gap-1 sm:p-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setView(tab.key)}
                    className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-medium transition-colors sm:gap-1.5 sm:px-4 sm:py-1.5 ${
                      activeTab === tab.key
                        ? "bg-brand-primary text-white"
                        : "text-gray-700 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="text-[10px] sm:text-sm">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Frame ──────────────────────────────────────────────────────── */}
        <div className="raised-card relative aspect-16/10 w-full overflow-hidden rounded-2xl">
          {current ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              /* Transformed, not the raw upload: these are 200-270KB camera
                 JPEGs and the frame is at most 1600px wide, so the originals
                 cost several megabytes across a 25-photo gallery for pixels no
                 screen can show. */
              src={thumbUrl(current.url, THUMB.hero)}
              alt={current.alt || listing.title}
              className="absolute inset-0 h-full w-full object-contain"
              loading="eager"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 dark:text-gray-600">
              <ImageOff className="h-10 w-10" />
              <p className="mt-2 text-sm">{t("لا توجد صورة", "No image")}</p>
            </div>
          )}

          {photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                className="absolute left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-xs transition-all hover:bg-black/70 md:left-4 md:h-12 md:w-12"
                aria-label={t("الصورة السابقة", "Previous image")}
              >
                <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-xs transition-all hover:bg-black/70 md:right-4 md:h-12 md:w-12"
                aria-label={t("الصورة التالية", "Next image")}
              >
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
              </button>
            </>
          ) : null}

          {photos.length > 0 ? (
            <>
              <div className="absolute bottom-4 right-4 rounded-full bg-black/70 px-3 py-1.5 text-sm font-medium tabular-nums text-white backdrop-blur-xs">
                {index + 1}/{photos.length}
              </div>
              <div className="absolute bottom-4 left-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setFull(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-xs transition-all hover:bg-black/90"
                  aria-label={t("تكبير", "Fullscreen")}
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              </div>
            </>
          ) : null}
        </div>

        {/* ── Thumbnails ─────────────────────────────────────────────────── */}
        {photos.length > 0 ? (
          <div className="relative w-full">
            {photos.length > 6 ? (
              <button
                type="button"
                onClick={() => scrollThumbs(-160)}
                className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 text-brand-primary transition-colors hover:text-brand-primary/70 md:block"
                aria-label={t("السابق", "Scroll back")}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}

            <div
              id="mk-thumbs"
              className="scrollbar-hide flex justify-start gap-2 overflow-x-auto p-2 md:justify-center md:gap-3 md:px-0"
            >
              {photos.map((p, i) => (
                <button
                  key={p.url + i}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-300 md:h-16 md:w-20 ${
                    i === index
                      ? "scale-105 border-brand-primary shadow-lg ring-2 ring-brand-primary/30"
                      : "border-gray-200 opacity-80 hover:scale-102 hover:border-gray-300 hover:opacity-100 dark:border-white/10"
                  }`}
                  aria-label={`${t("صورة", "Photo")} ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* 160x128 — twice the 80x64 the strip renders at, so it is
                      sharp on a 2x screen and nothing larger is fetched. */}
                  <img
                    src={thumbUrl(p.url, THUMB.gallery)}
                    alt=""
                    width={160}
                    height={128}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>

            {photos.length > 6 ? (
              <button
                type="button"
                onClick={() => scrollThumbs(160)}
                className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 text-brand-primary transition-colors hover:text-brand-primary/70 md:block"
                aria-label={t("التالي", "Scroll forward")}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ══ Buy panel ═════════════════════════════════════════════════════ */}
      <div className="flex flex-col xl:col-span-3">
        <div className="raised-card relative overflow-visible rounded-2xl p-4 lg:p-5">
          {/* ── Name + brand mark ──────────────────────────────────────── */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold leading-tight text-gray-900 sm:text-base lg:text-lg xl:text-xl dark:text-gray-100">
                {listing.title}
              </h1>
            </div>
            {listing.brand?.logo ? (
              <div className="shrink-0 ltr:ml-2 rtl:mr-2 sm:ltr:ml-3 sm:rtl:mr-3 lg:ltr:ml-4 lg:rtl:mr-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={listing.brand.logo}
                  alt={listing.brand.name}
                  width={50}
                  height={40}
                  className="h-10 w-auto object-contain"
                />
              </div>
            ) : null}
          </div>

          {/* ── Save / share ───────────────────────────────────────────────
              The main site's third button downloads a spec PDF, which the
              marketplace has no generator for. A button that does nothing is
              worse than a missing one, so there are two. */}
          <div className="mb-4 mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSaved((s) => !s)}
              aria-pressed={saved}
              className={`rounded-2xl border p-2.5 transition-colors ${
                saved
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                  : "border-gray-200 text-gray-600 hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-400"
              }`}
              aria-label={t("حفظ", "Save")}
            >
              <Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              onClick={share}
              className="rounded-2xl border border-gray-200 p-2.5 text-gray-600 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-400"
              aria-label={t("مشاركة", "Share")}
            >
              <Share2 className="h-4 w-4" />
            </button>
            {copied ? (
              <span className="self-center text-xs text-brand-primary">
                {t("تم نسخ الرابط", "Link copied")}
              </span>
            ) : null}
          </div>

          {/* ── Colours ────────────────────────────────────────────────── */}
          {swatches.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t("الألوان", "Colors")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {/* Back to the listing's own photos.
                    The main site has no such control because there every
                    colour owns the full gallery, so there is nothing to go
                    back TO. Here the listing carries 25 categorised photos and
                    a colour carries the two shot in that colour, which makes
                    "all of them" a real place — and a swatch you can select
                    but never deselect is a dead end. */}
                <button
                  type="button"
                  onClick={() => setVariantId(null)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                    variantId === null
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-2 ring-brand-primary ring-offset-1"
                      : "border-gray-200 text-gray-500 hover:border-brand-primary hover:text-brand-primary dark:border-white/20"
                  }`}
                  title={t("كل الصور", "All photos")}
                  aria-label={t("كل الصور", "All photos")}
                  aria-pressed={variantId === null}
                >
                  <Images className="h-3.5 w-3.5" />
                </button>

                {swatches.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className={`h-7 w-7 rounded-full border-2 ${
                      variantId === v.id
                        ? "ring-2 ring-brand-primary ring-offset-1"
                        : "border-gray-200 dark:border-white/20"
                    }`}
                    style={{ backgroundColor: v.hex || "#cccccc" }}
                    title={v.name}
                    aria-label={v.name}
                    aria-pressed={variantId === v.id}
                  />
                ))}
              </div>

              {/* The photos did NOT change, and a buyer who just tapped a
                  swatch is watching for exactly that. Said out loud only when
                  the selected colour has none of its own — otherwise the
                  gallery already answered it. */}
              {activeVariant && !activeVariant.hasOwnMedia ? (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    "لا توجد صور بهذا اللون — المعروض صور السيارة العامة",
                    "No photos in this colour — showing the car's general photos"
                  )}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ── Variants ───────────────────────────────────────────────────
              The same car at a different spec — GL beside GLX — as 80px cards
              carrying a photo, the trim name and its price. Each is a separate
              listing, so each is a link; the one you are on is outlined in
              brand purple instead.

              Renders only when a sibling trim exists. A "Variants" heading
              over a single card is a choice with nothing to choose, which is
              why this strip is invisible while the Fronx GL is the only trim
              listed. Add the GLX and it appears on both pages at once. */}
          {trims?.others?.length ? (
            <div className="mb-4">
              <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                {t("الفئات", "Variants")}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[{ ...trims.current, here: true }, ...trims.others].map((v) => {
                  const inner = (
                    <>
                      {v.image ? (
                        <div className="mb-1 h-10 w-full overflow-hidden rounded-xl bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbUrl(v.image, THUMB.gallery)}
                            alt=""
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                      <span
                        className={`truncate text-center text-[10px] ${
                          v.here ? "font-semibold text-brand-primary" : "text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        {v.name}
                      </span>
                      <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px] font-semibold tabular-nums text-brand-primary">
                        {money(v.price)}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icons/Currency.svg" alt="SAR" width={7} height={8} className="inline-block" />
                      </span>
                    </>
                  );

                  return v.here ? (
                    <div
                      key={v.id}
                      className="flex w-[80px] shrink-0 flex-col rounded-2xl border-2 border-brand-primary bg-brand-primary/5 p-1.5"
                    >
                      {inner}
                    </div>
                  ) : (
                    <Link
                      key={v.id}
                      href={`/${locale}${v.path}`}
                      className="flex w-[80px] shrink-0 flex-col rounded-2xl border border-gray-200 p-1.5 transition-colors hover:border-brand-primary dark:border-white/10"
                    >
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── Price + actions ────────────────────────────────────────── */}
          <div className="raised-card rounded-2xl">
            <div className="p-3">
              <div className="mb-3">
                <div className="mb-1 flex items-center gap-1 text-3xl font-bold text-brand-primary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/Currency.svg" alt="SAR" width={18} height={20} className="inline-block" />
                  <span className="tabular-nums">{money(pricing.price)}</span>
                  {pricing.compareAt && pricing.compareAt > pricing.price ? (
                    <span className="text-sm font-normal tabular-nums text-gray-400 line-through">
                      {money(pricing.compareAt)}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {listing.vatIncluded
                    ? t("شامل الضريبة واللوحات", "Including tax and plates")
                    : t("غير شامل الضريبة", "Excluding VAT")}
                </p>

                {/* Says WHY the number moved. A price that changes when you tap
                    a swatch, with nothing explaining it, reads as a glitch —
                    and a buyer who thinks the price is unstable stops trusting
                    the one they end up being quoted. */}
                {pricing.own ? (
                  <p className="mt-1 text-xs font-medium text-brand-primary">
                    {t(`سعر اللون: ${activeVariant.name}`, `Price for ${activeVariant.name}`)}
                  </p>
                ) : null}

                {/* ── The seller's offer ────────────────────────────────────
                    Shown under the price it produced, with what it saves and
                    when it ends.

                    The end is a DATE, not a ticking countdown. The main site's
                    flash-sale timer is a client clock, and a client clock is
                    exactly what `?mockNow=` hijacks there to display prices
                    that are not real. A date rendered on the server cannot be
                    argued with from a query string. */}
                {listing.offer ? (
                  <div className="mt-2 rounded-xl bg-brand-primary/5 px-3 py-2 dark:bg-brand-primary/10">
                    <p className="text-xs font-semibold text-brand-primary">
                      {listing.offer.label ?? t("عرض خاص", "Special offer")}
                      {" · "}
                      {t("توفير", "save")} {listing.offer.savingLabel}
                    </p>
                    {listing.offer.endsAt ? (
                      <p className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                        {t("ينتهي", "Ends")}{" "}
                        {new Date(listing.offer.endsAt).toLocaleDateString(
                          isAr ? "ar-SA" : "en-GB",
                          { day: "numeric", month: "long", year: "numeric" }
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* ── Seller ─────────────────────────────────────────────── */}
              {listing.vendor ? (
                <div className="mb-3 border-t border-gray-100 pt-3 dark:border-white/10">
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t("البائع", "Sold by")}</p>
                  <Link
                    href={`/${locale}${listing.vendor.path}`}
                    className="mt-1 flex items-center gap-1.5 font-semibold text-brand-primary hover:underline"
                  >
                    {listing.vendor.name}
                    {listing.vendor.verified ? <ShieldCheck className="h-4 w-4" /> : null}
                  </Link>
                  {listing.vendor.ratingCount > 0 ? (
                    <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      ★ {listing.vendor.rating.toFixed(1)} · {listing.vendor.ratingCount}{" "}
                      {t("تقييم", "reviews")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* The contact button and everything behind it. Lifted out
                  because this component is already the gallery AND the buy
                  panel, and a dialog with its own form state does not belong in
                  the same file as the colour swatches. */}
              <LeadPanel
                listingId={listing.id}
                locale={locale}
                signedIn={viewer.signedIn}
                isOwn={viewer.ownsListing}
                buyerPhone={viewer.phone}
                alreadySentAt={viewer.alreadySentAt}
                vendorName={listing.vendor?.name ?? ""}
                fields={leadFields}
                styleKey={leadStyle}
                theme={leadTheme}
                tabs={leadTabs}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ══ Fullscreen ════════════════════════════════════════════════════ */}
      {full && current ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          <button
            type="button"
            onClick={() => setFull(false)}
            className="absolute right-4 top-4 z-60 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-xs transition-all hover:bg-white/30"
            aria-label={t("إغلاق", "Close")}
          >
            <X className="h-6 w-6" />
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl(current.url, THUMB.hero)}
            alt={current.alt || listing.title}
            className="max-h-full max-w-full object-contain"
          />

          {photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                className="absolute left-4 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-xs transition-all hover:bg-white/30"
                aria-label={t("الصورة السابقة", "Previous image")}
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="absolute right-4 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-xs transition-all hover:bg-white/30"
                aria-label={t("الصورة التالية", "Next image")}
              >
                <ChevronRight className="h-8 w-8" />
              </button>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/20 px-4 py-2 text-lg font-medium tabular-nums text-white backdrop-blur-xs">
                {index + 1} / {photos.length}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
