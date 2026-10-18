import { getSiteSettings, getSiteLanguages } from '@/marketplace/db/queries/site';
import { normalizeHex } from '@/marketplace/lib/theme';
import { BRAND_FALLBACK } from '@/marketplace/lib/sitePages';

/**
 * /manifest.webmanifest — what an installed app is called and coloured.
 *
 * It was public/manifest.json: a flat file carrying the name "Sauda", the
 * sentence "New and used cars from verified showrooms." and the hex #0B6B3A.
 * Every one of those three now lives in Admin → Settings, so the file said
 * whatever was true the day it was written and nothing changed it afterwards —
 * rename the marketplace or repaint it and the installed app kept the old name
 * on the Home Screen and the old colour behind the status bar.
 *
 * As a route it is computed from the same cached reads the pages make.
 *
 * `start_url` follows the site's DEFAULT language rather than being pinned to
 * Arabic: an English-first deployment should not open its installed app in a
 * language its owner does not read.
 */
export default async function manifest() {
  const [site, langs] = await Promise.all([
    getSiteSettings().catch(() => null),
    getSiteLanguages().catch(() => null),
  ]);

  const locale = langs?.defaultLocale ?? 'ar';
  const name = (locale === 'en' ? site?.name?.en : site?.name?.ar) || BRAND_FALLBACK.name[locale === 'en' ? 'en' : 'ar'];
  const description =
    (locale === 'en' ? site?.tagline?.en : site?.tagline?.ar) || site?.tagline?.en || undefined;

  return {
    name,
    short_name: name,
    description,
    start_url: `/${locale}/marketplace`,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: normalizeHex(site?.theme?.primary, '#0B6B3A'),
    /* The installed icons stay files. They are artwork, not settings: a PNG
       cannot be derived from a hex, and a favicon an admin uploads is 32px —
       the wrong thing entirely for a 512px Home Screen tile. */
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
