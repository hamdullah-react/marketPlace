import Image from 'next/image';

/**
 * A vector or an inline image — something the optimiser cannot resize.
 *
 * Next already skips optimisation for a src whose path ENDS in `.svg`, so this
 * exists for the two cases that test does not catch: a cache-busted
 * `logo.svg?v=2`, and a URL carrying a fragment. Exported rather than repeated
 * at each call site, because it was repeated at four of them and two of those
 * copies had lost a backslash in transit — `/.svg(?|#|$)/` is not a regex, it
 * is a SyntaxError at module load, and a module that throws while loading
 * surfaces as a ChunkLoadError on the page that imported it.
 */
export function isVector(url) {
  return typeof url === 'string' && /\.svg(\?|#|$)/i.test(url);
}

/**
 * next/image, with a default size so it can be dropped in where an <img> was.
 *
 * ── Why a wrapper and not next/image directly ──────────────────────────────
 *
 * Per the docs (02-components/image.md): "You **must** set both `width` and
 * `height` properties unless the image is statically imported" or has `fill`.
 * That is the right rule for a page written from scratch and an awkward one
 * for eighty existing call sites whose size is already decided by a className
 * — `h-10 w-auto`, `h-full w-full object-contain`, a grid cell. Converting
 * each by hand would mean inventing an intrinsic size per image and getting
 * some of them wrong, silently, in a way only a stretched photo reveals.
 *
 * The docs are also explicit that these two "do not determine the rendered
 * size of the image, which is controlled by CSS" — they are the aspect ratio
 * the browser reserves space with, and the width budget the optimiser serves
 * against. 512 covers every thumbnail, avatar and logo on this platform;
 * anything bigger — a gallery frame, a hero — passes its own.
 *
 * ── What it also gets right by default ─────────────────────────────────────
 *
 *   · an empty src renders NOTHING rather than a broken-image glyph, which is
 *     what half these call sites were hand-writing a ternary for;
 *   · SVG and data: URIs skip the optimiser (Next does this itself, since
 *     dangerouslyAllowSVG is off — stated here because it is the question
 *     everybody asks when they see a logo go through this);
 *   · `alt` defaults to "", so a decorative image is decorative rather than
 *     being read out as a filename. A meaningful image passes its own.
 *
 * ── When to use next/image directly instead ────────────────────────────────
 *
 * When the image fills a positioned box and should be `fill` + `sizes` — a
 * card photo, a banner, a gallery frame. Those are worth writing out, and the
 * card and the storefront banner do.
 */
export default function Img({
  src,
  alt = '',
  width = 512,
  height = 512,
  /* An image from a host that is not in next.config's remotePatterns — a
     showroom's own rich text, say — must skip the optimiser or the render
     throws. The caller knows; this cannot. */
  unoptimized,
  ...rest
}) {
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized={unoptimized}
      {...rest}
    />
  );
}
