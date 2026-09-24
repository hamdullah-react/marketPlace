"use client";

/**
 * The promotions on a card, as marks rather than sentences.
 *
 * ── Why icons ───────────────────────────────────────────────────────────────
 *
 * A card can carry four of these at once — Featured, a named offer, a saving,
 * and new/used — and as words they took the whole top of the tile, wrapped onto
 * a second line on a phone, and pushed the car's name down. Every one of them
 * is a category with a fixed meaning, which is exactly what an icon is for.
 *
 * ── Why a dropdown and not a tooltip ────────────────────────────────────────
 *
 * The words did not go anywhere; they moved behind a tap. A tooltip is a
 * hover, and half the traffic here is a phone with no hover at all — the
 * promotions would be unreadable on the devices that see the most cards. The
 * dropdown opens on tap AND on click, says what each mark means, and names the
 * promotion in full.
 *
 * Each icon keeps its own accessible name as well, so the meaning does not
 * depend on opening anything.
 *
 * ── It never navigates ──────────────────────────────────────────────────────
 *
 * The badge row sits inside a card that is a link. Every handler stops the
 * event, or opening the promotions would open the car.
 */

import { forwardRef } from "react";
import { Star, Tag, Percent, Sparkles, CircleDot } from "lucide-react";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { badgeClass } from "@/marketplace/lib/badge";

/**
 * A badge slot's colours, as an inline style.
 *
 * Variables rather than classes because the values come from Admin → Settings
 * → Appearance and can be any hex — Tailwind can only generate classes it can
 * see in the source. `color` covers the icon too: the marks are lucide glyphs
 * drawn in currentColor.
 */
const slotStyle = (slot) => ({
  background: `var(--badge-${slot}-bg)`,
  color: `var(--badge-${slot}-fg)`,
});

/**
 * One mark. `icon` is either a lucide component or a URL the catalog holds.
 *
 * The chip is a fixed square so a row of four is a row of four equal marks —
 * an uploaded icon with a wide aspect ratio would otherwise make its own badge
 * twice the width of its neighbours.
 */
const Mark = forwardRef(function Mark({ entry, size = "card", ...rest }, ref) {
  const Icon = entry.lucide;
  const box = size === "card" ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5";
  const glyph = size === "card" ? "h-2.5 w-2.5 sm:h-3 sm:w-3" : "h-3 w-3";

  return (
    <span
      ref={ref}
      {...rest}
      style={entry.style}
      className={`flex ${box} shrink-0 items-center justify-center rounded-full shadow-sm ${entry.className ?? ""}`}
      aria-label={entry.text}
      role="img"
    >
      {entry.iconUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={entry.iconUrl} alt="" className={`${glyph} object-contain`} loading="lazy" />
      ) : (
        <Icon className={glyph} aria-hidden="true" />
      )}
    </span>
  );
});

/**
 * What this car is running, in the order a buyer scans them: its rank in a
 * promoted row, then the promotion, then the saving, then what it is.
 */
