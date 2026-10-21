'use server';

/**
 * Website content — Settings, languages, home carousel, Pages SEO, content pages.
 *
 * Every action re-checks that the caller is an admin, writes through the
 * service-role client, records an audit row, then expires the matching cache
 * tag with updateTag() so the public pages show the change on the next request
 * (read-your-own-writes — see next/dist/docs/.../updateTag.md).
 */

import { revalidatePath, updateTag } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { keywordList } from '@/marketplace/lib/seo';
import { parseSocialLinks } from '@/marketplace/lib/social';
import { PHONE_COUNTRY_BY_CODE } from '@/marketplace/lib/phone';
import { normalizeTheme, isDefaultTheme } from '@/marketplace/lib/theme';
import {
  SITE_TAGS, SEO_PAGE_BY_KEY, CONTENT_PAGE_BY_SLUG, CHANGEFREQ, OG_TYPES, TWITTER_CARDS, pageRoute,
} from '@/marketplace/lib/sitePages';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const flag = (fd, k) => ['on', 'true', '1'].includes(str(fd, k));
const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

/** `nameAr` + `nameEn` → {ar, en}, empties dropped. */
function bilingual(fd, base, max = 2000) {
  const out = {};
  const ar = str(fd, `${base}Ar`).slice(0, max);
  const en = str(fd, `${base}En`).slice(0, max);
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return out;
}

class Invalid extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** An absolute http(s) link, or null for an empty field. */
function webUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Invalid('INVALID_URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Invalid('INVALID_URL');
  return url.toString();
}

/** An uploaded image (absolute URL) or one of the app's own files ("/…"). */
function imageUrl(value) {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return webUrl(value);
}

/** A TagsInput posts JSON; a hand-made post may send commas. */
function keywords(fd, k) {
  const raw = str(fd, k);
  let value = raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) value = parsed;
  } catch {
    /* plain text — keywordList splits it */
  }
  return keywordList(value).map((w) => w.slice(0, 80)).slice(0, 25);
}

/**
 * Opening hours as the Organization graph wants them.
 *
 * [{ days: [1..7], opens: "09:00", closes: "21:00" }] — ISO weekdays, Monday
 * is 1. Anything malformed is DROPPED rather than corrected: a row with no
 * days, or a closing time typed as "9pm", describes hours this business does
 * not keep, and publishing wrong hours is worse than publishing none.
 */
