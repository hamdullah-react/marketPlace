"use client";

/**
 * Petrol, diesel, hybrid, electric — one per row, like transmission.
 */

import { Fuel } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";
import { valueLabel } from "./constants";

export default function FuelFilter({
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
      icon={Fuel}
      title={isAr ? "الوقود" : "Fuel"}
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
            icon={Fuel}
            label={valueLabel(o.value, locale)}
            count={o.count}
            onClick={() => onToggleValue(String(o.value))}
          />
        ))}
      </div>
    </FilterSection>
  );
}
