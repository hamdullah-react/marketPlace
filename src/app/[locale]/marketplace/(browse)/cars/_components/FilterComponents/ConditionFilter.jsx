"use client";

/**
 * New or used. Two answers, so two across — the main site's `grid-cols-2`,
 * which it uses wherever the labels are short enough to sit side by side.
 *
 * Multi-select: a buyer open to either wants both ticked, not a radio that
 * makes them choose one and re-run the search to see the other.
 */

import { BadgeCheck } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";
import { valueLabel } from "./constants";

export default function ConditionFilter({
  options = [],
  selected = [],
  onToggleValue,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  if (!options.length) return null;

  return (
    <FilterSection
      icon={BadgeCheck}
      title={isAr ? "الحالة" : "Condition"}
      selectedCount={selected.length}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <FilterPill
            key={o.value}
            checked={selected.includes(String(o.value))}
            icon={BadgeCheck}
            label={valueLabel(o.value, locale)}
            count={o.count}
            onClick={() => onToggleValue(String(o.value))}
          />
        ))}
      </div>
    </FilterSection>
  );
}
