import { getMarketplaceDb } from '@/marketplace/db/client';
import type { Enum } from '../types';

const SELECT = 'id, slug, parent_id, name, listing_type, icon_url, sort_order';

/**
 * The whole active tree in one round trip, nested in memory.
 *
 * The category set is small (tens of rows) and read on nearly every page, so
 * one flat fetch plus an in-process nest beats a recursive query.
 */
/** A category with its subtree hung off it, as the nesting loop below builds. */
type CategoryNode = {
  id: string;
  parent_id: string | null;
  children: CategoryNode[];
  [key: string]: unknown;
};

export async function getCategoryTree({
  type,
}: { type?: Enum<'listing_type'> | null } = {}) {
  let query = getMarketplaceDb()
    .from('categories')
    .select(SELECT)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (type) query = query.eq('listing_type', type);

  const { data, error } = await query;
  if (error) throw new Error(`getCategoryTree: ${error.message}`);

  const byId = new Map<string, CategoryNode>(
    (data ?? []).map((row) => [row.id, { ...row, children: [] as CategoryNode[] }]),
  );
  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function getCategoryBySlug(slug: string) {
  const { data, error } = await getMarketplaceDb()
    .from('categories')
    .select(SELECT)
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();

  if (error) throw new Error(`getCategoryBySlug: ${error.message}`);
  return data;
}

/**
 * Root → … → target, for breadcrumbs and BreadcrumbList JSON-LD.
 * Walks parents one at a time; the tree is at most 3 deep.
 */
export async function getCategoryPath(slug: string) {
  const db = getMarketplaceDb();
  const path = [];
  let current = await getCategoryBySlug(slug);

  while (current) {
    path.unshift(current);
    if (!current.parent_id) break;
    const { data } = await db.from('categories').select(SELECT).eq('id', current.parent_id).maybeSingle();
    current = data;
    if (path.length > 5) break; // cycle guard
  }
  return path;
}

/** Direct children only — the chip row under a category header. */
export async function getSubcategories(parentId: string) {
  const { data, error } = await getMarketplaceDb()
    .from('categories')
    .select(SELECT)
    .eq('parent_id', parentId)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`getSubcategories: ${error.message}`);
  return data ?? [];
}
