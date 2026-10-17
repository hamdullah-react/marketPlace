import { getSiteSettings } from '@/marketplace/db/queries/site';
import { normalizeHex } from '@/marketplace/lib/theme';

/**
 * Serves a catalog icon painted in the CURRENT brand colour.
 *
 *   /api/marketplace/icon?u=<url of an SVG in our own storage>
 *
 * ── Why a route and not a file, a mask, or an inline <svg> ─────────────────
 *
 * These icons are TWO TONE: a filled hexagon with the symbol knocked out of
 * it in white. That one fact rules out the two cheaper answers.
 *
 *   A CSS mask reads ALPHA, not colour, so hexagon and symbol are equally
 *   opaque and both get painted — every icon renders as a solid shape with
 *   the symbol gone. Tried; that is exactly what it did.
 *
 *   Recolouring the FILE on the way in works and is not dynamic: the brand
 *   colour is a setting an admin changes on Appearance, and a colour written
 *   into a file in a bucket stays whatever it was the day it was copied.
 *
 * An inline <svg> with currentColor would give both, and means injecting
 * markup fetched from a bucket into the page. Sellers can upload SVGs, so
 * that is a script-execution path on our own origin — the thing §28's
 * no-stored-HTML rule exists to keep out. This route does the substitution
 * server side and returns an IMAGE, which a browser never executes as part
 * of the page.
 *
 * ── Only our own storage ──────────────────────────────────────────────────
 *
 * `u` is checked against this deployment's Supabase public-object prefix
 * before anything is fetched. Without that the route is an open proxy:
 * anybody could point it at an internal address and read the response
 * through our server.
 */

/** Pure function of (url, colour) once the theme is resolved — cache it hard. */
const DAY = 60 * 60 * 24;

export async function GET(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('u');
  if (!target) return new Response('Missing u', { status: 400 });

  /* BOTH names, not one or the other with a fallback.
     NEXT_PUBLIC_* is inlined at build time and the server-only name is read
     at runtime, so on a deployment where the two ever differ — a build made
     against one database and run against another — a precedence rule silently
     refuses every icon with a 403. Accepting either prefix is correct and
     narrows nothing: both are this deployment's own storage. */
  const bases = [
    process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL,
    process.env.MARKETPLACE_SUPABASE_URL,
  ].filter(Boolean);

  if (!bases.length) return new Response('Not configured', { status: 500 });

  const allowed = bases.map((b) => `${b.replace(/\/$/, '')}/storage/v1/object/public/`);
  if (!allowed.some((prefix) => target.startsWith(prefix))) {
    return new Response('Forbidden host', { status: 403 });
  }

  let settings;
  try {
    settings = await getSiteSettings();
  } catch {
    settings = null;
  }
  const brand = normalizeHex(settings?.theme?.primary, '#0b6b3a');

  let res;
  try {
    res = await fetch(target, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return new Response('Upstream failed', { status: 502 });
  }
  if (!res.ok) return new Response('Upstream failed', { status: 502 });

  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (type !== 'image/svg+xml') {
    // Not an SVG — nothing to recolour. Hand it back untouched rather than
    // refusing: the caller should not have to know which icons are vectors.
    return new Response(res.body, {
      headers: {
        'Content-Type': type || 'application/octet-stream',
        'Cache-Control': `public, max-age=${DAY}, immutable`,
      },
    });
  }

  const svg = recolour(await res.text(), brand);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      /* Short, because the brand colour can change at any moment and this is
         the only thing standing between that change and a stale icon. A day
         on the CDN would mean an admin changing the theme and seeing the old
         colour until tomorrow. */
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Repaint every ink that is not white.
 *
 * White is the SYMBOL — it is knocked out of the hexagon — so painting it
 * too is what turned these into solid blocks the first time. Everything else
 * is the background the symbol sits on.
 *
 * `{3,}` rather than a bounded length: several of these carry a malformed
 * colour (`fill="#46194F332C2B"`, two colours concatenated by whatever
 * exported them), and a bounded pattern skips those entirely.
 *
 * Scripts are stripped as well. Nothing should be able to reach this route
 * with a hostile file — it only accepts our own bucket — but an <img> is not
 * a sandbox we control, and an icon has no use for a script either way.
 */
function recolour(svg, brand) {
  const WHITE = /^#(fff|ffffff)$/i;

  return svg
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(
      /(fill|stroke|stop-color|flood-color)(\s*[=:]\s*)"?(#[0-9a-fA-F]{3,})"?/g,
      (whole, _p, _s, colour) => (WHITE.test(colour) ? whole : whole.replace(colour, brand))
    );
}
