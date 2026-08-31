"use client";

/**
 * Mileage: one handle, an upper bound.
 *
 * Nobody shops for a car with a MINIMUM mileage, so this is a single handle
 * rather than a range — "up to 80,000 km" is the whole question.
 */

import { Gauge } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import FilterSection from "./FilterSection";

export default function MileageFilter({
  max = 300000,
  value = "",
  onCommit,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  const ceiling = max || 300000;
  const current = Number(value || ceiling);

  return (
    <FilterSection
      icon={Gauge}
      title={isAr ? "الممشى" : "Mileage"}
      selectedCount={value ? 1 : 0}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="space-y-3 px-1">
        {/* onValueCommit, not onValueChange — see PriceFilter. */}
        <Slider
          min={0}
          max={ceiling}
          step={5000}
          defaultValue={[current]}
          onValueCommit={([v]) => onCommit(v)}
          className="[&>span:first-child>span]:bg-brand-primary [&_[role=slider]]:border-brand-primary"
        />
        <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {isAr ? "حتى" : "Up to"} {current.toLocaleString(isAr ? "ar-SA" : "en")}{" "}
          {isAr ? "كم" : "km"}
        </p>
      </div>
    </FilterSection>
  );
}
