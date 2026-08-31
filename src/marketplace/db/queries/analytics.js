import { getMarketplaceDb } from '@/marketplace/db/client';
import { OPEN_STAGES } from '@/marketplace/db/queries/leads';

/**
 * Seller analytics, built only from data that actually exists.
 *
 * WHAT IS NOT HERE, and why: there is no views-over-time chart. `listings.views`
 * is a single cumulative counter per listing with no history table behind it —
 * no listing_views, no analytics_events, nothing that records when a view
 * happened. A daily views line would therefore be invented, and an invented
 * chart is worse than no chart: someone will make a pricing decision from it.
 *
 * Everything below is derived from columns that are genuinely populated:
 * created_at, published_at, state, price, views, brand_id, city.
 *
 * To get a real views trend, views need recording as events (or a nightly
 * snapshot of the counter). That is a schema change plus a job, not a query.
 */

/** Local YYYY-MM-DD. toISOString() would shift dates across the UTC boundary. */
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Every listing the vendor owns, with just the analytics columns.
 *
 * One read, aggregated in memory. A vendor's catalogue is tens to low hundreds
 * of rows, so eight `count: exact` round trips would cost more than the scan.
 */
async function loadListings(vendorId) {
  const { data, error } = await getMarketplaceDb()
    .from('listings')
    .select('id, slug, name, state, price, views, city, brand_id, created_at, published_at')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`analytics listings: ${error.message}`);
  return data ?? [];
}

/**
 * Swaps brand ids for their {ar,en} names.
 *
 * Only the handful actually on the chart are looked up, not the whole 96-row
 * brand table. A brand that has since been deleted keeps its id as the label
 * rather than vanishing from a chart whose counts would then stop adding up.
 */
async function withBrandNames(rows) {
  if (!rows.length) return rows;

  const { data, error } = await getMarketplaceDb()
    .from('car_brands')
    .select('id, name')
    .in('id', rows.map((r) => r.name));

  if (error) return rows;

  const names = new Map((data ?? []).map((b) => [b.id, b.name]));
  return rows.map((r) => ({ ...r, id: r.name, name: names.get(r.name) ?? r.name }));
}

/**
 * Headline numbers plus the breakdowns the page charts.
 *
 * @param days  window for the "added over time" series
 */
export async function getSellerAnalytics(vendorId, { days = 30 } = {}) {
  if (!vendorId) return null;

  const db = getMarketplaceDb();
  const [listings, leadsRes] = await Promise.all([
    loadListings(vendorId),
    // Leads may legitimately be empty, and a database that has not run
    // schema.sql §21 has no table at all. Neither must take the page down, so
    // this degrades to no lead data rather than throwing.
    db.from('leads').select('id, stage, created_at')
      .eq('vendor_id', vendorId).is('deleted_at', null),
  ]);

  const leads = leadsRes.error ? [] : leadsRes.data ?? [];

  const live = listings.filter((l) => l.state === 'live');
  const totalViews = listings.reduce((n, l) => n + (l.views ?? 0), 0);
  const priced = listings.filter((l) => Number(l.price) > 0);

  // ── by state ─────────────────────────────────────────────────────────────
  const byState = listings.reduce((map, l) => {
    map[l.state] = (map[l.state] ?? 0) + 1;
    return map;
  }, {});

  // ── added over time ──────────────────────────────────────────────────────
  // Every day in the window, including the zeroes. Skipping empty days makes a
  // line chart lie about its own x-axis: three listings on three scattered days
  // would render as a continuous run.
  const today = new Date();
  const series = [];
  const counts = listings.reduce((map, l) => {
    if (!l.created_at) return map;
    const key = dayKey(new Date(l.created_at));
    map[key] = (map[key] ?? 0) + 1;
    return map;
  }, {});

  const leadCounts = leads.reduce((map, l) => {
    if (!l.created_at) return map;
    const key = dayKey(new Date(l.created_at));
    map[key] = (map[key] ?? 0) + 1;
    return map;
  }, {});

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    series.push({ date: key, listings: counts[key] ?? 0, leads: leadCounts[key] ?? 0 });
  }

  // ── top performers ───────────────────────────────────────────────────────
  const topViewed = [...listings]
    .filter((l) => (l.views ?? 0) > 0)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 8);

  // ── where the inventory sits ─────────────────────────────────────────────
  const tally = (rows, key) => {
    const map = rows.reduce((acc, r) => {
      const k = r[key];
      if (!k) return acc;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    totals: {
      listings: listings.length,
      live: live.length,
      views: totalViews,
      // Averaged over listings that can actually be viewed. Dividing by the
      // whole catalogue would let a pile of drafts drag the number down and
      // make live listings look weaker than they are.
      viewsPerLive: live.length ? Math.round(totalViews / live.length) : 0,
      leads: leads.length,
      openLeads: leads.filter((l) => OPEN_STAGES.includes(l.stage)).length,
      avgPrice: priced.length
        ? Math.round(priced.reduce((n, l) => n + Number(l.price), 0) / priced.length)
        : 0,
      inventoryValue: priced.reduce((n, l) => n + Number(l.price), 0),
    },
    byState,
    series,
    topViewed,
    byCity: tally(listings, 'city').slice(0, 6),
    // Names, not ids — `brand_id` is a UUID and would render as one.
    byBrand: (await withBrandNames(tally(listings, 'brand_id').slice(0, 6))),
    // The page states this next to the views figures rather than implying a
    // trend it cannot show.
    viewsAreLifetime: true,
  };
}
