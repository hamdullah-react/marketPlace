'use server';

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';
import { getCatalogNames } from '@/marketplace/db/queries/catalog';
import { getAttributeSlugs, getAttributeLabels } from '@/marketplace/db/queries/attributes';
import { listingStem, slugify } from '@/marketplace/lib/slug';
import { i18n } from '@/marketplace/lib/listing';
import { listingSeo, keywordList } from '@/marketplace/lib/seo';
import { routing } from '@/i18n/routing';

/**
 * Creates or updates a car listing. One action for both — the only difference
 * is whether listingId is present, and everything downstream (validation,
 * media, variants) is identical.
 *
 * The vendor comes from the SESSION, not the form. The form still posts a
 * vendorId — the picker needs one to render — but it is overwritten before
 * validation, so a hand-edited value creates a listing under the caller's own
 * showroom rather than someone else's.
 *
 * and the ownership check below stops being a TODO.
 */

/**
 * Option lists are NOT hardcoded here. They are read from car_attributes, the
 * same table the form's dropdowns are built from, so the two can never drift.
 * They used to be literal arrays and had already drifted: `cvt` was a real
 * transmission in the catalog that this file would have rejected.
 *
 * `condition` is the one kind with behaviour attached — a used car must state
 * its mileage — so it keeps a named constant for that check alone.
 */
const CONDITION_USED = 'used';

/**
 * Keys listings.attributes owns outright, which no kind may take over.
 *
 * `year` and `mileage_km` are read as NUMBERS — by the card and by the browse
 * facets, which build the year and mileage sliders from them. A kind slugged
 * `year` would write an option slug over the catalog year and both would break
 * with no error anywhere. `trim` is the catalog trim name.
 *
 * Guarded in two places on purpose: here, so a reserved key can never be
 * written whatever is in the catalog, and in saveCatalogKind, so a seller is
 * told at the point of naming rather than discovering it later.
 */
const RESERVED_ATTRIBUTE_KEYS = ['year', 'mileage_km', 'trim'];

/**
 * Written above by name rather than through the generic loop, because it is the
 * one kind with a rule attached: a used car must state its mileage. It is a
 * perfectly normal catalog kind otherwise — editable, icon-able, and free to
 * appear on the card — which is why it is NOT in the reserved list.
 */
const HANDLED_BY_NAME = ['condition'];

/** Where each footer choice lands the listing. */
/**
 * Where a canonical URL points when the seller does not supply one.
 *
 * The listing's own page, absolute — a canonical has to be, or it is ignored.
 * The Arabic path is the canonical one because ar is the default locale; the
 * English page declares itself an alternate of it, which is what stops the two
 * competing as duplicates.
 */
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.alromaihcars.com';

const STATE_FOR_INTENT = {
  draft: 'draft',
  review: 'pending_review',
  publish: 'live',
};

/** Photo buckets, in display order. Exterior leads — see the sort below. */
const MEDIA_CATEGORIES = ['exterior', 'interior'];

