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
 * Structurally the SAME card as the main site's MyComponents/Cards/CarCard —
 * same 10px radius, same 5px transparent border that becomes the hover ring,
 * same purple-tinted shadow, and the same five stacked bands:
 *
 *   1. image, with the wishlist heart floating top-end
 *   2. car name + brand logo, divided by a rule
 *   3. price band
 *   4. an icon row of specs
 *   5. actions: a primary button, and "View details"
 *
 * It is a self-contained COPY, not an import: it reads a normalized marketplace
 * listing rather than an Odoo car, and MARKETPLACE-STRUCTURE.md 8 forbids
 * importing from @/MyComponents. Matching the bands by hand is the price of
 * that isolation, and it is worth paying — a buyer moving between the two
 * should not notice they have crossed into a different application.
 *
 * Two bands differ, because the underlying data does:
 *
 *   - No monthly payment. The main site quotes finance on its own inventory;
 *     the marketplace does not, so the price band is the cash price full-width
 *     rather than a split with a divider down the middle.
 *   - The icon row is the main site's "benefits" row, but driven by the CATALOG
 *     rather than by per-car benefit records: the option kinds a seller flagged
 *     "show on card" in Catalog > Kinds, with the icons uploaded there.
 */

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Heart, ChevronLeft, ChevronRight } from "lucide-react";
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
import { nudgeSavedCount, publishSavedCount } from "./savedStore";

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

/** The icon row holds four. A fifth wraps and breaks the card's fixed height. */
const MAX_FACTS = 4;

