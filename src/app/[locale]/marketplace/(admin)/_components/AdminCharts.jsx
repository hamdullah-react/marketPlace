"use client";

/**
 * The dashboard's charts.
 *
 * ── Drawn from what the marketplace actually records ────────────────────────
 *
 * Every series here is a count of rows that exist, over `created_at`, which is
 * the one timestamp every table has. Nothing is modelled, projected or filled
 * in — a quiet week is drawn as a quiet week, because the whole value of this
 * page is that an admin can trust the shape of the line.
 *
 * ── Colours come from the theme ─────────────────────────────────────────────
 *
 * The fills are `var(--brand-primary)` and friends rather than hexes, so the
 * charts follow Admin → Settings → Appearance like everything else. Recharts
 * writes them straight into SVG attributes, where a CSS variable resolves
 * normally.
 *
 * ── Empty is a state, not a bug ─────────────────────────────────────────────
 *
 * A new marketplace has three leads and four cars. Each panel says so in words
 * when it has nothing to draw, instead of rendering an axis around a blank box
 * — which reads as broken rather than as new.
 */

import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

/* The theme's own tokens. `--chart-*` are the shadcn palette slots, already
   defined in globals.css, so a breakdown with six slices does not need six
   hand-picked colours that fight the brand. */
const BRAND = "var(--brand-primary)";
const GOLD = "var(--gold)";
const SLICES = [
  "var(--brand-primary)",
  "var(--gold)",
  "var(--brand-on-dark)",
  "var(--chart-3, #6366f1)",
  "var(--chart-4, #f97316)",
  "var(--chart-5, #64748b)",
];

/** A listing state or lead stage, in the reader's language. */
const LABELS = {
  live: { ar: "منشورة", en: "Live" },
  draft: { ar: "مسودة", en: "Draft" },
  pending_review: { ar: "بانتظار المراجعة", en: "In review" },
  paused: { ar: "موقوفة", en: "Paused" },
  rejected: { ar: "مرفوضة", en: "Rejected" },
  sold_out: { ar: "مباعة", en: "Sold" },
  expired: { ar: "منتهية", en: "Expired" },
  new: { ar: "جديد", en: "New" },
  contacted: { ar: "تم التواصل", en: "Contacted" },
  quoted: { ar: "تم التسعير", en: "Quoted" },
  won: { ar: "ناجحة", en: "Won" },
  lost: { ar: "خاسرة", en: "Lost" },
  cancelled: { ar: "ملغاة", en: "Cancelled" },
};

function Empty({ children }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
      {children}
    </div>
  );
}

