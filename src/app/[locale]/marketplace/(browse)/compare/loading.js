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
export default function CompareLoading() {
  return (
    <main className="animate-pulse pb-20" aria-hidden="true">
      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="border-b border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-[#141414]">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-2.5 sm:px-8 md:py-4 lg:px-20 xl:px-28">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gray-200 dark:bg-white/10" />
            <div className="min-w-0 flex-1">
              <div className="h-6 w-48 rounded bg-gray-200 dark:bg-white/10 md:h-8 md:w-80" />
              <div className="mt-2 hidden h-4 w-64 rounded bg-gray-200 dark:bg-white/10 md:block" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-8 md:pt-6 lg:px-20 xl:px-28">
        {/* ── Action pills ────────────────────────────────────────────────── */}
        <div className="mb-4 flex justify-center gap-2 md:gap-3">
          <div className="h-10 w-40 rounded-xl bg-gray-200 dark:bg-white/10 md:w-44" />
          <div className="h-10 w-28 rounded-xl bg-gray-200 dark:bg-white/10 md:w-36" />
        </div>

        {/* ── Cards ───────────────────────────────────────────────────────── */}
        <div className="mx-auto grid max-w-2xl gap-6 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-[10px] bg-white shadow-lg dark:bg-[#141414]"
            >
              <div className="h-36 bg-gray-200 dark:bg-white/10 sm:h-40" />
              <div className="p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-white/10">
                  <div className="h-8 w-12 rounded bg-gray-200 dark:bg-white/10" />
                  <div className="flex-1">
                    <div className="mb-1 h-4 w-3/4 rounded bg-gray-200 dark:bg-white/10" />
                    <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-white/10" />
                  </div>
                </div>
                <div className="mb-3 h-5 w-24 rounded bg-gray-200 dark:bg-white/10" />
                {/* The card's icon row of specs. */}
                <div className="grid grid-cols-4 gap-2 border-t border-gray-100 py-2 dark:border-white/10">
                  {[0, 1, 2, 3].map((j) => (
                    <div key={j} className="flex flex-col items-center">
                      <div className="mb-1 h-6 w-6 rounded-full bg-gray-200 dark:bg-white/10" />
                      <div className="h-2 w-8 rounded bg-gray-200 dark:bg-white/10" />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 dark:border-white/10">
                  <div className="h-8 w-20 rounded-full bg-gray-200 dark:bg-white/10" />
                  <div className="h-4 w-24 rounded bg-gray-200 dark:bg-white/10" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Key Specifications ──────────────────────────────────────────── */}
        <div className="py-4 md:py-8">
          <div className="mb-3 h-12 rounded-xl bg-gray-200 dark:bg-white/10 md:mb-6 md:h-14" />

          <div className="mb-4 overflow-hidden rounded-xl bg-white shadow-xs dark:bg-[#141414] md:mb-8">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex border-b last:border-0 dark:border-white/10">
                <div className="flex w-[120px] shrink-0 items-center gap-2 bg-gray-50 p-3 dark:bg-white/5 md:w-[150px] md:p-4">
                  <div className="h-6 w-6 shrink-0 rounded bg-gray-200 dark:bg-white/10" />
                  <div className="h-4 flex-1 rounded bg-gray-200 dark:bg-white/10" />
                </div>
                <div className="flex flex-1">
                  {[0, 1].map((j) => (
                    <div key={j} className="flex flex-1 justify-center p-3 md:p-4">
                      <div className="h-4 w-16 rounded bg-gray-200 dark:bg-white/10" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Specifications, and its closed categories ─────────────────── */}
          <div className="mb-3 h-12 rounded-xl bg-gray-200 dark:bg-white/10 md:mb-6 md:h-14" />

          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="mb-3 overflow-hidden rounded-xl bg-white shadow-xs dark:bg-[#141414] md:mb-6"
            >
              <div className="flex items-center justify-between p-3 md:p-5">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="h-8 w-8 rounded bg-gray-200 dark:bg-white/10 md:h-10 md:w-10" />
                  <div className="h-5 w-32 rounded bg-gray-200 dark:bg-white/10 md:w-40" />
                </div>
                <div className="h-5 w-5 rounded bg-gray-200 dark:bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
