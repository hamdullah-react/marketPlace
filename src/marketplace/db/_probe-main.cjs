#!/usr/bin/env node
/**
 * Prints the COLUMN NAMES of the main site's catalog tables so the sync can be
 * written against what actually exists. Values are never printed — only keys
 * and a row count.
 *
 *   node src/marketplace/db/_probe-main.cjs
 *
 * Throwaway helper; delete once sync-catalog.cjs is settled.
 */
const { loadEnv } = require('./_env.cjs');


const env = { ...loadEnv(), ...process.env };
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (main site DB).');
  process.exit(1);
}

const TABLES = ['car_brand', 'car_model', 'car_year', 'car_trim', 'car_color', 'product_specification'];

(async () => {
  console.log(`\n  main DB: ${URL_}\n`);
  for (const t of TABLES) {
    const res = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
    });
    if (!res.ok) {
      console.log(`  ${t.padEnd(24)} ${res.status} ${(await res.text()).slice(0, 80)}`);
      continue;
    }
    const rows = await res.json();
    const total = res.headers.get('content-range')?.split('/')[1] ?? '?';
    console.log(`  ${t}  (${total} rows)`);
    console.log(`    ${rows[0] ? Object.keys(rows[0]).join(', ') : '(empty table)'}\n`);
  }
})();
