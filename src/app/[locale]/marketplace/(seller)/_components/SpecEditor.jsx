"use client";

/**
 * Spec sheet editor — the seller side of the car page's "Car Information" grid
 * and "Car Specifications" accordions.
 *
 * 83 attributes across 11 categories. They used to render as 11 stacked
 * accordions, which meant the only way to reach "Infotainment" was to scroll
 * past everything above it and the seller could never see how much was left.
 * Now the categories are a rail and one category shows at a time, so the sheet
 * is a fixed-height surface no matter how many attributes get added upstream.
 *
 * Each input is picked by `display_type`, and by whether the attribute has an
 * option list defined in the catalog:
 *
 *   yesno    → Yes / No toggle, always — the two answers ARE the type
 *   numeric  → number input with its unit suffix
 *   select   → one dropdown, or two synced ones in a popup when the store
 *              authors in both languages
 *   multi    → checkbox list
 *   text     → text
 *
 * A select or multi with NO options says so rather than degrading to a text
 * box. Free text on a controlled field is how "Automatic", "automatic" and
 * "أوتوماتيك" all ended up in one column matching nothing.
 *
 * "Not specified" has to stay distinct from "no". A car that genuinely lacks a
 * sunroof and a car whose seller never answered are different things, and
 * collapsing both into `false` would fill every spec sheet with confident wrong
 * answers.
 */

