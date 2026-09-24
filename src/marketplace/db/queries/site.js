import 'server-only';

/**
 * Website content — branding, languages, home carousel, page SEO, content pages.
 * See the WEBSITE CONTENT section at the end of schema.sql.
 *
 * Two kinds of reader:
 *
 *   get*   PUBLIC. `use cache`, tagged, so the header, footer, metadata and home
 *          page read them on every page for free. The admin actions call
 *          updateTag() on save, so a change shows on the next request.
 *          They never throw — a throw inside a cached scope cancels the render —
 *          and they fall back to the built-in values when the SQL has not run.
 *
 *   read*  ADMIN. Uncached, so an admin always edits the row as it is now, and
 *          `ready: false` tells the page to show the "run the SQL" note.
 */

import { cacheLife, cacheTag } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { isMissingSchema } from './engagement';
import { BRAND_FALLBACK, SITE_TAGS, SEO_PAGE_BY_KEY } from '@/marketplace/lib/sitePages';
import { normalizeTheme } from '@/marketplace/lib/theme';

const LANGUAGE_FALLBACK = [
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl', enabled: true, isDefault: true, sort: 0, updatedAt: null },
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr', enabled: true, isDefault: false, sort: 1, updatedAt: null },
];

const text = (v) => (typeof v === 'string' ? v : '');
const bi = (v) => ({ ar: text(v?.ar), en: text(v?.en) });

function shapeSettings(row, ready) {
  const name = bi(row?.name);
  const tagline = bi(row?.tagline);

  // The showroom rule (settings.locale_fallback): a text missing in one
  // language shows the other one. On unless the admin switched it off.
  const fallback = row?.locale_fallback !== false;
  const fill = (value, builtIn) => ({
    ar: value.ar || (fallback && value.en) || builtIn.ar,
    en: value.en || (fallback && value.ar) || builtIn.en,
  });

  return {
    ready,
    authoringLocale: ['ar', 'en', 'both'].includes(row?.default_locale) ? row.default_locale : 'ar',
    localeFallback: fallback,
    // null = the column does not exist yet (SQL not run) — the footer keeps its
    // built-in links until then. [] = the admin removed them all.
    socialLinks: Array.isArray(row?.social_links) ? row.social_links : null,
    /* Which countries' phone numbers every form accepts (Admin → Settings →
       Contact). [] means any country; a database without the column yet keeps
       the Saudi-only rule the code had before it. */
    phoneCountries: Array.isArray(row?.phone_countries) ? row.phone_countries : ['SA'],
    name: fill(name, BRAND_FALLBACK.name),
    tagline: fill(tagline, BRAND_FALLBACK.tagline),
    logoUrl: row?.logo_url || BRAND_FALLBACK.logoUrl,
    logoDarkUrl: row?.logo_dark_url || null,
    faviconUrl: row?.favicon_url || null,
    contactEmail: row?.contact_email || null,
    contactPhone: row?.contact_phone || null,
    whatsapp: row?.whatsapp || null,
    address: bi(row?.address),
    defaultOgImageUrl: row?.default_og_image_url || null,
    twitterHandle: row?.twitter_handle || null,
    googleSiteVerification: row?.google_site_verification || null,
    bingSiteVerification: row?.bing_site_verification || null,
    heroIntervalMs: Number(row?.hero_interval_ms) || 6000,
    /* Colours, corner radius and shadow strength (Admin → Settings →
       Appearance). Normalised here rather than at the point of use, so a
       missing column or a malformed value is the built-in look instead of a
       broken stylesheet. */
    theme: normalizeTheme(row?.theme),
    /* Where a showroom sends its payment (Admin → Finance). Raw jsonb, shaped
       by lib/billing.js at the point of use rather than here, because the two
       readers want different things from it: the admin's form wants the fields
       to edit, the showroom's page wants to know whether there is anything to
       print at all. */
    billing: row?.billing && typeof row.billing === 'object' ? row.billing : {},
    /* How long a new showroom's free period is (Admin → Subscriptions). The
       DATABASE is what applies it — a trigger on insert reads the column — so
       this copy is for the form that edits it and the screens that quote it. */
    trialDays: Number.isFinite(Number(row?.trial_days)) ? Number(row.trial_days) : 30,
    /* What the PLATFORM bills in (Admin → Settings → Language). Normalised to
       an upper-case ISO code here so that every screen can hand it straight to
       Intl without each one re-checking it, and so a database on which the
       CURRENCY section has not been run still renders prices. */
    currency: /^[A-Za-z]{3}$/.test(String(row?.currency ?? ''))
      ? String(row.currency).toUpperCase()
      : 'SAR',
  };
}

function shapeLanguages(rows, ready) {
  const languages = rows?.length
    ? rows.map((r) => ({
        code: r.code,
        label: r.label,
        nativeLabel: r.native_label,
        dir: r.dir,
        enabled: r.enabled !== false,
        isDefault: r.is_default === true,
        sort: r.sort ?? 0,
        updatedAt: r.updated_at ?? null,
      }))
    : LANGUAGE_FALLBACK;

  const enabled = languages.filter((l) => l.enabled).map((l) => l.code);
  const safe = enabled.length ? enabled : ['ar'];
  const defaultLocale = languages.find((l) => l.isDefault && l.enabled)?.code ?? safe[0];
  return { ready, languages, enabled: safe, defaultLocale };
}

