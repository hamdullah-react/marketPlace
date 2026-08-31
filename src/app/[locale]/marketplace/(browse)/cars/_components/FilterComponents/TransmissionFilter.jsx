"use client";

/**
 * Automatic or manual, one per row.
 *
 * `grid-cols-1`, matching the main site, which gives fuel and transmission a
 * full-width row each — their labels are the long ones, and two of them side
 * by side truncate in a 320px rail.
 */

import { Settings } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";
import { valueLabel } from "./constants";

export default function TransmissionFilter({
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
      icon={Settings}
      title={isAr ? "ناقل الحركة" : "Transmission"}
      selectedCount={selected.length}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="grid grid-cols-1 gap-2">
        {options.map((o) => (
          <FilterPill
            key={o.value}
            checked={selected.includes(String(o.value))}
            icon={Settings}
            label={valueLabel(o.value, locale)}
            count={o.count}
            onClick={() => onToggleValue(String(o.value))}
          />
        ))}
      </div>
    </FilterSection>
  );
}
