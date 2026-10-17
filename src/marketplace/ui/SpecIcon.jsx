/* eslint-disable @next/next/no-img-element */

/**
 * A catalog icon.
 *
 * One component for every place a spec or category mark is drawn — the car
 * page's tiles and groups, the card's fact row, the compare table and the
 * seller's spec editor — so how these are rendered is one decision rather
 * than six copies of an <img>.
 *
 * ── It was a CSS mask, and that was wrong ───────────────────────────────────
 *
 * The attraction of a mask was that the colour came from the theme: paint the
 * silhouette with `bg-brand-primary` and an admin changing the brand colour
 * changes every icon, with no file rewritten.
 *
 * It only works for a single-colour glyph, and these are not. They are TWO
 * tone — a filled hexagon with the symbol knocked out of it in white — and a
 * mask reads alpha, not colour, so hexagon and symbol are equally opaque and
 * both get painted. Every one of them rendered as a solid green hexagon with
 * the symbol gone. The handful that did survive were the few drawn as open
 * outlines, which is what made it look like a partial failure rather than the
 * wrong technique.
 *
 * ── So the colour lives in the FILE, and the importer owns it ───────────────
 *
 * mirror-assets.cjs recolours on the way in, and recolours only the inks that
 * are not white: the hexagon takes the brand colour, the symbol stays white.
 * Changing the brand colour therefore means re-running that script — a real
 * cost, stated here rather than hidden:
 *
 *     node src/marketplace/db/import/mirror-assets.cjs --refresh
 *
 * The alternative that keeps both — two-tone art AND a live theme — is to
 * inline the SVG and give its parts `currentColor`, which means parsing and
 * emitting markup from a bucket on every render. That is a bigger change than
 * an icon deserves, and it is the thing §28's no-stored-HTML rule exists to
 * keep out of this codebase.
 */
export default function SpecIcon({ src, className = '', alt = '' }) {
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
