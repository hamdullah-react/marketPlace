"use client";

/**
 * THE marketplace listing card. One component, every grid.
 *
 * Lives here rather than under cars/_components because it is used by the cars
 * grid, the home page's featured row and the related strip on a listing page.
 * Those three previously rendered three different cards — the home page had its
 * own inline tile with a different radius, a different shadow and a different
 * price treatment — so the same car looked like a different product depending
 * on which page you found it from.
 *
 * ── Three regions, not five bands ───────────────────────────────────────────
 *
 * This used to be the main site's CarCard: five stacked bands separated by
 * rules — image, name, price, spec icons, actions. It now follows the layout
 * in the reference design instead:
 *
 *   1. HEADER   name and vendor on the lead edge, price and the round
 *               "View details" arrow on the trailing one — so the two things a
 *               buyer scans a grid for sit on the same line
 *   2. STAGE    the car, with the heart and the compare tick floating on the
 *               trailing edge and the city pill on the lead one
 *   3. STRIP    the specs along the foot: value first and large, label small
 *               underneath, hairlines between rather than a rule beneath
 *
 * NOTHING was dropped in the move. Every element the banded version carried is
 * still here — offer badge, condition badge, brand logo, vendor, verified tick,
 * title, year/mileage, cash-price caption, price, strike-through compare-at,
 * up to four specs with their icons, wishlist, compare, city, View details.
 * Three of them changed FORM rather than disappearing, and each is noted where
 * it happens: the price caption folded into the identity line, the spec icons
 * moved inline beside their values, and "View details" became the corner arrow
 * while keeping its words as the accessible name and the tooltip.
 *
 * It remains a self-contained COPY, not an import: it reads a normalized
 * marketplace listing rather than an Odoo car, and MARKETPLACE-STRUCTURE.md 8
 * forbids importing from @/MyComponents.
 *
 * Two things differ from the main site because the underlying data does:
 *
 *   - No monthly payment. The main site quotes finance on its own inventory;
 *     the marketplace does not, so the price is the cash price alone.
 *   - The spec strip is the main site's "benefits" row, but driven by the
 *     CATALOG rather than by per-car benefit records: the specifications a
 *     seller flagged "show on card", with the icons uploaded there.
 */

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Heart, ArrowUpRight, ArrowUpLeft, ArrowLeftRight, Eye } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  subscribe, getSnapshot, getServerSnapshot, toggle as toggleCompare, MAX as MAX_COMPARE,
} from "./compareStore";
import {
  subscribe as subscribeWishlist,
  getSnapshot as getWishlist,
  getServerSnapshot as getServerWishlist,
  toggle as toggleWishlist,
} from "./wishlistStore";
import { toggleSavedListing } from "../(account)/_actions/account";
import {
  nudgeSavedCount, publishSavedCount,
  subscribeSaved, getSavedOverrides, getServerSavedOverrides, markSaved,
} from "./savedStore";
import { subscribeViews, getViews, getServerViews } from "./viewsStore";

/**
 * Where a saved car lives.
 *
 * Signed in → the saved_listings table, so it follows the person to their
 * phone and shows up on /account/saved. Signed out → localStorage, so the
 * heart still does something rather than bouncing a browsing visitor to a
 * login form they did not ask for.
 *
 * The local list is not thrown away on sign-in; migrating it is a separate,
 * deliberate step and not something a card should do as a side effect of being
 * rendered.
 *
 * The signed-out list lives in wishlistStore.js, for the same reason the
 * compare shortlist has its own store: it is shared by every card on the page,
 * so no card may own a copy of it.
 */

/**
 * The card's links — or plain boxes, when the card is inside another control.
 *
 * `compact` means this card is being rendered INSIDE something interactive:
 * the compare picker wraps each one in a <button> so the whole tile is the
 * choice. HTML forbids interactive content inside interactive content, and a
 * <button> (or an <a>) nested in a <button> is both a hydration error and a
 * real accessibility failure — a screen reader announces a control that cannot
 * be reached and a click lands on whichever the browser guessed.
 *
 * Module scope, not defined in the render: a component built during render is a
 * new type every pass, which remounts everything under it.
 */
function CardLink({ compact, href, className, title, children }) {
  if (compact) return <div className={className}>{children}</div>;
  return (
    <Link href={href} prefetch={false} className={className} title={title}>
      {children}
    </Link>
  );
}

