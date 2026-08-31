import { getMarketplaceDb } from '@/marketplace/db/client';
import { slugify } from '@/marketplace/lib/slug';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

/**
 * Creates a catalog entry a seller typed themselves.
 *
 *   POST /api/marketplace/catalog/create
 *   { kind: 'brand'|'model'|'trim'|'color'|'year', nameAr, nameEn, parentId?, vendorId?, value? }
 *
 * Always looks for an existing match FIRST, case-insensitively, and returns
 * that instead of creating a duplicate. This is the main defence against
 * "Tayota" / "toyota" / "TOYOTA" becoming three brands — a unique index on
 * lower(name->>'en') backs it up at the database level.
 *
 * NO AUTH YET — vendorId comes from the client and is recorded for the admin
 * merge queue. Once auth lands, resolve it from the session.
 */

const KINDS = {
  brand: { table: 'car_brands', parent: null },
  model: { table: 'car_models', parent: 'brand_id' },
  trim: { table: 'car_trims', parent: 'model_id' },
  color: { table: 'car_colors', parent: null },
  year: { table: 'car_years', parent: null },
};

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('Expected JSON', 400, 'BAD_REQUEST');
  }

  const { kind, nameAr, nameEn, parentId, vendorId, value, hex } = body ?? {};
  const config = KINDS[kind];
  if (!config) return fail(`Unknown kind "${kind}"`, 400, 'BAD_KIND');

  const db = getMarketplaceDb();

  try {
    // ── year: a plain integer, nothing to misspell ──
    if (kind === 'year') {
      const year = Number(value);
      if (!Number.isFinite(year) || year < 1950 || year > 2100) {
        return fail('Year must be between 1950 and 2100', 400, 'BAD_YEAR');
      }

      const { data: found } = await db.from('car_years').select('id, value').eq('value', year).maybeSingle();
      if (found) return ok({ item: found, created: false });

      const { data, error } = await db
        .from('car_years').insert({ value: year, is_custom: true }).select('id, value').single();
      if (error) return fail(error.message, 500, 'CREATE_FAILED');
      return ok({ item: data, created: true });
    }

    const en = String(nameEn || nameAr || '').trim();
    const ar = String(nameAr || nameEn || '').trim();
    if (!en) return fail('A name is required', 400, 'NO_NAME');

    if (config.parent && !parentId) {
      return fail(`${kind} needs a ${config.parent.replace('_id', '')}`, 400, 'NO_PARENT');
    }

    // ── existing match wins ──
    const columns = kind === 'color' ? 'id, name, hex' : 'id, name';
    let lookup = db.from(config.table).select(columns).ilike('name->>en', en);
    if (config.parent) lookup = lookup.eq(config.parent, parentId);

    const { data: matches } = await lookup.limit(1);
    if (matches?.length) return ok({ item: matches[0], created: false });

    // ── create ──
    const base = slugify(en) || `custom-${Date.now().toString(36)}`;
    const row = {
      name: { ...(ar ? { ar } : {}), ...(en ? { en } : {}) },
      is_custom: true,
      approved: false,           // lands in the admin merge queue
      created_by_vendor_id: vendorId || null,
    };
    if (config.parent) row[config.parent] = parentId;
    if (kind !== 'color') row.active = true;

    // Slug collisions are possible across brands (two "Territory" models), so
    // retry once with a suffix rather than failing the seller's whole listing.
    for (const slug of [base, `${base}-${Date.now().toString(36).slice(-4)}`]) {
      const { data, error } = await db
        .from(config.table).insert({ ...row, slug }).select('id, name').single();

      if (!error) return ok({ item: data, created: true });
      if (error.code !== '23505') return fail(error.message, 500, 'CREATE_FAILED');
    }

    return fail('Could not create a unique entry — try a different name.', 409, 'DUPLICATE');
  } catch (err) {
    return fail(err.message, 500, 'CREATE_ERROR');
  }
}
