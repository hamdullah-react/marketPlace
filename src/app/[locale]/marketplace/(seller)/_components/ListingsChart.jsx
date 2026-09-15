"use client";

/**
 * Views and price distribution across the vendor's listings.
 *
 * Honest about what the data supports: there is no time series yet — nothing
 * records a view with a timestamp — so this charts what actually exists
 * (views per listing, price bands) rather than inventing a 90-day trend line
 * the way the stock dashboard block does.
 *
 * When a listing_views table lands, the first chart becomes a real area chart
 * over time and this comment goes away.
 */

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
  AreaChart, Area,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const BRAND = "#0B6B3A";

export default function ListingsChart({ locale = "ar", listings = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const [tab, setTab] = useState("views");

  const nf = (n) => Number(n ?? 0).toLocaleString(isAr ? "ar-SA" : "en");

  // Top 10 by views. A bar per listing beyond that is unreadable on a phone.
  const byViews = [...listings]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 10)
    .map((l) => ({
      name: (l.title || "").slice(0, 18),
      views: l.views ?? 0,
      live: l.state === "live",
    }));

  // Price bands, so a seller sees where their inventory clusters.
  const bands = [
    { max: 50000, ar: "أقل من ٥٠ ألف", en: "Under 50k" },
    { max: 100000, ar: "٥٠–١٠٠ ألف", en: "50–100k" },
    { max: 200000, ar: "١٠٠–٢٠٠ ألف", en: "100–200k" },
    { max: Infinity, ar: "أكثر من ٢٠٠ ألف", en: "Over 200k" },
  ];
  const byPrice = bands.map((b, i) => ({
    name: t(b.ar, b.en),
    count: listings.filter((l) => {
      const p = Number(l.price ?? 0);
      const lower = i === 0 ? 0 : bands[i - 1].max;
      return p >= lower && p < b.max;
    }).length,
  }));

  const config = {
    views: { label: t("المشاهدات", "Views"), color: BRAND },
    count: { label: t("عدد الإعلانات", "Listings"), color: BRAND },
  };

  const TABS = [
    { id: "views", ar: "المشاهدات", en: "Views" },
    { id: "price", ar: "توزيع الأسعار", en: "Price spread" },
  ];

  const empty = listings.length === 0;

  return (
    <Card className="raised-card border-0">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">
            {tab === "views" ? t("الأكثر مشاهدة", "Most viewed") : t("توزيع الأسعار", "Price spread")}
          </CardTitle>
          <CardDescription className="text-xs">
            {tab === "views"
              ? t("أعلى ١٠ إعلانات لديك", "Your top 10 listings")
              : t("عدد الإعلانات في كل شريحة سعرية", "How many listings sit in each price band")}
          </CardDescription>
        </div>
        <div className="raised flex shrink-0 gap-1 rounded-lg p-1">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                tab === x.id ? "raised-solid bg-brand-primary text-white" : "raised-hover text-muted-foreground"
              }`}
            >
              {t(x.ar, x.en)}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {empty ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("لا توجد بيانات بعد — أضف إعلاناً.", "No data yet — add a listing.")}
          </p>
        ) : tab === "views" ? (
          <ChartContainer config={config} className="h-[260px] w-full">
            <BarChart data={byViews} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={nf} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                reversed={isAr}
                orientation={isAr ? "right" : "left"}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="views" radius={4}>
                {/* A draft with views is worth spotting — dim anything not live. */}
                {byViews.map((d, i) => (
                  <Cell key={i} fill={BRAND} fillOpacity={d.live ? 1 : 0.35} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartContainer config={config} className="h-[260px] w-full">
            <AreaChart data={byPrice} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} reversed={isAr} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} orientation={isAr ? "right" : "left"} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="count" stroke={BRAND} fill={BRAND} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
