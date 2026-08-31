"use client";

/**
 * Paint colour, as swatches — the main site's ColorsFilter: a four-across grid
 * of 40px discs, the chosen one ringed in brand purple with a tick inside it.
 *
 * The tick flips between dark and light depending on how bright the paint is,
 * because a white tick on a white car is an unticked car.
 */

import { Palette, Check } from "lucide-react";
import FilterSection from "./FilterSection";

/**
 * Perceived brightness, not the arithmetic mean.
 *
 * Human eyes are far more sensitive to green than to blue, so an unweighted
 * average calls a saturated blue "light" and puts a dark tick on it that
 * nobody can see. These are the standard luma coefficients.
 */
function isLight(hex) {
  const raw = String(hex || "").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (full.length !== 6) return false;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export default function ColorsFilter({
  options = [],
  selected = [],
  onToggleValue,
  isExpanded,
  onToggle,
  locale = "ar",
}) {
  const isAr = locale === "ar";
  if (!options.length) return null;

  const nameOf = (c) =>
    (isAr ? c.name?.ar || c.name?.en : c.name?.en || c.name?.ar) || c.slug || "—";

  return (
    <FilterSection
      icon={Palette}
      title={isAr ? "اللون" : "Color"}
      selectedCount={selected.length}
      isExpanded={isExpanded}
      onToggle={onToggle}
      locale={locale}
    >
      <div className="grid grid-cols-4 gap-2.5">
        {options.map((c) => {
          const checked = selected.includes(c.id);
          const label = nameOf(c);

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggleValue(c.id)}
              title={label}
              aria-pressed={checked}
              aria-label={label}
              className="group flex flex-col items-center gap-2"
            >
              {/* The one place an inline style is unavoidable: the swatch is a
                  colour out of the database, so there is no class to reach for
                  and a Tailwind arbitrary value cannot be built at runtime. */}
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                  checked
                    ? "border-brand-primary ring-2 ring-brand-primary ring-offset-2 dark:ring-offset-[#1a1a1a]"
                    : "border-gray-200 hover:scale-110 hover:border-brand-primary/50 dark:border-white/15"
                }`}
                style={{ backgroundColor: c.hex }}
              >
                {checked ? (
                  <Check
                    strokeWidth={3}
                    className={`h-5 w-5 ${isLight(c.hex) ? "text-gray-800" : "text-white"}`}
                  />
                ) : null}
              </span>

              <span
                className={`w-full truncate text-center text-xs ${
                  checked ? "font-medium text-brand-primary" : "text-gray-600 dark:text-gray-400"
                }`}
              >
                {label}
              </span>

              {c.count > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    checked
                      ? "bg-brand-primary/10 text-brand-primary"
                      : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                  }`}
                >
                  {c.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </FilterSection>
  );
}
