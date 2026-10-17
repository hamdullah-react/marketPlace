/**
 * The red "SOLD OUT" swing tag.
 *
 * A pill saying "Sold out" is a system message; a tag tied to the car is the
 * thing a showroom actually hangs on one, and it is recognised at a size where
 * nobody would stop to read a label. That matters here because the mark sits
 * in the corner of a 96px-tall photo in a grid of eight — it has to survive
 * being glanced at, not read.
 *
 * ── Drawn, not an image ─────────────────────────────────────────────────────
 *
 * An SVG rather than a PNG, for three reasons that all cost something in a
 * grid: no request, no second asset to ship at 2x and 3x, and it stays crisp
 * from the 36px corner mark to the 64px one on the car page. It also carries
 * no licence — the reference for this was a stock photograph, and a stock
 * photograph is exactly the kind of thing that quietly ends up in production
 * and then in a letter.
 *
 * ── textLength, deliberately ────────────────────────────────────────────────
 *
 * Both lines are drawn with an explicit textLength, so the words are fitted to
 * the tag instead of trusting a font metric. The site ships in two languages
 * and two font stacks, and "SOLD" in a fallback font — or الـ"البيع" in Noto —
 * is otherwise free to overrun the red and sit on the photo.
 */

export default function SoldTag({ locale = 'en', className = '' }) {
  const isAr = locale === 'ar';
  const label = isAr ? 'تم البيع' : 'Sold out';

  /* Two short lines rather than one long one: the tag is portrait, and a tag
     wider than it is tall stops reading as a tag. */
  const [top, bottom] = isAr ? ['تم', 'البيع'] : ['SOLD', 'OUT'];

  return (
    <svg
      viewBox="0 0 72 96"
      className={className}
      role="img"
      aria-label={label}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{label}</title>

      {/* The string. Drawn first so the tag body covers its lower half and it
          reads as passing THROUGH the hole rather than sitting behind it. */}
      {/* ry carries the loop's bottom BELOW the rim of the hole, so the
          string reads as threaded through it rather than resting above it. */}
      <ellipse cx="36" cy="13" rx="6.5" ry="11.5" stroke="#111827" strokeWidth="2.2" />

      {/* The hole is a real hole — the photo shows through it. A white disc
          would read as a sticker the moment the car behind it is pale. */}
      <mask id="sold-tag-hole" maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="96">
        <rect width="72" height="96" fill="#fff" />
        <circle cx="36" cy="30" r="4.4" fill="#000" />
      </mask>

      <g mask="url(#sold-tag-hole)">
        {/* Body. The rounded corners are the stroke, not a path: a 5-unit
            round-joined stroke in the fill colour rounds every vertex of the
            hexagon at once, where hand-written arcs would be six more numbers
            to keep in step. */}
        <polygon
          points="36,20 62,34 62,74 36,88 10,74 10,34"
          fill="#D62828"
          stroke="#D62828"
          strokeWidth="5"
          strokeLinejoin="round"
        />

        {/* The stitching. It is what makes the shape read as a leather tag
            rather than as a red hexagon. */}
        <polygon
          points="36,27 56,38 56,70 36,81 16,70 16,38"
          stroke="#fff"
          strokeWidth="1.1"
          strokeDasharray="3.5 3"
          strokeLinejoin="round"
          opacity="0.9"
        />
      </g>

      {/* A darker ring in the hole, so the punch has a thickness to it. */}
      <circle cx="36" cy="30" r="4.4" stroke="#9B1C1C" strokeWidth="1.6" />

      <g fill="#fff" fontFamily="inherit" fontWeight="900" textAnchor="middle">
        <text x="36" y="56" fontSize="17" textLength={isAr ? 26 : 36} lengthAdjust="spacingAndGlyphs">
          {top}
        </text>
        <text x="36" y="73" fontSize="17" textLength={isAr ? 36 : 26} lengthAdjust="spacingAndGlyphs">
          {bottom}
        </text>
      </g>
    </svg>
  );
}
