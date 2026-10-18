/** @type {import('next').NextConfig} */
import createNextIntlPlugin from 'next-intl/plugin';

// Picks up src/i18n/request.js by convention — same file, same path as the
// parent repo, so nothing inside the copied tree had to change.
const withNextIntl = createNextIntlPlugin();

/**
 * The storage host, from whichever Supabase the app is pointed at.
 *
 * This was the hosted project's hostname, typed in. next/image refuses any
 * host not on this list, so the day the app is pointed at a different Supabase
 * — self-hosted, staging, anything — every uploaded photo 400s through the
 * optimiser while the database, the auth and the uploads themselves all work
 * perfectly. The failure looks like broken images and nothing in the server
 * log says why.
 *
 * Derived instead, so the allowlist cannot disagree with the connection.
 * Next loads the .env files before it evaluates this file, so the value is
 * here at build time; on a host like Coolify or Vercel it comes from the
 * project's own environment, which is where it should come from.
 *
 * Protocol and port are taken from the URL as well: a self-hosted instance
 * reached over http://host:8000 is an ordinary case while a domain is being
 * set up, and hardcoding 'https' would reject it.
 */
function marketplaceStorageHost() {
  const raw =
    process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL || process.env.MARKETPLACE_SUPABASE_URL;
  if (!raw) return [];

  try {
    const u = new URL(raw);
    return [
      {
        protocol: u.protocol.replace(':', ''),
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: '/storage/v1/object/public/**',
      },
    ];
  } catch {
    // A malformed URL must not take the build down over an image host; the
    // app's own env check reports it in a sentence somebody can act on.
    return [];
  }
}

