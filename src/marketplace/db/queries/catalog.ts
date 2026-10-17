import { getMarketplaceDb } from '@/marketplace/db/client';
import type { LooseRow } from '@/marketplace/lib/row';

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
async function scopeIds(vendorId: string | null, table: string) {
  if (!vendorId) return null;

  const { data, error } = await getMarketplaceDb()
    .rpc('vendor_catalog_rows', { target: vendorId, tbl: table });

  // Section 18 of schema.sql has not been applied yet. Falling back to the
  // unscoped list keeps the form working rather than showing a seller an empty
  // brand list they cannot explain.
  if (error) return null;

  return [
    ...new Set(
      ((data ?? []) as LooseRow[]).map((r) =>
        typeof r === 'string' ? r : r.vendor_catalog_rows,
      ),
    ),
  ].filter(Boolean) as string[];
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

export async function getModels(brandId: string | null, vendorId: string | null = null) {
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

export async function getTrims(modelId: string | null, vendorId: string | null = null) {
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

/**
 * The colours and years ONE MODEL offers — and only those.
 *
 * ── A colour belongs to a model, exactly as a trim does ─────────────────────
 *
 * Brand → model → trim is a chain of ownership: a trim belongs to one model
 * and appears nowhere else, which is why picking a model is what fills the
 * trim list. Colour and year now work the same way. The 2026 Camry offers the
 * colours somebody recorded against the 2026 Camry, and nothing else.
 *
 * `model_colors` / `model_years` are the link rows rather than a `model_id`
 * column on the colour itself, and that is an implementation detail with one
 * visible consequence worth stating: the same colour ROW can be attached to
 * two models when a seller wants that, so renaming it renames it in both
 * places. What a seller sees is still one palette per model.
 *
 * ── An unlinked colour is in NO model's list ────────────────────────────────
 *
 * This is the whole point and it is worth being blunt about: there is no
 * "shared" tier. A colour attached to nothing is offered nowhere, the way a
 * trim with no model would be. The listing form's create button is how the
 * list gets filled — adding a colour while a model is selected attaches it to
 * that model, which is the only way colours are added from the form.
 *
 * ── The ids, not the exclusions ─────────────────────────────────────────────
 *
 * The caller holds the full catalog and keeps only what is named here. An
 * empty answer therefore means an empty picker, which is the honest state for
 * a model nobody has recorded a palette for yet.
 */
async function linkedIds(table: string, column: string, modelId: string) {
  const { data, error } = await getMarketplaceDb()
    .from(table)
    .select(column)
    .eq('model_id', modelId);

  /* A missing table means the section of schema.sql that creates it has not
     been run yet. `null` is distinct from `[]` here — it means "no answer",
     and the caller leaves the list unfiltered rather than showing the seller
     an empty picker they cannot explain. */
  if (error) return null;

  return (data as LooseRow[]).map((row) => row[column] as string);
}

/**
 * What the listing form shows once a model is chosen.
 *
 * ── Scoped to the CALLER's own catalog ──────────────────────────────────────
 *
 * `vendorId` is not decoration. Model ids are public — /api/marketplace/models
 * is an unauthenticated route, because a buyer filtering the browse grid needs
 * it — so without this check any signed-in seller could ask for a neighbour's
 * model id and be told how many colours and years that showroom has recorded
 * against it, with their ids. Ids are not names, and a list of another
 * business's catalog ids is still that business's data.
 *
 * A model that is not the caller's answers with EMPTY lists rather than an
 * error: the question "what does this model offer" is answered "nothing, as
 * far as you are concerned", which tells the asker nothing they did not
 * already supply. Platform-owned models (no owner) stay readable, as they are
 * everywhere else.
 *
 * Pass null for staff, who legitimately work every showroom's catalog — the
 * same convention getBrands and getModels already use.
 */
export async function getModelPalette(modelId: string | null, vendorId: string | null = null) {
  if (!modelId) return { colors: null, years: null };

  if (vendorId) {
    const { data: model } = await getMarketplaceDb()
      .from('car_models')
      .select('created_by_vendor_id')
      .eq('id', modelId)
      .maybeSingle();

    if (model?.created_by_vendor_id && model.created_by_vendor_id !== vendorId) {
      return { colors: [], years: [] };
    }
  }

  const [colors, years] = await Promise.all([
    linkedIds('model_colors', 'color_id', modelId),
    linkedIds('model_years', 'year_id', modelId),
  ]);
  return { colors, years };
}

/** Resolves the four catalog ids to names, for building a listing slug stem. */
export async function getCatalogNames({
  brandId,
  modelId,
  yearId,
  trimId,
}: {
  brandId?: string | null;
  modelId?: string | null;
  yearId?: string | null;
  trimId?: string | null;
}) {
  const db = getMarketplaceDb();
  const [brand, model, year, trim] = await Promise.all([
    brandId ? db.from('car_brands').select('slug, name').eq('id', brandId).maybeSingle() : null,
    modelId ? db.from('car_models').select('slug, name').eq('id', modelId).maybeSingle() : null,
    yearId ? db.from('car_years').select('value').eq('id', yearId).maybeSingle() : null,
    trimId ? db.from('car_trims').select('slug, name').eq('id', trimId).maybeSingle() : null,
  ]);

  // Slug first — it is already URL-safe and stable. The English name is the
  // fallback for a row created before slugs were assigned.
  const stem = (r: LooseRow | null) =>
    r?.data?.slug || r?.data?.name?.en || r?.data?.name?.ar || null;

  return {
    brand: stem(brand as LooseRow | null),
    model: stem(model as LooseRow | null),
    year: year?.data?.value,
    trim: stem(trim as LooseRow | null),
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