function parseOpeningHours(raw) {
  let sent = [];
  try {
    sent = JSON.parse(typeof raw === 'string' ? raw : '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(sent)) return [];

  const time = /^([01]\d|2[0-3]):[0-5]\d$/;

  return sent
    .map((r) => ({
      days: Array.isArray(r?.days)
        ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort()
        : [],
      opens: String(r?.opens ?? '').trim(),
      closes: String(r?.closes ?? '').trim(),
    }))
    .filter((r) => r.days.length && time.test(r.opens) && time.test(r.closes))
    .slice(0, 7);
}

/** [{ type, phone, email, languages }] — a contactPoint per job. */
function parseContactPoints(raw) {
  let sent = [];
  try {
    sent = JSON.parse(typeof raw === 'string' ? raw : '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(sent)) return [];

  return sent
    .map((p) => ({
      type: String(p?.type ?? '').trim().slice(0, 60),
      phone: String(p?.phone ?? '').trim().slice(0, 40),
      email: String(p?.email ?? '').trim().slice(0, 120),
      languages: Array.isArray(p?.languages)
        ? p.languages.map((l) => String(l).trim().slice(0, 8)).filter(Boolean).slice(0, 5)
        : [],
    }))
    // A contact point with a label and no way to reach anybody is furniture.
    .filter((p) => p.type && (p.phone || p.email))
    .slice(0, 6);
}

/**
 * The measurement ids, each checked against the SHAPE its vendor issues.
 *
 * The same patterns the reader applies (db/queries/site.js), enforced here as
 * well so a bad id is refused at the form rather than silently dropped at
 * render — an admin who pastes a GTM container into the GA4 box should be
 * told, not left watching for data that will never arrive.
 *
 * Ids only, never a <script> — see §32. Nothing in this object is ever
 * rendered as markup; the app builds each tag from the id itself.
 */
const ANALYTICS_IDS = {
  ga4: /^G-[A-Z0-9]{4,20}$/i,
  gtm: /^GTM-[A-Z0-9]{4,20}$/i,
  meta_pixel: /^\d{8,20}$/,
  tiktok_pixel: /^[A-Z0-9]{10,30}$/i,
  snapchat_pixel: /^[A-Za-z0-9-]{10,60}$/,
  clarity: /^[a-z0-9]{6,20}$/i,
};

function analyticsIds(sent) {
  const out = {};
  if (!sent || typeof sent !== 'object') return out;

  for (const [key, pattern] of Object.entries(ANALYTICS_IDS)) {
    const id = String(sent[key] ?? '').trim();
    if (!id) continue;
    if (!pattern.test(id)) throw new Invalid('INVALID_TRACKING_ID');
    out[key] = id;
  }
  return out;
}

const dbFail = (error, fallback = 'SAVE_FAILED') =>
  bad(isMissingSchema(error) ? 'SITE_SETUP' : fallback, { detail: error.message });

async function guard() {
  const { viewer, error } = await adminForAction();
  return error ? { denied: bad(error) } : { viewer };
}

/** Expire a cache tag and re-render the routes that show it. */
function refresh(tag, ...routes) {
  updateTag(tag);
  for (const [route, type] of routes) revalidatePath(route, type);
}

const EVERY_PAGE = ['/[locale]/marketplace', 'layout'];

/* ── Settings ─────────────────────────────────────────────────────────────── */

export async function saveSiteSettings(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  // Settings is tabbed and each tab is its own form, so only the fields a tab
  // actually SENT are written — saving Contact must not blank the logo.
  const has = (k) => formData.has(k);
  const row = { id: true };
  try {
    if (has('nameAr') || has('nameEn')) {
      const name = bilingual(formData, 'name', 80);
      if (!name.ar && !name.en) return bad('SITE_NAME_REQUIRED');
      row.name = name;
    }
    if (has('taglineAr') || has('taglineEn')) row.tagline = bilingual(formData, 'tagline', 200);
    if (has('addressAr') || has('addressEn')) row.address = bilingual(formData, 'address', 300);

    const images = {
      logoUrl: 'logo_url',
      logoDarkUrl: 'logo_dark_url',
      faviconUrl: 'favicon_url',
      defaultOgImageUrl: 'default_og_image_url',
    };
    for (const [field, column] of Object.entries(images)) {
      if (has(field)) row[column] = imageUrl(str(formData, field));
    }

    if (has('contactEmail')) {
      const email = str(formData, 'contactEmail');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('INVALID_EMAIL');
      row.contact_email = email || null;
    }
    if (has('contactPhone')) row.contact_phone = str(formData, 'contactPhone').slice(0, 40) || null;
    if (has('whatsapp')) row.whatsapp = str(formData, 'whatsapp').slice(0, 40) || null;
    if (has('twitterHandle')) row.twitter_handle = str(formData, 'twitterHandle').replace(/^@/, '').slice(0, 50) || null;
    if (has('googleSiteVerification')) {
      row.google_site_verification = str(formData, 'googleSiteVerification').slice(0, 200) || null;
    }
    if (has('bingSiteVerification')) {
      row.bing_site_verification = str(formData, 'bingSiteVerification').slice(0, 200) || null;
    }

    // Languages tab — same two choices as a showroom's Language settings.
    if (has('defaultLocale')) {
      const mode = str(formData, 'defaultLocale');
      row.default_locale = ['ar', 'en', 'both'].includes(mode) ? mode : 'ar';
    }
    if (has('localeFallback')) row.locale_fallback = str(formData, 'localeFallback') === 'true';

    /* What the PLATFORM bills in — promotions, subscriptions, every charge.
       Checked as a SHAPE (three letters) and not against a list of currencies
       we happen to have thought of, because a hardcoded list of allowed codes
       is the same mistake as the hardcoded 'SAR' it replaces, one level up.
       Intl renders an unknown code verbatim rather than throwing, so the worst
       a typo does is show the wrong symbol until it is corrected. */
    if (has('currency')) {
      const code = str(formData, 'currency').toUpperCase();
      if (!/^[A-Z]{3}$/.test(code)) return bad('INVALID_CURRENCY');
      row.currency = code;
    }

    // Contact tab — the same link list a showroom keeps, validated the same way.
    if (has('socialLinks')) row.social_links = parseSocialLinks(formData.get('socialLinks'));

    /* Which countries' phone numbers every form on the site accepts. Checked
       against the known list rather than stored as sent, so a hand-posted
       "ZZ" cannot become a rule nothing can satisfy. An empty list is a real
       answer and means any country. */
    if (has('phoneCountries')) {
      let picked = [];
      try {
        picked = JSON.parse(str(formData, 'phoneCountries') || '[]');
      } catch {
        return bad('SAVE_FAILED');
      }
      row.phone_countries = Array.isArray(picked)
        ? [...new Set(picked.map((c) => String(c).toUpperCase()))].filter((c) => PHONE_COUNTRY_BY_CODE.has(c))
        : [];
    }
    /* Appearance tab — colours, corner radius and shadow strength, posted as
       one JSON field. normalizeTheme() is the same function the page render
       uses, so anything it will not accept (a colour that is not a hex, a
       radius off the offered scale) becomes the default here rather than
       reaching the stylesheet. null when it is the built-in theme, so "reset"
       clears the row instead of storing a copy of the defaults. */
    if (has('theme')) {
      let sent = {};
      try {
        sent = JSON.parse(str(formData, 'theme') || '{}');
      } catch {
        return bad('SAVE_FAILED');
      }
      const theme = normalizeTheme(sent);
      row.theme = isDefaultTheme(theme) ? null : theme;
    }

    /* ── §32: the site's own SEO ─────────────────────────────────────────
     *
     * Same `has()` rule as everything above — the SEO tab posts these and no
     * other tab does, so saving Contact cannot blank them.
     *
     * Every one is nullable and every empty value is stored as null rather
     * than "", because null is what the readers treat as "fall back to what
     * you did before" — an empty string is a title, and it is a blank one.
     */
    if (has('seoTitleAr') || has('seoTitleEn')) row.meta_title = bilingual(formData, 'seoTitle', 200);
    if (has('seoDescriptionAr') || has('seoDescriptionEn')) {
      row.meta_description = bilingual(formData, 'seoDescription', 400);
    }
    if (has('seoKeywordsAr') || has('seoKeywordsEn')) {
      row.meta_keywords = { ar: keywords(formData, 'seoKeywordsAr'), en: keywords(formData, 'seoKeywordsEn') };
    }
    if (has('titleTemplateAr') || has('titleTemplateEn')) {
      const tpl = bilingual(formData, 'titleTemplate', 100);
      /* %s is where the page's own title goes. A template without it would
         give every page on the site the SAME <title>, which is the single
         worst thing a title field can do — so it is refused rather than
         saved and discovered in Search Console three weeks later. */
      for (const value of Object.values(tpl)) {
        if (value && !value.includes('%s')) return bad('TITLE_TEMPLATE_NEEDS_S');
      }
      row.title_template = tpl;
    }
    if (has('siteOgType')) {
      const value = str(formData, 'siteOgType');
      row.og_type = OG_TYPES.includes(value) ? value : 'website';
    }
    if (has('siteTwitterCard')) {
      const value = str(formData, 'siteTwitterCard');
      row.twitter_card = TWITTER_CARDS.includes(value) ? value : 'summary_large_image';
    }
    if (has('siteSeoIndex')) row.seo_index = flag(formData, 'siteSeoIndex');
    if (has('robotsExtra')) {
      /* One path per line. Normalised here rather than at render time: a
         robots.txt is generated from this verbatim, and a stray "Disallow:"
         prefix typed by somebody copying from a guide would produce
         "Disallow: Disallow: /x" — a line that silently matches nothing. */
      const lines = str(formData, 'robotsExtra')
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^disallow:\s*/i, ''))
        .filter(Boolean)
        .slice(0, 50);
      row.robots_extra = lines.length ? lines.join('\n') : null;
    }

    /* ── The business behind the site ─────────────────────────────────── */
    if (has('legalNameAr') || has('legalNameEn')) row.legal_name = bilingual(formData, 'legalName', 200);
    if (has('crNumber')) row.cr_number = str(formData, 'crNumber').slice(0, 40) || null;
    if (has('vatNumber')) row.vat_number = str(formData, 'vatNumber').slice(0, 40) || null;
    if (has('foundedYear')) {
      const year = Number(str(formData, 'foundedYear'));
      if (str(formData, 'foundedYear') && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
        return bad('INVALID_YEAR');
      }
      row.founded_year = str(formData, 'foundedYear') ? year : null;
    }
    if (has('priceRange')) row.price_range = str(formData, 'priceRange').slice(0, 20) || null;
    if (has('geoLat') || has('geoLng')) {
      const lat = Number(str(formData, 'geoLat'));
      const lng = Number(str(formData, 'geoLng'));
      const given = str(formData, 'geoLat') && str(formData, 'geoLng');
      if (given && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
        return bad('INVALID_COORDINATES');
      }
      row.geo = given ? { lat, lng } : null;
    }
    if (has('openingHours')) row.opening_hours = parseOpeningHours(formData.get('openingHours'));
    if (has('contactPoints')) row.contact_points = parseContactPoints(formData.get('contactPoints'));

    /* ── The remaining verification services ──────────────────────────── */
    for (const [field, column] of Object.entries({
      yandexSiteVerification: 'yandex_site_verification',
      pinterestSiteVerification: 'pinterest_site_verification',
      facebookDomainVerification: 'facebook_domain_verification',
    })) {
      if (has(field)) row[column] = str(formData, field).slice(0, 200) || null;
    }

    /* ── Measurement ──────────────────────────────────────────────────── */
    if (has('analytics')) {
      let sent = {};
      try {
        sent = JSON.parse(str(formData, 'analytics') || '{}');
      } catch {
        return bad('SAVE_FAILED');
      }
      row.analytics = analyticsIds(sent);
    }
  } catch (err) {
    if (err instanceof Invalid) return bad(err.code);
    throw err;
  }

  const { error } = await getMarketplaceDb().from('site_settings').upsert(row, { onConflict: 'id' });
  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.settings.update', 'site_settings', null, null, row);
  refresh(SITE_TAGS.settings, EVERY_PAGE);
  return ok({ saved: true });
}

/* ── Languages ────────────────────────────────────────────────────────────── */

const LANGS = ['ar', 'en'];

export async function setDefaultLanguage(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const code = str(formData, 'code');
  if (!LANGS.includes(code)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  // Clear the old default first: the one-default index would refuse two.
  const { error: clearError } = await db.from('site_languages').update({ is_default: false }).neq('code', code);
  if (clearError) return dbFail(clearError);

  const { data, error } = await db
    .from('site_languages')
    .update({ is_default: true, enabled: true })
    .eq('code', code)
    .select('code')
    .maybeSingle();
  if (error) return dbFail(error);
  if (!data) return bad('NOT_FOUND');

  await writeAudit(viewer, 'site.language.default', 'site_languages', null, null, { code });
  refresh(SITE_TAGS.languages, EVERY_PAGE);
  return ok({ saved: true });
}

export async function setLanguageEnabled(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const code = str(formData, 'code');
  const enabled = str(formData, 'enabled') === 'true';
  if (!LANGS.includes(code)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { data: rows, error: readError } = await db.from('site_languages').select('code, enabled, is_default');
  if (readError) return dbFail(readError);

  const target = rows?.find((r) => r.code === code);
  if (!target) return bad('NOT_FOUND');

  if (!enabled) {
    if (target.is_default) return bad('LANG_DEFAULT_DISABLE');
    if ((rows ?? []).filter((r) => r.enabled).length <= 1) return bad('LANG_LAST_ENABLED');
  }

  const { error } = await db.from('site_languages').update({ enabled }).eq('code', code);
  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.language.enabled', 'site_languages', null, { code, enabled: target.enabled }, { code, enabled });
  refresh(SITE_TAGS.languages, EVERY_PAGE);
  return ok({ saved: true });
}

/* ── Home carousel ────────────────────────────────────────────────────────── */

const HOME = ['/[locale]/marketplace', 'page'];
const BANNERS = ['/[locale]/marketplace/admin/content/banners', 'page'];

export async function saveHeroSlide(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const id = str(formData, 'slideId') || null;
  let row;
  try {
    const image = imageUrl(str(formData, 'imageUrl'));
    if (!image) return bad('SLIDE_IMAGE_REQUIRED');

    const title = bilingual(formData, 'title', 120);
    if (!title.ar && !title.en) return bad('SLIDE_TITLE_REQUIRED');

    row = {
      image_url: image,
      title,
      description: bilingual(formData, 'description', 300),
      alt: bilingual(formData, 'alt', 160),
      active: flag(formData, 'active'),
    };
  } catch (err) {
    if (err instanceof Invalid) return bad(err.code);
    throw err;
  }

  const db = getMarketplaceDb();

  if (id) {
    const { error } = await db.from('hero_slides').update(row).eq('id', id);
    if (error) return dbFail(error);
  } else {
    // New slides go to the end of the carousel.
    const { data: last, error: lastError } = await db
      .from('hero_slides')
      .select('sort')
      .order('sort', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) return dbFail(lastError);

    const { error } = await db.from('hero_slides').insert({ ...row, sort: (last?.sort ?? -1) + 1 });
    if (error) return dbFail(error);
  }

  await writeAudit(viewer, id ? 'site.hero.update' : 'site.hero.create', 'hero_slides', id, null, row);
  refresh(SITE_TAGS.hero, HOME, BANNERS);
  return ok({ saved: true });
}

export async function deleteHeroSlide(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const id = str(formData, 'slideId');
  if (!id) return bad('NOT_FOUND');

  const { error } = await getMarketplaceDb().from('hero_slides').delete().eq('id', id);
  if (error) return dbFail(error, 'DELETE_FAILED');

  await writeAudit(viewer, 'site.hero.delete', 'hero_slides', id, null, null);
  refresh(SITE_TAGS.hero, HOME, BANNERS);
  return ok({ deleted: id });
}

export async function setHeroSlideActive(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const id = str(formData, 'slideId');
  const active = str(formData, 'active') === 'true';
  if (!id) return bad('NOT_FOUND');

  const { error } = await getMarketplaceDb().from('hero_slides').update({ active }).eq('id', id);
  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.hero.visibility', 'hero_slides', id, null, { active });
  refresh(SITE_TAGS.hero, HOME, BANNERS);
  return ok({ saved: true });
}

/** Swaps a slide with its neighbour, renumbering the whole carousel 0…n. */
export async function moveHeroSlide(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const id = str(formData, 'slideId');
  const direction = str(formData, 'direction') === 'up' ? -1 : 1;

  const db = getMarketplaceDb();
  const { data, error: readError } = await db
    .from('hero_slides')
    .select('id, sort')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });
  if (readError) return dbFail(readError);

  const order = (data ?? []).map((r) => r.id);
  const from = order.indexOf(id);
  const to = from + direction;
  if (from < 0) return bad('NOT_FOUND');
  if (to < 0 || to >= order.length) return ok({ saved: false });

  [order[from], order[to]] = [order[to], order[from]];

  const current = new Map((data ?? []).map((r) => [r.id, r.sort]));
  for (const [index, slideId] of order.entries()) {
    if (current.get(slideId) === index) continue;
    const { error } = await db.from('hero_slides').update({ sort: index }).eq('id', slideId);
    if (error) return dbFail(error);
  }

  await writeAudit(viewer, 'site.hero.reorder', 'hero_slides', id, null, { direction });
  refresh(SITE_TAGS.hero, HOME, BANNERS);
  return ok({ saved: true });
}

export async function saveHeroInterval(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const seconds = Number(str(formData, 'seconds'));
  if (!Number.isFinite(seconds) || seconds < 2 || seconds > 30) return bad('HERO_INTERVAL_INVALID');

  const hero_interval_ms = Math.round(seconds * 1000);
  const { error } = await getMarketplaceDb()
    .from('site_settings')
    .upsert({ id: true, hero_interval_ms }, { onConflict: 'id' });
  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.hero.interval', 'site_settings', null, null, { hero_interval_ms });
  refresh(SITE_TAGS.settings, HOME, BANNERS);
  return ok({ saved: true });
}

/* ── Pages SEO ────────────────────────────────────────────────────────────── */

const SEO_ADMIN = ['/[locale]/marketplace/admin/content/seo', 'page'];

export async function savePageSeo(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const key = str(formData, 'pageKey');
  const page = SEO_PAGE_BY_KEY[key];
  if (!page) return bad('PAGE_UNKNOWN');

  let row;
  try {
    const rawData = str(formData, 'structuredData');
    let structured = null;
    if (rawData) {
      try {
        structured = JSON.parse(rawData);
      } catch {
        return bad('SEO_JSON_INVALID');
      }
      if (!structured || typeof structured !== 'object') return bad('SEO_JSON_INVALID');
    }

    const priority = Number(str(formData, 'seoPriority') || page.priority);
    if (!Number.isFinite(priority) || priority < 0 || priority > 1) return bad('SEO_PRIORITY_INVALID');

    const changefreq = str(formData, 'seoChangefreq');
    const ogType = str(formData, 'ogType');
    const twitterCard = str(formData, 'twitterCard');

    row = {
      page_key: key,
      meta_title: bilingual(formData, 'metaTitle', 200),
      meta_description: bilingual(formData, 'metaDescription', 400),
      meta_keywords: { ar: keywords(formData, 'metaKeywordsAr'), en: keywords(formData, 'metaKeywordsEn') },
      focus_keyword: bilingual(formData, 'focusKeyword', 100),
      og_title: bilingual(formData, 'ogTitle', 200),
      og_description: bilingual(formData, 'ogDescription', 400),
      og_image_url: imageUrl(str(formData, 'ogImageUrl')),
      og_type: OG_TYPES.includes(ogType) ? ogType : 'website',
      twitter_card: TWITTER_CARDS.includes(twitterCard) ? twitterCard : 'summary_large_image',
      twitter_title: bilingual(formData, 'twitterTitle', 200),
      twitter_description: bilingual(formData, 'twitterDescription', 400),
      twitter_image_url: imageUrl(str(formData, 'twitterImageUrl')),
      canonical_url: webUrl(str(formData, 'canonicalUrl')),
      seo_index: flag(formData, 'seoIndex'),
      seo_follow: flag(formData, 'seoFollow'),
      seo_changefreq: CHANGEFREQ.includes(changefreq) ? changefreq : page.changefreq,
      seo_priority: Math.round(priority * 10) / 10,
      structured_data: structured,

      /* §32: what the RESULT looks like once the page is listed. Each one is
         left OUT when the switch is in its neutral position, because "no
         directive" and "the default" are different instructions — emitting
         max-image-preview on every page would quietly shrink the photo on
         every car in the results. */
      robots_directives: (() => {
        const out = {};
        if (formData.has('noArchive') && flag(formData, 'noArchive')) out.archive = false;
        if (formData.has('noSnippet') && flag(formData, 'noSnippet')) out.snippet = false;

        const maxSnippet = str(formData, 'maxSnippet');
        if (maxSnippet !== '') {
          const n = Number(maxSnippet);
          if (!Number.isInteger(n) || n < -1 || n > 10_000) throw new Invalid('SEO_SNIPPET_INVALID');
          out.max_snippet = n;
        }

        const preview = str(formData, 'maxImagePreview');
        if (['none', 'standard', 'large'].includes(preview)) out.max_image_preview = preview;

        return out;
      })(),
    };
  } catch (err) {
    if (err instanceof Invalid) return bad(err.code);
    throw err;
  }

  const { error } = await getMarketplaceDb().from('page_seo').upsert(row, { onConflict: 'page_key' });
  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.seo.update', 'page_seo', null, null, { page: key });
  refresh(SITE_TAGS.seo, [pageRoute(page), 'page'], SEO_ADMIN, [`/[locale]/marketplace/admin/content/seo/[key]`, 'page']);
  return ok({ saved: true });
}

/**
 * Put ONE page into the sitemap, or take it out — from the sitemap screen.
 *
 * ── Why this is not a sitemap-only switch ───────────────────────────────────
 *
 * It writes `seo_index`, the same column the page's own SEO form writes, and
 * that column means two things at once: the page carries a noindex robots tag
 * AND it is left out of sitemap.xml.
 *
 * Splitting them was considered and is the wrong answer. A sitemap that lists
 * a page the page itself tells crawlers not to index is a contradiction, and
 * it is the half a search console reads as a SUBMISSION — so it gets reported
 * as an error rather than quietly obeyed. Keeping one switch is what stops an
 * admin producing that state by accident.
 *
 * It does mean the label has to be honest about the consequence, which is why
 * the UI says "removed from the sitemap AND marked noindex" rather than
 * implying this only tidies a file.
 *
 * ── Upsert, because most pages have no row ──────────────────────────────────
 *
 * A page_seo row exists only once somebody has customised that page, so the
 * common case here is a page with no row at all. PostgREST's upsert writes the
 * columns in the payload and leaves the rest alone on conflict, so toggling a
 * page that HAS a row cannot wipe the title and description somebody wrote.
 */
export async function setPageIndexed(pageKey, indexed) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const page = SEO_PAGE_BY_KEY[pageKey];
  if (!page) return bad('PAGE_UNKNOWN');

  const { error } = await getMarketplaceDb()
    .from('page_seo')
    .upsert({ page_key: pageKey, seo_index: !!indexed }, { onConflict: 'page_key' });

  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.seo.index', 'page_seo', null, null, {
    page: pageKey,
    indexed: !!indexed,
  });

  /* The sitemap's own cache tag, plus the page itself and both admin screens
     that show the switch. Without the first the file would keep its old
     contents for the rest of the hour. */
  refresh(
    SITE_TAGS.seo,
    [pageRoute(page), 'page'],
    SEO_ADMIN,
    ['/[locale]/marketplace/admin/content/sitemap', 'page']
  );

  return ok({ pageKey, indexed: !!indexed });
}

