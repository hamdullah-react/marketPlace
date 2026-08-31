'use server';

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';
import { updateVendor } from '@/marketplace/db/queries/settings';
import { keywordList } from '@/marketplace/lib/seo';
import { parseSocialLinks, legacySocialObject } from '@/marketplace/lib/social';

/**
 * Editing a showroom FROM its own storefront.
 *
 * ── Why here and not only in Settings ───────────────────────────────────────
 *
 * Settings is a form; the storefront is the thing the form is describing. A
 * seller who looks at their own page and sees a wrong opening time should be
 * able to fix it where they can see it, rather than translating "the hours card
 * is wrong" into "which of the four Settings tabs holds working_hours".
 *
 * ── ONE storage shape, not a second one ─────────────────────────────────────
 *
 * Every section below writes exactly the columns and the jsonb keys that
 * (seller)/_actions/settings.js writes — same `address` keys, same `policies`
 * keys, same eight social keys. This is a second DOOR onto the same data, and
 * the moment it becomes a second way of STORING it, the two screens start
 * disagreeing and the seller cannot tell which is true.
 *
 * ── Merged, never replaced ──────────────────────────────────────────────────
 *
 * The jsonb columns are written as a whole object by Settings, which is right
 * for a form that shows every field at once. These dialogs show a handful, so
 * writing the object back wholesale would silently blank whatever was not on
 * screen — a seller fixing their street would lose the map pin they had saved
 * from a different screen. Each section merges its fields over what is stored.
 *
 * ── Refusal, not fallback ───────────────────────────────────────────────────
 *
 * vendorForAction() falls back to the caller's first showroom when the id asked
 * for is not theirs. On a dashboard that is a kindness. Here the id comes from
 * whichever storefront is on screen, so falling back would let a seller edit
 * another showroom's page and silently rewrite their OWN. Refused instead.
 */

