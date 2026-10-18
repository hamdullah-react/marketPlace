import NextImage from 'next/image';

/**
 * next/image, with the two things that otherwise stop it being usable here.
 *
 * ── Why a wrapper and not next/image directly ──────────────────────────────
 *
 * `<Image>` REFUSES to render without `width` and `height`, or `fill`. That is
 * the right default for a page being written from scratch and the wrong one
 * for forty existing call sites whose size is already decided by a className —
 * `h-10 w-auto`, `h-full w-full object-contain`, a grid cell. Converting each
 * by hand would mean inventing an intrinsic size per image and getting some of
 * them wrong, silently, in a way only a stretched photo would reveal.
 *
 * So the size here is a BUDGET, not a layout instruction: it tells the
 * optimiser the largest width worth fetching, and CSS goes on deciding how big
 * the picture actually is. 512 covers every thumbnail, avatar and logo on this
 * platform; anything larger — a gallery frame, a hero — passes its own.
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
    <NextImage
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized={unoptimized}
      {...rest}
    />
  );
}
