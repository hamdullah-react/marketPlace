/**
 * What the compare page shows while its data is on the way.
 *
 * Next wraps page.js in a Suspense boundary using this as the fallback (see
 * the loading.js file convention), which means it appears on a cold page load
 * AND on every client navigation — and every add and remove IS a navigation
 * here, because the cars being compared live in the URL. Without it the old
 * page simply sat there, unchanged, for as long as the new one took to build,
 * so removing a car looked like nothing happening.
 *
 * Shaped like the real page rather than a spinner: the header bar, a centred
 * pair of action pills, two cards, then the two purple bars over their rows.
 * A skeleton that matches what arrives is the difference between "it is
 * coming" and "something else is coming".
 *
 * It cannot know how many cars are being compared — that is in the URL the
 * page has not parsed yet — so it draws two, the commonest comparison and the
 * fewest that can be one.
 */
import { ListingCardSkeleton } from '../../_components/ListingCardSkeleton';

export default function CompareLoading() {
  return (
    <main className="pb-20" aria-hidden="true">
      {/* animate-pulse sits on each block rather than on <main>: the card
          skeleton brings its own, and two nested pulses beat out of phase. */}
      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="raised-card">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-2.5 sm:px-8 md:py-4 lg:px-20 xl:px-28">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="h-9 w-9 shrink-0 rounded-xl animate-pulse bg-brand-primary/10 dark:bg-white/10" />
            <div className="min-w-0 flex-1">
              <div className="h-6 w-48 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10 md:h-8 md:w-80" />
              <div className="mt-2 hidden h-4 w-64 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10 md:block" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-8 md:pt-6 lg:px-20 xl:px-28">
        {/* ── Action pills ────────────────────────────────────────────────── */}
        <div className="mb-4 flex justify-center gap-2 md:gap-3">
          <div className="h-10 w-40 rounded-xl animate-pulse bg-brand-primary/10 dark:bg-white/10 md:w-44" />
          <div className="h-10 w-28 rounded-xl animate-pulse bg-brand-primary/10 dark:bg-white/10 md:w-36" />
        </div>

        {/* ── Cards ─────────────────────────────────────────
            The SHARED ListingCardSkeleton, because this page renders real
            ListingCards. It used to hand-draw its own, and that copy had gone
            stale in exactly the way the grid ones had — image on top, then a
            name band, a price band, a four-icon row, an actions row, which is
            the layout the card stopped using some time ago.

            `max-w-2xl md:grid-cols-2` mirrors CARD_GRID[2] in CompareTable:
            this file cannot know how many cars are being compared (they are in
            a URL the page has not parsed yet), so it draws two — the commonest
            comparison, and the fewest that can be one.
            ---------------------------------------------------------------- */}
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3 md:gap-6">
          {[0, 1].map((i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>

        {/* ── Key Specifications ──────────────────────────────────────────── */}
        <div className="py-4 md:py-8">
          {/* Solid, like the real bar — it is the one saturated thing in the
              column and a pale block in its place changes the page's weight. */}
          <div className="raised-solid mb-3 h-[52px] rounded-xl animate-pulse bg-brand-primary md:mb-6 md:h-[60px]" />

          <div className="raised-card mb-4 overflow-hidden rounded-xl md:mb-8">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex border-b last:border-0 dark:border-white/10">
                <div className="flex w-[120px] shrink-0 items-center gap-2 bg-brand-primary/[0.04] p-3 dark:bg-white/5 md:w-[150px] md:p-4">
                  <div className="h-6 w-6 shrink-0 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10" />
                  <div className="h-4 flex-1 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10" />
                </div>
                <div className="flex flex-1">
                  {[0, 1].map((j) => (
                    <div key={j} className="flex flex-1 justify-center p-3 md:p-4">
                      <div className="h-4 w-16 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Specifications, and its closed categories ─────────────────── */}
          {/* Solid, like the real bar — it is the one saturated thing in the
              column and a pale block in its place changes the page's weight. */}
          <div className="raised-solid mb-3 h-[52px] rounded-xl animate-pulse bg-brand-primary md:mb-6 md:h-[60px]" />

          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="raised-card mb-3 overflow-hidden rounded-xl md:mb-6"
            >
              <div className="flex items-center justify-between p-3 md:p-5">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="h-8 w-8 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10 md:h-10 md:w-10" />
                  <div className="h-5 w-32 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10 md:w-40" />
                </div>
                <div className="h-5 w-5 rounded animate-pulse bg-brand-primary/10 dark:bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
