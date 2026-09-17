import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Every loading state in the marketplace, in one file.
 *
 * There are no spinners here on purpose. A spinner says "something is
 * happening" and nothing else; a skeleton says "a table with eight rows is
 * about to appear here, and it will be this tall". The second one is both
 * faster-feeling and cheaper for layout: because each skeleton reserves the
 * same box its real content occupies, nothing jumps when the data streams in
 * (Cumulative Layout Shift stays at zero).
 *
 * That "same box" claim is the whole contract of this file. The heights and
 * grid definitions below are copied from the real components, not guessed:
 *   - StatCardsSkeleton    → (seller)/_components/StatCards.jsx
 *   - ChartSkeleton        → (seller)/_components/ListingsChart.jsx  (h-[260px])
 *   - CatalogTableSkeleton → (seller)/_components/CatalogManager.jsx
 * If you change a height in one of those, change it here too.
 *
 * These are server components — they ship no JavaScript. `animate-pulse` is a
 * pure CSS animation, so a skeleton costs nothing on the client.
 */

/* ── Chrome ───────────────────────────────────────────────────────────────── */

/**
 * The header's silhouette, shown while HeaderSlot reads the session.
 *
 * HeaderSlot calls getViewer(), which reads cookies() — request data, so the
 * route cannot be prerendered while it renders inline. Next 16.3 says so out
 * loud: "cookies(), headers(), params, or searchParams accessed outside of
 * <Suspense> prevents the route from being prerendered, blocking the page load"
 * (nextjs.org/docs/messages/blocking-prerender-runtime). Behind a boundary the
 * page ships as static HTML and only the header waits on the session.
 *
 * Same box as the real thing — `fixed inset-x-0 top-0 z-50 h-20`, copied from
 * MarketplaceHeader — so the 80px offset the layouts add stays correct and
 * nothing shifts when the real header lands.
 */
export function HeaderSkeleton() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 w-full bg-linear-to-b from-[#F7FCF9] to-[#DCEFE4] shadow-lg dark:from-[#1B4029] dark:to-[#12301F] sm:h-20">
      <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-4 px-3 sm:px-8">
        <Skeleton className="h-9 w-32" />
        <div className="hidden items-center gap-6 lg:flex">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>
    </header>
  );
}

/* ── Primitives ──────────────────────────────────────────────────────────── */

