"use client";

/**
 * Where the car is. One at a time.
 *
 * Single-select, unlike condition and fuel: a buyer drives to ONE showroom,
 * and "Riyadh or Jeddah" is not a journey anybody makes. Tapping the chosen
 * city again clears it — a pill has no empty option of its own the way a radio
 * group's Clear link does, so the pill has to be its own off switch.
 */

import { MapPin } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";

export default function CityFilter({
  options = [],
  selected = "",
  onSelect,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  if (!options.length) return null;

  return (
    <FilterSection
      icon={MapPin}
      title={isAr ? "المدينة" : "City"}
      selectedCount={selected ? 1 : 0}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="grid grid-cols-1 gap-2">
        {options.map((c) => (
          <FilterPill
            key={c.value}
            checked={selected === c.value}
            icon={MapPin}
            label={c.value}
            count={c.count}
            onClick={() => onSelect(selected === c.value ? null : c.value)}
          />
        ))}
      </div>
    </FilterSection>
  );
}
