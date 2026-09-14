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
    ],
  },
};

export default withNextIntl(nextConfig);
