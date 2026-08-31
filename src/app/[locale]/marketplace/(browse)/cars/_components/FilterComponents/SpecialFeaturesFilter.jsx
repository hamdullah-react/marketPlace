"use client";

/**
 * "Special Features" — the two switches that are about the LISTING rather than
 * about the car: is it discounted, and has the showroom paid to feature it.
 *
 * Each one appears only when some live car actually has it. A Featured switch
 * on a marketplace with nothing featured is a control whose only possible
 * effect is to empty the grid.
 */

import { Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import FilterSection from "./FilterSection";

export default function SpecialFeaturesFilter({
  features = {},
  hasOffer = false,
  isFeatured = false,
  onHasOfferChange,
  onIsFeaturedChange,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  if (!features.hasOffer && !features.isFeatured) return null;

  const row = (on, onChange, label, count) => (
    <label
      className={`flex cursor-pointer items-center justify-between rounded-[5px] border-2 p-3 transition-all ${
        on
          ? "border-brand-primary bg-brand-primary/5"
          : "border-transparent hover:bg-gray-50 dark:hover:bg-white/5"
      }`}
    >
      <span className="flex items-center gap-3">
        <Checkbox
          checked={on}
          onCheckedChange={onChange}
          className="data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary"
        />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
      </span>
      {count > 0 ? (
        <Badge variant="outline" className="rounded-[5px] text-xs">{count}</Badge>
      ) : null}
    </label>
  );

  return (
    <FilterSection
      icon={Sparkles}
      title={isAr ? "ميزات خاصة" : "Special Features"}
      selectedCount={(hasOffer ? 1 : 0) + (isFeatured ? 1 : 0)}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="space-y-2">
        {features.hasOffer
          ? row(hasOffer, onHasOfferChange, isAr ? "لديه عرض" : "Has Offer", features.hasOfferCount)
          : null}
        {features.isFeatured
          ? row(isFeatured, onIsFeaturedChange, isAr ? "مميز" : "Featured", features.isFeaturedCount)
          : null}
      </div>
    </FilterSection>
  );
}