export async function resetPageSeo(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const key = str(formData, 'pageKey');
  const page = SEO_PAGE_BY_KEY[key];
  if (!page) return bad('PAGE_UNKNOWN');

  const { error } = await getMarketplaceDb().from('page_seo').delete().eq('page_key', key);
  if (error) return dbFail(error, 'DELETE_FAILED');

  await writeAudit(viewer, 'site.seo.reset', 'page_seo', null, null, { page: key });
  refresh(SITE_TAGS.seo, [pageRoute(page), 'page'], SEO_ADMIN);
  return ok({ reset: key });
}

/* ── Content pages (About us) ─────────────────────────────────────────────── */

const PAGES_ADMIN = ['/[locale]/marketplace/admin/content/pages', 'page'];

/** An editor document, or {} for a language nobody has written yet. */
function editorDoc(fd, k) {
  const raw = str(fd, k);
  if (!raw) return null;
  if (raw.length > 400_000) throw new Invalid('CONTENT_INVALID');
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Invalid('CONTENT_INVALID');
  }
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content ?? [])) throw new Invalid('CONTENT_INVALID');
  return doc;
}

export async function saveSitePage(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const slug = str(formData, 'slug');
  const content = CONTENT_PAGE_BY_SLUG[slug];
  if (!content) return bad('PAGE_UNKNOWN');

  let row;
  try {
    const ar = editorDoc(formData, 'bodyAr');
    const en = editorDoc(formData, 'bodyEn');
    row = {
      slug,
      title: bilingual(formData, 'title', 120),
      body: { ...(ar ? { ar } : {}), ...(en ? { en } : {}) },
      published: flag(formData, 'published'),
    };
  } catch (err) {
    if (err instanceof Invalid) return bad(err.code);
    throw err;
  }

  const { error } = await getMarketplaceDb().from('site_pages').upsert(row, { onConflict: 'slug' });
  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.page.update', 'site_pages', null, null, { slug, published: row.published });
  refresh(SITE_TAGS.pages, [pageRoute(SEO_PAGE_BY_KEY[content.seoKey]), 'page'], PAGES_ADMIN);
  return ok({ saved: true });
}