/** Tells a spec option's id apart from a typed-in value. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readForm(formData) {
  const s = (k) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const n = (k) => {
    const v = s(k);
    if (v === '') return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  };
  const json = (k, fallback) => {
    try {
      const parsed = JSON.parse(s(k) || 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  };

  return {
    listingId: s('listingId') || null,
    vendorId: s('vendorId'),
    customSlug: s('customSlug'),
    brandId: s('brandId'),
    modelId: s('modelId'),
    yearId: s('yearId'),
    trimId: s('trimId') || null,
    colorId: s('colorId') || null,
    titleAr: s('titleAr'),
    titleEn: s('titleEn'),
    descriptionAr: s('descriptionAr'),
    descriptionEn: s('descriptionEn'),
    price: n('price'),
    compareAt: n('compareAt'),
    mileage: n('mileage'),
    condition: s('condition'),
    // Every other kind is read later, once the catalog has said which kinds
    // exist — see readKinds. They cannot be listed here because the list is
    // data, not code.
    kinds: {},
    city: s('city'),

    /* Search & social. Every one of these is optional — anything left blank is
       generated from the car below, and REgenerated on every save, so a
       listing renamed from GL to GLX gets a matching title without anyone
       remembering to come back here. */
    metaTitleAr: s('metaTitleAr'),
    metaTitleEn: s('metaTitleEn'),
    metaDescriptionAr: s('metaDescriptionAr'),
    metaDescriptionEn: s('metaDescriptionEn'),
    // Arrays, not a comma-joined string — the chip editor posts JSON. The
    // separator problem is real: Arabic lists with the U+060C comma, so one
    // shared split rule would have been wrong in one language or the other.
    metaKeywords: {
      ar: keywordList(json('metaKeywordsAr', [])),
      en: keywordList(json('metaKeywordsEn', [])),
    },
    focusKeywordAr: s('focusKeywordAr'),
    focusKeywordEn: s('focusKeywordEn'),

    ogTitleAr: s('ogTitleAr'),
    ogTitleEn: s('ogTitleEn'),
    ogDescriptionAr: s('ogDescriptionAr'),
    ogDescriptionEn: s('ogDescriptionEn'),
    ogImageUrl: s('ogImageUrl'),

    twitterCard: s('twitterCard') || 'summary_large_image',
    twitterTitleAr: s('twitterTitleAr'),
    twitterTitleEn: s('twitterTitleEn'),
    twitterDescriptionAr: s('twitterDescriptionAr'),
    twitterDescriptionEn: s('twitterDescriptionEn'),
    twitterImageUrl: s('twitterImageUrl'),

    canonicalUrl: s('canonicalUrl'),
    // Checkboxes: absent means unchecked, so these default to ON only for a
    // brand-new form, which posts them checked.
    seoIndex: s('seoIndex') === 'on',
    seoFollow: s('seoFollow') === 'on',
    seoPriority: n('seoPriority'),
    seoChangefreq: s('seoChangefreq') || 'weekly',

    media: json('media', []),
    specs: json('specs', {}),
    variants: json('variants', []),
    publish: s('publish') === 'on',
    // draft | review | publish. The form sends it; older callers that only
    // send `publish` still work, falling back to the review queue.
    intent: s('intent') || (s('publish') === 'on' ? 'review' : 'draft'),
  };
}

/**
 * Reads one value per option kind, using the catalog's own kind list.
 *
 * The form names each dropdown after its kind slug, so a kind added in the
 * Catalog needs no change here: it appears in `slugs`, gets read, gets
 * validated against its own option list, and lands in listings.attributes
 * under the same key. That is what makes a seller-created kind work end to end.
 *
 * RESERVED_ATTRIBUTE_KEYS are skipped because they are not option values at
 * all, and HANDLED_BY_NAME because condition is written above with its own
 * mileage rule attached.
 *
 * An empty catalog read means an empty result rather than a guess: the four
 * kinds that used to be hardcoded are not special enough to reinstate here, and
 * inventing them would write keys the catalog does not recognise.
 */
function readKinds(formData, slugs) {
  const out = {};
  for (const kind of Object.keys(slugs)) {
    if (RESERVED_ATTRIBUTE_KEYS.includes(kind) || HANDLED_BY_NAME.includes(kind)) continue;
    const v = formData.get(kind);
    const text = typeof v === 'string' ? v.trim() : '';
    if (text) out[kind] = text;
  }
  return out;
}

/**
 * Returns error CODES, never sentences.
 *
 * These used to be "اختر الماركة / Select a brand" — both languages in one
 * string, so an English seller always read Arabic and an Arabic seller always
 * read English. The server cannot know the viewer's locale at the point a
 * validator fails, so the wording belongs to the client: it resolves each code
 * through errorText(code, locale) and renders exactly one language.
 *
 * @param slugs  kind → Set(slug), straight from car_attributes. Empty when the
 *               catalog read failed; in that case option checks are skipped
 *               rather than rejecting every value, since a transient catalog
 *               outage must not block a seller from saving a draft.
 */
