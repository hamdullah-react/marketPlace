#!/usr/bin/env node
/**
 * Checks DB2 over HTTPS — no Postgres connection needed, so it works from
 * networks without IPv6 (which is why migrate.cjs may not be usable locally).
 *
 *   node src/marketplace/db/verify.cjs
 *
 * Reports which expected tables exist, their row counts, and whether the anon
 * key is correctly locked down by RLS.
 */
const { loadEnv } = require('./_env.cjs');

const EXPECTED = [
  'vendors', 'categories', 'listings',
  'orders', 'order_lines', 'order_events',
  'leads', 'vendor_form_fields', 'vendor_form_tabs', 'bookings', 'reviews',
  'commission_rules', 'disputes', 'payouts', 'payout_lines',
  'audit_log', 'saved_listings', 'saved_searches', 'addresses',
  'car_brands', 'car_models', 'car_years', 'car_trims', 'car_colors',
  'spec_attributes', 'listing_specs', 'trim_specs',
  'media_assets', 'listing_variants',
];

// Readable by the anon key once RLS is on. Everything else must be invisible.
const PUBLIC_READ = [
  'vendors', 'categories', 'listings', 'reviews',
  'car_brands', 'car_models', 'car_years', 'car_trims', 'car_colors',
  'spec_attributes', 'listing_specs', 'trim_specs',
  'listing_variants',
];


async function main() {
  const env = { ...loadEnv(), ...process.env };
  const url = env.MARKETPLACE_SUPABASE_URL;
  const secret = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.MARKETPLACE_SUPABASE_ANON_KEY;

  if (!url || !secret) {
    console.error('Missing MARKETPLACE_SUPABASE_URL or MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const head = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

  async function count(table, key) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: { ...head(key), Prefer: 'count=exact', Range: '0-0' },
    });
    const range = res.headers.get('content-range');
    return { status: res.status, total: range ? range.split('/')[1] : null };
  }

  console.log(`\n  ${url}\n`);

  let missing = 0;
  console.log('  table                 rows     anon');
  console.log('  ────────────────────────────────────────');
  for (const t of EXPECTED) {
    const asAdmin = await count(t, secret);
    if (asAdmin.status === 404 || asAdmin.status === 400) {
      console.log(`  ${t.padEnd(20)} MISSING`);
      missing++;
      continue;
    }
    // With RLS on and no select policy, PostgREST answers 200 with an empty
    // array — secure, not open. So the test is row COUNT, never status: a
    // private table must return 0 rows to anon even when rows exist.
    let anonNote = '—';
    if (anon) {
      const asAnon = await count(t, anon);
      const anonRows = Number(asAnon.total ?? 0);
      const adminRows = Number(asAdmin.total ?? 0);
      // PostgREST answers 206 Partial Content, not 200, whenever a Range header
      // is sent and rows come back. Both mean "readable".
      if (PUBLIC_READ.includes(t)) {
        anonNote = [200, 206].includes(asAnon.status) ? `public (${anonRows})` : '!! UNREADABLE';
      } else if (anonRows > 0) {
        anonNote = `!! LEAKING ${anonRows}`;
      } else {
        anonNote = adminRows > 0 ? 'blocked ✓' : 'blocked (empty)';
      }
    }
    console.log(`  ${t.padEnd(20)} ${String(asAdmin.total ?? '?').padStart(5)}     ${anonNote}`);
  }

  console.log('');
  if (missing) {
    console.log(`  ${missing}/${EXPECTED.length} tables missing — apply src/marketplace/db/schema.sql`);
    console.log('  Supabase Dashboard → SQL Editor → paste → Run\n');
    process.exit(1);
  }
  console.log(`  All ${EXPECTED.length} tables present.\n`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
