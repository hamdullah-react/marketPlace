"use client";

/**
 * Makes and models, nested — the main site's BrandsFilter.
 *
 * A checkbox and a logo per make, and a chevron that opens the models listed
 * under it. Nested rather than two flat lists because a flat list of models is
 * unreadable the moment more than one make is on the site: "Camry, Omega,
 * Corolla, Toano" tells a buyer nothing about which badge is on the bonnet.
 *
 * The list is capped in height and scrolls (`max-h-80`), like the main site's —
 * a rail whose first section is forty rows long buries every section under it.
 */

import { useState } from "react";
import { ChevronDown, Car } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import FilterSection from "./FilterSection";

export default function BrandsFilter({
  options = [],
  selectedBrands = [],
  selectedModels = [],
  onToggleBrand,
  onToggleModel,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  const [openBrands, setOpenBrands] = useState({});

  if (!options.length) return null;

  const nameOf = (row) =>
    (isAr ? row.name?.ar || row.name?.en : row.name?.en || row.name?.ar) || row.slug || "—";

  return (
    <FilterSection
      icon={Car}
      title={isAr ? "الماركات والموديلات" : "Brands & Models"}
      selectedCount={selectedBrands.length + selectedModels.length}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      {/* Negative margin cancels FilterSection's padding so the divider rules
          run the full width of the card, as they do on the main site. */}
      <div className="-mx-4 -mb-4 max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-white/10">
        {options.map((brand) => {
          const brandOpen = !!openBrands[brand.id];
          const brandOn = selectedBrands.includes(brand.id);

          return (
            <div key={brand.id}>
              {/* ── The make ───────────────────────────────────────────── */}
              <div className="flex items-center justify-between p-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/5">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={brandOn}
                    onCheckedChange={() => onToggleBrand(brand.id)}
                    className="h-5 w-5 shrink-0 border-2 data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary"
                  />

                  {/* Fixed 32px slot whatever the logo's aspect ratio, so the
                      rows do not jump about as the images arrive. */}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {brand.logoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={brand.logoUrl}
                        alt=""
                        className="max-h-8 max-w-8 object-contain"
                      />
                    ) : (
                      <span className="text-sm font-bold text-brand-primary">
                        {nameOf(brand).charAt(0)}
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {nameOf(brand)}
                    </span>
                    {brand.count > 0 ? (
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400">
                        {brand.count}
                      </span>
                    ) : null}
                  </span>
                </label>

                {brand.models.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenBrands((o) => ({ ...o, [brand.id]: !o[brand.id] }))}
                    aria-label={
                      brandOpen
                        ? isAr ? "إخفاء الموديلات" : "Collapse models"
                        : isAr ? "عرض الموديلات" : "Expand models"
                    }
                    aria-expanded={brandOpen}
                    className="ms-1 shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                  >
                    <ChevronDown
                      className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
                        brandOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                ) : null}
              </div>

              {/* ── Its models ─────────────────────────────────────────── */}
              {brandOpen ? (
                <div className="bg-gray-50 dark:bg-white/5">
                  {brand.models.map((model) => (
                    <label
                      key={model.id}
                      className="flex cursor-pointer items-center gap-3 py-2.5 pe-3 ps-12 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                    >
                      <Checkbox
                        checked={selectedModels.includes(model.id)}
                        onCheckedChange={() => onToggleModel(model.id)}
                        className="h-4 w-4 shrink-0 border-2 data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary"
                      />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate text-sm text-gray-700 dark:text-gray-300">
                          {nameOf(model)}
                        </span>
                        {model.count > 0 ? (
                          <span className="shrink-0 text-xs tabular-nums text-gray-400">
                            {model.count}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </FilterSection>
  );
}
