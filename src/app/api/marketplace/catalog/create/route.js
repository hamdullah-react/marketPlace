import { getMarketplaceDb } from '@/marketplace/db/client';
import { slugify } from '@/marketplace/lib/slug';
import { getViewer } from '@/marketplace/auth/session';
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
 * ── The vendor comes from the SESSION, never from the body ─────────────────
 *
 * It used to be read off the request, with a note saying to fix it once auth
 * landed. Auth has landed, and the note had become a hole: this route runs on
 * the service role, so anyone who could reach it could create catalog rows
 * attributed to any showroom on the platform — and there was no sign-in check
 * at all. A `vendorId` in the body is now only honoured for STAFF, who
 * legitimately act on a showroom's behalf.
 *
 * ── The duplicate check is scoped to the SHOWROOM'S OWN catalog ────────────
 *
 * §30 of schema.sql gave every showroom its own rows: there is one `toyota`
 * per showroom, not one for the platform. A global lookup therefore found
 * SOMEBODY ELSE'S Toyota and handed it back, so the seller's car pointed at a
 * brand their own catalog does not contain — invisible to them, un-editable,
 * and pinned into their catalog for as long as the listing lives. That is
 * exactly the fault the "A LISTING MUST POINT AT ITS OWN SHOWROOM'S CATALOG"
 * repair exists to undo, and an unscoped create here would recreate it on
 * every use.
 *
 * Platform rows — created_by_vendor_id null — are still matched, because those
 * are shared by design and every showroom may point at them.
 */