/** A run of text lines. The last one is short, the way a real paragraph ends. */
export function SkeletonLines({ count = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === count - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** Page heading + subtitle, used where the title itself depends on data. */
export function PageHeadSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

/* ── Browse: car card ────────────────────────────────────────────────────── */

/**
 * Mirrors ListingCard's fixed bands EXACTLY, band for band and height for
 * height: image 130/160px, the vendor + title + meta block, the price block
 * (min-h 60/68), the FOUR-up spec grid (min-h 64/76) and the action row
 * (min-h 44/52).
 *
 * Exact is the whole job. A skeleton that is close but not equal makes the
 * grid jump the moment real cards land, which reads as the page breaking
 * rather than loading. When ListingCard's bands change, this changes with it —
 * the spec grid was three columns here for exactly as long as it was three
 * there.
 */

/**
 * A grid of card skeletons, in the SAME columns as the grid it stands in for.
 *
 * `columns` exists because the two grids differ: the cars page runs three
 * across at xl, the home page's featured row runs four. A fixed three-column
 * skeleton under a four-column grid re-flows the moment the data lands, which
 * is the exact judder a skeleton is there to prevent.
 *
 * Literal class strings, not a template — Tailwind's scanner reads source text,
 * so `xl:grid-cols-${n}` would never be generated.
 */
/*
 * The listing card's skeleton is NOT here. It lives beside the card it traces,
 * in ListingCardSkeleton.jsx, and every page imports it from there directly —
 * one definition, filed next to the thing it has to stay in step with.
 */

/**
 * Filter rail — a stack of collapsible groups.
 *
 * Hidden below lg, exactly like the rail it stands in for. On a phone the rail
 * is not on screen at all and its place is taken by a button, so drawing a
 * column of grey bars there would be a skeleton for something that is never
 * going to appear.
 */
export function FilterSidebarSkeleton() {
  return (
    <div className="sticky top-[100px] hidden h-[calc(100vh-8rem)] self-start overflow-hidden rounded-xl shadow-md lg:block">
      {/* The gradient header is REAL, not a grey bar. It carries no data — a
          title, a search box and a reset button that are the same on every
          visit — so drawing it for real means the rail's most prominent band
          never flashes in. Only what the query decides is a skeleton. */}
      <div className="bg-linear-to-r from-[var(--brand-primary)] to-[#095A30] p-4">
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded bg-white/25" />
          <Skeleton className="h-5 w-16 bg-white/25" />
        </div>
        <Skeleton className="h-10 w-full rounded-[5px] bg-white/80" />
      </div>

      <div className="space-y-3 p-4">
        {[2, 1, 2, 1].map((rows, g) => (
          <div
            key={g}
            className="raised-card overflow-hidden rounded-xl"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-[5px]" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className={`grid gap-3 p-4 pt-2 ${rows === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {Array.from({ length: rows === 2 ? 2 : 2 }, (_, i) => (
                <Skeleton key={i} className="h-[58px] rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The phone's filter button. The mirror image: shown only where the rail is not. */
export function MobileFilterButtonSkeleton() {
  return <Skeleton className="mb-4 h-11 w-full rounded-lg lg:hidden" />;
}

/** The white card over the grid: title and count on one side, sort on the other. */
export function ResultsHeaderSkeleton() {
  return (
    <div className="raised-card mb-6 rounded-2xl p-5">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-[150px] rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/* ── Browse: home ────────────────────────────────────────────────────────── */

/** The four section cards on the home rail. */
export function CategoryRailSkeleton() {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="raised-card rounded-xl p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Home's featured grid — the flat 4/3 card, not the full CarCard. */
export function ListingGridSkeleton({ count = 8 }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="raised-card flex flex-col overflow-hidden rounded-xl">
          <Skeleton className="aspect-4/3 w-full rounded-none" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <Skeleton className="h-4 w-14 rounded" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="mt-auto h-5 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VendorGridSkeleton({ count = 3 }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="raised-card rounded-xl p-3 sm:p-5">
          <Skeleton className="h-4 w-20 sm:h-5 sm:w-32" />
          <SkeletonLines count={2} className="mt-3" />
          <Skeleton className="mt-4 h-3 w-16 sm:w-40" />
        </div>
      ))}
    </div>
  );
}

/* ── Browse: listing detail ──────────────────────────────────────────────── */

/** Main image plus the thumbnail strip below it. */
export function GallerySkeleton() {
  return (
    /*
      Traced against ListingFold's gallery column, which is a stack of three:
      the Exterior/Interior segmented control, the 16:10 frame, then the
      thumbnail strip.

      The frame was `aspect-4/3` here and `aspect-16/10` there — on a 700px
      column that is a 58px height difference, so the whole page below it
      jumped when the photos arrived. Thumbnails were a single size; the real
      strip is 48×64 stepping to 64×80 at md.
    */
    <div className="flex flex-col gap-3">
      {/* The segmented control, centred over the frame. */}
      <div className="flex justify-center">
        <Skeleton className="h-[46px] w-44 rounded-xl" />
      </div>

      <Skeleton className="aspect-16/10 w-full rounded-2xl" />

      {/* Centred from md, start-aligned below it — same as the real strip. */}
      <div className="flex justify-start gap-2 overflow-hidden p-2 md:justify-center md:gap-3 md:px-0">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-16 shrink-0 rounded-xl md:h-16 md:w-20" />
        ))}
      </div>
    </div>
  );
}

/** The six spec tiles. */
export function SpecsSkeleton({ count = 6 }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="raised-card rounded-xl p-4">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="mt-2 h-2.5 w-16" />
          <Skeleton className="mt-1.5 h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** The sticky buy panel: title, price, seller box, two buttons. */
export function BuyPanelSkeleton() {
  return (
    <div className="raised-card rounded-xl p-5">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="mt-3 h-8 w-40" />
      <Skeleton className="mt-2 h-3 w-32" />

      <div className="raised-card mt-5 rounded-lg p-4">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="mt-2 h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-28" />
      </div>

      <div className="mt-5 space-y-2">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}

/* ── Seller dashboard ────────────────────────────────────────────────────── */

/**
 * Four stat cards. The grid mirrors StatCards exactly — including the
 * @xl/@5xl container queries, which only work because the page keeps its
 * `@container/main` wrapper outside the Suspense boundary.
 */
export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="@container/card h-full">
          <CardHeader className="relative">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-2 h-8 w-20" />
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-1.5 pt-0">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Chart card. The 260px body matches ListingsChart's ChartContainer. */
export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-52 max-w-full" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </CardHeader>
      <CardContent>
        {/* Bars of differing heights read as a chart at a glance, where a
            plain 260px block just reads as a missing image. The heights are
            written out as literal classes because Tailwind scans source text —
            a template-built `h-[${n}%]` would never be generated. */}
        <div className="flex h-[260px] w-full items-end gap-1.5">
          {[
            'h-[42%]', 'h-[68%]', 'h-[35%]', 'h-[80%]', 'h-[55%]', 'h-[72%]',
            'h-[48%]', 'h-[88%]', 'h-[60%]', 'h-[38%]', 'h-[75%]', 'h-[52%]',
          ].map((h, i) => (
            <Skeleton key={i} className={`flex-1 rounded-t-sm ${h}`} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Tables ──────────────────────────────────────────────────────────────── */

/**
 * Generic table body. `cols` sets the column count and `rows` the row count —
 * pass the page size so the skeleton is exactly as tall as the real table.
 */
export function TableSkeleton({ rows = 8, cols = 5, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-xl border ${className}`}>
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-32' : 'flex-1 max-w-24'}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-32' : 'flex-1 max-w-24'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Catalog: toolbar + table + pager, the whole CatalogManager shell. */
export function CatalogTableSkeleton({ rows = 8 }) {
  return (
    <div className="space-y-4">
      {/* Toolbar — add button, search, filters, page size */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
        <Skeleton className="h-9 w-[150px] rounded-lg" />
        <div className="ms-auto flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-16 rounded-lg" />
        </div>
      </div>

      <TableSkeleton rows={rows} cols={7} />

      {/* Pager */}
      <div className="flex items-center justify-center gap-1.5 border-t pt-4">
        <Skeleton className="me-auto h-3 w-24" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-9 rounded-lg" />
        ))}
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
    </div>
  );
}

/* ── Media library ───────────────────────────────────────────────────────── */

export function MediaGridSkeleton({ count = 12 }) {
  return (
    <div>
      {/* Drop zone */}
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="p-2">
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="mt-1.5 h-2 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Settings ────────────────────────────────────────────────────────────── */

/** The settings page is a column of cards, each a small form. */
export function SettingsFormSkeleton() {
  return (
    <div className="space-y-6">
      {[3, 4, 2].map((fields, c) => (
        <Card key={c}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: fields }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
            <Skeleton className="h-9 w-28 rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
