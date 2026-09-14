import { getMarketplaceDb } from '@/marketplace/db/client';
import {
  ENTITY_BY_KEY, selectFor, nameFieldOf, sequenceFieldOf,
} from '@/marketplace/lib/catalog-entities';
import type { LooseRow } from '@/marketplace/lib/row';

/**
 * Generic catalog CRUD, driven by the entity registry.
 *
 * Reads here deliberately do NOT filter on `active` — this is the management
 * view, and a deactivated brand you cannot see is a brand you cannot
 * reactivate.
 *
 * They DO filter on the vendor, when one is given. See vendorScope().
 */

/**
 * The row ids one seller's catalog contains, or null for "everything".
 *
 * The catalog rows are shared — there is one "Toyota" — so what makes a
 * seller's catalog theirs is which rows they have installed or created. That
 * question is answered by vendor_catalog_rows() in the database rather than
 * here, because the same answer is needed by RLS policies and two copies of the
 * rule would drift.
 *
 * Returns null for staff (who administer the whole catalog) and for a call with
 * no vendor. Returns an EMPTY ARRAY for a seller who has installed nothing —
 * and the difference matters: null means "do not filter", [] means "filter to
 * nothing", which is exactly what a new showroom should see.
 */
async function vendorScope(vendorId: string | null, table: string) {
  if (!vendorId) return null;

  const { data, error } = await getMarketplaceDb()
    .rpc('vendor_catalog_rows', { target: vendorId, tbl: table });

  // The function arrives with section 18 of schema.sql. Until it is applied,
  // showing the whole catalog is the old behaviour and is better than showing
  // an error on every tab.
  if (error) return null;

  return [
    ...new Set(
      ((data ?? []) as LooseRow[]).map((r) =>
        typeof r === 'string' ? r : r.vendor_catalog_rows,
      ),
    ),
  ]
    .filter(Boolean);
}

export const PAGE_SIZES = [8, 16, 32, 64, 100];
export const DEFAULT_PAGE_SIZE = 8;

/**
 * One page of a catalog list.
 *
 * Paged in the DATABASE, not the client. trims alone is 1,308 rows; shipping
 * them all so the browser can show 25 wastes the query, the payload and the
 * render. `count: 'exact'` gives the total for the pager without a second
 * round trip.
 */
export async function listEntity(
  key: string,
  {
    parentId,
    kind,
    category,
    q,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    vendorId = null,
  }: {
    parentId?: string | null;
    kind?: string | null;
    category?: string | null;
    q?: string | null;
    page?: number;
    pageSize?: number;
    vendorId?: string | null;
  } = {},
) {
  const entity = ENTITY_BY_KEY[key];
  if (!entity) throw new Error(`Unknown catalog entity "${key}"`);

  const size = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), 200);
  const current = Math.max(Number(page) || 1, 1);

  const allowed = await vendorScope(vendorId, entity.table);

  // Nothing installed. Returned without touching the table — an `.in('id', [])`
  // is a valid query but a pointless round trip.
  if (allowed && !allowed.length) {
    return { items: [], total: 0, page: current, pageSize: size, pageCount: 1 };
  }

  let query = getMarketplaceDb().from(entity.table).select(selectFor(key), { count: 'exact' });

  if (allowed) query = query.in('id', allowed);

  if (entity.parent && parentId) query = query.eq(entity.parent.key, parentId);
  if (entity.kinded && kind) query = query.eq('kind', kind);
  // jsonb path match — the category name is the grouping key, not an id.
  if (entity.categorized && category) query = query.eq('category_name->>en', category);

  if (q) {
    const safe = q.replace(/[%,()]/g, ' ').trim();
    if (safe) {
      const field = nameFieldOf(key);
      query = entity.numericOnly
        ? query.eq('value', Number(safe) || -1)
        : query.or(`${field}->>ar.ilike.%${safe}%,${field}->>en.ilike.%${safe}%,slug.ilike.%${safe}%`);
    }
  }

  const order = entity.orderBy ?? { column: sequenceFieldOf(key), ascending: true };

  const from = (current - 1) * size;

  query = query
    .order(order.column, { ascending: order.ascending })
    // Secondary key so rows never shuffle between pages: sequence is not unique
    // and Postgres gives no stable order for ties, which makes an item appear on
    // two pages or none.
    .order('id', { ascending: true })
    .range(from, from + size - 1);

  const { data, error, count } = await query;

  if (error) {
    // The registry may name a column this database has not got yet — schema.sql
    // is re-runnable and gains columns over time, so a checkout can be ahead of
    // the deployed schema. Fall back to a full select rather than showing the
    // whole tab as broken over one missing optional field.
    if (/column .* does not exist|could not find the .* column/i.test(error.message)) {
      let retryQuery = getMarketplaceDb().from(entity.table).select('*', { count: 'exact' });
      if (allowed) retryQuery = retryQuery.in('id', allowed);

      const retry = await retryQuery
        .order(order.column, { ascending: order.ascending })
        .order('id', { ascending: true })
        .range(from, from + size - 1);

      if (!retry.error) {
        return { items: retry.data ?? [], total: retry.count ?? 0, page: current, pageSize: size };
      }
    }
    throw new Error(`listEntity(${key}): ${error.message}`);
  }

  const total = count ?? 0;
  return {
    items: data ?? [],
    total,
    page: current,
    pageSize: size,
    pageCount: Math.max(1, Math.ceil(total / size)),
  };
}

