import { getMarketplaceDb } from '@/marketplace/db/client';

/**
 * Car catalog reads — brand → model → trim, plus years and colours.
 *
 * This is a synced copy of the main site's Odoo mirror (sync-catalog.cjs), so
 * the marketplace and the dealership site name the same car the same way. That
 * is what stops "Tayota" / "toyota" / "TOYOTA" fragmenting the inventory, and
 * what makes the catalog pages rank.
 *
 * ── The vendorId argument ───────────────────────────────────────────────────
 *
 * Every reader here takes an optional vendorId, and the two audiences want
 * opposite things from it:
 *
 *   a BUYER filtering the browse grid must see every brand on the platform, so
 *   the public API routes pass nothing and nothing changes for them;
 *
 *   a SELLER filling in the listing form must see only their own catalog, or
 *   the form offers a hundred brands they never installed and the "clean
 *   catalog" a new showroom opens to lasts exactly as long as it takes them to
 *   click Add a car.
 *
 * Hence an argument rather than a global rule. Passing it is what makes a read
 * private; forgetting it leaves the old, public behaviour, which is the safe
 * direction to fail in for a catalog whose whole job is to be shared.
 */

/**
 * The row ids in one seller's catalog, or null for "no filter".
 *
 * Answered by the database — vendor_catalog_rows() is the same function the
 * catalog page and the RLS policies use, so the three cannot disagree about
 * what a seller's catalog contains.
 */
async function scopeIds(vendorId, table) {
  if (!vendorId) return null;

  const { data, error } = await getMarketplaceDb()
    .rpc('vendor_catalog_rows', { target: vendorId, tbl: table });

  // Section 18 of schema.sql has not been applied yet. Falling back to the
  // unscoped list keeps the form working rather than showing a seller an empty
  // brand list they cannot explain.
  if (error) return null;

  return [...new Set((data ?? []).map((r) => (typeof r === 'string' ? r : r.vendor_catalog_rows)))]
    .filter(Boolean);
}

export async function getBrands(vendorId = null) {
  const allowed = await scopeIds(vendorId, 'car_brands');
  if (allowed && !allowed.length) return [];

  let query = getMarketplaceDb()
    .from('car_brands')
    .select('id, slug, name, logo_url')
    .eq('active', true)
    .order('name->>en', { ascending: true });

  if (allowed) query = query.in('id', allowed);

  const { data, error } = await query;
  if (error) throw new Error(`getBrands: ${error.message}`);
  return data ?? [];
}

export async function getModels(brandId, vendorId = null) {
  if (!brandId) return [];

  const allowed = await scopeIds(vendorId, 'car_models');
  if (allowed && !allowed.length) return [];

  let query = getMarketplaceDb()
    .from('car_models')
    .select('id, slug, name, brand_id')
    .eq('brand_id', brandId)
    .eq('active', true)
    .order('name->>en', { ascending: true });

  if (allowed) query = query.in('id', allowed);

  const { data, error } = await query;
  if (error) throw new Error(`getModels: ${error.message}`);
  return data ?? [];
}

export async function getTrims(modelId, vendorId = null) {
  if (!modelId) return [];

  const allowed = await scopeIds(vendorId, 'car_trims');
  if (allowed && !allowed.length) return [];

  let query = getMarketplaceDb()
    .from('car_trims')
    .select('id, slug, name, code, model_id')
    .eq('model_id', modelId)
    .eq('active', true)
    .order('name->>en', { ascending: true });

  if (allowed) query = query.in('id', allowed);

  const { data, error } = await query;
  if (error) throw new Error(`getTrims: ${error.message}`);
  return data ?? [];
}

/** Newest first — a seller listing a car is far more likely to want a recent year. */
export async function getYears(vendorId = null) {
  const allowed = await scopeIds(vendorId, 'car_years');
  if (allowed && !allowed.length) return [];

  let query = getMarketplaceDb()
    .from('car_years')
    .select('id, value')
    .order('value', { ascending: false });

  if (allowed) query = query.in('id', allowed);

  const { data, error } = await query;
  if (error) throw new Error(`getYears: ${error.message}`);
  return data ?? [];
}

export async function getColors(vendorId = null) {
  const allowed = await scopeIds(vendorId, 'car_colors');
  if (allowed && !allowed.length) return [];

  let query = getMarketplaceDb()
    .from('car_colors')
    .select('id, name, hex')
    .order('name->>en', { ascending: true });

  if (allowed) query = query.in('id', allowed);

  const { data, error } = await query;
  if (error) throw new Error(`getColors: ${error.message}`);
  return data ?? [];
}

/** Resolves the four catalog ids to names, for building a listing slug stem. */
export async function getCatalogNames({ brandId, modelId, yearId, trimId }) {
  const db = getMarketplaceDb();
  const [brand, model, year, trim] = await Promise.all([
    brandId ? db.from('car_brands').select('slug, name').eq('id', brandId).maybeSingle() : null,
    modelId ? db.from('car_models').select('slug, name').eq('id', modelId).maybeSingle() : null,
    yearId ? db.from('car_years').select('value').eq('id', yearId).maybeSingle() : null,
    trimId ? db.from('car_trims').select('slug, name').eq('id', trimId).maybeSingle() : null,
  ]);

  // Slug first — it is already URL-safe and stable. The English name is the
  // fallback for a row created before slugs were assigned.
  const stem = (r) => r?.data?.slug || r?.data?.name?.en || r?.data?.name?.ar || null;

  return {
    brand: stem(brand),
    model: stem(model),
    year: year?.data?.value,
    trim: stem(trim),
    /**
     * The same four rows as bilingual LABELS rather than slugs.
     *
     * The slugs above are for URLs and attribute keys, where "jeel-al" is
     * correct and "جي ال" is not. A meta title is read by a person, so it
     * needs the name in their language — hence both shapes off one read
     * instead of a second round trip for the SEO builder.
     */
    labels: {
      brand: brand?.data?.name ?? null,
      model: model?.data?.name ?? null,
      trim: trim?.data?.name ?? null,
      year: year?.data?.value ?? null,
    },
  };
}

/** Spec attributes grouped by category — drives the optional spec section. */
export async function getSpecAttributes() {
  const { data, error } = await getMarketplaceDb()
    .from('spec_attributes')
    .select('id, slug, category_name, category_icon_url, attribute_name, attribute_icon_url, unit_code, display_type, category_sequence, attribute_sequence')
    .eq('active', true)
    .order('category_sequence', { ascending: true })
    .order('attribute_sequence', { ascending: true });

  if (error) throw new Error(`getSpecAttributes: ${error.message}`);
  return data ?? [];
}
