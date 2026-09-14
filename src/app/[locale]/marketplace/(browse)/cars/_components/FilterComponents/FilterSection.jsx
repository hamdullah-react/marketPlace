"use client";

/**
 * The white card every filter sits in — the main site's section shell
 * (MyComponents/AllCars/types/FilterComponents/*), factored out so eight
 * filters cannot drift into eight slightly different headers.
 *
 *   ┌──────────────────────────────────────┐
 *   │ [icon]  Condition              ⌄     │   px-4 py-3, hover:bg-gray-50
 *   │         2 selected                   │
 *   ├──────────────────────────────────────┤
 *   │  …whatever the filter draws…         │   p-4 pt-2
 *   └──────────────────────────────────────┘
 *
 * Module scope, and a real component rather than a helper that returns JSX —
 * a component declared inside another is a new TYPE on every render, so React
 * would throw away and rebuild every section each time a filter changed, and
 * the open/closed state would go with it.
 */

import { ChevronDown } from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function FilterSection({
  icon: Icon,
  iconSrc = null,
  title,
  selectedCount = 0,
  isExpanded = false,
  onToggle,
  locale = "ar",
  children,
}) {
  const isAr = locale === "ar";

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="raised-card overflow-hidden rounded-xl">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="shrink-0 rounded-[5px] bg-brand-primary/10 p-1.5">
              {iconSrc ? (
                /* An uploaded catalog icon, not a lucide mark — kept as a plain
                   img because next/image would want a configured domain for a
                   16px decoration. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={iconSrc} alt="" width={14} height={14} className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5 text-brand-primary" />
              )}
            </div>

            <div className="flex flex-col items-start">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
              {selectedCount > 0 ? (
                <span className="text-[11px] font-medium text-brand-primary">
                  {selectedCount} {isAr ? "محدد" : "selected"}
                </span>
              ) : null}
            </div>
          </div>

          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-3 pt-1">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
