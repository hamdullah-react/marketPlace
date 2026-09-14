/**
 * Thumbnail URLs for marketplace media.
 *
 * Nothing here generates or stores a second file. The resize happens on request,
 * and the point is the same either way: a 3 MB phone photo in a 96px grid cell
 * used to be downloaded at full size and scaled by the browser — the pixels were
 * thrown away after crossing the network, and a gallery of 40 photos cost over
 * 100 MB.
 *
 * ── Two resizers, and which one runs ─────────────────────────────────────────
 *
 *   DEFAULT  Next's own image optimizer, /_next/image. Resizes on our server,
 *            serves AVIF or WebP, caches the result. Needs nothing enabled
 *            anywhere — the Supabase host is already in next.config's
 *            remotePatterns for /storage/v1/object/public/**.
 *
 *   OPT-IN   Supabase Storage's /render/image/ transform, when
 *            NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS=1. It is a PAID add-on.
 *
 * This used to call the Supabase transform unconditionally, and its comment
 * said two things that had stopped being true: that the endpoint returned 200
 * for this project, and that the original URL would be returned if the
 * transform became unavailable. The first was true once. The second never was
 * — a URL builder cannot know at runtime whether the feature is on, so it
 * rewrote every URL regardless. Once the add-on was off, every call answered
 *
 *     403  {"error":"FeatureNotEnabled","message":"feature not enabled for this tenant"}
 *
 * and every thumbnail in the app broke at once: the media library, the image
 * picker, the listing form, the catalog icons, and the public listing gallery
 * buyers see. Only the originals, never passed through here, kept working.
 *
 * So the working resizer is the default, and the paid one is something you
 * switch on deliberately once you have confirmed it is enabled.
 */

/**
 * A transform request. Every field optional because the presets differ — only
 * some set `quality` — and a caller may pass its own partial size.
 */
export type ThumbSize = {
  width?: number;
  height?: number;
  resize?: string;
  quality?: number;
};

/** Sizes used across the dashboard. Keep the list short — each is a cache key. */
export const THUMB = {
  // 128 rather than 64: rendered at up to 64 CSS px, so 128 is sharp on a 2x
  // screen — the same reasoning the gallery preset below spells out.
  icon: { width: 128, height: 128, resize: 'contain' },
  grid: { width: 240, height: 240, resize: 'cover' },
  card: { width: 480, height: 360, resize: 'cover' },
  // Gallery strip: rendered at 80x64 CSS px, so 160x128 covers a 2x screen and
  // nothing more. These used to load the FULL upload — twenty-five 200KB JPEGs
  // to fill a row of thumbnails.
  gallery: { width: 160, height: 128, resize: 'cover', quality: 70 },
  // The main gallery frame. `contain` because a car shot must not be cropped,
  // and 1600 wide covers the largest the frame ever gets on a 2x display.
  hero: { width: 1600, height: 1200, resize: 'contain', quality: 80 },
};

/**
 * What Next's optimizer will accept, straight from its defaults
 * (next/dist/docs/.../components/image.md): imageSizes then deviceSizes. A
 * width outside this list is rejected, so a preset's width is rounded UP to
 * the nearest entry — never down, which would serve a blurry thumbnail.
 *
 * If next.config.mjs ever sets its own imageSizes or deviceSizes, this list
 * must change with it.
 */
const NEXT_WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

/**
 * The only quality Next 16 serves without configuration. `images.qualities`
 * defaults to [75], and anything else was measured failing: q=80 returns 400.
 * The presets' own `quality` values apply to the Supabase path only.
 */
const NEXT_QUALITY = 75;

/**
 * Read as a LITERAL process.env.NEXT_PUBLIC_ expression: this module runs in
 * client components, and the bundler only inlines a public variable it can see
 * written out in full.
 */
const SUPABASE_TRANSFORMS = process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS === '1';

function nextWidth(width: number): number {
  return NEXT_WIDTHS.find((w) => w >= width) ?? 3840;
}

/**
 * @param url    a Supabase public object URL
 * @param size   a THUMB preset, or an explicit {width, height, resize, quality}
 * @returns      a resized URL, or the input untouched when it is not a Supabase
 *               public object (an external CDN image, a data: URI, an empty
 *               value). Those are left alone on purpose: routing an arbitrary
 *               host through /_next/image would 400 for any host that is not
 *               in remotePatterns.
 */
export function thumbUrl<T extends string | null | undefined>(
  url: T,
  size: ThumbSize = THUMB.grid,
): T | string {
  if (typeof url !== 'string' || !url) return url;
  if (!url.includes('/storage/v1/object/public/')) return url;
  // SVGs are vectors: there is nothing to resize, and Next's optimizer refuses
  // them outright ("image type is not allowed", 400) unless dangerouslyAllowSVG
  // is on. Half the brand logos and every category icon are SVG, so these go
  // straight to the original file.
  if (/\.svg(\?|#|$)/i.test(url)) return url;

  const { width, height, resize = 'cover', quality } = size ?? {};

  if (!SUPABASE_TRANSFORMS) {
    // Width only: Next's optimizer keeps the aspect ratio and never crops. The
    // <img> elements that use this already crop or letterbox with object-cover
    // and object-contain, so `height` and `resize` have nothing to add here.
    const w = nextWidth(width ?? 256);
    return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${NEXT_QUALITY}`;
  }

  const transformed = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');

  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));
  if (resize) params.set('resize', resize);
  if (quality) params.set('quality', String(quality));

  // The object path can already carry a query string (a cache-buster, say).
  return `${transformed}${transformed.includes('?') ? '&' : '?'}${params.toString()}`;
}