/**
 * Parent options for the picker — id plus display name only.
 *
 * Scoped like the list itself: a Models tab offering every brand on the
 * platform would let a seller file a model under a brand their own catalog does
 * not contain, and then not be able to see it.
 */
export async function listParentOptions(key: string, vendorId = null) {
  const entity = ENTITY_BY_KEY[key];
  if (!entity?.parent) return [];

  const parentKey = entity.parent.entity ?? '';
  const parent = ENTITY_BY_KEY[parentKey];
  if (!parent) return [];
  const field = nameFieldOf(parentKey);

  // The PARENT's table, not this entity's — the Models tab picks from brands.
  const allowed = await vendorScope(vendorId, parent.table);
  if (allowed && !allowed.length) return [];

  let query = getMarketplaceDb()
    .from(parent.table)
    .select(`id, slug, ${field}`)
    .order(`${field}->>en`, { ascending: true })
    .limit(1000);

  if (allowed) query = query.in('id', allowed);

  const { data, error } = await query;
  if (error) throw new Error(`listParentOptions(${key}): ${error.message}`);
  // The select is built from `field`, so its shape is not statically known.
  return ((data ?? []) as LooseRow[]).map((r) => ({ id: r.id, slug: r.slug, name: r[field] }));
}

/** Distinct `kind` values, for the attribute filter. */
export async function listKinds() {
  const { data, error } = await getMarketplaceDb()
    .from('car_attributes').select('kind').limit(1000);

  if (error) throw new Error(`listKinds: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.kind))].sort();
}

/**
 * Kinds with how many options each holds, for the Kinds tab.
 *
 * A kind is not a row anywhere — it exists only as a value repeated across
 * car_attributes — so this is a group-by done in memory. The table is ~15 rows;
 * a real aggregate would need an RPC for no gain.
 */
export async function listKindsWithCounts() {
  const db = getMarketplaceDb();

  const { data, error } = await db
    .from('car_attributes')
    .select('kind, active')
    .limit(1000);

  if (error) throw new Error(`listKindsWithCounts: ${error.message}`);

  const map = new Map();
  for (const row of data ?? []) {
    if (!row.kind) continue;
    const entry = map.get(row.kind) ?? { kind: row.kind, total: 0, active: 0 };
    entry.total += 1;
    if (row.active !== false) entry.active += 1;
    map.set(row.kind, entry);
  }

  /**
   * Names come from car_attribute_kinds, which arrives with schema.sql.
   *
   * Degrades to slug-only rather than throwing: a checkout can be ahead of the
   * deployed schema, and an unlabelled kind list is still a usable one — a tab
   * that 500s is not.
   *
   * A kind can exist on EITHER side: in the table with no options yet (just
   * created), or on options with no row yet (synced before this table existed).
   * Both belong in the list, so the two sets are merged rather than joined.
   */
  let labels = new Map();
  try {
    const { data: rows, error: kindError } = await db
      .from('car_attribute_kinds')
      .select('slug, name, icon_url, image_url, show_on_card, sequence, active')
      .order('sequence', { ascending: true });

    if (kindError) throw new Error(kindError.message);

    for (const row of rows ?? []) {
      labels.set(row.slug, row);
      if (!map.has(row.slug)) {
        map.set(row.slug, { kind: row.slug, total: 0, active: 0 });
      }
    }
  } catch {
    labels = new Map();
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      name: labels.get(entry.kind)?.name ?? null,
      iconUrl: labels.get(entry.kind)?.icon_url ?? '',
      imageUrl: labels.get(entry.kind)?.image_url ?? '',
      showOnCard: !!labels.get(entry.kind)?.show_on_card,
      sequence: labels.get(entry.kind)?.sequence ?? 0,
      // A kind with no row of its own cannot be renamed or given a name until
      // one exists; the UI offers to adopt it.
      hasRow: labels.has(entry.kind),
    }))
    .sort((a, b) => a.sequence - b.sequence || a.kind.localeCompare(b.kind));
}

/**
 * Distinct spec categories, in the order the car page renders them.
 *
 * Keyed by the English name because that is what group-by uses elsewhere and
 * it stays stable when a seller edits the Arabic wording.
 *
 * ── Scoped, like listEntity and listParentOptions ──────────────────────────
 *
 * This read the whole table. A seller whose Specifications tab was empty still
 * saw eight categories in the dropdown — Engine, Safety, Seats — because those
 * are the categories of the 79 specs ANOTHER showroom installed. Filing a spec
 * under one of them then put it in a group this seller cannot see the rest of,
 * and the empty tab beside a full dropdown made the tab look broken rather than
 * un-installed.
 *
 * Categories are not rows of their own (see §25.1's argument about offer names
 * — this is the case where that argument was NOT applied): the category lives
 * denormalised on each spec, so the vendor scope is the scope of the specs
 * carrying it.
 */
export async function listSpecCategories(vendorId = null) {
  const allowed = await vendorScope(vendorId, 'spec_attributes');
  if (allowed && !allowed.length) return [];

  let query = getMarketplaceDb()
    .from('spec_attributes')
    // The icon comes along so the editor can PICK a category and inherit its
    // icon and order, instead of making someone retype all three every time.
    .select('category_name, category_sequence, category_icon_url')
    .eq('active', true)
    .order('category_sequence', { ascending: true })
    .limit(1000);

  if (allowed) query = query.in('id', allowed);

  const { data, error } = await query;

  if (error) throw new Error(`listSpecCategories: ${error.message}`);

  const seen = new Map();
  for (const row of data ?? []) {
    const category = (row.category_name ?? {}) as LooseRow;
    const key = category.en || category.ar;
    if (!key || seen.has(key)) continue;
    seen.set(key, {
      key,
      name: row.category_name,
      sequence: row.category_sequence ?? 0,
      icon: row.category_icon_url ?? null,
    });
  }
  return [...seen.values()];
}

export async function getEntity(key: string, id: string) {
  const entity = ENTITY_BY_KEY[key];
  if (!entity) throw new Error(`Unknown catalog entity "${key}"`);

  const { data, error } = await getMarketplaceDb()
    .from(entity.table).select(selectFor(key)).eq('id', id).maybeSingle();

  if (error) throw new Error(`getEntity(${key}): ${error.message}`);
  return data;
}

/**
 * How many rows a delete would take with it.
 *
 * Brands cascade to models and trims. A confirmation that says "this also
 * removes 34 models and 121 trims" is the difference between an informed
 * decision and an accident.
 */
export async function countDependents(key: string, id: string) {
  const entity = ENTITY_BY_KEY[key];
  if (!entity?.cascades?.length) return {};

  const db = getMarketplaceDb();
  const out: Record<string, number> = {};

  if (key === 'brands') {
    const { data: models } = await db.from('car_models').select('id').eq('brand_id', id);
    const modelIds = (models ?? []).map((m) => m.id);
    out.models = modelIds.length;

    if (modelIds.length) {
      const { count } = await db
        .from('car_trims').select('id', { count: 'exact', head: true }).in('model_id', modelIds);
      out.trims = count ?? 0;
    } else {
      out.trims = 0;
    }

    const { count: listings } = await db
      .from('listings').select('id', { count: 'exact', head: true }).eq('brand_id', id);
    out.listings = listings ?? 0;
  }

  if (key === 'models') {
    const { count: trims } = await db
      .from('car_trims').select('id', { count: 'exact', head: true }).eq('model_id', id);
    out.trims = trims ?? 0;

    const { count: listings } = await db
      .from('listings').select('id', { count: 'exact', head: true }).eq('model_id', id);
    out.listings = listings ?? 0;
  }

  return out;
}

/** Rows referencing this entity from `listings` — blocks a hard delete. */
export async function countListingRefs(key: string, id: string) {
  const column = { brands: 'brand_id', models: 'model_id', trims: 'trim_id', colors: 'color_id', years: 'year_id' }[key];
  if (!column) return 0;

  const { count } = await getMarketplaceDb()
    .from('listings').select('id', { count: 'exact', head: true }).eq(column, id);

  return count ?? 0;
}

/**
 * Option lists for a page of spec attributes.
 *
 * Only for the rows currently on screen — the editor needs them to seed its
 * options list, and fetching every value for all 80 attributes to render 8
 * rows would be waste.
 */
export async function listSpecValuesFor(attributeIds = []) {
  if (!attributeIds.length) return new Map();

  const { data, error } = await getMarketplaceDb()
    .from('spec_attribute_values')
    .select('id, attribute_id, name, sequence')
    .in('attribute_id', attributeIds)
    .order('sequence', { ascending: true });

  if (error) throw new Error(`listSpecValuesFor: ${error.message}`);

  return (data ?? []).reduce((map, row) => {
    const list = map.get(row.attribute_id) ?? [];
    list.push(row);
    return map.set(row.attribute_id, list);
  }, new Map());
}
