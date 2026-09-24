import 'server-only';

/**
 * Everything the admin dashboard draws, in one read.
 *
 * ── Why one function and not eight ──────────────────────────────────────────
 *
 * The page is a single screen that answers one question — "what is happening on
 * the marketplace?" — and every panel on it is a different cut of the same few
 * tables. Eight exported readers would mean eight round trips fired from eight
 * components, each with its own loading state, and a dashboard that arrives in
 * eight pieces. They go out together and arrive together.
 *
 * ── Counted in JS, not in SQL ───────────────────────────────────────────────
 *
 * A daily series is `count(*) … group by date_trunc('day', …)`, which PostgREST
 * cannot express — it would need a database function per series, so four more
 * things in schema.sql that have to be kept in step with this file. What is
 * fetched instead is one narrow column (`created_at`, plus a state where the
 * panel needs it) for the window being charted, and the buckets are filled
 * here. At marketplace scale that is a few thousand dates over the wire; if
 * this ever becomes slow, the fix is a view, not a rewrite of the page.
 *
 * ── Every read is INDEPENDENTLY tolerant ────────────────────────────────────
 *
 * A dashboard is the first page an admin opens, and a table that does not exist
 * yet — leads before §21, boosts before their section — must cost its own panel
 * and nothing else. Each read resolves to an empty array rather than throwing,
 * so a missing table draws an empty chart beside seven populated ones.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';

/** A read that answers with `fallback` instead of throwing. */
const safe = async (run, fallback = []) => {
  try {
    const { data, error } = await run();
    return error ? fallback : (data ?? fallback);
  } catch {
    return fallback;
  }
};

const DAY = 86_400_000;

/** `2026-09-24` in UTC — the key a bucket is filed under. */
const dayKey = (value) => {
  const at = new Date(value);
  return Number.isFinite(at.getTime()) ? at.toISOString().slice(0, 10) : null;
};

/**
 * One row per day for `days` back, including the days nothing happened.
 *
 * The gaps are the point: a chart drawn only from the days that have rows
 * shows a flat line through a quiet week and makes it look busy.
 */
function series(days, sources) {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const rows = [];
  const index = new Map();

  for (let i = days - 1; i >= 0; i -= 1) {
    const key = new Date(start.getTime() - i * DAY).toISOString().slice(0, 10);
    const row = { date: key };
    for (const name of Object.keys(sources)) row[name] = 0;
    rows.push(row);
    index.set(key, row);
  }

  for (const [name, list] of Object.entries(sources)) {
    for (const item of list) {
      const row = index.get(dayKey(item.created_at));
      if (row) row[name] += 1;
    }
  }

  return rows;
}

/**
 * This window against the one before it.
 *
 * A bare number says nothing about direction — 41 listings is good news or bad
 * depending on last month — so every headline figure carries the change. Null
 * when there is no previous period to compare against, which is honest for a
 * marketplace in its first month and better than printing "+100%".
 */
function delta(list, days) {
  const now = Date.now();
  const thisWindow = now - days * DAY;
  const lastWindow = now - days * 2 * DAY;

  let current = 0;
  let previous = 0;

  for (const item of list) {
    const at = new Date(item.created_at).getTime();
    if (!Number.isFinite(at)) continue;
    if (at >= thisWindow) current += 1;
    else if (at >= lastWindow) previous += 1;
  }

  return {
    current,
    previous,
    percent: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
  };
}

const countBy = (list, key) => {
  const out = new Map();
  for (const item of list) {
    const value = typeof key === 'function' ? key(item) : item[key];
    if (value == null) continue;
    out.set(value, (out.get(value) ?? 0) + 1);
  }
  return out;
};

