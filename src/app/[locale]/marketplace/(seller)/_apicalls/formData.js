import { getBrands, getYears, getColors } from '@/marketplace/db/queries/catalog';
import { getAttributeGroups, getKindsWithOptions } from '@/marketplace/db/queries/attributes';
import { getVendorOptions } from '@/marketplace/db/queries/seller';
import { getVendorSettings } from '@/marketplace/db/queries/settings';
import { getVendorMedia, getListingVariants } from '@/marketplace/db/queries/media';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getViewer } from '@/marketplace/auth/session';
import { getSpecDefinitions, getListingSpecs } from '@/marketplace/db/queries/specs';

/**
 * Everything the listing form needs, for both new and edit.
 *
 * Brands, years and colours ship with the page — small, and every session uses
 * all of them. Models (425) and trims (1308) load on demand from
 * /api/marketplace/catalog instead.
 *
 * Returns { error } rather than throwing so the page can render setup
 * instructions when a migration hasn't been applied yet.
 */
export async function getListingFormData({ vendorId = null, listingId = null, locale = 'ar' } = {}) {
  try {
    /**
     * Which catalog the dropdowns offer.
     *
     * The seller's own, so a new showroom sees empty pickers until it installs
     * a template — otherwise the Catalog tab says "nothing installed" while
     * Add a car offers a hundred brands, and the two disagree about the same
     * question.
     *
     * Staff get everything, because staff list cars on behalf of showrooms and
     * moderate listings from every one of them.
     *
     * Resolved BEFORE the reads below, since all five of them need it.
     */
    const viewer = await getViewer();
    const vendors = await getVendorOptions();
    const scope = viewer?.isStaff ? null : (vendorId || vendors[0]?.id || null);

    const [brands, years, colors] = await Promise.all([
      getBrands(scope),
      getYears(scope),
      getColors(scope),
    ]);

    // Condition, transmission, fuel, seats and body type all live in
    // car_attributes, split by `kind`. The form used to hardcode these as
    // <option> literals, which meant anything staff added on the catalog page
    // was invisible here — and `cvt` existed in the table but not in the form.
    // Reading them makes the catalog the single source of truth.
    let attributeGroups = {};
    try { attributeGroups = await getAttributeGroups(); } catch { attributeGroups = {}; }

    // The same options again, but as an ORDERED, LABELLED list of kinds — which
    // is what lets the form render a dropdown per kind instead of four
    // hardcoded ones. attributeGroups stays because `condition` is still looked
    // up by name: it is the one kind with a rule attached (a used car must state
    // its mileage), so it keeps its own tile row rather than joining the loop.
    let optionKinds = [];
    try { optionKinds = await getKindsWithOptions(); } catch { optionKinds = []; }

    const activeVendorId = vendorId || vendors[0]?.id || null;

    // Spec definitions are shared reference data — one fetch, grouped ready
    // for the accordions. Absent table must not take down the whole form.
    let specGroups = [];
    // locale matters: the category headings are built here, not in the client.
    // `scope` here too — the spec sheet is part of the seller's catalog, and
    // showing all eighty definitions beside an empty brand list was the form
    // giving two different answers to the same question.
    try { specGroups = await getSpecDefinitions(locale, scope); } catch { specGroups = []; }

    // Which language(s) the bilingual fields offer. This is the vendor's
    // "Language & preferences" setting, exactly as the catalog page reads it —
    // the listing form used to look for it on the LISTING row, where it does
    // not exist, so it silently fell back to "both" for everyone and the
    // setting appeared to do nothing.
    let fieldMode = 'both';
    if (activeVendorId) {
      try {
        const settings = await getVendorSettings(activeVendorId);
        fieldMode = settings?.settings?.default_locale ?? 'both';
      } catch {
        fieldMode = 'both';
      }
    }

    // The media library is newer than the catalog, so a missing table here must
    // not take down a form that is otherwise usable.
    let assets = [];
    try {
      if (activeVendorId) ({ items: assets } = await getVendorMedia(activeVendorId, { limit: 200 }));
    } catch {
      assets = [];
    }

    let existing = null;
    if (listingId) {
      /**
       * Whose listing this has to be.
       *
       * The read used to be `.eq('id', listingId)` and nothing else, so
       * /seller/listings/<any-uuid> opened ANY seller's car in an editable
       * form — price, photos, specs and SEO — to anyone with a dashboard.
       * Guessing a uuid is hard; being sent one in a link is not.
       *
       * Staff are exempt because moderating a listing means opening it.
       */
      // `viewer` is the one resolved at the top of the function — the scope
      // for the dropdowns and the ownership check are the same question asked
      // twice, and two reads would be two chances to disagree.
      const mine = viewer?.vendorIds ?? [];
      if (!viewer || (!viewer.isStaff && !mine.length)) {
        return {
          brands, years, colors, vendors, attributeGroups, optionKinds,
          assets, specGroups, existing: null, activeVendorId, fieldMode, error: null,
        };
      }
      // `name` and `description` are jsonb {ar,en} — there are no title_ar /
      // title_en columns. Selecting them returned PostgREST 42703, and because
      // only `data` was destructured the error was invisible: every edit page
      // read `existing = null` and answered notFound(). Surface it instead.
      let query = getMarketplaceDb()
        .from('listings')
        .select('id, slug, vendor_id, brand_id, model_id, year_id, trim_id, color_id, name, description, price, compare_at, city, media, attributes, state, meta_title, meta_description, meta_keywords, og_title, og_description, canonical_url')
        .eq('id', listingId);

      // Someone else's listing and a listing that does not exist both come back
      // empty, and the page answers notFound() to either. That is the right
      // answer to both: confirming a car exists but is not yours is still an
      // answer about someone else's inventory.
      if (!viewer.isStaff) query = query.in('vendor_id', mine);

      const { data, error } = await query.maybeSingle();

      if (error) throw new Error(`listing ${listingId}: ${error.message}`);

      if (data) {
        let variants = [];
        try {
          variants = await getListingVariants(listingId);
        } catch {
          variants = [];
        }
        let specs = [];
        try { specs = await getListingSpecs(listingId); } catch { specs = []; }
        existing = { ...data, variants, specs };
      }
    }

    return {
      brands, years, colors, vendors, attributeGroups, optionKinds,
      assets, specGroups, existing, activeVendorId, fieldMode, error: null,
    };
  } catch (err) {
    return {
      brands: [], years: [], colors: [], vendors: [], attributeGroups: {}, optionKinds: [],
      assets: [], specGroups: [], existing: null, activeVendorId: null,
      fieldMode: 'both', error: err.message,
    };
  }
}
