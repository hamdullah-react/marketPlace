/**
 * Thumbnail URLs for marketplace media.
 *
 * Nothing here generates or stores a second file. Supabase Storage can resize
 * on request: swapping `/object/public/` for `/render/image/public/` and adding
 * width/height serves a transformed copy from the CDN. A 3 MB phone photo in a
 * 96px grid cell was previously downloaded at full size and scaled by the
 * browser — the pixels were thrown away after crossing the network, and a
 * gallery of 40 photos cost over 100 MB.
 *
 * Verified against this project: /render/image/public/... returns 200 with the
 * resized bytes. If the transform ever becomes unavailable the original URL is
 * returned unchanged, so callers degrade to the old behaviour rather than to a
 * broken image.
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
  icon: { width: 64, height: 64, resize: 'contain' },
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
 * @param url    a Supabase public object URL
 * @param size   a THUMB preset, or an explicit {width, height, resize, quality}
 * @returns      a transformed URL, or the input untouched when it is not a
 *               Supabase public object (an external CDN image, a data: URI,
 *               an empty value)
 */
export function thumbUrl<T extends string | null | undefined>(
  url: T,
  size: ThumbSize = THUMB.grid,
): T | string {
  if (typeof url !== 'string' || !url) return url;
  if (!url.includes('/storage/v1/object/public/')) return url;

  const { width, height, resize = 'cover', quality } = size ?? {};
  const transformed = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');

  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));
  if (resize) params.set('resize', resize);
  if (quality) params.set('quality', String(quality));

  // The object path can already carry a query string (a cache-buster, say).
  return `${transformed}${transformed.includes('?') ? '&' : '?'}${params.toString()}`;
}