export default function AdminCharts({ locale = "ar", overview }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const label = (key) => (LABELS[key] ? t(LABELS[key].ar, LABELS[key].en) : key);

  const [metric, setMetric] = useState("all");

  const nf = (n) => Number(n ?? 0).toLocaleString(isAr ? "ar-SA" : "en");
  const localized = (value) =>
    typeof value === "string" ? value : value?.[isAr ? "ar" : "en"] || value?.en || value?.ar || "—";

  /* The axis prints a short date; the tooltip prints the full one. A 30-point
     axis with "24 September" on every tick is unreadable at any width. */
  const shortDate = (iso) =>
    new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short" });

  const activity = overview.activity ?? [];
  const busy = activity.some((d) => d.listings || d.leads || d.users);

  const SERIES = [
    { key: "listings", ar: "سيارات مضافة", en: "Cars added", color: BRAND },
    { key: "leads", ar: "طلبات", en: "Requests", color: GOLD },
    { key: "users", ar: "مستخدمون", en: "Sign-ups", color: "var(--brand-on-dark)" },
  ];
  const shown = metric === "all" ? SERIES : SERIES.filter((s) => s.key === metric);

  const config = Object.fromEntries(
    SERIES.map((s) => [s.key, { label: t(s.ar, s.en), color: s.color }])
  );

  const states = (overview.listingStates ?? []).map((row) => ({
    ...row,
    name: label(row.state),
  }));

  const brands = (overview.topBrands ?? []).map((b) => ({
    ...b,
    name: localized(b.name),
  }));

  return (
    <div className="grid gap-4 @4xl/main:grid-cols-3">
      {/* ── What happened, day by day ─────────────────────────────────────
          Two thirds of the row: it is the only panel that shows a DIRECTION,
          which is the question a dashboard exists to answer. */}
      <Card className="@4xl/main:col-span-2">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base text-brand-primary">
              {t("النشاط", "Activity")}
            </CardTitle>
            <CardDescription>
              {t(`آخر ${overview.days} يوماً`, `The last ${overview.days} days`)}
            </CardDescription>
          </div>

          {/* One series at a time, or all three. Three overlapping areas are
              right for "is anything happening"; one is right for "how much". */}
          <div className="flex flex-wrap gap-1">
            {[{ key: "all", ar: "الكل", en: "All" }, ...SERIES].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setMetric(s.key)}
                aria-pressed={metric === s.key}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  metric === s.key
                    ? "raised-solid bg-brand-primary text-white"
                    : "raised-hover text-muted-foreground"
                }`}
              >
                {t(s.ar, s.en)}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {busy ? (
            <ChartContainer config={config} className="h-[240px] w-full">
              <AreaChart data={activity} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>

                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tick={{ fontSize: 11 }}
                  reversed={isAr}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11 }}
                  orientation={isAr ? "right" : "left"}
                />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(v) => shortDate(v)} />}
                />

                {shown.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#fill-${s.key})`}
                    stackId={metric === "all" ? undefined : "one"}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          ) : (
            <Empty>
              {t(
                "لا يوجد نشاط في هذه الفترة بعد.",
                "Nothing has happened in this period yet."
              )}
            </Empty>
          )}
        </CardContent>
      </Card>

      {/* ── Where the inventory stands ────────────────────────────────────
          A doughnut rather than a pie: the hole carries the total, which is
          the number an admin reads first, and the slices answer "of which". */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-brand-primary">
            {t("حالة الإعلانات", "Listings by state")}
          </CardTitle>
          <CardDescription>{t("كل السيارات على المنصة", "Every car on the platform")}</CardDescription>
        </CardHeader>
        <CardContent>
          {states.length ? (
            <ChartContainer
              config={Object.fromEntries(states.map((s, i) => [s.state, { label: s.name, color: SLICES[i % SLICES.length] }]))}
              className="h-[240px] w-full"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <Pie
                  data={states}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {states.map((s, i) => (
                    <Cell key={s.state} fill={SLICES[i % SLICES.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          ) : (
            <Empty>{t("لا توجد إعلانات بعد.", "No listings yet.")}</Empty>
          )}

          {/* A legend of our own: recharts' prints a row that wraps badly at
              this width, and the COUNT beside each label is the thing being
              compared. */}
          <ul className="mt-3 grid gap-1.5">
            {states.map((s, i) => (
              <li key={s.state} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: SLICES[i % SLICES.length] }}
                />
                <span className="text-muted-foreground">{s.name}</span>
                <span className="ms-auto font-semibold tabular-nums">{nf(s.count)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── Which brands the marketplace actually carries ─────────────────
          Horizontal, because brand names are words: a vertical bar chart puts
          them on their side or truncates them. */}
      <Card className="@4xl/main:col-span-2">
        <CardHeader>
          <CardTitle className="text-base text-brand-primary">
            {t("أكثر الماركات", "Top brands")}
          </CardTitle>
          <CardDescription>
            {t("عدد السيارات المنشورة لكل ماركة", "Live cars per brand")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {brands.length ? (
            <ChartContainer
              config={{ count: { label: t("سيارات", "Cars"), color: BRAND } }}
              className="h-[240px] w-full"
            >
              <BarChart data={brands} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.35} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} reversed={isAr} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  orientation={isAr ? "right" : "left"}
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="count" fill={BRAND} radius={5} barSize={18} />
              </BarChart>
            </ChartContainer>
          ) : (
            <Empty>{t("لا توجد سيارات منشورة بعد.", "No live cars yet.")}</Empty>
          )}
        </CardContent>
      </Card>

      {/* ── The sales pipeline, platform-wide ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-brand-primary">
            {t("مسار الطلبات", "Request pipeline")}
          </CardTitle>
          <CardDescription>
            {t(`آخر ${overview.days} يوماً`, `The last ${overview.days} days`)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.leadStages?.length ? (
            <ul className="grid gap-2.5">
              {overview.leadStages.map((row, i) => {
                const total = overview.leadStages.reduce((sum, r) => sum + r.count, 0);
                const share = total ? Math.round((row.count / total) * 100) : 0;

                return (
                  <li key={row.stage} className="grid gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{label(row.stage)}</span>
                      <span className="font-semibold tabular-nums">
                        {nf(row.count)} · {share}%
                      </span>
                    </div>
                    {/* A bar rather than a slice: these are STAGES, which have
                        an order, and a pie throws that away. */}
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, background: SLICES[i % SLICES.length] }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>{t("لا توجد طلبات في هذه الفترة.", "No requests in this period.")}</Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
