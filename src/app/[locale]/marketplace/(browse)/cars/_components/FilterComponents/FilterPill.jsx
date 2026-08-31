"use client";

/**
 * One answer, as the main site draws it: a bordered tile that fills with brand
 * purple when chosen, with an 8×8 icon square that turns into a tick and a
 * count of the cars behind it.
 *
 *   ┌─────────────────────────────┐   ┌─────────────────────────────┐
 *   │ [▣]  Petrol            12   │   │ [✓]  Diesel             4   │  ← chosen
 *   └─────────────────────────────┘   └─────────────────────────────┘
 *
 * The count is the point of the pattern. A list of options tells a buyer what
 * they may pick; a list of options with counts tells them what the inventory
 * actually holds, which is the thing they came to find out.
 */

import { Check } from "lucide-react";

export default function FilterPill({
  checked = false,
  icon: Icon,
  label,
  count = 0,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border-2 px-2.5 py-2 transition-all ${
        checked
          ? "border-brand-primary bg-brand-primary shadow-xs"
          : "border-gray-200 bg-white hover:border-brand-primary/50 hover:bg-gray-50 dark:border-white/10 dark:bg-[#1a1a1a] dark:hover:bg-white/5"
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
          checked
            ? "bg-white text-brand-primary"
            : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
        }`}
      >
        {checked ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span
          className={`truncate text-start text-[13px] font-medium ${
            checked ? "text-white" : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {label}
        </span>

        {count > 0 ? (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              checked
                ? "bg-white/20 text-white"
                : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
            }`}
          >
            {count}
          </span>
        ) : null}
      </div>
    </button>
  );
}
