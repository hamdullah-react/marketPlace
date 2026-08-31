"use client";

/**
 * Every catalog attribute that does NOT have a section of its own — the
 * marketplace's answer to the main site's DynamicFacets.
 *
 * Driven entirely by `car_attribute_kinds` and the options under it, which is
 * the same table the listing form writes. So a seller-facing catalog change —
 * a new "Drive" kind, a fifth body type — shows up in this rail on the next
 * request, with its own icon, and nobody edits a component to make it happen.
 * The alternative is a hardcoded list that silently goes stale, which is how a
 * filter ends up offering four fuel types on a site that sells five.
 *
 * One section per kind, drawn with the same shell and pills as the dedicated
 * filters, so a generated section is indistinguishable from a hand-written one.
 */

import { SlidersHorizontal } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";

export default function DynamicFacets({
  facets = [],
  selected = {},
  onToggleValue,
  expanded = {},
  onToggleSection,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  if (!facets.length) return null;

  const nameOf = (row, fallback) =>
    (isAr ? row?.ar || row?.en : row?.en || row?.ar) || fallback;

  return (
    <>
      {facets.map((facet) => {
        const chosen = selected[facet.kind] ?? [];

        return (
          <FilterSection
            key={facet.kind}
            icon={SlidersHorizontal}
            iconSrc={facet.iconUrl}
            title={nameOf(facet.name, facet.kind)}
            selectedCount={chosen.length}
            isExpanded={!!expanded[facet.kind]}
            onToggle={(v) => onToggleSection(facet.kind, v)}
            locale={locale}
          >
            <div className="grid grid-cols-1 gap-2">
              {facet.values.map((v) => (
                <FilterPill
                  key={v.value}
                  checked={chosen.includes(v.value)}
                  icon={SlidersHorizontal}
                  label={nameOf(v.name, v.value)}
                  count={v.count}
                  onClick={() => onToggleValue(facet.kind, v.value)}
                />
              ))}
            </div>
          </FilterSection>
        );
      })}
    </>
  );
}
