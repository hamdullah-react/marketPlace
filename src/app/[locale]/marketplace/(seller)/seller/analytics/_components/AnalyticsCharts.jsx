"use client";

/**
 * The charted half of the analytics page.
 *
 * Client-side because Recharts needs a DOM to measure against. Everything it
 * draws is pre-aggregated on the server — this file does no arithmetic beyond
 * formatting, so there is one place where a number can be wrong.
 */

import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { localized } from "@/marketplace/lib/listing";

/** Matches the state colours used on the listings table. */
const STATE_META = {
  live: { ar: "منشور", en: "Live", dot: "bg-green-600", bar: "[&>div]:bg-green-600" },
  draft: { ar: "مسودة", en: "Draft", dot: "bg-gray-400", bar: "[&>div]:bg-gray-400" },
  pending_review: { ar: "قيد المراجعة", en: "In review", dot: "bg-amber-600", bar: "[&>div]:bg-amber-600" },
  rejected: { ar: "مرفوض", en: "Rejected", dot: "bg-red-600", bar: "[&>div]:bg-red-600" },
  sold_out: { ar: "مباع", en: "Sold", dot: "bg-blue-600", bar: "[&>div]:bg-blue-600" },
  paused: { ar: "موقوف", en: "Paused", dot: "bg-gray-500", bar: "[&>div]:bg-gray-500" },
};

const STATE_FALLBACK = { dot: "bg-brand-primary", bar: "[&>div]:bg-brand-primary" };

export default function AnalyticsCharts({ locale = "ar", data }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const [metric, setMetric] = useState("listings");

  const nf = (n) => Number(n ?? 0).toLocaleString(isAr ? "ar-SA" : "en-US");

  const dayLabel = (iso) =>
    new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short" });

  const stateRows = Object.entries(data.byState ?? {}).map(([state, count]) => ({
    state,
    count,
    label: t(STATE_META[state]?.ar ?? state, STATE_META[state]?.en ?? state),
    dot: STATE_META[state]?.dot ?? STATE_FALLBACK.dot,
    bar: STATE_META[state]?.bar ?? STATE_FALLBACK.bar,
  }));

  const seriesConfig = {
    listings: { label: t("إعلانات مضافة", "Listings added"), color: "var(--brand-primary)" },
    leads: { label: t("عملاء محتملون", "Leads"), color: "#0ea5e9" },
  };

  // A window where nothing happened is a real answer, but an empty chart looks
  // broken — say it instead of drawing a flat line and hoping.
  const seriesTotal = data.series.reduce((n, d) => n + d[metric], 0);

  return (
    <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
      {/* ── Activity over time ─────────────────────────────────────────── */}
      <Card className="raised-card border-0 @4xl/main:col-span-2">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base">{t("النشاط", "Activity")}</CardTitle>
            <CardDescription className="text-xs">
              {t(
                `آخر ${data.series.length} يوماً — حسب تاريخ الإضافة`,
                `Last ${data.series.length} days, by date added`
              )}
            </CardDescription>
          </div>
          <div className="raised flex gap-1 rounded-lg p-1">
            {Object.entries(seriesConfig).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMetric(key)}
                aria-pressed={metric === key}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  metric === key ? "raised-solid bg-brand-primary text-white" : "raised-hover text-muted-foreground"
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {seriesTotal === 0 ? (
            <p className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
              {t(
                "لا نشاط في هذه الفترة.",
                "No activity in this period."
              )}
            </p>
          ) : (
            <ChartContainer config={seriesConfig} className="h-[240px] w-full">
              <AreaChart data={data.series} margin={{ left: 4, right: 4, top: 4 }}>
                <defs>
                  <linearGradient id="fillMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={seriesConfig[metric].color} stopOpacity={0.7} />
                    <stop offset="95%" stopColor={seriesConfig[metric].color} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={dayLabel}
                />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(v) => dayLabel(v)} />}
                />
                <Area
                  dataKey={metric}
                  type="monotone"
                  stroke={seriesConfig[metric].color}
                  fill="url(#fillMetric)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── By state ───────────────────────────────────────────────────── */}
      <Card className="raised-card border-0">
        <CardHeader>
          <CardTitle className="text-base">{t("حسب الحالة", "By status")}</CardTitle>
          <CardDescription className="text-xs">
            {t("أين تقف إعلاناتك الآن.", "Where your listings stand right now.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stateRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("لا توجد إعلانات بعد.", "No listings yet.")}
            </p>
          ) : (
            <ul className="space-y-3">
              {stateRows.map((r) => {
                const pct = Math.round((r.count / data.totals.listings) * 100);
                return (
                  <li key={r.state}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
                        {r.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {nf(r.count)} · {pct}%
                      </span>
                    </div>
                    {/* Progress takes a number, so no inline width is needed —
                        the colour rides on a child selector. */}
                    <Progress value={pct} className={`h-2 ${r.bar}`} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Most viewed ────────────────────────────────────────────────── */}
      <Card className="raised-card border-0">
        <CardHeader>
          <CardTitle className="text-base">{t("الأكثر مشاهدة", "Most viewed")}</CardTitle>
          <CardDescription className="text-xs">
            {t("إجمالي المشاهدات منذ النشر.", "Lifetime views since publishing.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.topViewed.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("لا مشاهدات بعد.", "No views recorded yet.")}
            </p>
          ) : (
            <ChartContainer
              config={{ views: { label: t("مشاهدات", "Views"), color: "var(--brand-primary)" } }}
              className="h-[240px] w-full"
            >
              <BarChart
                data={data.topViewed.map((l) => ({
                  name: localized(l.name, locale) || l.slug,
                  views: l.views ?? 0,
                }))}
                layout="vertical"
                margin={{ left: 4, right: 8 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="views" fill="var(--brand-primary)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Where the inventory sits ───────────────────────────────────── */}
      {[
        { key: "byBrand", ar: "حسب الماركة", en: "By brand", bilingual: true },
        { key: "byCity", ar: "حسب المدينة", en: "By city", bilingual: false },
      ].map((block) => {
        const rows = data[block.key] ?? [];
        const max = Math.max(1, ...rows.map((r) => r.count));
        return (
          <Card key={block.key} className="raised-card border-0">
            <CardHeader>
              <CardTitle className="text-base">{t(block.ar, block.en)}</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("لا بيانات.", "No data.")}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {rows.map((r) => {
                    // byBrand carries {ar,en}; byCity is a plain string.
                    const label = block.bilingual
                      ? localized(r.name, locale) || String(r.id ?? "")
                      : r.name;
                    return (
                      <li key={r.id ?? r.name} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate text-xs">{label}</span>
                        <Progress
                          value={(r.count / max) * 100}
                          className="h-2 flex-1 [&>div]:bg-brand-primary"
                        />
                        <span className="w-8 shrink-0 text-end text-xs tabular-nums text-muted-foreground">
                          {nf(r.count)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