/** The icon row holds four. A fifth wraps and breaks the card's fixed height. */
const MAX_FACTS = 4;

export default function ListingCard({
  listing, locale = "ar", priority = false, cardSpecs = [], saved = null,
  /* Drops the heart and the Compare toggle. Used by the compare page, where
     both would be controls for a decision the page has already made. */
  compact = false,
  /* Shows how many people have opened this car — the real counter from
     increment_listing_views. Used by the home page's Most viewed row. */
  showViews = false,
  /* Position in a ranked row (1, 2, 3…) — drawn as a medal-style badge. */
  rank = null,
}) {
  const isEnglish = locale === "en";

  /* The shortlist, read straight from the store so every card on the page
     agrees about what is ticked without any of them owning the list. */
  const compareList = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const inCompare = compareList.some((c) => c.slug === listing.slug);
  const [compareFull, setCompareFull] = useState(false);

  /* "3 is the limit" is a reply to a tap, not a state of the card. It clears
     itself so the button goes back to saying what it does. */
  useEffect(() => {
    if (!compareFull) return undefined;
    const id = setTimeout(() => setCompareFull(false), 2500);
    return () => clearTimeout(id);
  }, [compareFull]);

  // `saved` is null for a signed-out visitor and a boolean for a signed-in one.
  // That distinction is what decides which store the heart writes to.
  const signedIn = saved !== null;

  /* Signed out: read straight from the shared store, exactly as the compare
     tick does. This used to be an effect that filled the heart in on the frame
     after mount — so a grid of cars painted twenty-four empty hearts and then
     corrected them, on every navigation. */
  const wishlist = useSyncExternalStore(
    subscribeWishlist, getWishlist, getServerWishlist
  );

  /* Signed in: the server's answer, overridden by anything this browser has
     changed since. Shared, so the same car in two places on one page — or the
     saved page and a grid in two tabs — cannot disagree. It used to be a local
     useState, which is why removing a car from the saved page left every other
     card still showing a filled heart. See savedStore.js. */
  const savedOverrides = useSyncExternalStore(
    subscribeSaved, getSavedOverrides, getServerSavedOverrides
  );
  const savedHere = savedOverrides.has(listing.id)
    ? savedOverrides.get(listing.id)
    : Boolean(saved);

  /* The view count, live when the page runs LiveViews. Never lower than what
     the server rendered — the store only fills in once it has polled. */
  const liveViews = useSyncExternalStore(subscribeViews, getViews, getServerViews);
  const viewCount = Math.max(Number(listing.views ?? 0), liveViews.get(listing.id) ?? 0);

  const [, startSaving] = useTransition();

  const isFavorite = signedIn ? savedHere : wishlist.includes(listing.id);

  const toggleFavorite = (e) => {
    // The card is a link. Without both of these the click navigates to the car
    // and the save is lost mid-flight.
    e.preventDefault();
    e.stopPropagation();

    if (!signedIn) {
      // The store writes and notifies; every card reading it re-renders,
      // including any other card showing this same car.
      toggleWishlist(listing.id);
      return;
    }

    // Flipped immediately and the request sent behind it. A heart that waits
    // for a round trip feels broken on a slow connection, and the failure mode
    // — it flips back — is both rare and self-explanatory.
    const next = !isFavorite;
    markSaved(listing.id, next);

    /* The header badge moves with the heart rather than after it. This is a
       guess for the length of one round trip; the action returns the real total
       and overwrites it below. See savedStore.js. */
    const step = next ? 1 : -1;
    nudgeSavedCount(step);

    startSaving(async () => {
      const body = new FormData();
      body.set("listingId", listing.id);
      const result = await toggleSavedListing(null, body);

      if (!result?.ok) {
        markSaved(listing.id, !next);
        nudgeSavedCount(-step);
        return;
      }

      markSaved(listing.id, Boolean(result.saved));

      /* The count AFTER the write, which is not always the guess: a double tap
         that raced, or a car already saved in another tab, both end somewhere
         the running tally would not have reached. Null means the count query
         failed after a save that worked — the optimistic number stands, because
         being one out beats snapping to zero. */
      if (Number.isFinite(result.total)) publishSavedCount(result.total);
    });
  };

  const a = listing.attributes || {};
  const href = `/${locale}${listing.path}`;

  /**
   * The four-up spec row — SPECIFICATIONS, resolved on the server.
   *
   * Which four is a catalog decision: the specifications flagged "show on
   * card", picked and localized by getCardSpecs(). Nothing is hardcoded here,
   * so a spec someone flags tomorrow appears with no change to this file.
   *
   * This used to read option KINDS, a second parallel list of fuel /
   * transmission / body type that duplicated specifications the seller was
   * already filling in — two places to define one thing, and two places to
   * disagree. Specifications carry the icon, the unit, the translations and
   * the flag, so they are the only list left.
   *
   * Year and mileage are deliberately NOT in this row. They have no icon in
   * the database and would sit in an icon row with an empty slot where every
   * neighbour has artwork. They go on the meta line under the car name
   * instead, where they read as part of its identity.
   */
  const facts = cardSpecs.slice(0, MAX_FACTS);

  /**
   * New or used, kept as its own badge.
   *
   * The one fact that survived the kinds removal as a first-class field: it is
   * on every car, it is two values and never more, and it changes what the
   * price MEANS. A buyer scanning a grid reads it before anything else, which
   * is why it is a badge rather than one of four rotating spec slots.
   */
  const condition = a.condition === "new"
    ? { label: isEnglish ? "New" : "جديد", isNew: true }
    : a.condition === "used"
      ? { label: isEnglish ? "Used" : "مستعمل", isNew: false }
      : null;

  // Identity line: what the car IS, as opposed to how it is specified.
  const meta = [
    a.year,
    a.mileage_km != null
      ? `${Number(a.mileage_km).toLocaleString(isEnglish ? "en" : "ar-SA")} ${isEnglish ? "km" : "كم"}`
      : null,
  ].filter(Boolean);

  /* The corner arrow points AWAY from the text in both directions — ↗ in
     English, ↖ in Arabic. An arrow that points back into the card reads as
     "return", which is the opposite of what this control does. */
  const Arrow = isEnglish ? ArrowUpRight : ArrowUpLeft;

  return (
    /* ── The card ─────────────────────────────────────────────────────────
       One soft, generously-rounded panel instead of the five ruled bands this
       used to be. The rules are gone but nothing they separated is: the name,
       the vendor, the price, the specs and every control are all still here,
       re-seated into the three regions the reference layout uses — a header
       that pairs the name with the price, a stage for the car, and a stat
       strip along the foot.

       overflow-hidden, so the image is clipped by the radius. The heart and the compare tick moved INSIDE the panel for the
       same reason — the old card was overflow-visible to let them hang off
       the edge, which is what forced the 5px transparent border.
       raised-card, like the hero's filter panel and the nav dropdowns — the
       grid is a tray of panels and they should all be lit the same way. This
       card's own gradient and two-shadow stack were the same idea written out
       by hand, in grey rather than green, before the utility existed.

       The hover lift stays HERE rather than moving into the utility: rising on
       hover is what a card does, and would be wrong on a dropdown.
       ------------------------------------------------------------------ */
    /* ── Ambient hover, the YouTube way ────────────────────────────────────
       On hover the card takes its colour from its own car. No canvas, no
       colour sampling: a blurred, enlarged copy of the same photo does it,
       like YouTube's ambient mode does with the video frame. The browser
       already has the image, so it costs no request, and a car photo on
       another host needs no CORS for it to work.

       Two layers, both opacity-0 at rest:
         glow  OUTSIDE the card, behind it, so the colour spills around the
               edge. It needs this wrapper because the card is overflow-hidden.
         tint  INSIDE the card, over its gradient and under the content, so the
               panel itself is washed in the car's colour.
       ------------------------------------------------------------------ */
    <div className="group/ambient relative h-full w-full">
      {listing.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={listing.image}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none absolute inset-x-4 top-10 bottom-6 h-[calc(100%-4rem)] w-[calc(100%-2rem)] scale-90 object-cover opacity-0 blur-2xl saturate-150 transition-all duration-500 group-hover/ambient:scale-105 group-hover/ambient:opacity-70 motion-reduce:transition-none"
        />
      ) : null}

    <div className="car-card raised-card group relative z-10 flex h-full w-full flex-col overflow-hidden rounded-2xl transition-transform duration-500 hover:-translate-y-1 sm:rounded-[22px] md:rounded-[26px]">

      {listing.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={listing.image}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full scale-150 object-cover opacity-0 blur-3xl saturate-150 transition-opacity duration-500 group-hover:opacity-35 dark:group-hover:opacity-45 motion-reduce:transition-none"
        />
      ) : null}

      {/* ── Badges ───────────────────────────────────────────────────────
          Both kept, both still opposed so a discounted car cannot collide
          them. Floating pills now rather than flags welded to the edge,
          because the edge is a 22px curve and a square flag on it reads as a
          rendering mistake. */}
      {/* ── View details ─────────────────────────────────────────────────
          Pinned to the top corner rather than sitting beside the price. It is
          the card's one navigation affordance, so it belongs where a corner
          control is looked for — and next to the price it competed with the
          number for the same glance.

          The words did not go anywhere: they are the accessible name and the
          tooltip, so a screen reader and a hover both still say "View
          details" while the grid stays quiet.
          ------------------------------------------------------------- */}
      {/* Dropped entirely under `compact` — the whole tile is already one
          control there, and a second way in would be a link inside a button. */}
      {compact ? null : (
      <Link
        href={href}
        prefetch={false}
        title={isEnglish ? "View details" : "عرض التفاصيل"}
        className="raised absolute end-2 top-2.5 z-30 flex h-6 w-6 items-center justify-center rounded-full sm:end-3 sm:top-4 sm:h-7 sm:w-7 md:h-8 md:w-8"
      >
        <Arrow className="h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform duration-300 group-hover:scale-110 md:h-4 md:w-4" />
        <span className="sr-only">{isEnglish ? "View details" : "عرض التفاصيل"}</span>
      </Link>
      )}

      {/* ── Header ───────────────────────────────────────────────────────
          ONE column, top to bottom, at every width: badges, brand and vendor,
          name, year and mileage, price.

          The badges used to float absolutely over a fixed pt-14 gap, and the
          price sat beside the name. Both only held while the card was wide: a
          two-up phone grid wraps "Featured · Save 10% · New" onto a second
          line the fixed gap knew nothing about, so it ran into the vendor
          line, and the name was squeezed to a few characters beside the price
          — on a four-column desktop row too. In the flow, a badge row that
          wraps simply pushes everything under it down.

          pe-9 keeps the badges clear of the corner arrow. */}
      <div className="relative z-20 flex flex-col px-2.5 pt-2.5 sm:px-4 sm:pt-4 md:px-5">
        {rank || listing.isFeatured || listing.offer?.label || listing.discountPercent || condition ? (
          <div className="mb-1.5 flex min-h-6 min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden pe-8 sm:mb-2 sm:min-h-7 sm:gap-1 sm:pe-10">
            {rank ? (
              <span
                aria-label={isEnglish ? `Rank ${rank}` : `المرتبة ${rank}`}
                className={`flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full px-1 text-[7px] font-extrabold shadow-sm sm:h-4 sm:min-w-4 sm:text-[8px] md:h-5 md:min-w-5 md:text-[9px] ${
                  rank === 1
                    ? "bg-brand-gold text-[#2a2100]"
                    : rank === 2
                      ? "bg-[#D9DEE3] text-gray-800"
                      : rank === 3
                        ? "bg-[#E3A76F] text-[#3a1f05]"
                        : "bg-brand-primary text-white"
                }`}
              >
                #{rank}
              </span>
            ) : null}
            {listing.isFeatured ? (
              /* Promoted placement is labelled, always — a featured car must
                 not look like it earned the top of the grid on its own. */
              <span className="rounded-full px-1 text-[7px] font-bold leading-[14px] whitespace-nowrap shadow-sm sm:px-1.5 sm:text-[8px] sm:leading-4 md:text-[9px] shrink-0 bg-[#06170E] text-brand-gold">
                {isEnglish ? "Featured" : "مميز"}
              </span>
            ) : null}
            {listing.offer?.label ? (
              /* GOLD: the one thing on the card that is a deal rather than a
                 fact about the car. */
              <span className="rounded-full px-1 text-[7px] font-bold leading-[14px] whitespace-nowrap shadow-sm sm:px-1.5 sm:text-[8px] sm:leading-4 md:text-[9px] min-w-0 truncate bg-brand-gold text-[#2a2100]">
                {listing.offer.label}
                {listing.offer.percent ? ` · ${listing.offer.percent}%` : ""}
              </span>
            ) : listing.discountPercent ? (
              <span className="rounded-full px-1 text-[7px] font-bold leading-[14px] whitespace-nowrap shadow-sm sm:px-1.5 sm:text-[8px] sm:leading-4 md:text-[9px] shrink-0 bg-brand-gold text-[#2a2100]">
                {isEnglish ? `Save ${listing.discountPercent}%` : `وفّر ${listing.discountPercent}%`}
              </span>
            ) : null}
            {condition ? (
              <span
                className={`rounded-full px-1 text-[7px] font-bold leading-[14px] whitespace-nowrap shadow-sm sm:px-1.5 sm:text-[8px] sm:leading-4 md:text-[9px] shrink-0 ${
                  condition.isNew
                    ? "bg-brand-primary text-white"
                    : "bg-white/90 text-gray-700 dark:bg-white/15 dark:text-gray-200"
                }`}
              >
                {condition.label}
              </span>
            ) : null}
          </div>
        ) : (
          /* No badges: the arrow still needs its row, or the name runs under it. */
          <div className="mb-1.5 h-6 sm:mb-2 sm:h-7" />
        )}

        {/* ── Identity and price, side by side ─────────────────────────────
            The layout the live site shipped with: what the car is on the lead
            edge, what it costs on the trailing one, so "which car, how much"
            is one glance. On a phone the whole card is set a size smaller
            rather than restacked — that is what keeps it the same card in a
            two-up grid. */}
        <div className="flex items-start justify-between gap-1.5 sm:gap-2.5 md:gap-3">
          <div className="min-w-0 flex-1">
            {listing.vendor || listing.brand ? (
              <div className="mb-0.5 flex min-w-0 items-center gap-1 sm:mb-1 sm:gap-2">
                {listing.brand ? (
                  <span className="flex h-3 shrink-0 items-center sm:h-3.5 md:h-4">
                    {listing.brand.logo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={listing.brand.logo}
                        alt={listing.brand.name ?? ""}
                        loading="lazy"
                        className="max-h-3 w-auto max-w-7 object-contain sm:max-h-3.5 sm:max-w-10 md:max-h-4 md:max-w-12"
                      />
                    ) : (
                      <span className="max-w-12 truncate text-[7px] font-bold uppercase tracking-wide text-brand-primary/70 dark:text-brand-on-dark/70 sm:max-w-none sm:text-[9px]">
                        {listing.brand.name}
                      </span>
                    )}
                  </span>
                ) : null}
                {listing.vendor ? (
                  <p className="min-w-0 truncate text-[7px] text-gray-500 dark:text-gray-400 sm:text-[9px] md:text-[10px]">
                    {listing.vendor.name}
                    {listing.vendor.verified ? <span className="text-brand-primary"> ✓</span> : null}
                  </p>
                ) : null}
              </div>
            ) : null}

            <h2
              title={listing.title}
              className="truncate text-[9px] font-bold leading-snug tracking-tight text-neutral-900 transition-colors duration-300 group-hover:text-brand-primary dark:text-neutral-50 dark:group-hover:text-white sm:text-[12px] md:text-[13px]"
            >
              <CardLink compact={compact} href={href}>
                {listing.title}
              </CardLink>
            </h2>

            {/* Year and mileage, with "Cash price" saying which price this is. */}
            <p className="mt-0.5 truncate text-[7px] text-gray-500 dark:text-gray-400 sm:text-[9px] md:text-[10px]">
              {[...meta, isEnglish ? "Cash price" : "سعر الكاش"].join(" · ")}
            </p>
          </div>

          <div className="shrink-0 text-end">
            <div className="whitespace-nowrap text-[10px] font-bold tabular-nums text-neutral-900 dark:text-neutral-50 sm:text-[13px] md:text-sm">
              {listing.priceLabel}
            </div>
            {listing.compareAtLabel ? (
              <div className="whitespace-nowrap text-[7px] text-gray-500 line-through tabular-nums dark:text-gray-400 sm:text-[9px] md:text-[10px]">
                {listing.compareAtLabel}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Stage: the car ───────────────────────────────────────────────
          No ghost lettering behind the photo. It was decoration that competed
          with the spec strip for the eye on a card this dense, and on a small
          tile it read as a rendering artefact rather than as texture.
          ------------------------------------------------------------- */}
      <div className="relative mt-1.5 px-2 pb-1 sm:mt-2 sm:px-3">
        <CardLink
          compact={compact}
          href={href}
          className="relative z-10 block h-[96px] w-full sm:h-[130px] transition-transform duration-500 group-hover:scale-105 md:h-[160px]"
        >
          {listing.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={listing.image}
              alt={listing.imageAlt}
              className="h-full w-full object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.16)]"
              loading={priority ? "eager" : "lazy"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-2xl bg-black/[0.03] text-xs text-gray-400 dark:bg-white/5 dark:text-gray-500">
              {isEnglish ? "No image" : "لا توجد صورة"}
            </div>
          )}
        </CardLink>

        {/* ── Floating controls ─────────────────────────────────────────────
            The heart and the compare tick, stacked on the trailing edge. Both
            were already icon buttons; putting them together makes them read as
            one set of controls for this card rather than two unrelated marks
            at opposite ends of it. */}
        {/* `hidden` was the bug: it took the buttons off screen and left them
            in the DOM, so a compact card inside the compare picker really did
            nest <button> in <button>. Not rendered at all now. */}
        {compact ? null : (
        <div className="absolute end-2 top-0 z-20 flex flex-col gap-1 sm:end-3">
          <button
            onClick={toggleFavorite}
            className="raised flex h-6 w-6 items-center justify-center rounded-full sm:h-8 sm:w-8 md:h-9 md:w-9"
            aria-label={
              isFavorite
                ? isEnglish ? "Remove from wishlist" : "إزالة من المفضلة"
                : isEnglish ? "Add to wishlist" : "أضف للمفضلة"
            }
          >
            <Heart
              className={`h-3 w-3 sm:h-4 sm:w-4 transition-all duration-300 md:h-[18px] md:w-[18px] ${
                isFavorite ? "scale-110 fill-brand-primary text-brand-primary" : "text-brand-primary"
              }`}
            />
          </button>

          {/* ── Compare ──────────────────────────────────────────────────
              A TOGGLE, not a link. Comparing is something you do to two or
              three cars, and the second one is usually further down the
              grid — so the card records a choice and CompareBar carries it
              until there is enough to compare. A link here would send the
              visitor to a one-car comparison and make them come back.

              stopPropagation and preventDefault because the whole card is
              inside a hover/press affordance and the button sits above a
              link region; without them a tick also navigates.
              ------------------------------------------------------- */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const result = toggleCompare({
                id: listing.id,
                slug: listing.slug,
                title: listing.title,
                image: listing.image,
                priceLabel: listing.priceLabel,
              });
              if (result === "full") setCompareFull(true);
            }}
            aria-pressed={inCompare}
            aria-label={
              compareFull
                ? isEnglish
                  ? `You can compare ${MAX_COMPARE} cars at a time`
                  : `يمكنك مقارنة ${MAX_COMPARE} سيارات في المرة`
                : isEnglish
                  ? inCompare
                    ? "Remove from comparison"
                    : "Add to comparison"
                  : inCompare
                    ? "إزالة من المقارنة"
                    : "أضف للمقارنة"
            }
            title={
              compareFull
                ? isEnglish
                  ? `You can compare ${MAX_COMPARE} cars at a time`
                  : `يمكنك مقارنة ${MAX_COMPARE} سيارات في المرة`
                : isEnglish
                  ? inCompare
                    ? "Remove from comparison"
                    : "Add to comparison"
                  : inCompare
                    ? "إزالة من المقارنة"
                    : "أضف للمقارنة"
            }
            /* "Full" and "ticked" keep their own faces on purpose: both are
               states the button is REPORTING, and `raised` is the resting look
               every other control wears. A ticked compare that looked like the
               heart beside it would say nothing. */
            className={`relative flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full transition-all duration-300 md:h-9 md:w-9 ${
              compareFull
                ? "bg-red-50 shadow-sm ring-2 ring-red-400 dark:bg-red-950/40"
                : inCompare
                  ? "bg-brand-primary/15 shadow-sm ring-2 ring-brand-primary"
                  : "raised"
            }`}
          >
            {/* currentColor, deliberately. This was a two-tone SVG asset with
                the old brand purple baked into the file, which made it the one
                mark on the card that could not follow the theme — CSS cannot
                recolour an image's pixels. A stroke icon inherits the button's
                colour and costs no request; the asset is deleted. */}
            <ArrowLeftRight
              className={`h-3 w-3 sm:h-4 sm:w-4 shrink-0 text-brand-primary transition-transform duration-300 dark:text-brand-on-dark ${
                inCompare ? "scale-110" : ""
              }`}
            />
            {inCompare ? (
              <span className="absolute -end-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-primary text-[9px] font-bold leading-none text-white">
                ✓
              </span>
            ) : null}
          </button>
        </div>
        )}

        {listing.city ? (
          <div className="absolute bottom-0 start-2 z-20 max-w-[60%] sm:start-3">
            <div className="raised truncate rounded-full px-1.5 py-px text-[7px] font-bold sm:px-2 sm:py-0.5 sm:text-[9px] md:text-[10px]">
              {listing.city}
            </div>
          </div>
        ) : null}

        {showViews ? (
          <div className="absolute bottom-0 end-2 z-20 sm:end-3">
            <div
              className="raised flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tabular-nums md:text-[10px]"
              title={isEnglish ? "People who viewed this car" : "عدد من شاهد هذه السيارة"}
            >
              <Eye className="h-3 w-3 text-brand-primary" aria-hidden="true" />
              {/* Keyed on the value so the pop replays each time it rises. */}
              <span key={viewCount} className="count-pop inline-block">
                {viewCount.toLocaleString(isEnglish ? "en" : "ar-SA")}
              </span>
              <span className="sr-only">{isEnglish ? " views" : " مشاهدة"}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Spec strip ───────────────────────────────────────────────────
          The same four specs, restacked the way the reference reads them:
          the VALUE first and large, the label small underneath. The old order
          put an icon and a caption above the number, so the one thing a buyer
          is comparing across cards was the smallest text in the row.

          Dividers between, not under — a hairline between columns groups them
          as one strip; the heavy rule underneath used to cut the card in two.
          grid-cols-N from the actual count, so three specs fill the width
          instead of leaving a gap where a fourth never arrives.
          ------------------------------------------------------------- */}
      {facts.length > 0 ? (
        /* One row, value over label, hairlines between — the live layout.

           Three columns at most on a phone: a fourth in a two-up card leaves
           each value about 30px, which is how "Gasoline" and "Dual-Clutch
           (DCT)" ended up drawn over each other. The fourth comes back from
           sm. Values that still do not fit are cut with an ellipsis and keep
           the full text as a tooltip. */
        <div
          className={`relative z-20 mt-auto grid px-1.5 pb-2.5 pt-1 sm:px-3 sm:pb-4 sm:pt-1.5 md:px-4 ${
            facts.length === 1
              ? "grid-cols-1"
              : facts.length === 2
                ? "grid-cols-2"
                : facts.length === 3
                  ? "grid-cols-3"
                  : "grid-cols-3 sm:grid-cols-4"
          }`}
        >
          {facts.map((f, i) => (
            <div
              key={f.label}
              title={`${f.label}: ${f.value}`}
              className={`min-w-0 flex-col items-center justify-start px-0.5 text-center sm:px-1 ${
                i === 3 ? "hidden sm:flex" : "flex"
              } ${i > 0 ? "border-s border-black/10 dark:border-white/10" : ""}`}
            >
              <div className="flex w-full min-w-0 items-center justify-center gap-0.5 sm:gap-1">
                {/* No fallback glyph: a spec without artwork shows its value
                    alone rather than a generic icon that looks wrong. */}
                {f.icon ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.icon}
                    alt=""
                    loading="lazy"
                    className="h-2.5 w-2.5 shrink-0 object-contain opacity-70 sm:h-3 sm:w-3 md:h-3.5 md:w-3.5"
                  />
                ) : null}
                <span className="truncate text-[8px] font-bold tabular-nums text-neutral-900 dark:text-neutral-50 sm:text-[10px] md:text-[11px]">
                  {f.value}
                </span>
              </div>
              <span className="mt-px w-full truncate text-[6px] leading-tight text-gray-500 dark:text-gray-400 sm:text-[8px] md:text-[9px]">
                {f.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
    </div>
  );
}