export async function setSitePagePublished(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  const slug = str(formData, 'slug');
  const content = CONTENT_PAGE_BY_SLUG[slug];
  if (!content) return bad('PAGE_UNKNOWN');

  const published = str(formData, 'published') === 'true';
  const { error } = await getMarketplaceDb().from('site_pages').upsert({ slug, published }, { onConflict: 'slug' });
  if (error) return dbFail(error);

  await writeAudit(viewer, 'site.page.publish', 'site_pages', null, null, { slug, published });
  refresh(SITE_TAGS.pages, [pageRoute(SEO_PAGE_BY_KEY[content.seoKey]), 'page'], PAGES_ADMIN);
  return ok({ saved: true });
}

/* ── The platform's own FAQ ─────────────────────────────────────────────────
   Buyer-facing and admin-written — NOT the help centre in
   src/marketplace/lib/help-articles.ts, which is hardcoded documentation for
   SELLERS about operating the dashboard and ships with the code because it
   describes the code.
   ------------------------------------------------------------------------ */

const FAQ_ADMIN = ['/[locale]/marketplace/admin/content/faq', 'page'];
const FAQ_PUBLIC = ['/[locale]/marketplace/faq', 'page'];

/** How many questions one FAQ may hold. A cap on a list anybody can grow. */
const FAQ_MAX = 60;

