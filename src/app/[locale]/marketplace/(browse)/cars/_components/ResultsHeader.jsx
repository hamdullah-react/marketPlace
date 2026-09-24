"use client";

/**
 * The band above the grid, in the main site's shape
 * (MyComponents/AllCars/types/AllCarMainpage.jsx):
 *
 *   1. a white card — "Available Cars" with a count pill on one side, the sort
 *      control on the other
 *   2. under it, a row of chips for what is currently filtered, led by a
 *      "Clear All" button
 *
 * Both halves read the URL, which is why they are one client component rather
 * than two: the chips and the sort control are the same state seen twice, and
 * splitting them would mean two subscriptions to the same searchParams.
 *
 * The labels the chips show are NOT derived from the URL alone. `vendor` is a
 * uuid and `city` a raw value, so the facets are passed in to turn them back
 * into a showroom's name — a chip reading "b3f1c2a4-…" is not a chip.
 */

import { useEffect, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RefreshCw, X, TrendingUp, TrendingDown, Sparkles, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FILTER_KEYS, MULTI_KEYS, valueLabel, KIND_PREFIX, kindsFromParams,
  SPEC_PREFIX, specsFromParams,
} from "./FilterComponents/constants";
import { publishResultsTotal } from "./resultsCount";
import { formatPrice } from "@/marketplace/lib/listing";

/* Each option carries its own mark, like the main site's CustomSortDropdown —
   the icon is what makes "low to high" and "high to low" distinguishable at a
   glance instead of two lines of near-identical text. */
const SORT_OPTIONS = [
  { value: "newest", ar: "الأحدث", en: "Newest", Icon: Sparkles },
  { value: "price_asc", ar: "السعر: من الأقل للأعلى", en: "Price: Low to High", Icon: TrendingDown },
  { value: "price_desc", ar: "السعر: من الأعلى للأقل", en: "Price: High to Low", Icon: TrendingUp },
  { value: "popular", ar: "الأكثر مشاهدة", en: "Most Viewed", Icon: Eye },
];

