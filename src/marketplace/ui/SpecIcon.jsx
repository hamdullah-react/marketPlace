import Img from '@/marketplace/ui/Img';

/**
 * A catalog icon, painted in the CURRENT brand colour.
 *
 * One component for every place a spec or category mark is drawn — the car
 * page's tiles and groups, the listing card's fact row, the compare table and
 * the seller's spec editor — so how these are coloured is one decision rather
 * than six copies of an image tag.
 *
 * ── The colour is resolved per REQUEST, not per import ─────────────────────
 *
 * An SVG of ours is served through /api/marketplace/icon, which substitutes
 * the brand colour from site_settings as it hands the file over. So changing
 * the colour on Settings → Appearance changes every icon on the next load,
 * with no script to re-run and no second copy of any file.
 *
 * Two cheaper approaches were tried and are wrong, both because these icons
 * are TWO TONE — a filled hexagon with the symbol knocked out in white:
 *
 *   · a CSS mask reads ALPHA, so hexagon and symbol are painted alike and the
 *     symbol disappears. Every icon became a solid block.
 *   · recolouring the FILE at import works and then freezes: the colour is a
 *     setting, and a file in a bucket cannot follow it.
 *
 * ── What is NOT sent through the route ─────────────────────────────────────
 *
 * Anything that is not an SVG in our own storage is rendered as it is. A
 * raster icon has nothing to substitute, and a URL on somebody else's host is
 * refused by the route anyway — it only accepts this deployment's bucket, so
 * it cannot be used as an open proxy.
 */

/** Our own storage, which is the only thing the route will serve. */
function isOurSvg(src) {
  if (!/\.svg($|\?)/i.test(src)) return false;

  /* Either name — see the route for why a precedence rule between the
     build-time and runtime variables refuses everything when they differ. */
  const bases = [
    process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL,
    process.env.MARKETPLACE_SUPABASE_URL,
  ].filter(Boolean);

  return bases.some((b) => src.startsWith(`${b.replace(/\/$/, '')}/storage/v1/object/public/`));
}

export default function SpecIcon({ src, className = '', alt = '' }) {
  if (!src) return null;

  const href = isOurSvg(src)
    ? `/api/marketplace/icon?u=${encodeURIComponent(src)}`
    : src;

  return (
    <Img
      src={href}
      alt={alt}
      loading="lazy"
      className={`shrink-0 object-contain ${className}`}
      /**
       * UNOPTIMISED, and this is the one icon on the platform where it has to
       * be said out loud.
       *
       * Next skips the optimiser by itself for a URL ending in `.svg`. This
       * one does not end in .svg — it is `/api/marketplace/icon?u=…`, because
       * the colour is substituted per request — so the optimiser would fetch
       * it, find `image/svg+xml` and refuse it with a 400, and every spec icon
       * on the site would disappear at once.
       *
       * There is nothing to optimise anyway: a vector is a vector at every
       * size, and the route already caches its own output.
       */
      unoptimized
    />
  );
}
