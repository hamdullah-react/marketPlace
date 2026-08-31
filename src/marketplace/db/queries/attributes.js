import { getMarketplaceDb } from '@/marketplace/db/client';
import { localized } from '@/marketplace/lib/listing';

/**
 * Seller-extendable option lists — fuel, transmission, condition, body type,
 * and whatever gets added later.
 *
 * One table with a `kind` discriminator rather than a table per list. Each row
 * carries name, description, icon and image, so an option can render as a
 * labelled tile rather than a bare word.
 */

const SELECT = 'id, kind, slug, name, description, icon_url, image_url, color, sequence, is_custom, approved';

export async function getAttributes(kind) {
  let query = getMarketplaceDb()
    .from('car_attributes')
    .select(SELECT)
    .eq('active', true)
    .order('sequence', { ascending: true });

  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) throw new Error(`getAttributes: ${error.message}`);
  return data ?? [];
}

/** All lists in one round trip, grouped by kind — what the listing form needs. */
export async function getAttributeGroups() {
  const rows = await getAttributes();
  const groups = {};
  for (const row of rows) {
    (groups[row.kind] ??= []).push(row);
  }
  return groups;
}

/**
 * Every option kind that has options, with its bilingual name — what the
 * listing form builds its dropdowns from.
 *
 * This is what makes a seller-created kind reach the form. The form used to
 * hardcode four `<CatalogSelect>` blocks reading attributeGroups.fuel,
 * .transmission, .seats and .body_type by name, so a kind someone added in the
 * Catalog existed, held options, and appeared absolutely nowhere a car could be
 * described with it. Now the form renders whatever this returns.
 *
 * Kinds with no options are skipped — a dropdown with nothing in it is not a
 * field, it is a dead end. Kinds with no row in car_attribute_kinds still come
 * through, labelled by their slug, because options are the thing that makes a
 * kind real here and a missing name is cosmetic.
 */
export async function getKindsWithOptions() {
  /* Both at once. The options and the kind metadata are two different tables
     and neither needs the other, but they were awaited one after the other —
     two round trips to a remote database in series for no reason. */
  const [groups, metaRows] = await Promise.all([
    getAttributeGroups(),
    getMarketplaceDb()
      .from('car_attribute_kinds')
      .select('slug, name, icon_url, sequence')
      .eq('active', true)
      .then(({ data, error }) => (error ? [] : data ?? []))
      .catch(() => []),
  ]);

  const meta = new Map();
  for (const row of metaRows) meta.set(row.slug, row);

  return Object.entries(groups)
    .filter(([, options]) => options.length > 0)
    .map(([kind, options]) => ({
      kind,
      name: meta.get(kind)?.name ?? null,
      iconUrl: meta.get(kind)?.icon_url ?? null,
      sequence: meta.get(kind)?.sequence ?? 0,
      options,
    }))
    .sort((a, b) => a.sequence - b.sequence || a.kind.localeCompare(b.kind));
}

/**
 * Valid slugs per kind, for server-side validation.
 *
 * The save action used to check against hardcoded arrays, which meant the
 * catalog and the validator could disagree: `cvt` was a real transmission in
 * car_attributes but ['automatic','manual'] rejected it, so a seller could
 * pick an option the form offered and have the save bounce. Validating against
 * the same table the form reads from makes that impossible by construction.
 */
export async function getAttributeSlugs() {
  const { data, error } = await getMarketplaceDb()
    .from('car_attributes')
    .select('kind, slug')
    .eq('active', true);

  if (error) throw new Error(`getAttributeSlugs: ${error.message}`);

  const out = {};
  for (const row of data ?? []) (out[row.kind] ??= new Set()).add(row.slug);
  return out;
}

/**
 * The same table as bilingual labels: { fuel: { petrol: {ar, en} }, … }.
 *
 * Keyed exactly the way listings.attributes stores its answers, so turning a
 * saved listing back into readable text is two lookups and no joins. Used by
 * the SEO generator, which needs "Automatic" and "أوتوماتيك" rather than the
 * slug `automatic` that goes in the URL.
 */