function validate(raw, slugs = {}) {
  const errors = {};

  const known = (kind, value) => !slugs[kind]?.size || slugs[kind].has(value);

  if (!raw.vendorId) errors.vendorId = 'MISSING_VENDOR';
  if (!raw.brandId) errors.brandId = 'BRAND_REQUIRED';
  if (!raw.modelId) errors.modelId = 'MODEL_REQUIRED';
  if (!raw.yearId) errors.yearId = 'YEAR_REQUIRED';

  if (raw.price == null || raw.price <= 0) errors.price = 'PRICE_INVALID';

  // No rule tying compare_at to price. It used to be rejected unless it was
  // strictly higher, which blocked legitimate cases the seller owns: a price
  // that went UP, a "was" figure kept while a promotion is off, or an equal
  // value used as a placeholder. What a car costs is the seller's call — the
  // card simply omits the strike-through when there is no saving to show.

  if (!raw.condition || !known('condition', raw.condition)) {
    errors.condition = 'CONDITION_REQUIRED';
  }
  if (raw.condition === CONDITION_USED && (raw.mileage == null || raw.mileage < 0)) {
    errors.mileage = 'MILEAGE_REQUIRED';
  }
  // Every kind checks the same way, against its own list. The error is keyed by
  // the kind slug, which is also the form field name, so the client highlights
  // the right control without a translation table.
  for (const [kind, value] of Object.entries(raw.kinds ?? {})) {
    if (!known(kind, value)) errors[kind] = 'OPTION_UNKNOWN';
  }
  if (!raw.city) errors.city = 'CITY_REQUIRED';

  // A car listing with no photo gets no clicks — better to block it here than
  // let a seller wonder why nobody enquires.
  if (raw.publish && (!Array.isArray(raw.media) || raw.media.length === 0)) {
    errors.media = 'MEDIA_REQUIRED';
  }

  return errors;
}

/**
 * Spec values replace wholesale, same as variants: delete then insert.
 *
 *  is stored as jsonb {raw} so a boolean stays a boolean and a number
 * stays a number — storing everything as text would make "0" and false
 * indistinguishable from "not answered" on read.
 */
