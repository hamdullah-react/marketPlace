#!/usr/bin/env node
/**
 * Create (or repair) the platform administrator, with a password.
 *
 *   node src/marketplace/db/make-admin.cjs
 *   node src/marketplace/db/make-admin.cjs you@example.com 'YourPassword123!'
 *
 * Run it anywhere the app's own environment is present — the Coolify terminal
 * for this project is the intended place, because the two variables it needs
 * are already set there and nothing has to be pasted.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The ordinary way in is: sign up on the site, receive a code by email, then
 * run an UPDATE to promote the account. Every step of that can be blocked on a
 * fresh deployment — the mail sender is still Resend's sandbox and only
 * delivers to the Resend account's own address, so the person who needs to get
 * in may be unable to receive the code that lets them.
 *
 * This takes the other route Supabase offers: the admin API creates the user
 * server-side with `email_confirm: true`, so there is no code to wait for, and
 * the password works with the login form immediately (the sign-in action calls
 * signInWithPassword).
 *
 * ── It is RE-RUNNABLE, and it repairs ───────────────────────────────────────
 *
 * Run it on an account that already exists and it resets that account's
 * password and confirms the address rather than failing. That is deliberate:
 * "I cannot get in" is the situation this is for, and an admin locked out by a
 * forgotten password needs the same three API calls as one who was never
 * created.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 *
 * It does not create the profiles row by hand unless it has to. `profiles` is
 * written by the on_auth_user_created trigger (§17.1), and letting the trigger
 * do it is how the row ends up shaped the way every other account's is. The
 * insert below is a fallback for a database where the trigger was not created,
 * and it says so rather than papering over it.
 */
const { loadEnv } = require('./_env.cjs');

const env = { ...loadEnv(), ...process.env };

const URL_ = env.MARKETPLACE_SUPABASE_URL;
const KEY = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;

/* Order of preference: what was typed on the command line, then the
   environment, then the address this project has always used. */
const EMAIL = (process.argv[2] || env.ADMIN_EMAIL || 'hamdullahs046@gmail.com').trim().toLowerCase();
const GIVEN = process.argv[3] || env.ADMIN_PASSWORD || '';

const bad = (m) => { console.error(`\n\u001b[31m${m}\u001b[0m\n`); process.exit(1); };
const ok = (m) => console.log(`  \u001b[32mok\u001b[0m    ${m}`);
const note = (m) => console.log(`  \u001b[33m·\u001b[0m     ${m}`);

if (!URL_ || !KEY) {
  bad(
    'MARKETPLACE_SUPABASE_URL and MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY must both be set.\n' +
      'Run this in the project terminal, where the app already has them.'
  );
}

/**
 * A password nobody has to invent.
 *
 * Only used when none was given. crypto.randomBytes rather than Math.random:
 * this is a credential, and a predictable one is worse than a short one. The
 * character set skips the pairs that are read wrong aloud or over a phone
 * (0/O, 1/l/I), because this one is going to be read off a terminal.
 */
function generated() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = require('crypto').randomBytes(20);
  return (
    Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('') + '!7'
  );
}

const PASSWORD = GIVEN || generated();

if (PASSWORD.length < 8) bad('That password is under 8 characters; Supabase will refuse it.');

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

async function api(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  let body = null;
  try { body = await res.json(); } catch { /* 204s and empty bodies */ }
  return { status: res.status, body };
}

(async () => {
  console.log(`\nAdministrator: ${EMAIL}`);
  console.log(`Database:      ${URL_}\n`);

  /* ── 1. Does the account exist? ──────────────────────────────────────────
     Asked by listing with a filter rather than by attempting the create and
     reading the error, so the "already there" path is a decision rather than
     an exception. */
  const found = await api(`/auth/v1/admin/users?page=1&per_page=200`);
  if (found.status !== 200) {
    bad(
      `The admin API answered ${found.status}. ` +
        'That is the service-role key being wrong for this instance, or GoTrue not running.'
    );
  }

  const existing = (found.body?.users ?? []).find(
    (u) => String(u.email ?? '').toLowerCase() === EMAIL
  );

  let userId = existing?.id ?? null;

  if (existing) {
    /* Reset rather than refuse. Somebody running this on an account that
       exists is somebody who cannot get into it. */
    const upd = await api(`/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    if (upd.status !== 200) bad(`Could not set the password: ${upd.status} ${JSON.stringify(upd.body)}`);
    ok('account already existed — password reset and address confirmed');
  } else {
    const made = await api('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        /* The whole point: confirmed server-side, so there is no emailed code
           to wait for and the login form works at once. */
        email_confirm: true,
        user_metadata: { full_name: 'Administrator', locale: 'ar' },
      }),
    });
    if (made.status !== 200 && made.status !== 201) {
      bad(`Could not create the account: ${made.status} ${JSON.stringify(made.body)}`);
    }
    userId = made.body?.id;
    ok('account created, address confirmed');
  }

  if (!userId) bad('The account has no id — nothing further can be done.');

  /* ── 2. The profiles row ─────────────────────────────────────────────────
     The trigger should have written it. Checked rather than assumed, because
     a database where §17.1 did not run is exactly where this script is most
     likely to be used. */
  let row = await api(`/rest/v1/profiles?id=eq.${userId}&select=id,role`);

  if (row.status === 404 || row.body?.code === '42P01') {
    bad('There is no `profiles` table. Run src/marketplace/db/schema.sql on this database first.');
  }

  if (Array.isArray(row.body) && row.body.length === 0) {
    note('no profiles row — the on_auth_user_created trigger did not fire; inserting one');
    const ins = await api('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: userId, role: 'admin', full_name: 'Administrator', locale: 'ar' }),
    });
    if (ins.status >= 300) bad(`Could not create the profile: ${ins.status} ${JSON.stringify(ins.body)}`);
    ok('profile created as admin');
  } else {
    const patch = await api(`/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ role: 'admin' }),
    });
    if (patch.status >= 300) bad(`Could not promote the profile: ${patch.status} ${JSON.stringify(patch.body)}`);
    ok('profile promoted to admin');
  }

  /* Read it back. The patch above reporting 200 is not the same as the role
     actually being 'admin' — a policy or a trigger could have intervened, and
     this is the one fact the whole script exists to establish. */
  row = await api(`/rest/v1/profiles?id=eq.${userId}&select=role`);
  const role = Array.isArray(row.body) ? row.body[0]?.role : null;

  if (role !== 'admin') bad(`The role reads back as "${role}" rather than admin. Nothing was left half-done; re-run after checking §17.1 of schema.sql.`);

  ok('verified: role = admin');

  console.log('\n' + '─'.repeat(58));
  console.log('  Sign in at  /marketplace/login');
  console.log(`  Email       ${EMAIL}`);
  console.log(`  Password    ${PASSWORD}`);
  console.log('─'.repeat(58));
  if (!GIVEN) {
    console.log('  This password was generated. It is printed once, here, and');
    console.log('  stored nowhere — copy it now, and change it after signing in.');
  }
  console.log('');
})().catch((e) => bad(e.message));
