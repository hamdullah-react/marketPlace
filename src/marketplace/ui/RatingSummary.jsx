import Stars from './Stars';

/**
 * The average, the histogram and the share who rated it well.
 *
 * ── Why the bars are a share of the LARGEST bucket ──────────────────────────
 *
 * Ratings are not evenly spread — most showrooms sit at four and five stars. As
 * a proportion of the total, the one- and two-star bars come out a pixel wide
 * and the chart says "everything is five stars" when it should say "three
 * people were unhappy". Against the tallest bar, every row that has anybody in
 * it is visible, and the count is printed at the end regardless.
 *
 * Shown on the storefront, the public reviews page and the seller's own page,
 * which is the point of it living here: a seller comparing their page with
 * their storefront must not find two different-looking charts.
 */
export default function RatingSummary({ summary, locale = 'ar', className = '' }) {
  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const s = summary ?? { total: 0, average: 0, buckets: [0, 0, 0, 0, 0], positive: 0 };

  if (!s.total) return null;

  const max = Math.max(...s.buckets, 1);

  return (
    <div className={`flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8 ${className}`}>
      <div className="shrink-0 text-center sm:w-36">
        <p className="text-4xl font-bold tabular-nums text-brand-primary">{s.average.toFixed(1)}</p>
        <div className="mt-1 flex justify-center">
          <Stars value={s.average} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {s.total} {t(s.total === 1 ? 'تقييم' : 'تقييم', `review${s.total === 1 ? '' : 's'}`)}
        </p>
      </div>

      <div className="flex-1 space-y-1.5">
        {s.buckets.map((count, i) => {
          const stars = 5 - i;
          return (
            <div key={stars} className="flex items-center gap-2 text-xs">
              <span className="w-3 shrink-0 tabular-nums text-muted-foreground">{stars}</span>
              <Stars value={1} size="h-3 w-3" className="shrink-0" label={`${stars}`} />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                <span
                  className="block h-full rounded-full bg-[var(--gold)]"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-end tabular-nums text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>

      {/* One average hides the difference between "everyone thought it was
          fine" and "half loved it, half were furious". */}
      {s.total >= 3 ? (
        <div className="shrink-0 rounded-xl bg-brand-primary/5 px-4 py-3 text-center sm:w-32">
          <p className="text-2xl font-bold tabular-nums text-brand-primary">{s.positive}%</p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {t('قيّموها ٤ نجوم فأكثر', 'rated it 4 stars or more')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