async function saveSpecs(db, listingId, specs) {
  await db.from('listing_specs').delete().eq('listing_id', listingId);

  const entries = Object.entries(specs ?? {}).filter(
    ([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
  );

  // Choice-type answers are stored as the option's id, which is the right
  // thing to keep — it survives a renamed label and can be filtered on. But
  // the spec sheet reads display_value, so an unresolved id would render as a
  // raw UUID on the car page. Resolve the labels once, here, and store both:
  // the id as the durable reference, the text as what a buyer reads.
  const referenced = [...new Set(entries.flatMap(([, v]) => (Array.isArray(v) ? v : [v])))]
    .filter((v) => typeof v === 'string' && UUID.test(v));

  const labels = new Map();
  if (referenced.length) {
    const { data } = await db
      .from('spec_attribute_values')
      .select('id, name')
      .in('id', referenced);

    for (const row of data ?? []) labels.set(row.id, row.name);
  }

  // Both languages, so the sheet renders in the viewer's language rather than
  // whichever one the seller happened to be using when they saved.
  const textOf = (v) => {
    const parts = (Array.isArray(v) ? v : [v]).map((one) => labels.get(one) ?? one);
    const lang = (key) =>
      parts
        .map((p) => {
          if (p == null) return '';
          if (typeof p !== 'object') return String(p);
          // Unwrap what a PREVIOUS save already stored. The edit form loads the
          // saved value and hands it straight back, so `p` here is routinely
          // { raw, label } or { label } rather than a fresh answer. Reading
          // p[key] on those returns undefined, which is how a re-save wiped
          // every label to "" and wrote String(object) into display_value —
          // the literal text "[object Object]" on the car page.
          if (p.label && typeof p.label === 'object') return p.label[key] ?? '';
          if (p.raw !== undefined) {
            const r = p.raw;
            if (r && typeof r === 'object') {
              return (r.label && typeof r.label === 'object' ? r.label[key] : r[key]) ?? '';
            }
            return r == null ? '' : String(r);
          }
          return p[key] ?? '';
        })
        .filter(Boolean)
        .join(', ');
    const ar = lang('ar');
    const en = lang('en');
    return { ar: ar || en, en: en || ar };
  };

  /** The durable answer, with any previous wrapper peeled off so it cannot nest. */
  const rawOf = (v) => {
    let out = v;
    // Bounded rather than while(true): a malformed row must not spin here.
    for (let depth = 0; depth < 4; depth++) {
      if (out && typeof out === 'object' && out.raw !== undefined) out = out.raw;
      else break;
    }
    return out;
  };

  const rows = entries.map(([attribute_id, v], i) => {
    const text = textOf(v);
    return {
      listing_id: listingId,
      attribute_id,
      value: { raw: rawOf(v), label: text },
      // NEVER String(v) — v can be an object, and stringifying one wrote the
      // characters "[object Object]" into the column, where no renderer can
      // tell it from a real answer. An empty string is honest.
      display_value: text.en || text.ar || (typeof v === 'object' ? '' : String(v ?? '')),
      sequence: i,
    };
  });

  if (rows.length) {
    const { error } = await db.from('listing_specs').insert(rows);
    if (error) throw new Error(`specs: ${error.message}`);
  }
}

/**
 * A colour's own price, or null to follow the car's.
 *
 * Blank is not zero. An empty box means "same as the listing" (schema.sql §31),
 * and Number('') is 0 — so a seller who left seven of eight colours alone would
 * have published seven free cars. Anything that is not a usable positive number
 * becomes null, which is the safe direction: the colour falls back to the
 * listing price rather than inventing one.
 */
const variantPrice = (raw) => {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Colour variants replace wholesale — simpler and race-free versus diffing. */
async function saveVariants(db, listingId, variants) {
  await db.from('listing_variants').delete().eq('listing_id', listingId);

  const rows = (variants ?? [])
    .filter((v) => v?.colorId)
    .map((v, i) => ({
      listing_id: listingId,
      color_id: v.colorId,
      name: i18n(v.nameAr, v.nameEn),
      // Exactly one primary, enforced by a partial unique index in 0007.
      is_primary: i === 0,
      media: Array.isArray(v.media) ? v.media : [],
      sequence: i,
      price: variantPrice(v.price),
      compare_at: variantPrice(v.compareAt),
    }));

  if (rows.length) {
    const { error } = await db.from('listing_variants').insert(rows);
    if (error) throw new Error(`variants: ${error.message}`);
  }
}

/**
 * Slug stem: the seller's own text when they supplied one, otherwise built from
 * the catalog. The public_ref suffix is appended either way, so a custom stem
 * can never collide with another listing.
 */
function stemFor(raw, names) {
  const custom = slugify(raw.customSlug);
  return custom || listingStem({ ...names, title: raw.titleEn });
}

export async function saveListing(prevState, formData) {
  const raw = readForm(formData);

  /**
   * Overwrite the form's vendor with the session's.
   *
   * Before validation, deliberately: validate() rejects a missing vendorId, so
   * doing it here means a seller whose session resolved fine never sees a
   * "choose a showroom" error about a field they cannot see, and a caller who
   * supplied someone else's id never gets as far as the insert.
   */
  const { vendorId, error: denied } = await vendorForAction(raw.vendorId || null);
  if (denied) return { ok: false, error: denied, errors: {}, token: Date.now() };
  raw.vendorId = vendorId;

  // Read the option lists before validating, so the check runs against the
  // same catalog rows the seller picked from.
  let slugs = {};
  try { slugs = await getAttributeSlugs(); } catch { slugs = {}; }

  // Between the catalog read and validation on purpose: the kind list IS the
  // catalog's answer, so it cannot be known any earlier.
  raw.kinds = readKinds(formData, slugs);

  const errors = validate(raw, slugs);
  if (Object.keys(errors).length) {
    return { ok: false, errors, values: raw, error: null };
  }

  try {
    const db = getMarketplaceDb();

    /**
     * The category this listing belongs to, created if it is somehow missing.
     *
     * It used to refuse with "run seed.cjs first", which is a thing no seller
     * can do and should never be asked to. The four root categories are
     * platform data — schema.sql §13 creates them now — and this is the belt to
     * that braces: a database seeded before that change still has none, and the
     * right answer is to make the one row rather than to lose the listing a
     * seller has just spent ten minutes filling in.
     *
     * Not a race worth guarding beyond the unique slug: two sellers publishing
     * at the same second both try, one wins, and the loser re-reads.
     */
    const carCategory = await ensureCarCategory(db);

    if (!carCategory) {
      return { ok: false, errors: {}, values: raw, error: 'NO_CAR_CATEGORY' };
    }

    const names = await getCatalogNames(raw);
    const autoTitle = [names.brand, names.model, names.year, names.trim].filter(Boolean).join(' ');

    /* listings.attributes stores option SLUGS. Metadata is read by people, so
       turn them back into names — and never let a missing catalog table stop a
       save: metadata without the fuel type is still metadata. */
    const optionLabels = await getAttributeLabels().catch(() => ({}));
    const conditionLabel = optionLabels.condition?.[raw.condition] ?? null;
    const kindLabels = Object.entries(raw.kinds ?? {})
      .map(([kind, slug]) => optionLabels[kind]?.[slug])
      .filter(Boolean);

    /**
     * Index 0 is the primary photo — the one every card, search result and
     * social preview uses — so ordering here decides what a buyer sees first.
     *
     * The seller's explicit choice wins. Before, "main" was implicit: whichever
     * exterior shot happened to sort first, which meant the only way to change
     * the cover was to delete and re-add photos in a different order. A photo
     * flagged `main` is now hoisted to the front.
     *
     * With no choice made it falls back to exterior-before-interior, so a
     * listing still opens on an outside shot rather than a dashboard close-up.
     * Array.sort is stable, so the seller's ordering within each bucket
     * survives either way.
     */
    const normalized = (raw.media ?? []).map((m) => ({
      ...m,
      category: MEDIA_CATEGORIES.includes(m.category) ? m.category : 'exterior',
    }));

    const chosenMain = normalized.findIndex((m) => m.main);

    const media = normalized
      .sort((a, b) => MEDIA_CATEGORIES.indexOf(a.category) - MEDIA_CATEGORIES.indexOf(b.category))
      .sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0))
      .map((m, i) => ({
        url: m.url,
        path: m.storage_path ?? m.path ?? null,
        alt: m.alt || raw.titleEn || autoTitle,
        category: m.category,
        primary: i === 0,
        // Kept so the form can show which one the seller picked; `primary`
        // alone would be re-derived from position on every load.
        main: chosenMain !== -1 ? !!m.main : i === 0,
      }));

    /**
     * Search and social metadata, seller's words first.
     *
     * The generator reads the CATALOG LABELS, not the slugs — a meta title is
     * read by a person, so "سوزوكي فرونكس" beats "suzuki-fronx". The option
     * kinds the seller answered (transmission, fuel, body type) come along as
     * facts, so a generated description says something specific about the car
     * rather than being the same sentence on every listing.
     */
    const auto = listingSeo({
      brand: names.labels?.brand,
      model: names.labels?.model,
      trim: names.labels?.trim,
      year: names.year,
      city: raw.city,
      condition: conditionLabel,
      mileage: raw.mileage,
      price: raw.price,
      description: { ar: raw.descriptionAr, en: raw.descriptionEn },
      facts: kindLabels,
    });

    /* Blank means "generate it", not "store an empty object" — so each side of
       each pair falls back on its own. A seller who writes an English title
       and leaves the Arabic empty gets a generated Arabic one beside it. */
    const seo = (ar, en, generated) =>
      i18n(ar || generated.ar, en || generated.en);

    const payload = {
      vendor_id: raw.vendorId,
      category_id: carCategory.id,
      type: 'car',
      // Review and Publish are DIFFERENT outcomes, not one boolean. Showing a
      // seller "submitted for review" when the listing actually went live —
      // or the reverse — is the kind of small lie that erodes trust in the
      // whole dashboard, so the intent is carried through rather than
      // collapsed.
      state: STATE_FOR_INTENT[raw.intent] ?? 'draft',
      brand_id: raw.brandId,
      model_id: raw.modelId,
      year_id: raw.yearId,
      trim_id: raw.trimId,
      color_id: raw.colorId,
      name: i18n(raw.titleAr || autoTitle, raw.titleEn || autoTitle),
      description: i18n(raw.descriptionAr, raw.descriptionEn),
      price: raw.price,
      compare_at: raw.compareAt,
      vat_included: true,
      city: raw.city,

      // ── search result ──
      meta_title: seo(raw.metaTitleAr, raw.metaTitleEn, auto.title),
      meta_description: seo(raw.metaDescriptionAr, raw.metaDescriptionEn, auto.description),
      // Arrays on both sides, so an empty list falls back per language.
      meta_keywords: {
        ar: raw.metaKeywords.ar.length ? raw.metaKeywords.ar : auto.keywords.ar,
        en: raw.metaKeywords.en.length ? raw.metaKeywords.en : auto.keywords.en,
      },
      focus_keyword: seo(raw.focusKeywordAr, raw.focusKeywordEn, auto.focus),
      seo_index: raw.seoIndex,
      seo_follow: raw.seoFollow,

      // ── share cards ──
      // Open Graph falls back to the meta pair rather than to the generator a
      // second time: a seller who wrote a meta title meant it for the share
      // card too, and two different titles for one page is a bug in every
      // preview that shows both.
      og_title: seo(raw.ogTitleAr || raw.metaTitleAr, raw.ogTitleEn || raw.metaTitleEn, auto.title),
      og_description: seo(
        raw.ogDescriptionAr || raw.metaDescriptionAr,
        raw.ogDescriptionEn || raw.metaDescriptionEn,
        auto.description
      ),
      // Blank means "use the listing's main photo", which the page already
      // does — storing a copy of that URL here would go stale the first time
      // the seller reorders the gallery.
      og_image_url: raw.ogImageUrl || null,
      og_type: 'product',

      // X reads its own tags first and falls back to OG for what it cannot
      // find, so the same cascade one step further along.
      twitter_card: raw.twitterCard,
      twitter_title: seo(
        raw.twitterTitleAr || raw.ogTitleAr || raw.metaTitleAr,
        raw.twitterTitleEn || raw.ogTitleEn || raw.metaTitleEn,
        auto.title
      ),
      twitter_description: seo(
        raw.twitterDescriptionAr || raw.ogDescriptionAr || raw.metaDescriptionAr,
        raw.twitterDescriptionEn || raw.ogDescriptionEn || raw.metaDescriptionEn,
        auto.description
      ),
      twitter_image_url: raw.twitterImageUrl || raw.ogImageUrl || null,

      // ── sitemap ──
      seo_priority: raw.seoPriority ?? 0.5,
      seo_changefreq: raw.seoChangefreq,

      media,
      attributes: {
        year: names.year ?? null,
        mileage_km: raw.mileage ?? 0,
        condition: raw.condition,
        trim: names.trim ?? null,
        // Keyed by kind slug — the same keys the previous hardcoded block wrote
        // (`fuel`, `transmission`, `seats`, `body_type`), so listings saved
        // before this change read back unchanged. A kind left blank is simply
        // absent rather than explicitly null; the object is replaced wholesale
        // on every save, so absent and null both mean "not answered".
        ...raw.kinds,
      },
    };

    let listingId = raw.listingId;
    let slug;

    if (listingId) {
      // ── update ──
      /**
       * Whose listing this is, established BEFORE anything is written.
       *
       * raw.vendorId came from the session a few lines above, and the read is
       * scoped by it, so a listingId belonging to someone else simply does not
       * come back and the save stops at NOT_FOUND. The update below repeats the
       * scope rather than trusting this read: two statements, and between them
       * the row could in principle change hands.
       */
      const { data: current, error: readError } = await db
        .from('listings')
        .select('public_ref, slug, state')
        .eq('id', listingId)
        .eq('vendor_id', raw.vendorId)
        .maybeSingle();

      if (readError || !current) {
        return { ok: false, errors: {}, values: raw, error: 'NOT_FOUND' };
      }

      // Keep a listing that is already live live; only a draft moves state.
      // A live listing stays live when the seller merely saves an edit; only
      // an explicit Draft takes it back down.
      const nextState =
        current.state === 'live' && raw.intent !== 'draft' ? 'live' : payload.state;
      /**
       * KEEP the existing slug on an edit.
       *
       * This used to rebuild it from the name plus public_ref on every save, so
       * a listing's URL changed each time the seller pressed Save — a live car
       * at /listing/suzuki-fronx-gl-2026 became /listing/suzuki-fronx-gl-2026-40d11b30
       * the first time anyone touched it, and every link, bookmark and share
       * already out there died. A URL is a promise; only a deliberate rename
       * breaks it, which is what `customSlug` is for.
       */
      const renamed = slugify(raw.customSlug);
      slug = renamed
        ? `${renamed}-${current.public_ref}`
        : current.slug || `${stemFor(raw, names)}-${current.public_ref}`;

      const { error } = await db
        .from('listings')
        .update({
          ...payload,
          state: nextState,
          slug,
          // Follows the slug. A renamed listing whose canonical still pointed
          // at the old URL would be telling search engines to index a 404.
          canonical_url: raw.canonicalUrl || `${SITE_URL}/ar/marketplace/listing/${slug}`,
        })
        .eq('id', listingId)
        // Scoped again, deliberately. See the read above.
        .eq('vendor_id', raw.vendorId)
        .select('id');

      if (error) return { ok: false, errors: {}, values: raw, error: error.message };
    } else {
      // ── create ──
      // Insert with a placeholder, then rewrite the slug using the DB-generated
      // public_ref. Generating the ref in app code would let two concurrent
      // inserts pick the same value before either commits.
      const placeholder = `pending-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

      const { data: inserted, error } = await db
        .from('listings').insert({ ...payload, slug: placeholder })
        .select('id, public_ref').single();

      if (error) return { ok: false, errors: {}, values: raw, error: error.message };

      listingId = inserted.id;
      slug = `${stemFor(raw, names)}-${inserted.public_ref}`;

      // The canonical cannot be written with the insert: it contains the slug,
      // and the slug contains the public_ref the database only generates here.
      const { error: slugError } = await db
        .from('listings')
        .update({
          slug,
          canonical_url: raw.canonicalUrl || `${SITE_URL}/ar/marketplace/listing/${slug}`,
        })
        .eq('id', listingId);
      if (slugError) return { ok: false, errors: {}, values: raw, error: slugError.message };
    }

    try {
      await saveVariants(db, listingId, raw.variants);
      await saveSpecs(db, listingId, raw.specs);
    } catch (err) {
      // The listing saved; only the colour variants failed. Say exactly that
      // rather than implying the whole thing was lost.
      return {
        ok: true,
        errors: {},
        values: null,
        error: `Listing saved, but specs/colours failed: ${err.message}`,
        listing: { id: listingId, slug, state: payload.state },
      };
    }

    revalidatePath('/[locale]/marketplace/cars', 'page');
    revalidatePath('/[locale]/marketplace/seller/listings', 'page');
    // The edit form itself. Reopening a listing after saving it was showing
    // the pre-save row — variants included — until a hard refresh.
    revalidatePath('/[locale]/marketplace/seller/listings/[id]', 'page');
    /**
     * The car's own page, one LITERAL path per locale.
     *
     * This used to pass `/[locale]/marketplace/listing/${slug}` with type
     * 'page' — half route pattern, half literal — which matches no cache entry
     * and therefore invalidated nothing. The two lines above are pure patterns
     * and work; this one silently did not, so a seller who added a colour or a
     * photo saw the old page until they hard-refreshed the browser.
     *
     * revalidatePath takes EITHER a literal path (no type) or a route pattern
     * plus type, never a mix — see next/dist/docs/.../revalidatePath.md. Per
     * locale rather than the `[slug]` pattern so one save expires one car,
     * not every listing on the site.
     */
    for (const l of routing.locales) revalidatePath(`/${l}/marketplace/listing/${slug}`);

    return {
      ok: true,
      errors: {},
      values: null,
      error: null,
      listing: { id: listingId, slug, state: payload.state, updated: !!raw.listingId },
    };
  } catch (err) {
    return { ok: false, errors: {}, values: raw, error: err.message };
  }
}

/*
 * setListingState used to live here, and had to go rather than be guarded.
 *
 * Nothing imported it — the live one is in listing-crud.js — but it was still
 * EXPORTED from a 'use server' file, and that is the part that matters: Next
 * mints a callable action id for every such export whether the UI references it
 * or not. It took a listing id and a state and updated the row with no vendor
 * scope of any kind, so it was a public endpoint for changing the state of any
 * listing on the platform.
 *
 * Worth remembering when deleting UI: removing the component that called an
 * action does not remove the action.
 */

/**
 * The "Cars" category, made on demand.
 *
 * Reads first, because in every normal case it exists and this must not be an
 * insert attempt per publish. Falls back to a re-read on a unique violation,
 * which is the concurrent-publish case rather than an error.
 */
async function ensureCarCategory(db) {
  const read = () =>
    db.from('categories')
      .select('id')
      .eq('listing_type', 'car')
      .order('sort_order')
      .limit(1)
      .maybeSingle();

  const { data: existing } = await read();
  if (existing) return existing;

  const { data: created, error } = await db
    .from('categories')
    .insert({
      slug: 'cars',
      name: { ar: 'السيارات', en: 'Cars' },
      listing_type: 'car',
      sort_order: 2,
    })
    .select('id')
    .single();

  if (created) return created;

  // 23505 — somebody else created it a millisecond ago, or a 'cars' row exists
  // under a different listing_type. Either way the read is the answer.
  if (error?.code === '23505') {
    const { data: raced } = await read();
    if (raced) return raced;
  }

  console.error('[marketplace] could not ensure car category:', error?.message);
  return null;
}
