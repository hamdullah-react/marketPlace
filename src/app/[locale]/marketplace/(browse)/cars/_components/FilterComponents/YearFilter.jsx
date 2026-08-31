"use client";

/**
 * Model year — the years actually listed, two across, like the main site's
 * YearsFilter.
 *
 * A list, not a from/to pair. This was two number boxes, which asked a buyer
 * to express "2024 or 2026" as a span that also drags in 2025 — and to type
 * digits to say something they can point at. Model years are a short,
 * enumerable set; the only reason the boxes existed is that the facet used to
 * carry the min and max instead of the values.
 *
 * Multi-select, because "2025 or 2026" is an ordinary thing to want and a
 * radio would make you run the search twice to see both.
 */

import { Calendar } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";

export default function YearFilter({
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
      icon={Calendar}
      title={isAr ? "السنة" : "Year"}
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
            icon={Calendar}
            label={String(o.value)}
            count={o.count}
            onClick={() => onToggleValue(String(o.value))}
          />
        ))}
      </div>
    </FilterSection>
  );
}
