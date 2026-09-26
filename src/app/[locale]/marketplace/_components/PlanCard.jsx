"use client";

/**
 * A subscription plan, as a card. The only one in the app.
 *
 * ── Why one component and not three ─────────────────────────────────────────
 *
 * A plan was drawn in three places and each drew it differently: the public
 * pricing page had the full card, the admin's list had a tile with a price and
 * a day count, and the seller's renewal picker had a third thing with neither
 * the description nor the features. So an admin wrote copy, looked at their own
 * screen, and could not see what they had written — the only surface that
 * showed it was the one they were not on.
 *
 * Worse, it made the fallbacks invisible where they mattered most: the admin
 * deciding whether a plan needs its own words is exactly the person who should
 * be looking at what it says without them.
 *
 * ── "use client", deliberately ──────────────────────────────────────────────
 *
 * The pricing page is a server component and the other two callers are client
 * components. A server component cannot be rendered inside a client one, so a
 * shared card has to be the client kind — it then works as an island in the
 * server tree and as an ordinary child in the other two. Nothing here reads a
 * session, a cookie or a database, so the boundary costs nothing.
 *
 * ── The ACTION is a slot ────────────────────────────────────────────────────
 *
 * What a plan card does when you press it is entirely different on each screen:
 * the public page raises a charge, the admin's list edits or deletes, the
 * seller's picker selects. None of that belongs to the card, so it takes
 * `children` and draws them at the bottom, where every card's button lines up
 * whatever the height of the list above it.
 */

import { Check, Sparkles } from "lucide-react";
import { localized, formatPrice } from "@/marketplace/lib/listing";
import { planDescription, planFeatures } from "@/marketplace/lib/planCopy";

export default function PlanCard({
  plan,
  locale = "ar",
  currency = null,

  /** The dense variant: a dashboard list, not a landing page. */
  compact = false,
  /** How many ticks to draw before summarising the rest. */
  maxFeatures = compact ? 4 : 0,

  /** The seller's picker: the whole card becomes the control. */
  selectable = false,
  selected = false,
  onSelect,

  /** Dimmed, for a plan an admin has switched off. */
  muted = false,

  /** The buttons, the picker's tick, the CTA — whatever this screen needs. */
  children,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const name = localized(plan?.name, locale) || t(`${plan?.days} يوم`, `${plan?.days} days`);
  /* Both fall back to copy derived from the plan when nobody has written any,
     and stop having an opinion the moment somebody does — see lib/planCopy.js.
     Reading them HERE is what puts the same words on all three screens. */
  const description = planDescription(plan, locale, { t });
  const features = planFeatures(plan, locale, { t });

  const price = Number(plan?.price);
  const days = Number(plan?.days);
  const free = price === 0;
  const money = (n) => formatPrice(n, locale, currency);

  const shown = maxFeatures > 0 ? features.slice(0, maxFeatures) : features;
  const hidden = features.length - shown.length;

  /* A selectable card is a BUTTON, not a div with a click handler: it has to be
     reachable by keyboard and announce that it is pressed, and role="button" on
     a div would mean re-implementing both by hand. */
  const Tag = selectable ? "button" : "article";

  const ring = selected
    ? "ring-2 ring-brand-primary"
    : plan?.popular
      ? "ring-2 ring-brand-primary"
      : "ring-1 ring-black/5 dark:ring-white/10";

  return (
    <Tag
      {...(selectable
        ? { type: "button", onClick: onSelect, "aria-pressed": selected }
        : {})}
      className={`relative flex h-full w-full flex-col rounded-2xl bg-white text-start shadow-sm transition-shadow hover:shadow-xl dark:bg-[#161616] ${ring} ${
        compact ? "p-4" : "p-6"
      } ${muted ? "opacity-60" : ""}`}
    >
      {plan?.popular ? (
        <p className="absolute -top-3 start-6 inline-flex items-center gap-1 rounded-full bg-brand-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
          <Sparkles className="h-3 w-3" />
          {t("الأكثر اختياراً", "Most popular")}
        </p>
      ) : null}

      <h3 className={`font-bold text-brand-primary ${compact ? "text-sm" : "text-lg"}`}>
        {name}
        {muted ? (
          <span className="ms-2 text-[11px] font-normal text-muted-foreground">
            {t("(غير مفعّلة)", "(inactive)")}
          </span>
        ) : null}
      </h3>

      {description ? (
        <p className={`mt-1 text-muted-foreground ${compact ? "text-[11px]" : "text-sm"}`}>
          {description}
        </p>
      ) : null}

      <p className={`flex flex-wrap items-baseline gap-1.5 ${compact ? "mt-3" : "mt-4"}`}>
        <span
          className={`font-bold tabular-nums text-brand-primary ${compact ? "text-xl" : "text-3xl"}`}
        >
          {free ? t("مجاناً", "Free") : money(price)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t(`/ ${days} يوم`, `/ ${days} days`)}
        </span>
      </p>

      {/* What one day costs. It is how a reader tells a 90-day plan from three
          months of a 30-day one without doing the arithmetic themselves. */}
      {!free && days >= 30 ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
          {t(`${money(price / days)} في اليوم`, `${money(price / days)} a day`)}
        </p>
      ) : null}

      {shown.length ? (
        <ul className={`space-y-2 ${compact ? "mt-3 text-[11px]" : "mt-5 space-y-2.5 text-sm"}`}>
          {shown.map((line, i) => (
            // Index as the key: a feature list is a fixed, ordered set of
            // strings with no identity of its own.
            <li key={i} className="flex items-start gap-2">
              <Check
                className={`mt-0.5 shrink-0 text-brand-primary ${compact ? "h-3 w-3" : "h-4 w-4"}`}
              />
              <span className="text-gray-700 dark:text-gray-300">{line}</span>
            </li>
          ))}

          {hidden > 0 ? (
            <li className="ps-5 text-[11px] text-muted-foreground">
              {t(`و${hidden} أخرى`, `and ${hidden} more`)}
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* mt-auto pins it to the bottom, so cards with different numbers of
          ticks still line their buttons up across a row. */}
      {children ? <div className={compact ? "mt-auto pt-3" : "mt-auto pt-6"}>{children}</div> : null}
    </Tag>
  );
}