const KINDS = {
  brand: { table: 'car_brands', parent: null },
  model: { table: 'car_models', parent: 'brand_id' },
  trim: { table: 'car_trims', parent: 'model_id' },
  color: { table: 'car_colors', parent: null },
  year: { table: 'car_years', parent: null },
  /**
   * An ANSWER to a specification — "Automatic" under Transmission.
   *
   * Handled in a branch of its own below rather than through the generic path,
   * because spec_attribute_values is shaped differently from the catalog
   * tables: no slug, no is_custom, no approved, and no owner column. It
   * belongs to its ATTRIBUTE, and the attribute carries the ownership — which
   * is also where this one's permission check has to look.
   */
  specValue: { table: 'spec_attribute_values', parent: 'attribute_id' },
};

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('Expected JSON', 400, 'BAD_REQUEST');
  }

  const { kind, nameAr, nameEn, parentId, vendorId, value, hex, modelId } = body ?? {};
  const config = KINDS[kind];
  if (!config) return fail(`Unknown kind "${kind}"`, 400, 'BAD_KIND');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in first', 401, 'NOT_SIGNED_IN');

  /**
   * Whose catalog this row joins.
   *
   * Staff may name a showroom, because they add cars on a showroom's behalf.
   * Everyone else gets their own, whatever the body said — the body is a
   * suggestion from a browser, and this route writes with the service role.
   */
  const scope = viewer.isStaff
    ? (vendorId || viewer.vendorIds[0] || null)
    : (viewer.vendorIds.includes(vendorId) ? vendorId : viewer.vendorIds[0] ?? null);

  if (!scope && !viewer.isStaff) {
    return fail('You are not a member of a showroom', 403, 'NO_VENDOR');
  }

  const db = getMarketplaceDb();

  /* Rows this showroom may point at: its own, plus the platform-level ones
     (created_by_vendor_id null), which §30 keeps shared on purpose. */
  const mine = (q) =>
    scope ? q.or(`created_by_vendor_id.eq.${scope},created_by_vendor_id.is.null`) : q;

  /**
   * A colour or year added while a model was selected BELONGS to that model.
   *
   * Colour and year hang off a model the way a trim does — see
   * getModelPalette. A row attached to no model is offered nowhere, so
   * attaching it is not an optional extra here: it is what "add 2027 to this
   * car" means.
   *
   * ── On a MATCH as well as on a create ─────────────────────────────────────
   *
   * The seller typing a year that already exists in their catalog is still
   * saying "this model comes in 2027". Returning the existing row without
   * attaching it would hand the picker an id it immediately filters out, and
   * the field would go blank on a value that had just been accepted.
   *
   * Silent on every failure. The link is an improvement to a row that has
   * already been created and returned; failing the seller's whole create over
   * a table that a migration has not added yet would be the wrong trade.
   */
  const linkToModel = async (table, column, rowId) => {
    if (!modelId || !rowId) return;

    const { data: model } = await db
      .from('car_models')
      .select('id, created_by_vendor_id')
      .eq('id', modelId)
      .maybeSingle();

    // Somebody else's model is not theirs to narrow. The row is still created;
    // it simply stays shared.
    if (!model) return;
    if (!viewer.isStaff && model.created_by_vendor_id && model.created_by_vendor_id !== scope) return;

    await db.from(table).insert({ model_id: modelId, [column]: rowId });
  };

  try {
    // ── year: a plain integer, nothing to misspell ──
    if (kind === 'year') {
      const year = Number(value);
      if (!Number.isFinite(year) || year < 1950 || year > 2100) {
        return fail('Year must be between 1950 and 2100', 400, 'BAD_YEAR');
      }

      /* Scoped like every other kind. Unscoped, the first showroom to add
         2027 owned it and the second was handed a row outside its catalog —
         and the insert recorded no owner at all, which is how §30.8's
         invisible orphan years were made. */
      const { data: found } = await mine(
        db.from('car_years').select('id, value').eq('value', year)
      ).limit(1);
      if (found?.length) {
        await linkToModel('model_years', 'year_id', found[0].id);
        return ok({ item: found[0], created: false });
      }

      const { data, error } = await db
        .from('car_years')
        .insert({ value: year, is_custom: true, created_by_vendor_id: scope })
        .select('id, value').single();
      if (error) return fail(error.message, 500, 'CREATE_FAILED');

      await linkToModel('model_years', 'year_id', data.id);
      return ok({ item: data, created: true });
    }

    /**
     * ── a specification's own option list ──
     *
     * Without this a seller met a dropdown with four answers in it, none of
     * which was the one on the car in front of them, and no way to add a
     * fifth except to leave the spec blank. The free-text fallback is worse
     * than it sounds: it is what made "Automatic", "automatic" and
     * "أوتوماتيك" three values that never match each other — see §14.
     */
    if (kind === 'specValue') {
      const label = String(nameEn || nameAr || '').trim();
      if (!label) return fail('A name is required', 400, 'NO_NAME');
      if (!parentId) return fail('specValue needs an attribute', 400, 'NO_PARENT');

      /* The attribute must be one this showroom can see. The values table has
         no owner of its own, so the parent is where the question is asked —
         otherwise a seller could add answers to somebody else's spec. */
      const { data: attr } = await db
        .from('spec_attributes')
        .select('id, created_by_vendor_id')
        .eq('id', parentId)
        .maybeSingle();

      if (!attr) return fail('No such specification', 404, 'NO_PARENT');
      if (
        !viewer.isStaff &&
        attr.created_by_vendor_id &&
        attr.created_by_vendor_id !== scope
      ) {
        return fail('That specification belongs to another showroom', 403, 'NOT_YOURS');
      }

      const { data: hit } = await db
        .from('spec_attribute_values')
        .select('id, name')
        .eq('attribute_id', parentId)
        .or(`name->>en.ilike.${label},name->>ar.ilike.${label}`)
        .limit(1);

      if (hit?.length) return ok({ item: hit[0], created: false });

      /* Appended to the end of the list rather than inserted anywhere clever:
         the seller added it last, and an option that jumps the queue would
         reorder a list other people are reading. */
      const { data: last } = await db
        .from('spec_attribute_values')
        .select('sequence')
        .eq('attribute_id', parentId)
        .order('sequence', { ascending: false })
        .limit(1);

      const { data, error } = await db
        .from('spec_attribute_values')
        .insert({
          attribute_id: parentId,
          name: {
            ...(nameAr ? { ar: String(nameAr).trim() } : {}),
            ...(label ? { en: label } : {}),
          },
          sequence: (last?.[0]?.sequence ?? 0) + 1,
          active: true,
        })
        .select('id, name')
        .single();

      if (error) return fail(error.message, 500, 'CREATE_FAILED');
      return ok({ item: data, created: true });
    }

    /**
     * ── One name, in the language it was written in ───────────────────────
     *
     * These two used to fall back to each other, so a row created from an
     * Arabic name was stored with that same Arabic text as its ENGLISH name —
     * and every English list then showed Arabic. The client now sends one
     * side; the server stops inventing the other.
     *
     * Matching follows the same rule: an Arabic name is compared against
     * Arabic names. Comparing it to name->>'en' found nothing, so every
     * attempt created another row — which is how one brand becomes four.
     */
    const en = String(nameEn || '').trim();
    const ar = String(nameAr || '').trim();
    const typed = en || ar;
    if (!typed) return fail('A name is required', 400, 'NO_NAME');
    const matchColumn = en ? 'name->>en' : 'name->>ar';

    if (config.parent && !parentId) {
      return fail(`${kind} needs a ${config.parent.replace('_id', '')}`, 400, 'NO_PARENT');
    }

    // ── existing match wins ──
    const columns = kind === 'color' ? 'id, name, hex' : 'id, name';
    let lookup = mine(db.from(config.table).select(columns).ilike(matchColumn, typed));
    if (config.parent) lookup = lookup.eq(config.parent, parentId);

    const { data: matches } = await lookup.limit(1);
    if (matches?.length) {
      if (kind === 'color') await linkToModel('model_colors', 'color_id', matches[0].id);
      return ok({ item: matches[0], created: false });
    }

    // ── create ──
    /* slugify() keeps ASCII, so an Arabic-only name reduces to nothing and
       falls through to the generated slug. That is the honest outcome: a slug
       is a URL segment, and transliterating "تويوتا" into one would be a guess
       nobody asked for. The name is what people read; the slug only has to be
       unique and stable. */
    const base = slugify(en) || `custom-${Date.now().toString(36)}`;
    const row = {
      /* One side only. The other is left for whoever translates it, and
         localized() already falls back, so a half-translated row renders in
         both interfaces rather than blank in one. */
      name: { ...(ar ? { ar } : {}), ...(en ? { en } : {}) },
      is_custom: true,
      approved: false,           // lands in the admin merge queue
      created_by_vendor_id: scope,
    };
    if (config.parent) row[config.parent] = parentId;
    if (kind !== 'color') row.active = true;

    /**
     * The swatch.
     *
     * `hex` arrived in the body, was destructured at the top, and was then
     * never written — so a colour created from the picker went in with a null
     * hex. It LOOKED right until the page reloaded, because ColorPicker merges
     * the hex it just chose into the row it renders; the database had none, so
     * the swatch came back grey and the seller's colour choice was lost.
     *
     * Validated rather than trusted: this value is rendered as a CSS colour,
     * and the one thing it must not be is arbitrary text from a request body.
     */
    if (kind === 'color' && typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
      row.hex = hex.trim().toLowerCase();
    }

    // Slug collisions are possible across brands (two "Territory" models), so
    // retry once with a suffix rather than failing the seller's whole listing.
    for (const slug of [base, `${base}-${Date.now().toString(36).slice(-4)}`]) {
      const { data, error } = await db
        .from(config.table).insert({ ...row, slug }).select(columns).single();

      if (!error) {
        if (kind === 'color') await linkToModel('model_colors', 'color_id', data.id);
        return ok({ item: data, created: true });
      }
      if (error.code !== '23505') return fail(error.message, 500, 'CREATE_FAILED');
    }

    return fail('Could not create a unique entry — try a different name.', 409, 'DUPLICATE');
  } catch (err) {
    return fail(err.message, 500, 'CREATE_ERROR');
  }
}