export async function getAttributeLabels() {
  const { data, error } = await getMarketplaceDb()
    .from('car_attributes')
    .select('kind, slug, name')
    .eq('active', true);

  if (error) throw new Error(`getAttributeLabels: ${error.message}`);

  const out = {};
  for (const row of data ?? []) (out[row.kind] ??= {})[row.slug] = row.name;
  return out;
}

/**
 * The kinds flagged "show on card", with their bilingual names and the
 * bilingual name of every option under them.
 *
 * RAW — nothing is localized here. That is what lets the HTTP API hand a
 * consumer `{ar, en}` and let it choose, while the site's own pages localize on
 * top via getCardKinds() below. One query, two shapes, no second round trip.
 *
 * The card stores option SLUGS in listings.attributes (`fuel: "petrol"`), so
 * rendering a label needs the option table too — hence two reads rather than
 * one. Both are small and fully covered by the caller's own cache entry.
 *
 * Returns [] rather than throwing when car_attribute_kinds is missing: a card
 * without its fact row is still a card, whereas a browse page that 500s is not.
 */
export async function getCardKindDefs() {
  const db = getMarketplaceDb();

  try {
    const { data: kinds, error } = await db
      .from('car_attribute_kinds')
      .select('slug, name, icon_url, sequence')
      .eq('show_on_card', true)
      .eq('active', true)
      .order('sequence', { ascending: true });

    if (error) throw new Error(error.message);
    if (!kinds?.length) return [];

    const { data: options } = await db
      .from('car_attributes')
      .select('kind, slug, name')
      .in('kind', kinds.map((k) => k.slug));

    const byKind = new Map();
    for (const o of options ?? []) {
      const map = byKind.get(o.kind) ?? {};
      map[o.slug] = o.name ?? null;
      byKind.set(o.kind, map);
    }

    return kinds.map((k) => ({
      kind: k.slug,
      name: k.name ?? null,
      icon: k.icon_url ?? null,
      sequence: k.sequence ?? 0,
      values: byKind.get(k.slug) ?? {},
    }));
  } catch {
    return [];
  }
}

/** The same list, flattened to one language, for the site's own components. */
export async function getCardKinds(locale = 'ar') {
  const defs = await getCardKindDefs();

  return defs.map((d) => ({
    kind: d.kind,
    label: localized(d.name, locale) || d.kind,
    icon: d.icon,
    values: Object.fromEntries(
      Object.entries(d.values).map(([slug, name]) => [slug, localized(name, locale) || slug])
    ),
  }));
}

/** Distinct kinds, for the management page's tab bar. */
export async function getAttributeKinds() {
  const { data, error } = await getMarketplaceDb()
    .from('car_attributes')
    .select('kind')
    .eq('active', true);

  if (error) throw new Error(`getAttributeKinds: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.kind))].sort();
}

/**
 * Everything a seller created that staff has not confirmed, across every
 * catalog table. This is the merge queue — if it grows unattended, the
 * catalogue is fragmenting.
 */
export async function getPendingCatalog() {
  const db = getMarketplaceDb();

  const [brands, models, trims, colors, attributes] = await Promise.all([
    db.from('car_brands').select('id, slug, name, logo_url, created_at, created_by_vendor_id').eq('is_custom', true).eq('approved', false),
    db.from('car_models').select('id, slug, name, brand_id, created_at, created_by_vendor_id').eq('is_custom', true).eq('approved', false),
    db.from('car_trims').select('id, slug, name, model_id, created_at, created_by_vendor_id').eq('is_custom', true).eq('approved', false),
    db.from('car_colors').select('id, slug, name, hex, created_at, created_by_vendor_id').eq('is_custom', true).eq('approved', false),
    db.from('car_attributes').select('id, kind, slug, name, created_at, created_by_vendor_id').eq('is_custom', true).eq('approved', false),
  ]);

  return {
    brands: brands.data ?? [],
    models: models.data ?? [],
    trims: trims.data ?? [],
    colors: colors.data ?? [],
    attributes: attributes.data ?? [],
    total:
      (brands.data?.length ?? 0) + (models.data?.length ?? 0) + (trims.data?.length ?? 0) +
      (colors.data?.length ?? 0) + (attributes.data?.length ?? 0),
  };
}
