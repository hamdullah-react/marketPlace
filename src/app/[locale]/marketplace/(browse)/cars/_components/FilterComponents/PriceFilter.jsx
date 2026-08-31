"use client";

/**
 * Price: a two-handled slider over the range the inventory actually spans.
 *
 * The slider carries its own numbers — a readout either side with ± steppers,
 * exactly as the main site's RangeSlider does it. There is deliberately NO
 * second pair of from/to boxes under it: that was the same two values entered
 * twice, and a control that appears twice on one card is a control a person
 * has to work out the relationship between before touching either.
 *
 * Typing an exact figure is still possible — the steppers move in thousands,
 * which is the granularity a car price is actually chosen at.
 *
 * (Year and the numeric spec facets DO use NumberPair, because they have no
 * slider and nothing else to enter a bound with.)
 */

import FilterSection from "./FilterSection";
import RangeSlider from "./RangeSlider";

export default function PriceFilter({
  range = [0, 0],
  minValue = "",
  maxValue = "",
  onCommitRange,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  const lo = Math.floor(range?.[0] ?? 0);
  const hi = Math.ceil(range?.[1] ?? 0);

  // A range of one price is not a range. With every car at the same number
  // there is nothing to drag between, so the section is left out rather than
  // rendered as a dead track.
  if (hi <= lo) return null;

  return (
    <FilterSection
      iconSrc="/icons/Currency.svg"
      title={isAr ? "نطاق السعر" : "Price Range"}
      selectedCount={(minValue ? 1 : 0) + (maxValue ? 1 : 0)}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <RangeSlider
        min={lo}
        max={hi}
        step={1000}
        value={[Number(minValue || lo), Number(maxValue || hi)]}
        onCommit={onCommitRange}
        locale={locale}
      />
    </FilterSection>
  );
}
