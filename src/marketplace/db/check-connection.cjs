#!/usr/bin/env node
/**
 * Is the marketplace actually connected to the Supabase it is configured for?
 *
 *   node src/marketplace/db/check-connection.cjs
 *
 * Written for the move onto a self-hosted instance, and useful on any
 * deployment afterwards: pointing an app at a different Supabase changes six
 * things at once — REST, auth, storage, realtime, the schema and the image
 * allowlist — and five of them fail in ways that do not say what is wrong. The
 * database is reachable but the schema was never run; the keys work but belong
 * to the other project; everything works except that photos 400 through the
 * image optimiser because next.config's host list still names the old
 * hostname.
 *
 * So this checks each one separately and says which it was.
 *
 * ── It prints no secrets ────────────────────────────────────────────────────
 *
 * Keys are reported as present/absent and by their first few characters only.
 * A connection check that is unsafe to paste into a chat or a ticket is a
 * check nobody runs when it matters.
 */
const { loadEnv } = require('./_env.cjs');

const env = { ...loadEnv(), ...process.env };

const URL_ = env.MARKETPLACE_SUPABASE_URL;
const SERVICE = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_URL = env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_ANON_KEY;

/* The tables the app cannot run without, one per area, rather than all
   eighty: if these five are there the schema was run, and if they are not the
   message is "run schema.sql" rather than a list. */
const TABLES = ['listings', 'vendors', 'profiles', 'leads', 'site_settings'];

/* Added by the most recent sections of schema.sql. Reported separately,
   because "the schema was run, but not this version of it" is a different
   problem from "the schema was never run" and has a different fix. */
const RECENT = ['site_faqs', 'listing_faqs', 'notifications', 'vendor_charges'];

const BUCKETS = ['marketplace-media', 'marketplace-backups', 'marketplace-payments', 'marketplace-chat'];

const ok = (m) => console.log(`  \u001b[32mok\u001b[0m    ${m}`);
const bad = (m) => console.log(`  \u001b[31mFAIL\u001b[0m  ${m}`);
const warn = (m) => console.log(`  \u001b[33mwarn\u001b[0m  ${m}`);
const head = (m) => console.log(`\n${m}`);

const hint = (s) => (s ? `${String(s).slice(0, 6)}… (${String(s).length} chars)` : 'MISSING');

let failed = 0;
const fail = (m) => { failed += 1; bad(m); };

async function json(url, headers, init) {
  const res = await fetch(url, { headers, ...init });
  let body = null;
  try { body = await res.json(); } catch { /* not every endpoint answers JSON */ }
  return { status: res.status, body };
}

(async () => {
  head('Configuration');

  if (!URL_ || !SERVICE) {
    fail('MARKETPLACE_SUPABASE_URL / MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY are not both set — nothing else can be checked.');
    process.exit(1);
  }

  ok(`server URL   ${URL_}`);
  ok(`service key  ${hint(SERVICE)}`);
  ok(`browser URL  ${PUBLIC_URL || 'MISSING'}`);
  ok(`anon key     ${hint(ANON)}`);

  /* The two URLs are the same project seen from two places. When they differ,
     the server reads one database and the browser signs in to another — and
     the symptom is a session that works until the first server action. */
  if (PUBLIC_URL && PUBLIC_URL.replace(/\/$/, '') !== URL_.replace(/\/$/, '')) {
    fail('The server URL and the browser URL are different projects. Sign-in and server reads will disagree.');
  }
  if (ANON && SERVICE && ANON === SERVICE) {
    fail('The anon key and the service-role key are the same value. The service key must never reach the browser.');
  }

  const rest = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

  head('PostgREST (the database the app reads)');
  try {
    const { status } = await json(`${URL_}/rest/v1/`, rest);
    if (status === 200) ok('reachable, and the service key is accepted');
    else if (status === 401) fail('401 — the service-role key does not belong to this instance.');
    else fail(`unexpected status ${status}`);
  } catch (e) {
    fail(`unreachable: ${e.message}`);
    console.log('\n  Is the URL the PUBLIC gateway (Kong, normally :8000) rather than the Postgres port?');
    process.exit(1);
  }

  head('Schema');
  for (const t of TABLES) {
    const { status, body } = await json(`${URL_}/rest/v1/${t}?select=*&limit=1`, rest);
    if (status === 200) ok(`${t}`);
    else if (status === 404 || body?.code === '42P01') fail(`${t} does not exist — run src/marketplace/db/schema.sql on this database.`);
    else fail(`${t}: ${status} ${body?.message ?? ''}`);
  }

  for (const t of RECENT) {
    const { status } = await json(`${URL_}/rest/v1/${t}?select=*&limit=1`, rest);
    if (status === 200) ok(`${t}`);
    else warn(`${t} is missing — this database is on an older schema.sql than the code. Re-run it.`);
  }

  head('Storage');
  const buckets = await json(`${URL_}/storage/v1/bucket`, rest);
  if (buckets.status !== 200) {
    fail(`the storage API answered ${buckets.status} — is the storage service running?`);
  } else {
    const have = new Set((buckets.body ?? []).map((b) => b.id));
    for (const b of BUCKETS) {
      if (have.has(b)) ok(b);
      else fail(`${b} is missing — §24 of schema.sql creates it; it may have been refused by the SQL role.`);
    }
  }

  head('Auth');
  const health = await json(`${URL_}/auth/v1/health`, { apikey: ANON || SERVICE });
  if (health.status === 200) ok(`GoTrue is up${health.body?.version ? ` (${health.body.version})` : ''}`);
  else fail(`/auth/v1/health answered ${health.status} — sign-in will not work.`);

  const users = await json(`${URL_}/auth/v1/admin/users?per_page=1`, rest);
  if (users.status === 200) ok('the service key can administer users (the sign-up flow mints its own codes this way)');
  else fail(`admin users endpoint answered ${users.status} — generate_link, and therefore every emailed code, will fail.`);

  head('Realtime');
  /* The seller dashboard's live leads are an HTTP broadcast, not postgres
     changes — see §21.7 of schema.sql. 202 is the whole contract. */
  const broadcast = await fetch(`${URL_}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { ...rest, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: 'connection-check', event: 'ping', payload: {} }] }),
  }).catch((e) => ({ status: 0, error: e.message }));

  if (broadcast.status === 202) ok('broadcast accepted (live leads will arrive)');
  else warn(`broadcast answered ${broadcast.status || broadcast.error} — the dashboard still works, it just will not update until a refresh.`);

  head('Image optimiser');
  /* next/image refuses any host not in next.config's allowlist, and that list
     is derived from this same URL — so this only fails if the build was given
     a different value than this check was. */
  try {
    const host = new URL(PUBLIC_URL || URL_).hostname;
    const conf = require('fs').readFileSync(require('path').join(__dirname, '../../../next.config.mjs'), 'utf8');
    if (conf.includes('marketplaceStorageHost')) ok(`the allowlist is derived from the env, so ${host} is covered`);
    else if (conf.includes(host)) ok(`${host} is named in next.config.mjs`);
    else fail(`${host} is NOT allowed by next.config.mjs — every uploaded photo will 400 through next/image.`);
  } catch (e) {
    warn(`could not read next.config.mjs (${e.message})`);
  }

  head(failed ? `\u001b[31m${failed} check(s) failed.\u001b[0m` : '\u001b[32mEverything checks out.\u001b[0m');
  process.exit(failed ? 1 : 0);
})();