const shapeSlide = (r) => ({
  id: r.id,
  title: bi(r.title),
  description: bi(r.description),
  alt: bi(r.alt),
  image: r.image_url,
  sort: r.sort ?? 0,
  active: r.active !== false,
  updatedAt: r.updated_at ?? null,
});

/* ── Public, cached ────────────────────────────────────────────────────────── */

export async function getSiteSettings() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.settings);

  const { data, error } = await getMarketplaceDb()
    .from('site_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();

  return shapeSettings(error ? null : data, !error);
}

export async function getSiteLanguages() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.languages);

  const { data, error } = await getMarketplaceDb()
    .from('site_languages')
    .select('*')
    .order('sort', { ascending: true });

  return shapeLanguages(error ? null : data, !error);
}

/** Visible slides, in order. `ready: false` means the table does not exist yet. */
export async function getHeroSlides() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.hero);

  const { data, error } = await getMarketplaceDb()
    .from('hero_slides')
    .select('*')
    .eq('active', true)
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { ready: false, slides: [] };
  return { ready: true, slides: (data ?? []).map(shapeSlide) };
}

/** The customised SEO row for one page, or null when it uses the defaults. */
export async function getPageSeo(key) {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.seo);

  if (!SEO_PAGE_BY_KEY[key]) return null;

  const { data, error } = await getMarketplaceDb()
    .from('page_seo')
    .select('*')
    .eq('page_key', key)
    .maybeSingle();

  return error ? null : data ?? null;
}

/** Every customised SEO row — for the sitemap. */
export async function getAllPageSeo() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.seo);

  const { data, error } = await getMarketplaceDb().from('page_seo').select('*');
  return error ? [] : data ?? [];
}

/** A published content page, or null. */
export async function getSitePage(slug) {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.pages);

  const { data, error } = await getMarketplaceDb()
    .from('site_pages')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (error || !data) return null;
  return { slug: data.slug, title: bi(data.title), body: data.body ?? {}, updatedAt: data.updated_at };
}

/**
 * The marketplace in four numbers, for the About page: live cars, approved
 * showrooms, brands with a car, and cities with a car. Cached for an hour —
 * these are a sense of scale, not a live counter. Zero on any failure.
 */
export async function getMarketplaceStats() {
  'use cache';
  cacheLife('hours');

  const db = getMarketplaceDb();
  const count = (res) => (res.error ? 0 : res.count ?? 0);

  const [cars, vendors, rows] = await Promise.all([
    db.from('listings').select('id', { count: 'exact', head: true }).eq('state', 'live'),
    db.from('vendors').select('id', { count: 'exact', head: true }).eq('state', 'approved').is('deleted_at', null),
    db.from('listings').select('brand_id, city').eq('state', 'live').limit(5000),
  ]);

  const list = rows.error ? [] : rows.data ?? [];
  const brands = new Set(list.map((r) => r.brand_id).filter(Boolean)).size;
  const cities = new Set(list.map((r) => String(r.city ?? '').trim().toLowerCase()).filter(Boolean)).size;

  return { cars: count(cars), vendors: count(vendors), brands, cities };
}

/* ── Admin, uncached ───────────────────────────────────────────────────────── */

const failed = (label, error) => {
  const missing = isMissingSchema(error);
  if (!missing) console.error(`[site] ${label}:`, error.message);
  return missing;
};

export async function readSiteSettings() {
  const { data, error } = await getMarketplaceDb()
    .from('site_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();

  if (error) return { ready: !failed('readSiteSettings', error), row: null };
  return { ready: true, row: data ?? null };
}

export async function readSiteLanguages() {
  const { data, error } = await getMarketplaceDb()
    .from('site_languages')
    .select('*')
    .order('sort', { ascending: true });

  if (error) return shapeLanguages(null, !failed('readSiteLanguages', error));
  return shapeLanguages(data, true);
}

export async function readHeroSlides() {
  const { data, error } = await getMarketplaceDb()
    .from('hero_slides')
    .select('*')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { ready: !failed('readHeroSlides', error), slides: [] };
  return { ready: true, slides: (data ?? []).map(shapeSlide) };
}

export async function readPageSeoRows() {
  const { data, error } = await getMarketplaceDb()
    .from('page_seo')
    .select('page_key, meta_title, seo_index, seo_follow, canonical_url, og_image_url, updated_at');

  if (error) return { ready: !failed('readPageSeoRows', error), rows: [] };
  return { ready: true, rows: data ?? [] };
}

export async function readPageSeo(key) {
  const { data, error } = await getMarketplaceDb()
    .from('page_seo')
    .select('*')
    .eq('page_key', key)
    .maybeSingle();

  if (error) return { ready: !failed('readPageSeo', error), row: null };
  return { ready: true, row: data ?? null };
}

export async function readSitePages() {
  const { data, error } = await getMarketplaceDb()
    .from('site_pages')
    .select('slug, title, body, published, updated_at')
    .order('slug', { ascending: true });

  if (error) return { ready: !failed('readSitePages', error), rows: [] };
  return { ready: true, rows: data ?? [] };
}

export async function readSitePage(slug) {
  const { data, error } = await getMarketplaceDb()
    .from('site_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { ready: !failed('readSitePage', error), row: null };
  return { ready: true, row: data ?? null };
}