const stamp = () => Date.now() + Math.random();
const bad = (error, errors = {}) => ({ ok: false, error, errors, token: stamp() });

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const bool = (fd, k) => fd.get(k) === 'on' || fd.get(k) === 'true' || fd.get(k) === '1';
const num = (fd, k) => {
  const v = str(fd, k);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * {ar, en}, merged over what is stored — and ONLY for the languages that were
 * actually submitted.
 *
 * This is the bug the plain version caused. A seller whose Settings say they
 * work in Arabic is shown Arabic fields only (vendors.settings.default_locale),
 * so the form posts `bioAr` and no `bioEn` at all. Building the object from
 * both keys read the missing one as an empty string and wrote `{ar: …}` — which
 * silently DELETED the English the showroom already had, on a save the seller
 * thought was about the Arabic.
 *
 * `fd.has()` is the whole fix: a key that was not on the form is not an answer,
 * and only a key that WAS on the form and came back empty means "clear this".
 */
const i18nFrom = (fd, arKey, enKey, current) => {
  const out = { ...(current ?? {}) };

  if (fd.has(arKey)) {
    const v = str(fd, arKey);
    if (v) out.ar = v;
    else delete out.ar;
  }
  if (fd.has(enKey)) {
    const v = str(fd, enKey);
    if (v) out.en = v;
    else delete out.en;
  }

  return out;
};

/**
 * A keyword list per language, same shape listings store (§15): {ar: [], en: []}.
 *
 * The tag box posts JSON, and this parses it — but it also accepts the
 * comma-separated line a hand-made post might send, because the client cannot
 * be the only thing between a paste and the database. keywordList() is the same
 * splitter save-listing.js uses, so the two SEO editors cannot disagree about
 * what counts as one keyword.
 *
 * Deduplicated case-insensitively: "Riyadh" and "riyadh" are one keyword to a
 * search engine and two rows of noise to a human.
 */
const keywordsFrom = (fd, arKey, enKey, current) => {
  const out = { ...(current ?? {}) };

  const parse = (raw) => {
    const text = String(raw ?? '').trim();

    let source = text;
    if (text.startsWith('[')) {
      try { source = JSON.parse(text); } catch { source = text; }
    }

    const seen = new Set();
    return keywordList(source)
      .filter((k) => {
        const key = k.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 25);
  };

  for (const [key, lang] of [[arKey, 'ar'], [enKey, 'en']]) {
    if (!fd.has(key)) continue;
    const list = parse(fd.get(key));
    if (list.length) out[lang] = list;
    else delete out[lang];
  }

  return out;
};

/* The closed sets the SEO selects offer. A value not on the list is not a
   choice the UI can produce, so it is a hand-made post — take the default
   rather than pass it to a column with a check constraint. */
const TWITTER_CARDS = ['summary_large_image', 'summary'];
const CHANGEFREQS = ['daily', 'weekly', 'monthly'];
const PRIORITIES = ['0.8', '0.7', '0.5', '0.3'];

const pick = (fd, key, allowed, fallback) => {
  const v = str(fd, key);
  return allowed.includes(v) ? v : fallback;
};

/**
 * Everything a section might merge into, read back before the write.
 *
 * The SEO and About columns are asked for separately from the rest for the
 * reason §27 and §28 give: on a database where they have not been added yet
 * this select fails with 42703, and taking the whole save down over a column
 * a seller is not editing would be the wrong trade. The caller retries without
 * them and reports COLUMN_MISSING only if the section actually needed them.
 */
const BASE_COLUMNS = 'id, name, bio, settings, address, working_hours, policies, social';
const READ_COLUMNS = `${BASE_COLUMNS},
  meta_title, meta_description, meta_keywords, focus_keyword,
  og_title, og_description, twitter_title, twitter_description, about,
  social_links
`;

/**
 * The sections that cannot work without §27 / §28 / §29.
 *
 * Everything else still saves on a database that has not been migrated yet:
 * the read falls back to BASE_COLUMNS and an opening time is not held hostage
 * by a column nobody is editing. These three are refused by name, with the fix
 * in the message, because there is nowhere for their values to go.
 */
const NEEDS_NEW_COLUMNS = new Set(['seo', 'story', 'social']);

/**
 * Both screens that read these columns.
 *
 * The Settings page is in the list because the seller's next stop after
 * editing here is often there, and a stale form showing the OLD value is how
 * an edit gets made twice — the second time undoing the first.
 */
function refresh() {
  revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
  revalidatePath('/[locale]/marketplace/seller/settings', 'page');
}

/**
 * Turn one section's form into a patch over the stored row.
 *
 * Each returns either a patch object or `{ errors }`. Nothing here touches the
 * database — that is the caller's job — so the rules stay readable as rules.
 */
const SECTIONS = {
  /* Name and the paragraph under it. */
  about: (fd, vendor) => {
    const name = i18nFrom(fd, 'nameAr', 'nameEn', vendor.name);
    // After the merge, not before: a seller editing in Arabic only must not be
    // told the name is missing because the English box was not on their form.
    if (!name.ar && !name.en) return { errors: { nameAr: 'NAME_REQUIRED' } };

    return {
      name,
      bio: i18nFrom(fd, 'bioAr', 'bioEn', vendor.bio),
    };
  },

  /**
   * The long-form About page (schema.sql §28).
   *
   * The editor posts its document as JSON in a hidden field. Parsed and stored
   * as jsonb — never as HTML, and never rendered as HTML. See §28 for why that
   * is the whole security model rather than a preference.
   */
  story: (fd, vendor) => {
    const out = { ...(vendor.about ?? {}) };

    for (const [key, lang] of [['aboutAr', 'ar'], ['aboutEn', 'en']]) {
      if (!fd.has(key)) continue;

      const raw = str(fd, key);
      if (!raw) { delete out[lang]; continue; }

      try {
        const doc = JSON.parse(raw);
        // A document, or nothing. Anything else is a client that has gone
        // wrong, and storing it would put an unrenderable value on a page.
        if (doc?.type !== 'doc' || !Array.isArray(doc.content)) return { errors: { [key]: 'BAD_DOCUMENT' } };
        // An empty editor serialises to one empty paragraph, which should read
        // as "nothing written" rather than as a blank section on the page.
        const empty = doc.content.every(
          (n) => n?.type === 'paragraph' && !(n.content?.length)
        );
        if (empty) delete out[lang];
        else out[lang] = doc;
      } catch {
        return { errors: { [key]: 'BAD_DOCUMENT' } };
      }
    }

    return { about: out };
  },

  /* How to reach them, and whether the number may be shown at all. */
  contact: (fd, vendor) => {
    const email = str(fd, 'contactEmail');
    const phone = str(fd, 'contactPhone');

    const errors = {};
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.contactEmail = 'EMAIL_INVALID';
    // Saudi mobile, with or without the country code — same rule as Settings.
    if (phone && !/^(\+?966|0)?5\d{8}$/.test(phone.replace(/[\s-]/g, ''))) {
      errors.contactPhone = 'PHONE_INVALID';
    }
    if (Object.keys(errors).length) return { errors };

    return {
      contact_email: email || null,
      contact_phone: phone || null,
      settings: {
        ...(vendor.settings ?? {}),
        show_phone: bool(fd, 'showPhone'),
        show_whatsapp: bool(fd, 'showWhatsapp'),
      },
    };
  },

  /* Where the showroom is. City is its own column; the rest is the address blob. */
  address: (fd, vendor) => {
    const lat = num(fd, 'lat');
    const lng = num(fd, 'lng');

    return {
      city: str(fd, 'city') || null,
      address: {
        ...(vendor.address ?? {}),
        district: i18nFrom(fd, 'districtAr', 'districtEn', vendor.address?.district),
        street: i18nFrom(fd, 'streetAr', 'streetEn', vendor.address?.street),
        building: str(fd, 'building') || null,
        postal_code: str(fd, 'postalCode') || null,
        // Both halves or neither: a lone latitude is worse than none, because
        // a map renders it happily somewhere in the sea.
        lat: lat != null && lng != null ? lat : null,
        lng: lat != null && lng != null ? lng : null,
        map_url: str(fd, 'mapUrl') || null,
      },
    };
  },

  hours: (fd, vendor) => ({
    working_hours: {
      ...(vendor.working_hours ?? {}),
      weekdays: str(fd, 'hoursWeekdays') || null,
      weekend: str(fd, 'hoursWeekend') || null,
      closed: str(fd, 'hoursClosed') || null,
    },
  }),

  policies: (fd, vendor) => ({
    policies: {
      ...(vendor.policies ?? {}),
      returns_days: num(fd, 'returnsDays') ?? 0,
      warranty: str(fd, 'warranty') || null,
      shipping: i18nFrom(fd, 'shippingAr', 'shippingEn', vendor.policies?.shipping),
      returns: i18nFrom(fd, 'returnsAr', 'returnsEn', vendor.policies?.returns),
      terms: i18nFrom(fd, 'termsAr', 'termsEn', vendor.policies?.terms),
    },
  }),

  /**
   * The showroom's links, as a list (§29).
   *
   * `social` is written too, rebuilt from the list, so anything still reading
   * the old eight-key object keeps working. The list is the truth; the object
   * is its shadow, and writing it as a SET means a deleted row clears the key
   * rather than leaving last week's handle behind.
   */
  social: (fd) => {
    const links = parseSocialLinks(fd.get('socialLinks'));
    return { social_links: links, social: legacySocialObject(links) };
  },

  business: (fd) => {
    const cr = str(fd, 'crNumber');
    const vat = str(fd, 'vatNumber');

    const errors = {};
    if (cr && !/^\d{10}$/.test(cr)) errors.crNumber = 'CR_INVALID';
    if (vat && !/^\d{15}$/.test(vat)) errors.vatNumber = 'VAT_INVALID';
    if (Object.keys(errors).length) return { errors };

    return { cr_number: cr || null, vat_number: vat || null };
  },

  /**
   * How the page appears in a search result (schema.sql §27).
   *
   * Seller-only, and nothing here is required: every field blank means "work it
   * out from the showroom", which is what the page did before the panel
   * existed.
   */
  /**
   * The whole search surface, the same one a listing has (§15/§27).
   *
   * Nothing here is required: every field left blank means "work it out from
   * the showroom", which is what the page did before the panel existed.
   */
  seo: (fd, vendor) => ({
    meta_title: i18nFrom(fd, 'metaTitleAr', 'metaTitleEn', vendor.meta_title),
    meta_description: i18nFrom(fd, 'metaDescriptionAr', 'metaDescriptionEn', vendor.meta_description),
    meta_keywords: keywordsFrom(fd, 'metaKeywordsAr', 'metaKeywordsEn', vendor.meta_keywords),
    focus_keyword: i18nFrom(fd, 'focusKeywordAr', 'focusKeywordEn', vendor.focus_keyword),

    og_title: i18nFrom(fd, 'ogTitleAr', 'ogTitleEn', vendor.og_title),
    og_description: i18nFrom(fd, 'ogDescriptionAr', 'ogDescriptionEn', vendor.og_description),
    og_image_url: str(fd, 'ogImageUrl') || null,

    twitter_card: pick(fd, 'twitterCard', TWITTER_CARDS, 'summary_large_image'),
    twitter_title: i18nFrom(fd, 'twitterTitleAr', 'twitterTitleEn', vendor.twitter_title),
    twitter_description: i18nFrom(fd, 'twitterDescriptionAr', 'twitterDescriptionEn', vendor.twitter_description),
    twitter_image_url: str(fd, 'twitterImageUrl') || null,

    seo_index: bool(fd, 'seoIndex'),
    seo_follow: bool(fd, 'seoFollow'),

    /* Both go in the sitemap. Validated against the offered lists rather
       than trusted: the column has a 0..1 check constraint, and a hand-made
       post of "9" would come back as a constraint violation reported to the
       seller as "that did not work". */
    seo_priority: PRIORITIES.includes(str(fd, 'seoPriority')) ? Number(str(fd, 'seoPriority')) : 0.7,
    seo_changefreq: pick(fd, 'seoChangefreq', CHANGEFREQS, 'weekly'),

    canonical_url: str(fd, 'canonicalUrl') || null,
  }),
};

export async function saveStorefrontSection(prevState, formData) {
  const section = String(formData.get('section') ?? '');
  const build = SECTIONS[section];
  if (!build) return bad('BAD_SECTION');

  const wanted = str(formData, 'vendorId');
  const { vendorId, error: denied } = await vendorForAction(wanted || null);
  if (denied) return bad(denied);
  if (wanted && vendorId !== wanted) return bad('NOT_YOUR_STORE');

  /**
   * The stored row, read back for the merge.
   *
   * Read from the SESSION's vendor id rather than trusting the form, so the
   * object being merged into can only ever be the caller's own.
   */
  const db = getMarketplaceDb();
  const read = (columns) =>
    db.from('vendors').select(columns).eq('id', vendorId).maybeSingle();

  let { data: vendor, error: readError } = await read(READ_COLUMNS);

  /**
   * The database has not had §27/§28 run yet.
   *
   * Editing an opening time must not fail because a column the seller is not
   * touching does not exist, so the read falls back — and only a section that
   * genuinely needs those columns is refused, with the reason.
   */
  if (readError?.code === '42703') {
    if (NEEDS_NEW_COLUMNS.has(section)) return bad('COLUMN_MISSING');
    ({ data: vendor, error: readError } = await read(BASE_COLUMNS));
  }

  if (readError || !vendor) {
    console.error('[storefront] read:', readError?.message ?? 'vendor not found');
    return bad('SAVE_FAILED');
  }

  const built = build(formData, vendor);
  if (built.errors) return bad(null, built.errors);

  try {
    await updateVendor(vendorId, built);
  } catch (err) {
    /**
     * 42703 is the SEO columns missing — schema.sql §27 has not been run.
     * Named rather than reported as "that did not work", because the fix is a
     * paste into the SQL editor and nothing else here can tell the seller so.
     */
    if (err.message?.includes('42703') || err.message?.includes('column')) {
      console.error('[storefront] save failed, is §27 applied?:', err.message);
      return bad('COLUMN_MISSING');
    }
    console.error('[storefront] save:', err.message);
    return bad('SAVE_FAILED');
  }

  refresh();
  return { ok: true, error: null, errors: {}, token: stamp(), section };
}