export default function ResultsHeader({
  locale = "ar",
  total = 0,
  page = 1,
  pageCount = 1,
  facets = {},
  /* The platform's currency, for the price chips. A range is not a listing, so
     there is no seller's currency to use — a filter is the platform asking the
     question, and it asks in the platform's money. */
  currency = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Tell the filter rail what the grid actually matched.
   *
   * This component is the only client code on the page that holds the FILTERED
   * total — the rail deliberately never sees the searchParams — so the phone's
   * "Show N cars" button reads it from here. In an effect, not in the body: a
   * publish during render is a write to another component while React is
   * rendering this one.
   */
  useEffect(() => {
    publishResultsTotal(total);
  }, [total]);

  const sort = searchParams.get("sort") || "newest";

  const setSort = (value) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  /**
   * One chip per thing a visitor has actually chosen.
   *
   * A multi-value param becomes several chips, because "Petrol, Diesel" as one
   * chip can only be removed as one — and half of what you picked is exactly
   * what you want to drop.
   */
  const chips = useMemo(() => {
    const out = [];
    const say = (v) => valueLabel(v, locale);

    /**
     * A multi-value chip's words.
     *
     * brand, model and colour are UUIDS in the URL — the same problem the
     * vendor chip has below, and the same answer: look the id up in the facets
     * the rail was built from. A chip reading "8cd07cda-5840-…" is not a chip,
     * it is a fault report.
     *
     * Falls back to the raw value rather than dropping the chip. A filter that
     * is applied and not shown is worse than one shown awkwardly — it cannot be
     * cleared, and the grid looks broken instead of filtered.
     */
    const named = (row) =>
      (isAr ? row?.name?.ar || row?.name?.en : row?.name?.en || row?.name?.ar) || row?.slug;

    const multiLabel = (key, v) => {
      if (key === "brand") {
        return named((facets.brands ?? []).find((b) => b.id === v)) ?? v;
      }
      if (key === "model") {
        for (const b of facets.brands ?? []) {
          const m = (b.models ?? []).find((x) => x.id === v);
          if (m) return named(m) ?? v;
        }
        return v;
      }
      if (key === "trim") {
        for (const m of facets.trimModels ?? []) {
          const tr = (m.trims ?? []).find((x) => x.id === v);
          if (tr) return named(tr) ?? v;
        }
        return v;
      }
      if (key === "offer") {
        const o = (facets.offers ?? []).find((x) => x.value === v);
        return (isAr ? o?.label?.ar || o?.label?.en : o?.label?.en || o?.label?.ar) || v;
      }
      if (key === "color") {
        return named((facets.colors ?? []).find((c) => c.id === v)) ?? v;
      }
      if (key === "seats") return t(`${v} مقاعد`, `${v} Seats`);
      return say(v);
    };

    for (const key of FILTER_KEYS) {
      const raw = searchParams.get(key);
      if (!raw) continue;

      if (MULTI_KEYS.has(key)) {
        for (const v of raw.split(",").filter(Boolean)) {
          out.push({ key, value: v, label: multiLabel(key, v) });
        }
        continue;
      }

      let label = raw;
      if (key === "vendor") {
        const v = (facets.vendors ?? []).find((x) => x.id === raw);
        // Falls back to the raw value rather than dropping the chip: a filter
        // that is applied and not shown is worse than one shown awkwardly.
        label = v ? (isAr ? v.name_ar : v.name_en) : raw;
      } else if (key === "min_price") {
        label = t(`من ${formatPrice(raw, "ar", currency)}`, `From ${formatPrice(raw, "en", currency)}`);
      } else if (key === "max_price") {
        label = t(`حتى ${formatPrice(raw, "ar", currency)}`, `Up to ${formatPrice(raw, "en", currency)}`);
      } else if (key === "min_year") {
        label = t(`من ${raw}`, `From ${raw}`);
      } else if (key === "max_year") {
        label = t(`حتى ${raw}`, `Up to ${raw}`);
      } else if (key === "max_mileage") {
        label = t(
          `حتى ${Number(raw).toLocaleString("ar-SA")} كم`,
          `Up to ${Number(raw).toLocaleString("en")} km`
        );
      } else if (key === "q") {
        label = `"${raw}"`;
      } else if (key === "has_offer") {
        label = t("لديه عرض", "Has Offer");
      } else if (key === "featured") {
        label = t("مميز", "Featured");
      }

      out.push({ key, value: null, label });
    }

    /**
     * The generic catalog attributes, which are not in FILTER_KEYS because
     * their names are not known until the catalog is read.
     *
     * Chipped through the same path as everything else — a filter that is
     * applied and has no chip cannot be cleared, and the grid then looks
     * broken rather than filtered.
     */
    for (const [kind, values] of Object.entries(kindsFromParams(searchParams))) {
      const facet = (facets.kinds ?? []).find((k) => k.kind === kind);
      for (const v of values) {
        const option = (facet?.values ?? []).find((o) => o.value === v);
        out.push({
          key: `${KIND_PREFIX}${kind}`,
          value: v,
          label: named(option) ?? v,
        });
      }
    }

    /**
     * The spec-sheet filters, which are not in FILTER_KEYS for the same reason
     * the catalog attributes are not: their names come from the catalog, not
     * from this file. The stored value IS the label a seller picked, so no
     * lookup is needed — only the attribute's own name, for the numeric
     * ranges, which have no value text of their own.
     */
    for (const [slug, values] of Object.entries(specsFromParams(searchParams))) {
      for (const v of values) {
        out.push({ key: `${SPEC_PREFIX}${slug}`, value: v, label: v });
      }
    }

    for (const [key, raw] of searchParams.entries()) {
      if (!key.startsWith(SPEC_PREFIX) || !key.endsWith("_range")) continue;
      const slug = key.slice(SPEC_PREFIX.length, -"_range".length);
      const facet = (facets.specs ?? []).find((f) => f.slug === slug);
      const [min, max] = String(raw).split("-");
      const title = named(facet) ?? slug;
      out.push({
        key,
        value: null,
        label: `${title}: ${min || "—"} – ${max || "—"}`,
      });
    }

    return out;
    /* The currency belongs in these deps: the price chips render an amount
       through it, so a list memoised without it would go on showing the old
       currency after the platform changed its own. */
  }, [searchParams, facets, isAr, currency]);

  const removeChip = (key, value) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value == null) {
      params.delete(key);
    } else {
      const next = (params.get(key) || "").split(",").filter((v) => v && v !== value);
      if (next.length) params.set(key, next.join(","));
      else params.delete(key);
    }

    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const clearAll = () => router.push(pathname, { scroll: false });

  return (
    <>
      {/* ── The header card ──────────────────────────────────────────────── */}
      <Card className="raised-card mb-6 rounded-2xl border-0">
        <CardContent className="flex flex-col items-start justify-between p-5 md:flex-row md:items-center">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-brand-primary md:mb-0">
            <span>{t("السيارات المتاحة", "Available Cars")}</span>
            {total > 0 ? (
              <Badge className="rounded-full bg-brand-primary px-2 py-1 text-sm text-brand-light hover:bg-brand-primary">
                {total}
              </Badge>
            ) : null}
            {pageCount > 1 ? (
              <span className="text-xs font-normal text-gray-400">
                {t(`صفحة ${page} من ${pageCount}`, `Page ${page} of ${pageCount}`)}
              </span>
            ) : null}
          </h2>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-brand-primary">
              {t("الترتيب:", "Sort:")}
            </span>
            <Select
              value={sort}
              onValueChange={setSort}
              dir={isAr ? "rtl" : "ltr"}
            >
              <SelectTrigger
                aria-label={t("ترتيب", "Sort")}
                className="raised w-auto min-w-[180px] gap-2 rounded-xl border-0 px-4 py-2.5 text-sm font-bold focus:ring-brand-primary/20"
              >
                <SelectValue placeholder={t("ترتيب حسب", "Sort by")} />
              </SelectTrigger>
              <SelectContent
                dir={isAr ? "rtl" : "ltr"}
                className="raised-card rounded-xl border-0"
              >
                {SORT_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    className="raised-hover cursor-pointer rounded-lg font-bold"
                  >
                    <span className="flex items-center gap-2">
                      <o.Icon
                        className={`h-4 w-4 ${
                          sort === o.value ? "text-brand-primary" : "text-gray-400"
                        }`}
                      />
                      <span>{t(o.ar, o.en)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── What is filtered ─────────────────────────────────────────────── */}
      {chips.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            onClick={clearAll}
            className="raised-solid h-9 gap-1 rounded-[5px] bg-brand-primary px-4 text-white hover:bg-brand-dark dark:border dark:border-white dark:bg-[#1e1e1e] dark:hover:bg-[#2a2a2a]"
          >
            <RefreshCw className="h-4 w-4" />
            {t("مسح الكل", "Clear All")}
          </Button>

          {chips.map((chip) => (
            <div
              key={`${chip.key}-${chip.value ?? ""}`}
              className="flex items-center gap-2 rounded-xl border-2 border-brand-primary bg-white px-4 py-2 text-brand-primary dark:bg-[#1a1a1a]"
            >
              <span className="text-sm font-medium">{chip.label}</span>
              <button
                type="button"
                onClick={() => removeChip(chip.key, chip.value)}
                aria-label={t(`إزالة ${chip.label}`, `Remove ${chip.label}`)}
                className="rounded-full p-1 transition-colors hover:bg-brand-light/50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
