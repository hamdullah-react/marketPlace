"use client";

/**
 * Pick a specification's mark from the icons this application ships.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * A specification's icon used to be a URL — a file somebody had to upload
 * before a row could have a mark — and in practice nobody uploaded one: the 91
 * icons on this database all arrived with the scraped template, from somebody
 * else's site, and every specification a showroom added by hand had no icon at
 * all. See lib/spec-icons.js and schema.sql §35.
 *
 * So the icon is a token from a closed set of 121, and this is the dropdown
 * that searches it. Available on every row of the checklist, new and already
 * saved alike, which is the half that was missing: a showroom could not change
 * the mark on a definition it already had.
 *
 * ── Search, not a grid to scroll ──────────────────────────────────────────
 *
 * 121 icons is four screens of grid. The search runs over the token, both
 * names and a keyword line, so "برد", "cold" and "snow" all reach the
 * snowflake — see searchSpecIcons. Opening on the whole set rather than on
 * nothing matters too, because somebody who does not know what to type still
 * has to be able to browse.
 *
 * ── A trigger that says what is chosen ────────────────────────────────────
 *
 * The button draws the current mark, not a label. The row already says the
 * specification's name; a second copy of "Fuel" beside the fuel icon would be
 * noise, and the mark IS the thing being chosen.
 */

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SPEC_ICONS, searchSpecIcons } from "@/marketplace/lib/spec-icons";
import SpecGlyph from "@/marketplace/ui/SpecGlyph";

export default function IconPicker({
  value = null,
  onChange,
  locale = "ar",
  disabled = false,
  /** Shown as the trigger's accessible name, so it says WHICH row it is for. */
  label = "",
  className = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchSpecIcons(query), [query]);

  const pick = (token) => {
    onChange?.(token);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        /* Cleared on close, so re-opening starts on the whole set rather than
           on whatever was typed last time — a filtered list that looks empty
           is how somebody concludes there are no icons. */
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={
            label
              ? t(`أيقونة ${label}`, `Icon for ${label}`)
              : t("اختر أيقونة", "Choose an icon")
          }
          title={label || t("اختر أيقونة", "Choose an icon")}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
            value
              ? "border-brand-primary/40 bg-brand-primary/5 text-brand-primary"
              : "border-dashed border-gray-300 text-gray-400 hover:border-brand-primary hover:text-brand-primary dark:border-gray-600"
          } ${className}`}
        >
          {/* `fallback={null}` here and nowhere else: an empty slot is the
              honest state for a row with no icon chosen, and the dashed border
              is what says it can be filled. Everywhere the mark is DISPLAYED,
              the neutral fallback keeps the row's gutter steady instead. */}
          <SpecGlyph icon={value} className="h-4 w-4" fallback={null} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[280px] p-0" dir={isAr ? "rtl" : "ltr"}>
        <div className="flex items-center gap-2 border-b border-gray-200 px-2.5 py-2 dark:border-gray-700">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث: وقود، برد، أمان…", "Search: fuel, cold, safety…")}
            className="w-full bg-transparent text-xs outline-hidden"
          />
          {value ? (
            <button
              type="button"
              onClick={() => pick(null)}
              className="shrink-0 text-[10px] text-gray-500 underline-offset-2 hover:underline"
            >
              {t("إزالة", "Clear")}
            </button>
          ) : null}
        </div>

        {/* A fixed-height scroller rather than a growing panel: the popover is
            anchored to a row inside a long checklist, and one that changes
            height as you type pushes its own anchor off screen. */}
        <div className="max-h-[260px] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-gray-400">
              {t("لا أيقونة تطابق البحث", "No icon matches that")}
            </p>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {results.map((icon) => {
                const chosen = icon.token === value;
                return (
                  <button
                    key={icon.token}
                    type="button"
                    onClick={() => pick(icon.token)}
                    title={`${t(icon.ar, icon.en)}`}
                    aria-label={t(icon.ar, icon.en)}
                    aria-pressed={chosen}
                    className={`flex h-9 items-center justify-center rounded-md border transition-colors ${
                      chosen
                        ? "border-brand-primary bg-brand-primary text-white"
                        : "border-transparent text-gray-600 hover:border-brand-primary/40 hover:bg-brand-primary/5 dark:text-gray-300"
                    }`}
                  >
                    <SpecGlyph icon={icon.token} className="h-4 w-4" fallback={null} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="border-t border-gray-200 px-2.5 py-1.5 text-[10px] text-gray-400 dark:border-gray-700">
          {query
            ? t(`${results.length} من ${SPEC_ICONS.length}`, `${results.length} of ${SPEC_ICONS.length}`)
            : t(`${SPEC_ICONS.length} أيقونة`, `${SPEC_ICONS.length} icons`)}
        </p>
      </PopoverContent>
    </Popover>
  );
}