import { useState, useMemo } from "react";
import { Search, X, Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { localized } from "@/marketplace/lib/listing";
import BilingualSelect from "./BilingualSelect";

/**
 * A spec's unit, in the dashboard's language.
 *
 * Upstream ships the unit as a bilingual object ({"en_US":"L","ar_001":"L"}),
 * and it landed in a text column verbatim — so the editor printed the literal
 * JSON where a unit belongs. localized() already copes with all three shapes
 * this column can hold: a plain string, a stringified object, and the legacy
 * en_US / ar_001 keys.
 */
const unitOf = (item, locale) => localized(item?.unit_code, locale);

const isFilled = (v) => v !== "" && v != null;

export default function SpecEditor({ locale = "ar", groups = [], values = {}, onChange, fieldMode = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /**
   * Open on a category that is worth opening on.
   *
   * groups[0] is whatever sorted first, and category_sequence is not unique —
   * three categories share 0, so the winner was arbitrary and in practice it
   * was a stray one-off category with no usable fields. The first category
   * holding a field the seller can actually answer is a better first
   * impression; groups[0] remains the fallback.
   */
  const firstUsable =
    groups.find((g) => g.items.some((i) => i.options?.length)) ?? groups[0];

  const [active, setActive] = useState(firstUsable?.key ?? null);
  const [query, setQuery] = useState("");
  const [keyOnly, setKeyOnly] = useState(false);

  const set = (attributeId, value) => onChange?.({ ...values, [attributeId]: value });
  const clear = (attributeId) => {
    const next = { ...values };
    delete next[attributeId];
    onChange?.(next);
  };

  const filledIn = (group) => group.items.filter((i) => isFilled(values[i.id])).length;

  // Searching an 83-row sheet beats scrolling it, and a search has to reach
  // across categories — otherwise "sunroof" only ever matches if you already
  // guessed which category it lives in. Matching runs over both languages so
  // an Arabic interface still finds the English term.
  const searching = query.trim().length > 0;
  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();

    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => {
          if (keyOnly && !i.is_key) return false;
          if (!q) return true;
          const name = `${localized(i.attribute_name, "en")} ${localized(i.attribute_name, "ar")}`;
          return name.toLowerCase().includes(q);
        }),
      }))
      .filter((g) => g.items.length);
  }, [groups, query, keyOnly]);

  // A category can vanish from the rail under a filter — fall back rather than
  // render an empty panel with a selected tab that no longer exists.
  const shown = searching
    ? visibleGroups
    : visibleGroups.filter((g) => g.key === active).length
      ? visibleGroups.filter((g) => g.key === active)
      : visibleGroups.slice(0, 1);

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const filledCount = Object.values(values).filter(isFilled).length;
  const pct = totalItems ? Math.round((filledCount / totalItems) * 100) : 0;

  const field =
    "h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-hidden transition-colors focus:border-brand-primary dark:border-gray-600 dark:bg-[#141414]";

  if (!groups.length) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400 dark:border-gray-600">
        {t("لا توجد مواصفات — أضفها من الكتالوج.", "No spec attributes — add them in Catalog.")}
      </p>
    );
  }

  return (
    <div>
      {/* ── Toolbar: search, key-only filter, progress ────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-300 px-2.5 dark:border-gray-600">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث في كل المواصفات…", "Search all specifications…")}
            className="w-full bg-transparent text-sm outline-hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={t("مسح", "Clear")}>
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setKeyOnly((v) => !v)}
          aria-pressed={keyOnly}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
            keyOnly
              ? "border-brand-primary bg-brand-primary text-white"
              : "border-gray-300 hover:border-brand-primary dark:border-gray-600"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${keyOnly ? "fill-current" : ""}`} />
          {t("الأساسية فقط", "Key only")}
        </button>
      </div>

      {/* Progress: 83 fields is a lot, and knowing 12 are done is the
          difference between finishing the sheet and abandoning it. */}
      <div className="mb-4 flex items-center gap-3">
        <Progress value={pct} className="h-1.5 flex-1 [&>div]:bg-brand-primary" />
        <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {filledCount}/{totalItems} {t("مُعبأة", "filled")}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* ── Category rail ──────────────────────────────────────────────── */}
        {/* Horizontal chips on mobile, a vertical list from lg — the same
            markup, so there is only one selected-state to keep in sync. */}
        <nav
          className={`flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible ${
            searching ? "pointer-events-none opacity-40" : ""
          }`}
          aria-label={t("المجموعات", "Categories")}
        >
          {groups.map((g) => {
            const done = filledIn(g);
            const isActive = !searching && g.key === shown[0]?.key;

            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setActive(g.key)}
                aria-current={isActive ? "true" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-start text-xs transition-colors lg:shrink ${
                  isActive
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "border-gray-200 hover:border-brand-primary dark:border-gray-700"
                }`}
              >
                {g.icon ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={g.icon}
                    alt=""
                    className={`h-4 w-4 shrink-0 object-contain ${isActive ? "brightness-0 invert" : ""}`}
                  />
                ) : null}
                <span className="flex-1 whitespace-nowrap font-medium lg:whitespace-normal">{g.name}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 text-[10px] tabular-nums ${
                    isActive
                      ? "bg-white/20"
                      : done
                        ? "bg-brand-primary/10 text-brand-primary"
                        : "text-gray-400"
                  }`}
                >
                  {done ? `${done}/${g.items.length}` : g.items.length}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── Fields ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {shown.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400 dark:border-gray-600">
              {t("لا نتائج", "Nothing matches")}
            </p>
          ) : null}

          {shown.map((group) => (
            <div key={group.key}>
              {/* Only worth a heading when several groups show at once —
                  otherwise the rail already says which category this is. */}
              {searching ? (
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand-primary">
                  {group.icon ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={group.icon} alt="" className="h-4 w-4 object-contain" />
                  ) : null}
                  {group.name}
                </h3>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => {
                  const label = localized(item.attribute_name, locale);
                  const value = values[item.id];
                  const filled = isFilled(value);

                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        filled
                          ? "border-brand-primary/40 bg-brand-primary/[0.03]"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <div className="mb-2 flex items-start gap-2">
                        {item.attribute_icon_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={item.attribute_icon_url} alt="" className="mt-0.5 h-4 w-4 shrink-0 object-contain" />
                        ) : null}
                        <span className="flex-1 text-xs font-medium leading-snug text-gray-700 dark:text-gray-300">
                          {label}
                          {unitOf(item, locale) ? <span className="text-gray-400"> ({unitOf(item, locale)})</span> : null}
                        </span>
                        {item.is_key ? (
                          <Star className="mt-0.5 h-3 w-3 shrink-0 fill-current text-brand-primary" title={t("مواصفة رئيسية", "Key spec")} />
                        ) : null}
                        {filled ? (
                          <button
                            type="button"
                            onClick={() => clear(item.id)}
                            aria-label={t("مسح", "Clear")}
                            className="mt-0.5 shrink-0 text-gray-400 transition-colors hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>

                      {/* An attribute that upstream defines a value list for
                          gets that list, whatever its display type. Free text
                          on a controlled field is how "Automatic", "automatic"
                          and "أوتوماتيك" all ended up meaning the same thing
                          and matching nothing. Only attributes with no options
                          fall through to a typed value. */}
                      {item.options?.length ? (
                        item.display_type === "multi" ? (
                          <div className="space-y-1">
                            {item.options.map((opt) => {
                              const chosen = Array.isArray(value) ? value : [];
                              const on = chosen.includes(opt.id);
                              return (
                                <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-[11px]">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => {
                                      const next = on
                                        ? chosen.filter((id) => id !== opt.id)
                                        : [...chosen, opt.id];
                                      return next.length ? set(item.id, next) : clear(item.id);
                                    }}
                                    className="h-3.5 w-3.5 accent-[var(--brand-primary)]"
                                  />
                                  <span className="text-gray-700 dark:text-gray-300">
                                    {localized(opt.name, locale)}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          /* Same control as the catalog dropdowns above — one
                             list in a single-language store, two synced lists
                             in a popup when the store authors in both. */
                          <BilingualSelect
                            name={`spec_${item.id}`}
                            options={item.options}
                            /* The option ID, verbatim. A dropdown matches on id,
                               so localizing it here would hand it display text
                               that matches no option and select nothing. */
                            value={typeof value === "string" ? value : ""}
                            onChange={(v) => (v === "" ? clear(item.id) : set(item.id, v))}
                            mode={fieldMode}
                            locale={locale}
                            className={field}
                          />
                        )
                      ) : item.display_type === "yesno" ? (
                        /* yesno never needs a catalog option list — the two
                           answers are the type. It used to fall through to the
                           text box below whenever no options happened to be
                           synced, so a field the catalog called Yes/No became
                           free text and the setting looked broken. */
                        <div className="flex gap-1.5">
                          {[
                            { v: "yes", ar: "نعم", en: "Yes" },
                            { v: "no", ar: "لا", en: "No" },
                          ].map((o) => {
                            const on = value === o.v;
                            return (
                              <button
                                key={o.v}
                                type="button"
                                aria-pressed={on}
                                onClick={() => (on ? clear(item.id) : set(item.id, o.v))}
                                className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                  on
                                    ? "border-brand-primary bg-brand-primary text-white"
                                    : "border-gray-300 hover:border-brand-primary dark:border-gray-600"
                                }`}
                              >
                                {t(o.ar, o.en)}
                              </button>
                            );
                          })}
                        </div>
                      ) : item.display_type === "numeric" ? (
                        <input
                          type="number"
                          step="any"
                          /* Scalar only — a numeric spec stored as {ar,en} would render blank. */
                          value={typeof value === "object" ? localized(value, locale) : value ?? ""}
                          onChange={(e) => (e.target.value === "" ? clear(item.id) : set(item.id, e.target.value))}
                          className={field}
                          placeholder={unitOf(item, locale) || "0"}
                        />
                      ) : item.display_type === "select" || item.display_type === "multi" ? (
                        /* A choice field with nothing to choose from. Silently
                           degrading to free text is what let "Automatic",
                           "automatic" and "أوتوماتيك" all be typed into the same
                           controlled field — say the list is missing instead. */
                        <p className="rounded-md border border-dashed border-amber-300 px-2 py-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:text-amber-500">
                          {t("أضف الخيارات من الكتالوج", "Add options in Catalog")}
                        </p>
                      ) : (
                        /* A free-text spec value is translatable like every
                           other authored string — "Black leather" is "جلد أسود".
                           In 'both' mode it gets one box per language and stores
                           {ar, en}; in a single-language store it stays one box
                           and stores a plain string, so nothing existing has to
                           be migrated. */
                        fieldMode === "both" ? (
                          <div className="space-y-2">
                            {["ar", "en"].map((lang) => (
                              <div key={lang} className="flex items-center gap-2">
                                <span className="w-6 shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
                                  {lang}
                                </span>
                                <input
                                  type="text"
                                  dir={lang === "ar" ? "rtl" : "ltr"}
                                  value={(typeof value === "object" ? value?.[lang] : lang === "en" ? value : "") ?? ""}
                                  onChange={(e) => {
                                    const prev = typeof value === "object" && value ? value : {};
                                    const next = { ...prev, [lang]: e.target.value };
                                    if (!next.ar && !next.en) clear(item.id);
                                    else set(item.id, next);
                                  }}
                                  className={field}
                                  placeholder={lang === "ar" ? "بالعربية" : "In English"}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={(typeof value === "object" ? localized(value, locale) : value) ?? ""}
                            onChange={(e) => (e.target.value === "" ? clear(item.id) : set(item.id, e.target.value))}
                            className={field}
                            placeholder={t("القيمة", "Value")}
                          />
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
