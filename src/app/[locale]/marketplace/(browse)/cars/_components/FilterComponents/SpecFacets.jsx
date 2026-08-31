"use client";

/**
 * Every filter that comes out of the SPEC SHEET — transmission, fuel type,
 * seats, body style, drive type, driving modes, engine capacity.
 *
 * ── Why these are not eight hand-written components ─────────────────────────
 *
 * They are eight rows of one table. Which attributes exist, what they are
 * called, what icon they carry, what unit they use and which options a seller
 * may pick are all catalog decisions, and the catalog is edited by people who
 * do not deploy. A hardcoded FuelFilter goes stale the day someone adds a
 * fifth fuel; this does not, because it never names one.
 *
 * That is also what the main site's DynamicFacets is for, and this is grouped
 * by category the same way — the small brand-purple heading above each run of
 * sections.
 *
 * Numeric attributes get a from/to pair rather than a list: nobody wants to
 * pick "1598 cc" off a list of every engine size on the site.
 */

import { SlidersHorizontal } from "lucide-react";
import FilterSection from "./FilterSection";
import FilterPill from "./FilterPill";
import NumberPair from "./NumberPair";

export default function SpecFacets({
  facets = [],
  selected = {},
  ranges = {},
  onToggleValue,
  onCommitRange,
  expanded = {},
  onToggleSection,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  if (!facets.length) return null;

  const nameOf = (row, fallback) =>
    (isAr ? row?.ar || row?.en : row?.en || row?.ar) || fallback;

  /**
   * NO category headings.
   *
   * The main site groups these under a small "TRANSMISSION" style heading
   * because its generic facets are otherwise anonymous. Here every filter is
   * already a titled card with its own icon, so the heading only repeats a
   * word — and where an attribute shares its category's name (transmission
   * lives in a category called Transmission) the rail printed "Transmission"
   * twice, once as a section and again as a heading over the sections that
   * were left after it was lifted out. Dropping them removes the duplicate
   * and shortens the rail, which is the whole point of a rail.
   *
   * The catalog's ordering still holds: getSpecFacets sorted by
   * category_sequence then attribute_sequence, so related attributes stay
   * adjacent without a label announcing it.
   */

  return (
    <>
      {facets.map((facet) => {
            const key = facet.slug;
            const numeric = facet.displayType === "numeric" && facet.range;
            const chosen = selected[key] ?? [];
            const range = ranges[key] ?? {};
            const count = numeric
              ? (range.min || range.max ? 1 : 0)
              : chosen.length;

            return (
              <FilterSection
                key={key}
                icon={SlidersHorizontal}
                iconSrc={facet.iconUrl}
                title={
                  <>
                    {nameOf(facet.name, facet.slug)}
                    {facet.unit ? (
                      <span className="font-normal text-gray-400"> ({facet.unit})</span>
                    ) : null}
                  </>
                }
                selectedCount={count}
                isExpanded={!!expanded[key]}
                onToggle={(v) => onToggleSection(key, v)}
                locale={locale}
              >
                {numeric ? (
                  <NumberPair
                    minValue={range.min ?? ""}
                    maxValue={range.max ?? ""}
                    minPlaceholder={String(facet.range.min)}
                    maxPlaceholder={String(facet.range.max)}
                    onMinCommit={(v) => onCommitRange(key, v, range.max ?? "")}
                    onMaxCommit={(v) => onCommitRange(key, range.min ?? "", v)}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {facet.values.map((v) => (
                      <FilterPill
                        key={v.value}
                        checked={chosen.includes(v.value)}
                        icon={SlidersHorizontal}
                        label={v.value}
                        count={v.count}
                        onClick={() => onToggleValue(key, v.value)}
                      />
                    ))}
                  </div>
                )}
              </FilterSection>
        );
      })}
    </>
  );
}
