/**
 * Env loader shared by the marketplace CLI scripts (verify / seed / sync).
 *
 * Splits on /\r?\n/ rather than '\n'. The repo has CRLF .env files, and in a JS
 * regex `.` does not match \r — so a naive /^(\w+)=(.*)$/ silently matches
 * nothing on a CRLF line and every variable reads as missing.
 */
const fs = require('fs');
const path = require('path');

function loadEnv(files = ['.env.local', '.env']) {
  const out = {};
  for (const file of files) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      // First file wins — .env.local overrides .env, matching Next.js.
      if (m && !(m[1] in out)) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { ...out, ...process.env };
}

/**
 * Retries a request that failed at the transport layer.
 *
 * A full catalog sync moves ~7 MB across a dozen round trips, and a single
 * dropped connection used to kill the whole run with "terminated" after the
 * brands and models had already been written — leaving the catalog half
 * synced. HTTP errors are NOT retried: a 400 will fail identically next time
 * and hiding it behind three attempts only delays the real message.
 */
async function withRetry(label, run, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      // A 4xx/5xx is deterministic — it will fail identically next time, and
      // three more attempts only delay the message that explains the problem.
      if (err.http) throw new Error(`${label}: ${err.message}`);
      if (attempt >= attempts) throw new Error(`${label}: ${err.message} (after ${attempts} attempts)`);
      const wait = 800 * attempt;
      console.log(`  … ${label} failed (${err.message}); retrying in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

/** Small REST helper bound to one Supabase project. */
function supabaseRest(url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  return async function rest(method, pathname, body, prefer) {
    return withRetry(`${method} ${pathname.split('?')[0]}`, async () => {
      const res = await fetch(`${url}/rest/v1/${pathname}`, {
        method,
        headers: prefer ? { ...headers, Prefer: prefer } : headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      // An HTTP error is deterministic — surface it instead of retrying.
      if (!res.ok) return Promise.reject(Object.assign(
        new Error(`${res.status} ${text.slice(0, 300)}`), { http: true }
      ));
      return text ? JSON.parse(text) : null;
    });
  };
}

/**
 * Pages through a table with Range headers.
 *
 * PostgREST caps every response at max-rows (1000 on Supabase) and does NOT
 * error when it truncates — a plain `?limit=5000` silently returns 1000 and
 * looks like the whole table. Anything that must read a table in full has to
 * page explicitly.
 */
function supabaseSelectAll(url, key) {
  return async function selectAll(pathname, { pageSize = 1000, max = Infinity } = {}) {
    const rows = [];
    for (let from = 0; from < max; from += pageSize) {
      const to = Math.min(from + pageSize, max) - 1;
      const batch = await withRetry(`GET ${pathname.split('?')[0]} [${from}-${to}]`, async () => {
        const res = await fetch(`${url}/rest/v1/${pathname}`, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Range: `${from}-${to}`,
            'Range-Unit': 'items',
          },
        });
        if (!res.ok) {
          throw Object.assign(new Error(`${res.status} ${(await res.text()).slice(0, 200)}`), { http: true });
        }
        return res.json();
      });
      rows.push(...batch);
      if (batch.length < to - from + 1) break; // last page
    }
    return rows;
  };
}

module.exports = { loadEnv, supabaseRest, supabaseSelectAll, withRetry };
