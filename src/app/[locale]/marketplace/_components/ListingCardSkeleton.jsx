/**
 * The stand-in for ListingCard, and the grid that holds them.
 *
 * ── Why it lives HERE and not in Skeletons.jsx ──────────────────────────────
 *
 * Because it is a TRACING of ListingCard.jsx, which sits next to it. Every box
 * in it matches the element it stands in for: the same paddings, the same text
 * heights, the same 130/160px stage, the same radius. If those drift apart the
 * real card arrives and the grid jumps — a layout shift on the largest element
 * of the page, and the one thing a skeleton exists to prevent.
 *
 * It was previously buried among thirty unrelated skeletons, and it had gone
 * badly stale: it still drew the card's OLD five-band layout (image on top,
 * then a name band, a price band, a four-icon row, an actions row) long after
 * the card became header → stage → spec strip. It was not imprecise, it was a
 * different component, and every tile visibly re-flowed on arrival.
 *
 * Filed as a sibling so the two are read together. If you change ListingCard's
 * structure, change this — they are one design in two files and no test will
 * tell you they have drifted.
 *
 * A server component: it ships no JavaScript, which matters because it is what
 * the visitor is looking at while the JavaScript is still arriving.
 */

import { Skeleton } from "@/components/ui/skeleton";

export function ListingCardSkeleton() {
  return (
    /*
      ── A TRACING of ListingCard, not an impression of it ────────────────────

      Every box below matches the element it stands in for: the same paddings,
      the same text heights, the same 130/160px stage, the same corner radius.
      That is the entire job of a skeleton — if the shapes differ, the real card
      arrives and the grid jumps, which is a layout shift on the largest element
      of the page.

      It was still drawing the card's OLD five-band layout (image on top, then a
      name band, a price band, a four-icon row and an actions row) long after the
      card became header → stage → spec strip. So it was not merely imprecise,
      it was a different component: every tile visibly re-flowed on arrival.

      If you change ListingCard's structure, change this. They are one design in
      two files and there is no test that will tell you they have drifted.
    */
    <div className="raised-card relative flex h-full w-full flex-col overflow-hidden rounded-2xl sm:rounded-[22px] md:rounded-[26px]">
      <Skeleton className="absolute end-2 top-2.5 h-6 w-6 rounded-full sm:end-3 sm:top-4 sm:h-7 sm:w-7 md:h-8 md:w-8" />

      {/* Header: badge row, then identity on the lead edge and price on the
          trailing one — the same as ListingCard. */}
      <div className="flex flex-col px-2.5 pt-2.5 sm:px-4 sm:pt-4 md:px-5">
        <div className="mb-1.5 flex min-h-6 items-center gap-1 pe-8 sm:mb-2 sm:min-h-7 sm:pe-10">
          <Skeleton className="h-4 w-11 rounded-full sm:h-5 sm:w-14" />
          <Skeleton className="h-4 w-9 rounded-full sm:h-5 sm:w-10" />
        </div>
        <div className="flex items-start justify-between gap-1.5 sm:gap-2.5 md:gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1 sm:mb-1 sm:gap-2">
              <Skeleton className="h-3 w-7 sm:h-3.5 sm:w-10 md:h-4 md:w-12" />
              <Skeleton className="h-2 w-10 sm:h-2.5 sm:w-16" />
            </div>
            <Skeleton className="h-2.5 w-full sm:h-3.5 md:h-4" />
            <Skeleton className="mt-1 h-2 w-3/4 sm:h-2.5 sm:w-28" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Skeleton className="h-2.5 w-12 sm:h-3.5 sm:w-20 md:h-4" />
            <Skeleton className="h-2 w-9 sm:h-2.5 sm:w-14" />
          </div>
        </div>
      </div>

      {/* Stage */}
      <div className="relative mt-1.5 px-2 pb-1 sm:mt-2 sm:px-3">
        <Skeleton className="h-[96px] w-full rounded-xl sm:h-[130px] sm:rounded-2xl md:h-[160px]" />
        <div className="absolute end-2 top-0 flex flex-col gap-1 sm:end-3">
          <Skeleton className="h-6 w-6 rounded-full sm:h-8 sm:w-8 md:h-9 md:w-9" />
          <Skeleton className="h-6 w-6 rounded-full sm:h-8 sm:w-8 md:h-9 md:w-9" />
        </div>
        <Skeleton className="absolute bottom-0 start-3 h-3 w-10 rounded-full sm:h-4 sm:w-14" />
      </div>

      {/* Spec strip: one row of three. */}
      <div className="mt-auto grid grid-cols-3 px-1.5 pb-2.5 pt-1 sm:px-3 sm:pb-4 sm:pt-1.5 md:px-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex flex-col items-center px-0.5 sm:px-1 ${
              i > 0 ? "border-s border-black/10 dark:border-white/10" : ""
            }`}
          >
            <Skeleton className="h-2 w-7 sm:h-3 sm:w-12 md:h-3.5 md:w-14" />
            <Skeleton className="mt-1 h-1.5 w-6 sm:h-2 sm:w-10 md:w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The grid, with the SAME column counts as the real ones.
 *
 * `columns` is the widest step; the breakpoints below it mirror what the pages
 * actually use, lg included. That step was missing before, so between 1024 and
 * 1280 the skeleton laid out two columns where the grid resolved to three — the
 * tiles were the right shape and still in the wrong places.
 *
 *   3 → sm:2  lg:2  xl:3   the cars grid with its filter rail
 *   4 → sm:2  lg:3  xl:4   a full-width grid: home, related, storefront
 */
export function ListingCardGridSkeleton({ count = 6, columns = 3 }) {
  const cols =
    columns === 4
      ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : "grid-cols-2 lg:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid gap-3 sm:gap-6 ${cols}`}>
      {Array.from({ length: count }, (_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}
