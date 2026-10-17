/**
 * A catalog icon, coloured by the THEME rather than by the file.
 *
 * ── Why this is not an <img> ────────────────────────────────────────────────
 *
 * These marks arrive from a catalog with a colour baked into them —
 * `fill="#46194F"`, the dealership's purple — and an <img> cannot be
 * recoloured by CSS, so a purple icon sat on every green tile.
 *
 * The obvious repair is to rewrite the file's fill on the way in, and that is
 * what the importer first did. It is wrong for one reason that matters: the
 * brand colour is a SETTING. An admin changes it on Settings → Appearance and
 * every token on the site follows — except a colour painted into a file in a
 * bucket, which stays whatever it was on the day it was copied. The icons
 * would silently drift out of the theme, and nothing on screen would say why.
 *
 * ── A mask, so the colour is CSS ────────────────────────────────────────────
 *
 * The SVG is used as a mask-image and the colour is an ordinary background,
 * `bg-brand-primary` — a token that resolves to whatever the theme currently
 * says. Change the brand colour in the admin and these change with it, with
 * no re-import and no second copy of the file.
 *
 * It also means the file's own colour stops mattering: a mask reads the ALPHA
 * channel, so the shape is taken and the paint is discarded. A catalog icon
 * in any colour, from any source, renders in this platform's.
 *
 * ── What this must NOT be used for ──────────────────────────────────────────
 *
 * Anything whose own colours carry meaning — a brand logo, a colour swatch, a
 * photograph. A mask flattens every one of those to a single-colour
 * silhouette. Those stay <img>.
 */
export default function SpecIcon({ src, className = '', title }) {
  if (!src) return null;

  /* Quoted and encoded: the value goes into a CSS url(), and a stray quote or
     bracket in a filename would end the declaration early. */
  const url = `url("${encodeURI(src).replace(/"/g, '%22')}")`;

  return (
    <span
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
      className={`inline-block shrink-0 bg-brand-primary dark:bg-brand-on-dark ${className}`}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}