export function promoEntries({ listing, rank, isEnglish }) {
  const entries = [];
  const a = listing.attributes || {};

  if (listing.isFeatured) {
    entries.push({
      key: "featured",
      lucide: Star,
      style: slotStyle("featured"),
      text: isEnglish ? "Featured" : "مميز",
      hint: isEnglish
        ? "A promoted placement paid for by the seller."
        : "ظهور مدفوع من البائع.",
    });
  }

  if (listing.offer?.label) {
    entries.push({
      key: "offer",
      lucide: Tag,
      iconUrl: listing.offer.icon ?? null,
      /* A named offer keeps ITS OWN colour, chosen on the Catalog row — one
         promotion is one colour wherever it appears. Only an offer with no
         colour set falls back to the Appearance setting. */
      className: listing.offer.color ? badgeClass(listing.offer.color) : null,
      style: listing.offer.color ? undefined : slotStyle("offer"),
      text: listing.offer.percent
        ? `${listing.offer.label} · ${listing.offer.percent}%`
        : listing.offer.label,
      hint: isEnglish ? "Offer running now." : "عرض ساري الآن.",
      /* The part that is worth hovering for: what it saves and when it stops.
         Read from the offer itself, so it is this car's promotion rather than
         a generic description of what a promotion is. */
      detail: [
        listing.offer.savingLabel
          ? isEnglish
            ? `Save ${listing.offer.savingLabel}`
            : `توفير ${listing.offer.savingLabel}`
          : null,
        listing.offer.endsAt
          ? `${isEnglish ? "ends" : "ينتهي"} ${new Date(listing.offer.endsAt).toLocaleDateString(
              isEnglish ? "en-GB" : "ar-SA",
              { day: "numeric", month: "short" }
            )}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  } else if (listing.discountPercent) {
    entries.push({
      key: "discount",
      lucide: Percent,
      style: slotStyle("discount"),
      text: isEnglish ? `Save ${listing.discountPercent}%` : `وفّر ${listing.discountPercent}%`,
      hint: isEnglish ? "Reduced from the usual price." : "مخفّض عن السعر المعتاد.",
    });
  }

  if (a.condition === "new" || a.condition === "used") {
    const isNew = a.condition === "new";
    entries.push({
      key: "condition",
      lucide: isNew ? Sparkles : CircleDot,
      style: slotStyle(isNew ? "isNew" : "used"),
      text: isNew ? (isEnglish ? "New" : "جديد") : isEnglish ? "Used" : "مستعمل",
    });
  }

  return entries;
}

export default function PromoBadges({
  listing,
  locale = "ar",
  rank = null,
  className = "",
}) {
  const isEnglish = locale === "en";
  const entries = promoEntries({ listing, rank, isEnglish });

  if (!entries.length && !rank) return null;

  /* The card is a link, so the event must not reach it. */
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * Pointer-down only stops BUBBLING — deliberately no preventDefault.
   *
   * Radix opens the menu on pointer-down, and it composes its handler with
   * this one in a way that skips its own if ours has called preventDefault.
   * With both calls here the trigger swallowed the gesture and nothing opened;
   * the menu was unreachable while looking perfectly fine.
   */
  const stopBubble = (e) => e.stopPropagation();

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
    <div className={`flex min-w-0 flex-nowrap items-center gap-1 ${className}`}>
      {/* The medal keeps its number: it says WHICH place, and a shape cannot. */}
      {rank ? (
        <span
          aria-label={isEnglish ? `Rank ${rank}` : `المرتبة ${rank}`}
          className={`flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[7px] font-extrabold shadow-sm sm:h-5 sm:min-w-5 sm:text-[9px] ${
            rank === 1
              ? "bg-brand-gold text-[#2a2100]"
              : rank === 2
                ? "bg-[#D9DEE3] text-gray-800"
                : rank === 3
                  ? "bg-[#E3A76F] text-[#3a1f05]"
                  : "bg-brand-primary text-white"
          }`}
        >
          {rank}
        </span>
      ) : null}

      {entries.length ? (
        <DropdownMenu>
          {/* asChild, so the trigger IS the row of marks — a wrapper button
              around them would be a button inside the card's link. */}
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={stop}
              onPointerDown={stopBubble}
              aria-label={isEnglish ? "What this car is running" : "عروض هذه السيارة"}
              className="flex min-w-0 items-center gap-1 rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              {/* One tooltip per MARK, not one for the row: hovering a
                  specific icon should say what that icon is, and the row is up
                  to four different things. The trigger is the mark itself
                  (asChild), because a trigger of its own would be a button
                  inside the dropdown's button. */}
              {entries.map((entry) => (
                <Tooltip key={entry.key}>
                  <TooltipTrigger asChild>
                    <Mark entry={entry} />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-56 text-xs">
                    <p className="font-semibold">{entry.text}</p>
                    {entry.detail ? <p className="opacity-90">{entry.detail}</p> : null}
                    {entry.hint ? <p className="opacity-70">{entry.hint}</p> : null}
                  </TooltipContent>
                </Tooltip>
              ))}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            dir={isEnglish ? "ltr" : "rtl"}
            className="w-60"
            /* The menu is portalled to the end of the document, so a click
               inside it is not inside the card — but the card's link still
               catches the bubbling event on some browsers. */
            onClick={stop}
          >
            <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
              {isEnglish ? "On this car" : "على هذه السيارة"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {entries.map((entry) => (
              <div key={entry.key} className="flex items-start gap-2 px-2 py-1.5">
                <Mark entry={entry} size="menu" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{entry.text}</p>
                  {entry.detail ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">{entry.detail}</p>
                  ) : null}
                  {entry.hint ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">{entry.hint}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
    </TooltipProvider>
  );
}
