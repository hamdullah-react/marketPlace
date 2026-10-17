"use client";

/**
 * Which showroom is selling. One at a time, like city.
 *
 * This filter has no equivalent on the main site, which sells its own stock —
 * on a marketplace the seller is half of what is being compared, so it earns a
 * section of its own rather than a line in a generic facet list.
 */

import { Store } from "lucide-react";
import { localized } from "@/marketplace/lib/listing";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";

export default function VendorFilter({
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
      icon={Store}
      title={isAr ? "المعرض" : "Showroom"}
      selectedCount={selected ? 1 : 0}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="grid grid-cols-1 gap-2">
        {options.map((v) => (
          <FilterPill
            key={v.id}
            checked={selected === v.id}
            icon={Store}
            /* `vendors.name` is {ar, en} jsonb. This read name_ar / name_en —
               the columns the schema replaced — so every label resolved to
               undefined and the rail showed a row of empty pills with a count
               beside them. localized() is the same helper the card and the
               storefront header use, and it falls back to the other language
               rather than rendering blank. */
            label={localized(v.name, locale) || v.slug || ""}
            count={v.count}
            onClick={() => onSelect(selected === v.id ? null : v.id)}
          />
        ))}
      </div>
    </FilterSection>
  );
}
