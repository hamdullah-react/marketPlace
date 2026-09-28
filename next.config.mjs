/** @type {import('next').NextConfig} */
import createNextIntlPlugin from 'next-intl/plugin';

// Picks up src/i18n/request.js by convention — same file, same path as the
// parent repo, so nothing inside the copied tree had to change.
const withNextIntl = createNextIntlPlugin();

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
  serverActions: {
    bodySizeLimit: '24mb',
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
  // Runs through babel-plugin-react-compiler (a devDependency). Next only
  // applies it to files with JSX or hooks, so the build cost is localised.
  // experimental.turbopackRustReactCompiler would run the native Rust port
  // instead and is faster, but it is experimental — worth revisiting.
  reactCompiler: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Where the marketplace's own uploads live — DB2's storage bucket. This
      // is the one host this app cannot work without.
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