export async function getAdminOverview({ days = 30 } = {}) {
  const db = getMarketplaceDb();

  /* Two windows' worth, so `delta` can compare this period with the last one
     from the same rows the charts are drawn from. */
  const since = new Date(Date.now() - days * 2 * DAY).toISOString();

  /* The only head count here: `profiles` is fetched WINDOWED (two periods, for
     the trend), so its length is not the total and never was. Everything else
     comes back whole and is counted from the rows already in hand. */
  const totalUsers = db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .then(({ count, error }) => (error ? null : count ?? 0), () => null);

  const [profiles, vendors, listings, leads, boosts, offers, brands, audit, users] = await Promise.all([
    safe(() => db.from('profiles').select('id, role, created_at').gte('created_at', since)),
    safe(() => db.from('vendors').select('id, slug, name, state, created_at, deleted_at')),
    safe(() =>
      db
        .from('listings')
        .select('id, state, is_featured, price, views, brand_id, vendor_id, created_at')
        .neq('state', 'removed')
    ),
    safe(() => db.from('leads').select('id, stage, created_at').gte('created_at', since)),
    safe(() => db.from('listing_boosts').select('id, state, price, days, created_at, ends_at')),
    safe(() =>
      db
        .from('listing_offers')
        .select('id, active, starts_at, ends_at, created_at')
        .eq('active', true)
    ),
    safe(() => db.from('car_brands').select('id, name')),
    safe(() =>
      db
        .from('audit_log')
        .select('id, actor, action, entity, created_at')
        .order('created_at', { ascending: false })
        .limit(8)
    ),
    totalUsers,
  ]);

  /* Totals are counted from the rows already fetched rather than with a second
     head-count per table: `listings` and `vendors` come back whole (neither is
     windowed), so a count here is free and cannot disagree with the charts. */
  const liveListings = listings.filter((l) => l.state === 'live');
  const activeVendors = vendors.filter((v) => !v.deleted_at);

  const now = Date.now();
  const runningBoosts = boosts.filter(
    (b) => b.state === 'approved' && b.ends_at && new Date(b.ends_at).getTime() > now
  );
  const liveOffers = offers.filter((o) => {
    const started = !o.starts_at || new Date(o.starts_at).getTime() <= now;
    const ended = o.ends_at && new Date(o.ends_at).getTime() <= now;
    return started && !ended;
  });

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const perBrand = countBy(liveListings, 'brand_id');

  const stateCount = countBy(listings, 'state');
  const stageCount = countBy(leads, 'stage');

  return {
    days,

    /* ── The headline figures ──────────────────────────────────────────── */
    kpis: {
      users: { total: users, ...delta(profiles, days) },
      vendors: {
        total: activeVendors.filter((v) => v.state === 'approved').length,
        pending: activeVendors.filter((v) => v.state !== 'approved' && v.state !== 'rejected').length,
        ...delta(activeVendors, days),
      },
      listings: {
        total: liveListings.length,
        featured: liveListings.filter((l) => l.is_featured).length,
        ...delta(listings, days),
      },
      leads: { total: leads.length, ...delta(leads, days) },
    },

    /* ── What happened, day by day ─────────────────────────────────────── */
    activity: series(days, {
      listings: listings.filter((l) => new Date(l.created_at).getTime() >= now - days * DAY),
      leads: leads.filter((l) => new Date(l.created_at).getTime() >= now - days * DAY),
      users: profiles.filter((p) => new Date(p.created_at).getTime() >= now - days * DAY),
    }),

    /* ── Breakdowns ────────────────────────────────────────────────────── */
    listingStates: [...stateCount.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),

    leadStages: [...stageCount.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count),

    topBrands: [...perBrand.entries()]
      .map(([id, count]) => ({ id, name: brandName.get(id) ?? null, count }))
      .filter((b) => b.name)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),

    /* Showrooms with the most live cars — who is actually carrying the
       marketplace, which the vendor count alone never says. */
    topVendors: [...countBy(liveListings, 'vendor_id').entries()]
      .map(([id, count]) => {
        const vendor = activeVendors.find((v) => v.id === id);
        return vendor ? { id, slug: vendor.slug, name: vendor.name, count } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),

    /* ── What is waiting for the admin ─────────────────────────────────── */
    queue: {
      boosts: boosts.filter((b) => b.state === 'pending').length,
      vendors: activeVendors.filter((v) => v.state === 'applied' || v.state === 'under_review').length,
      drafts: listings.filter((l) => l.state === 'pending_review').length,
    },

    /* ── Money asked for, not money taken ──────────────────────────────────
       The sum of the prices on boosts approved in this window. Payment is
       arranged off-platform (§ boost plans), so this is what was QUOTED — it
       is labelled that way on the card rather than being called revenue. */
    boostValue: boosts
      .filter(
        (b) => b.state === 'approved' && new Date(b.created_at).getTime() >= now - days * DAY
      )
      .reduce((sum, b) => sum + Number(b.price ?? 0), 0),

    running: { boosts: runningBoosts.length, offers: liveOffers.length },

    audit,
  };
}
