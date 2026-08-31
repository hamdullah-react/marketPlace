"use client";

/**
 * Seating capacity. Two across, like the main site's SeatsFilter.
 *
 * No count chip on these: the main site leaves it off here, and "5 Seats 12"
 * next to "7 Seats 3" reads as a number of seats twice.
 */

import { Users } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";

export default function SeatsFilter({
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
      icon={Users}
      title={isAr ? "المقاعد" : "Seats"}
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
            icon={Users}
            label={`${o.value} ${isAr ? "مقاعد" : "Seats"}`}
            onClick={() => onToggleValue(String(o.value))}
          />
        ))}
      </div>
    </FilterSection>
  );
}
