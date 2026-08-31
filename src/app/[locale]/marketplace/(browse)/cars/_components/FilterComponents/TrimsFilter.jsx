"use client";

/**
 * Trims, grouped under the model they belong to — the main site's TrimsFilter.
 *
 * Nested rather than flat because a trim name is only meaningful next to its
 * model: two makes both ship a "GT", and a flat list puts them on adjacent
 * rows with nothing to tell them apart.
 *
 * `max-h-60` and scrolls, like the main site's — one model with nine trims
 * should not push every section below it off the rail.
 */

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import FilterSection from "./FilterSection";

export default function TrimsFilter({
  options = [],
  selected = [],
  onToggleValue,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  const [openModels, setOpenModels] = useState({});

  if (!options.length) return null;

  const nameOf = (row) =>
    (isAr ? row.name?.ar || row.name?.en : row.name?.en || row.name?.ar) || row.slug || "—";

  return (
    <FilterSection
      icon={FileText}
      title={isAr ? "الفئات" : "Trims"}
      selectedCount={selected.length}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      {/* Negative margin cancels FilterSection's padding so the divider rules
          run the full width of the card, as they do on the main site. */}
      <div className="-mx-4 -mb-4 max-h-60 divide-y divide-gray-100 overflow-y-auto dark:divide-white/10">
        {options.map((model) => {
          const open = !!openModels[model.id];

          return (
            <div key={model.id}>
              <div className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/5">
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                    {nameOf(model)}
                  </span>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-400">
                    {model.trims.length}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => setOpenModels((o) => ({ ...o, [model.id]: !o[model.id] }))}
                  aria-expanded={open}
                  aria-label={
                    open
                      ? isAr ? "إخفاء الفئات" : "Collapse trims"
                      : isAr ? "عرض الفئات" : "Expand trims"
                  }
                  className="ms-2 shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  <ChevronDown
                    className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {open ? (
                <div className="space-y-1 bg-gray-50 px-4 py-2 dark:bg-white/5">
                  {model.trims.map((trim) => (
                    <label
                      key={trim.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-white dark:hover:bg-white/10"
                    >
                      <Checkbox
                        checked={selected.includes(trim.id)}
                        onCheckedChange={() => onToggleValue(trim.id)}
                        className="h-4 w-4 shrink-0 border-2 data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary"
                      />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate text-sm text-gray-700 dark:text-gray-300">
                          {nameOf(trim)}
                        </span>
                        {trim.count > 0 ? (
                          <span className="shrink-0 text-xs tabular-nums text-gray-400">
                            {trim.count}
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
