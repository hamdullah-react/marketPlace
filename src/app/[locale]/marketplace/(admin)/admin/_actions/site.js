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