const nextConfig = {
  // Both carried over from the parent repo deliberately.
  //
  // cacheComponents is not a performance toggle here, it is a DIALECT: the
  // marketplace code is written against it. `'use cache'`, cacheLife(), and
  // the rule that a non-deterministic call (new Date(), Math.random()) must
  // sit inside a cached scope or behind connection() are all load-bearing in
  // the copied queries. Turning it off would not slow this app down, it would
  // change what the code means.
  //
  cacheComponents: true,

  // ── How large a server action's body may be ────────────────────
  //
  // The default is 1 MB, and leaving it there quietly broke every upload that
  // goes through an action rather than a route handler: a chat attachment and a
  // payment receipt are both FormData on a server action, and both declare
  // their own size limits — 10 MB and 8 MB — that could never be reached. The
  // framework rejected the request before the action ran, so the careful
  // "that file is over 8MB" message was unreachable and what a seller actually
  // saw was an opaque failure.
  //
  // 24 MB covers the largest legitimate body: one chat message carrying several
  // attachments, capped in the action at MAX_TOTAL_BYTES, plus multipart
  // overhead. It is a CEILING, not a target — the real limits are the ones in
  // the actions, which produce a sentence somebody can act on.
  //
  // Route handlers (listing photos, /api/marketplace/upload) are unaffected;
  // this governs server actions only.
  //
  // UNDER experimental, which is where Next reads it from — it sat at the top
  // level and the build said so on every run:
  //
  //   ⚠ Invalid next.config.mjs options detected:
  //   ⚠   Unrecognized key(s) in object: 'serverActions'
  //
  // An unrecognised key is ignored, so the limit was never 24 MB: it was the
  // 1 MB default, and the careful "that file is over 8MB" messages in the
  // actions were unreachable because the framework rejected the request before
  // the action ran.
  experimental: {
    serverActions: {
      bodySizeLimit: '24mb',
    },

    // ── The React Compiler's Rust port, instead of the Babel transform ──
    //
    // reactCompiler below says WHETHER the compiler runs; this says WHICH
    // implementation does it. The Babel path hands every file with JSX or a
    // hook to babel-plugin-react-compiler over in Node; this runs the same
    // compiler as native code inside Turbopack, with no Node round trip.
    //
    // It is a build-time change and nothing else. The output is the same
    // compiler's output, so no component memoises differently because of this
    // line — if the build is green, the app is unchanged.
    //
    // Introduced in 16.3.0 and we are on 16.3.3, so it exists here; it would
    // have thrown on the version this note was first written against. Still
    // flagged experimental, and it is Turbopack-only — it THROWS under
    // webpack rather than falling back. That is fine: Next 16 runs Turbopack
    // by default for both `next dev` and `next build`, and neither script
    // passes --webpack.
    //
    // babel-plugin-react-compiler is now redundant and stays in
    // devDependencies on purpose: it is the only thing that would make a
    // `--webpack` build work at all, and it costs nothing at runtime.
    turbopackRustReactCompiler: true,
  },

  // ── React Compiler, ON ─────────────────────────────────────────────────
  //
  // This was false, with a note saying that flipping it on is a real change
  // and belongs in its own commit, measured. That is still true and this is
  // that commit.
  //
  // What it does: memoises components and hook results automatically, so
  // useMemo/useCallback stop being the way you buy re-render stability. The
  // existing ones are not wrong and were not removed — the compiler is
  // designed to leave hand-written memoisation alone.
  //
  // The precondition was the Rules of React, which the compiler assumes rather
  // than checks at runtime: a component built during render, a ref written
  // during render or a Math.random() in a render body all produce code the
  // compiler may memoise incorrectly. eslint-plugin-react-hooks reported 58 of
  // those and they are now zero — that clean-up is what made this safe to turn
  // on, not the config line.
  //
  // Next only applies it to files with JSX or hooks, so the build cost is
  // localised. It no longer runs through babel-plugin-react-compiler:
  // experimental.turbopackRustReactCompiler above now selects the native Rust
  // port, which is what this note said was worth revisiting.
  reactCompiler: true,

  images: {
    formats: ['image/avif', 'image/webp'],

    /* ── 31 days, not the 4-hour default ───────────────────────────────────
     *
     * The storage bucket answers every object with `Cache-Control: no-cache`.
     * Per the image docs the optimised copy's max-age is "either the
     * minimumCacheTTL or the upstream image Cache-Control header, whichever is
     * larger" — so upstream is saying the smallest possible thing and this
     * value is the only one that counts.
     *
     * At the 4-hour default the optimiser goes back to origin for a photo
     * nobody has changed, re-downloads it and re-encodes it to AVIF, six times
     * a day, per size, per format. That work lands inside the LCP: the request
     * is same-origin so the browser is not waiting on a connection, it is
     * waiting on us to produce the file. It is most of the 1,350 ms "resource
     * load duration" the audit attributes to the LCP image.
     *
     * The docs warn to keep this LOW because there is no cache invalidation.
     * That warning does not apply here: uploads are content-addressed
     * (b540de2afd934200-suzuki-jimny-…-f46f9f.jpg), so replacing a photo
     * produces a new URL rather than new bytes behind an old one. There is
     * nothing to invalidate.
     */
    minimumCacheTTL: 2678400,
    remotePatterns: [
      // Where the marketplace's own uploads live — whichever Supabase this
      // deployment points at. The one host this app cannot work without.
      ...marketplaceStorageHost(),
      /* The ORIGINAL hosted project, kept on purpose while the move to the
         self-hosted instance settles: every `media_assets.url` and every entry
         in `listings.media` holds an absolute URL that was written against
         this host, so they go on resolving here until those rows are rewritten.
         Delete this line once they have been — an allowlisted host is a
         standing permission to optimise and serve anything from it. */
      { protocol: 'https', hostname: 'cwfojlepmzamhgeejugr.supabase.co', pathname: '/storage/v1/object/public/**' },
      // The dealership CDN. Kept because catalog rows (brand logos, template
      // imagery) still point at it; a listing photo does not.
      { protocol: 'https', hostname: 'cdn.alromaihcars.com' },
      { protocol: 'https', hostname: 'alromaih.b-cdn.net' },
      { protocol: 'https', hostname: 'alromaih-cdn.b-cdn.net' },
      // PLACEHOLDER ART ONLY — the hero carousel's stand-in photography.
      // Delete this line together with the stock URLs in
      // (browse)/_components/heroSlides.js, the day the admin supplies real
      // hero images. An allowlisted host is a standing permission to optimise
      // and serve anything from it, so it should not outlive what it was for.
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default withNextIntl(nextConfig);
