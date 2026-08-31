import {
  listEntity, listParentOptions, listKinds, listSpecCategories, listSpecValuesFor,
  listKindsWithCounts, DEFAULT_PAGE_SIZE,
} from '@/marketplace/db/queries/catalog-admin';
import { getVendorOptions } from '@/marketplace/db/queries/seller';
import { getVendorSettings } from '@/marketplace/db/queries/settings';
import { getVendorMedia } from '@/marketplace/db/queries/media';
import { ENTITIES, ENTITY_KEYS } from '@/marketplace/lib/catalog-entities';
import { getViewer } from '@/marketplace/auth/session';

/**
 * Everything the catalog page reads, in one place.
 *
 * The page imports ONLY from here — no direct query imports — so its data
 * surface is one file and swapping a source touches one file.
 *
 * These call the query layer directly rather than fetching
 * /api/marketplace/*. The page is a server component already running on the
 * server; going out over HTTP to our own route would add a round trip, lose
 * the connection pool and gain nothing. The HTTP routes exist for CLIENTS —
 * the combo box, the catalog manager's on-demand lookups — and both share the
 * same query layer underneath, so there is one implementation either way.
 */

export { DEFAULT_PAGE_SIZE };

/**
 * The Kinds tab is not an entity.
 *
 * A kind has its own small table (car_attribute_kinds, holding the bilingual
 * name), but `car_attributes.kind` still stores the slug as text — so it does
 * not fit the generic CRUD the other tabs share. It is a tab in the UI and a
 * special case here, which is the honest shape of the thing.
 */
export const KINDS_TAB = 'kinds';

/**
 * Also not an entity: a template is a file on disk, not a table. Same reason
 * KINDS_TAB is separate — ENTITY_KEYS drives the CRUD manager, and neither of
 * these has rows for it to manage.
 */
export const TEMPLATES_TAB = 'templates';

/** Falls back to the first tab when the URL names an entity that does not exist. */
export function resolveEntity(requested) {
  if (requested === KINDS_TAB) return KINDS_TAB;
  if (requested === TEMPLATES_TAB) return TEMPLATES_TAB;
  return ENTITY_KEYS.includes(requested) ? requested : 'brands';
}

/**
 * Kinds, their option counts, and the store's authoring language.
 *
 * fieldMode comes along because a kind's name is bilingual like every other
 * catalog label, so its editor has to follow the same ar / en / both setting
 * the rest of the dashboard does.
 */
export async function getKindsPageData(vendorId) {
  try {
    const [kinds, settings, assets] = await Promise.all([
      listKindsWithCounts(),
      vendorId ? getVendorSettings(vendorId).catch(() => null) : Promise.resolve(null),
      // A kind carries an icon and an image, so it needs the same media
      // library the other editors pick from.
      vendorId
        ? getVendorMedia(vendorId, { limit: 200 }).then((r) => r.items).catch(() => [])
        : Promise.resolve([]),
    ]);

    return {
      kinds,
      assets,
      fieldMode: settings?.settings?.default_locale ?? 'ar',
      error: null,
    };
  } catch (err) {
    return { kinds: [], assets: [], fieldMode: 'ar', error: err.message };
  }
}

export async function getCatalogPageData(searchParams = {}, { vendorId } = {}) {
  const entityKey = resolveEntity(searchParams.entity);
  const entity = ENTITIES[entityKey];

  /**
   * Which catalog this page is showing.
   *
   * A seller sees only what they installed or created, which is what makes a
   * new showroom open to an empty Catalog tab instead of a hundred brands
   * somebody else chose. Staff see everything — administering the shared
   * catalog is the job.
   */
  const viewer = await getViewer();
  const scope = viewer?.isStaff ? null : vendorId;

  const [list, parents, kinds, categories, settings, assets] = await Promise.all([
    listEntity(entityKey, {
      parentId: searchParams.parent,
      kind: searchParams.kind,
      category: searchParams.category,
      q: searchParams.q,
      page: Number(searchParams.page) || 1,
      pageSize: Number(searchParams.size) || DEFAULT_PAGE_SIZE,
      vendorId: scope,
    }),
    entity.parent ? listParentOptions(entityKey, scope) : Promise.resolve([]),
    // The labelled shape, so the option editor and the filter can show
    // "Body type" rather than the raw slug.
    entity.kinded ? listKindsWithCounts().catch(() => []) : Promise.resolve([]),
    entity.categorized ? listSpecCategories(scope).catch(() => []) : Promise.resolve([]),
    vendorId ? getVendorSettings(vendorId).catch(() => null) : Promise.resolve(null),
    vendorId
      ? getVendorMedia(vendorId, { limit: 200 }).then((r) => r.items).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Spec rows carry their option list so the editor can show and edit it.
  // Only for the page on screen — see listSpecValuesFor.
  let items = list.items;
  if (entityKey === 'specs' && items.length) {
    try {
      const byAttribute = await listSpecValuesFor(items.map((i) => i.id));
      items = items.map((i) => ({ ...i, options: byAttribute.get(i.id) ?? [] }));
    } catch {
      items = items.map((i) => ({ ...i, options: [] }));
    }
  }

  return {
    entityKey,
    items,
    total: list.total,
    page: list.page,
    pageSize: list.pageSize,
    pageCount: list.pageCount ?? 1,
    parents,
    kinds,
    categories,
    assets,
    // Editor fields follow the same authoring-language setting as the rest of
    // the dashboard.
    fieldMode: settings?.settings?.default_locale ?? 'ar',
  };
}

export async function getCatalogVendors() {
  return getVendorOptions().catch(() => []);
}