export default function ListingCard({
  listing, locale = "ar", priority = false, cardSpecs = [], saved = null,
  /* Drops the heart and the Compare toggle. Used by the compare page, where
     both would be controls for a decision the page has already made. */
  compact = false,
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

  /* Signed in: the server's answer, flipped optimistically by the toggle below
     and corrected by what the action returns. */
  const [savedHere, setSavedHere] = useState(Boolean(saved));
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
    setSavedHere(next);

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
        setSavedHere(!next);
        nudgeSavedCount(-step);
        return;
      }

      setSavedHere(Boolean(result.saved));

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

  const Chevron = isEnglish ? ChevronRight : ChevronLeft;

  return (
    <div className="car-card group relative flex h-full w-full flex-col overflow-visible rounded-[10px] border-[5px] border-transparent bg-white shadow-[0_8px_24px_rgba(70,25,79,0.15),0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-500 hover:shadow-[0_20px_40px_rgba(70,25,79,0.25),0_10px_20px_rgba(0,0,0,0.15)] dark:border-[rgb(55,65,81)] dark:bg-[#1e1e1e] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] dark:hover:bg-[#252525]">
      {/* ── Discount badge ─────────────────────────────────────────────────
          One badge, not two. A running offer replaces the generic "Save 10%"
          with the seller's own name for it — "عرض رمضان" says more than a
          percentage, and stacking both would put two pills in one corner.
          The percentage is kept alongside the name, since that is the part a
          buyer scans for. */}
      {listing.offer?.label ? (
        <div className="absolute left-0 top-[10px] z-20 flex items-center gap-1">
          <span className="rounded-e-full bg-brand-primary px-3 py-1 text-[11px] font-bold text-white shadow-sm">
            {listing.offer.label}
            {listing.offer.percent ? ` · ${listing.offer.percent}%` : ""}
          </span>
        </div>
      ) : listing.discountPercent ? (
        <div className="absolute left-0 top-[10px] z-20">
          <span className="rounded-e-full bg-brand-primary px-3 py-1 text-[11px] font-bold text-white shadow-sm">
            {isEnglish ? `Save ${listing.discountPercent}%` : `وفّر ${listing.discountPercent}%`}
          </span>
        </div>
      ) : null}

      {/* ── Condition ──────────────────────────────────────────────────
          Top right, opposite the discount, so the two never collide on a
          discounted car. */}
      {condition ? (
        <div className="absolute right-0 top-[10px] z-20">
          <span
            className={`rounded-s-full px-3 py-1 text-[11px] font-bold shadow-sm ${
              condition.isNew
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 dark:bg-[#333] dark:text-gray-200"
            }`}
          >
            {condition.label}
          </span>
        </div>
      ) : null}

      {/* ── Image ──────────────────────────────────────────────────────── */}
      <div className="relative mx-2 overflow-hidden px-2 pb-3 pt-3 md:pb-4 md:pt-4">
        <Link
          href={href}
          prefetch={false}
          className="relative block h-[130px] w-full transition-transform duration-500 group-hover:scale-105 md:h-[160px]"
        >
          {listing.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={listing.image}
              alt={listing.imageAlt}
              className="h-full w-full object-contain"
              loading={priority ? "eager" : "lazy"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400 dark:bg-[#262626] dark:text-gray-500">
              {isEnglish ? "No image" : "لا توجد صورة"}
            </div>
          )}
        </Link>

        <div className={`absolute right-1 top-4 z-10 ${compact ? "hidden" : ""}`}>
          <button
            onClick={toggleFavorite}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center p-2 transition-all duration-300 hover:scale-110 md:min-h-[48px] md:min-w-[48px] md:p-3"
            aria-label={
              isFavorite
                ? isEnglish ? "Remove from wishlist" : "إزالة من المفضلة"
                : isEnglish ? "Add to wishlist" : "أضف للمفضلة"
            }
          >
            <Heart
              className={`h-5 w-5 transition-all duration-300 md:h-6 md:w-6 ${
                isFavorite ? "scale-110 fill-brand-primary text-brand-primary" : "text-brand-primary hover:scale-110"
              }`}
            />
          </button>
        </div>

        {listing.city ? (
          <div className={`absolute bottom-1 z-10 md:bottom-2 ${isEnglish ? "left-1 md:left-2" : "right-1 md:right-2"}`}>
            <div className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-brand-primary shadow-lg dark:bg-[#2a2a2a] md:px-3 md:py-1.5 md:text-xs">
              {listing.city}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Name + brand logo ──────────────────────────────────────────────
          flex-row-reverse, matching the main site: the logo sits on the
          trailing edge in both directions, and the name takes the rest.
          ------------------------------------------------------------- */}
      <div className="mx-2 flex flex-row-reverse items-center justify-between border-b border-gray-200 px-1 pb-1.5 dark:border-gray-700 md:mx-3 md:px-2 md:pb-2">
        {/*
          The logo when the brand has one, its NAME when it does not.

          Not a fallback in the sense the spec icons refuse — the name is real
          catalog data, not a stand-in mark invented to fill a hole. Dropping
          the brand entirely (what this did before) left the card unable to say
          what make the car even was until someone uploaded artwork, which is a
          worse answer than a word.
        */}
        {listing.brand ? (
          <div className="ms-1 flex h-6 shrink-0 items-center justify-center md:ms-2 md:h-8">
            {listing.brand.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={listing.brand.logo}
                alt={listing.brand.name ?? ""}
                loading="lazy"
                className="max-h-8 w-auto max-w-16 object-contain"
              />
            ) : (
              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-brand-primary/70 dark:text-[#c9a3d4]/70 md:text-xs">
                {listing.brand.name}
              </span>
            )}
          </div>
        ) : null}

        <div className="me-1 flex min-w-0 flex-1 flex-col justify-center md:me-2">
          {listing.vendor ? (
            <p className="mb-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400 md:text-xs">
              {listing.vendor.name}
              {listing.vendor.verified ? <span className="text-brand-primary"> ✓</span> : null}
            </p>
          ) : null}
          <h2 className="line-clamp-2 wrap-break-word text-sm font-bold leading-tight text-brand-primary transition-all duration-300 group-hover:text-[#5a1f70] dark:group-hover:text-white md:text-base">
            <Link href={href} prefetch={false}>
              {listing.title}
            </Link>
          </h2>
          {meta.length ? (
            <p className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400 md:text-xs">
              {meta.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Price ──────────────────────────────────────────────────────────
          Full width, with no divider down the middle. The main site splits this
          band into cash | monthly because it finances its own stock; the
          marketplace quotes no finance, and a half-empty band with a rule down
          the centre would only advertise the gap.
          ------------------------------------------------------------- */}
      <div className="mx-2 flex min-h-[60px] items-center border-b border-gray-200 py-1.5 dark:border-gray-700 md:min-h-[68px] md:py-2">
        <div className="w-full px-2 md:px-3">
          <p className="mb-0.5 text-[10px] text-brand-primary md:mb-1 md:text-xs">
            {isEnglish ? "Cash Price" : "سعر الكاش"}
          </p>
          <div className="flex items-baseline gap-2 font-bold text-brand-primary">
            <span className="text-sm tabular-nums md:text-base">{listing.priceLabel}</span>
            {listing.compareAtLabel ? (
              <span className="text-[10px] text-gray-500 line-through tabular-nums md:text-xs">
                {listing.compareAtLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Facts row ──────────────────────────────────────────────────── */}
      {facts.length > 0 ? (
        <div className="mx-2 grid min-h-[64px] grid-cols-4 gap-0.5 border-b-2 border-gray-300 py-1.5 pt-2 dark:border-gray-700 md:min-h-[76px] md:pt-2.5">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col items-center justify-center px-0.5 text-center">
              {/*
                The kind's icon, straight from car_attribute_kinds.icon_url.

                NO fallback glyph. A generic placeholder on a kind nobody has
                given artwork to looks like a real icon that happens to be
                wrong, and it hides the gap from the only person who can close
                it. The box is reserved rather than conditional, so a row with
                icons and a row without keep the same height.
              */}
              <div className="mb-0.5 flex h-7 w-7 items-center justify-center md:h-8 md:w-8">
                {f.icon ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={f.icon} alt="" loading="lazy" className="h-full w-full object-contain" />
                ) : null}
              </div>
              <span className="text-[8px] leading-tight text-gray-500 dark:text-gray-400 md:text-[10px]">
                {f.label}
              </span>
              <span className="mt-0.5 line-clamp-1 text-[9px] font-semibold text-brand-primary md:text-[11px]">
                {f.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div className="mx-2 mt-auto">
        {/* ── One way in, not two ──────────────────────────────────────────
            There used to be an "Enquire" pill here, linking to #contact so the
            request panel opened on arrival. It is gone: the card is a summary,
            and asking somebody to commit to an enquiry from a photo and a price
            is asking before they have read anything. The listing page carries
            Request a quote and the seller's number, next to the specs the
            answer actually depends on.

            justify-end rather than justify-between now that only View details
            remains — between with one child pins it to the start of the row. */}
        <div
          className={`flex min-h-[44px] items-center px-2 py-1.5 md:min-h-[52px] md:px-3 md:py-2 ${
            compact ? "justify-end" : "justify-between"
          }`}
        >
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
          {compact ? null : (
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
            className={`relative flex items-center justify-center rounded-full p-2 transition-all duration-300 hover:scale-110 ${
              compareFull
                ? "bg-red-50 ring-2 ring-red-400 dark:bg-red-950/40"
                : inCompare
                  ? "bg-brand-primary/15 ring-2 ring-brand-primary"
                  : "bg-brand-light hover:bg-brand-light/80 dark:bg-white/10"
            }`}
          >
            {/* Two FIXED brand colours, not currentColor — so the mark is not
                tinted by the button around it, and the selected state has to
                be carried by the pill behind it and the label beside it
                rather than by recolouring the icon. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/compare.svg"
              alt=""
              width={18}
              height={18}
              className={`h-[18px] w-[18px] shrink-0 object-contain transition-transform duration-300 ${
                inCompare ? "scale-110" : ""
              }`}
            />
            {inCompare ? (
              <span className="absolute -end-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-primary text-[9px] font-bold leading-none text-white">
                ✓
              </span>
            ) : null}
          </button>
          )}

          <Link
            href={href}
            prefetch={false}
            className="flex items-center text-xs text-brand-primary transition-all duration-300 md:text-sm"
          >
            <span
              className={`font-medium transition-all duration-300 ${
                isEnglish ? "group-hover:translate-x-1" : "group-hover:-translate-x-1"
              }`}
            >
              {isEnglish ? "View Details" : "عرض التفاصيل"}
            </span>
            <Chevron
              className={`h-4 w-4 transition-all duration-300 ${
                isEnglish ? "ml-0.5 group-hover:translate-x-1" : "mr-0.5 group-hover:-translate-x-1"
              }`}
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
