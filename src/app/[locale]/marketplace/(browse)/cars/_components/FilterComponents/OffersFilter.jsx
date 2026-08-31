"use client";

/**
 * The offers currently running, by name.
 *
 * A marketplace equivalent of the main site's OffersFilter: "Ramadan Deal",
 * "End of Year" — a buyer who saw a campaign wants the cars in it, not every
 * discounted car. The generic "has any offer" switch lives in
 * SpecialFeaturesFilter, which is a different question.
 *
 * Unnamed offers are deliberately absent. An offer with no label is an ordinary
 * state (see listing_offers.label), and a row reading "—" is not a campaign
 * anybody can have seen.
 */

import { Tag } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";

export default function OffersFilter({
  options = [],
  selected = [],
  onToggleValue,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  if (!options.length) return null;

  const nameOf = (o) =>
    (isAr ? o.label?.ar || o.label?.en : o.label?.en || o.label?.ar) || o.value;

  return (
    <FilterSection
      icon={Tag}
      title={isAr ? "العروض" : "Offers"}
      selectedCount={selected.length}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="grid grid-cols-1 gap-2">
        {options.map((o) => (
          <FilterPill
            key={o.value}
            checked={selected.includes(o.value)}
            icon={Tag}
            label={nameOf(o)}
            count={o.count}
            onClick={() => onToggleValue(o.value)}
          />
        ))}
      </div>
    </FilterSection>
  );
}