/**
 * The whole list, replaced in one write.
 *
 * ── Why wholesale rather than a row per action ─────────────────────────────
 *
 * Hero slides get save / delete / move / toggle as four separate actions,
 * which is right for a carousel: a slide carries an uploaded image, so each
 * one is edited on its own and reordering must not risk the others.
 *
 * A FAQ is text. The admin edits the list as a list — writes three questions,
 * reorders them, switches one off — and expects one Save. Four actions would
 * mean four round trips to do what the screen presents as one change, and a
 * `move` that half-applies leaves the order wrong with nothing to blame.
 *
 * The cost is the honest one: two admins editing the FAQ at the same moment,
 * last write wins. For a page edited a few times a year by the people who run
 * the platform, that is a better trade than four endpoints.
 *
 * Delete-then-insert for the same reason the listing form replaces its specs
 * and variants: the payload is the whole truth, so reconstructing a diff from
 * it is work that can only introduce disagreement.
 */
export async function saveSiteFaqs(prevState, formData) {
  const { viewer, denied } = await guard();
  if (denied) return denied;

  let rows;
  try {
    const parsed = JSON.parse(str(formData, 'faqs') || '[]');
    if (!Array.isArray(parsed)) return bad('CONTENT_INVALID');
    if (parsed.length > FAQ_MAX) return bad('TOO_MANY', { max: FAQ_MAX });

    rows = parsed
      .map((f, i) => ({
        question: {
          ...(String(f?.questionAr ?? '').trim() ? { ar: String(f.questionAr).trim().slice(0, 300) } : {}),
          ...(String(f?.questionEn ?? '').trim() ? { en: String(f.questionEn).trim().slice(0, 300) } : {}),
        },
        answer: {
          ...(String(f?.answerAr ?? '').trim() ? { ar: String(f.answerAr).trim().slice(0, 4000) } : {}),
          ...(String(f?.answerEn ?? '').trim() ? { en: String(f.answerEn).trim().slice(0, 4000) } : {}),
        },
        category: String(f?.category ?? '').trim().slice(0, 40) || null,
        sort_order: i,
        active: f?.active !== false,
      }))
      /* A pair missing a question or an answer in BOTH languages is a row the
         admin added and abandoned. Dropped rather than rejected: an error
         about a row somebody is trying to leave blank is an error about
         nothing. */
      .filter((r) => Object.keys(r.question).length && Object.keys(r.answer).length);
  } catch {
    return bad('CONTENT_INVALID');
  }

  const db = getMarketplaceDb();

  /* `neq(id, …)` rather than a bare delete: PostgREST refuses an unfiltered
     DELETE, which is a guard worth having on a table this one owns entirely. */
  const { error: clearError } = await db
    .from('site_faqs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (clearError) return dbFail(clearError);

  if (rows.length) {
    const { error } = await db.from('site_faqs').insert(rows);
    if (error) return dbFail(error);
  }

  await writeAudit(viewer, 'site.faq.update', 'site_faqs', null, null, { count: rows.length });
  refresh(SITE_TAGS.faq, FAQ_ADMIN, FAQ_PUBLIC);
  return ok({ saved: true, count: rows.length });
}
