'use server';

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { staffForAction, vendorForAction } from '@/marketplace/auth/session';
import { slugify, kindSlug } from '@/marketplace/lib/slug';

import {
  ENTITIES, nameFieldOf, iconFieldOf, sequenceFieldOf, lacksColumn,
} from '@/marketplace/lib/catalog-entities';
import { countListingRefs, countDependents } from '@/marketplace/db/queries/catalog-admin';

/**
 * Keys listings.attributes owns outright, which a kind may not take over.
 *
 * `condition` is NOT here, though save-listing skips it in its own loop. The
 * difference matters: condition is a real option kind — it lives in
 * car_attributes with `new` and `used` under it, and the listing form renders
 * it — so it already owns `attributes.condition` legitimately. Listing it as
 * reserved meant the Kinds tab refused to save the condition kind at all, and
 * nobody could give it an icon or take it off the card. Only year, mileage_km
 * and trim are genuinely not option kinds.
 */
const RESERVED_ATTRIBUTE_KEYS = ['year', 'mileage_km', 'trim'];

/**
 * Create / update / delete for every catalog list, driven by the registry.
 *
 * NO AUTH YET — these edit shared reference data that every seller's listings
 * point at, so they need a staff check, not just a vendor one, before this is
 * exposed. `requireStaff()` goes at the top of each.
 */

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const bool = (fd, k) => fd.get(k) === 'on' || fd.get(k) === 'true';
const num = (fd, k) => {
  const v = str(fd, k);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const i18n = (ar, en) => {
  const out = {};
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return out;
};
/** A field carrying JSON. Malformed input falls back rather than throwing. */
const json = (fd, k, fallback = null) => {
  try {
    const parsed = JSON.parse(str(fd, k) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const stamp = () => Date.now() + Math.random();

const bump = () => {
  revalidatePath('/[locale]/marketplace/seller/catalog', 'page');
  revalidatePath('/[locale]/marketplace/cars', 'page');
  /**
   * The listing form reads this catalog — brands, models, years, COLOURS,
   * option kinds and specs all come down as props from the server component.
   *
   * Without these two lines a seller could add a colour on the Catalog page,
   * come back to a listing, and not find it in the picker: the row was in the
   * database, but the form was still being served from the router cache with
   * the colour list as it stood before. The only way out was a hard refresh,
   * which is exactly what it looked like — "I added the colour and it only
   * shows after refreshing".
   */
  revalidatePath('/[locale]/marketplace/seller/listings/[id]', 'page');
  revalidatePath('/[locale]/marketplace/seller/listings/new', 'page');
};

/** Builds the row from the form, per the entity's config. */
function buildRow(key, formData) {
  const entity = ENTITIES[key];
  const row = {};

  if (entity.numericOnly) {
    const value = num(formData, 'value');
    if (value == null) return { error: 'CATALOG_VALUE_REQUIRED' };
    row.value = value;
    return { row };
  }

  const nameAr = str(formData, 'nameAr');
  const nameEn = str(formData, 'nameEn');
  if (!nameAr && !nameEn) return { error: 'CATALOG_NAME_REQUIRED' };

  row[nameFieldOf(key)] = i18n(nameAr, nameEn);

  if (entity.hasDescription) {
    row.description = i18n(str(formData, 'descriptionAr'), str(formData, 'descriptionEn'));
  }

  // Specs carry a second name + icon for the category they group under.
  if (key === 'specs') {
    row.category_name = i18n(str(formData, 'categoryNameAr'), str(formData, 'categoryNameEn'));
    row.category_icon_url = str(formData, 'categoryIconUrl') || null;
    row.category_sequence = num(formData, 'categorySequence') ?? 0;
  }

  if (entity.hasIcon || entity.iconField) row[iconFieldOf(key)] = str(formData, 'iconUrl') || null;
  if (entity.hasImage) row.image_url = str(formData, 'imageUrl') || null;
  if (entity.hasLogo) row.logo_url = str(formData, 'logoUrl') || null;
  if (entity.hasSequence || entity.sequenceField) row[sequenceFieldOf(key)] = num(formData, 'sequence') ?? 0;
  if (entity.hasActive) row.active = bool(formData, 'active');
  if (entity.kinded) {
    const kind = str(formData, 'kind');
    if (!kind) return { error: 'CATALOG_KIND_REQUIRED' };
    row.kind = kind;
  }
  if (entity.parent) {
    const parentId = str(formData, 'parentId');
    if (!parentId) return { error: 'CATALOG_PARENT_REQUIRED' };
    row[entity.parent.key] = parentId;
  }

  for (const x of entity.extra ?? []) {
    if (x.type === 'boolean') row[x.key] = bool(formData, x.key);
    else if (x.type === 'number') row[x.key] = num(formData, x.key);
    else if (x.type === 'i18n') {
      // BilingualField submits <key>Ar / <key>En. Null when both are blank, so
      // an untouched unit stays absent rather than becoming an empty object.
      const pair = i18n(str(formData, `${x.key}Ar`), str(formData, `${x.key}En`));
      row[x.key] = Object.keys(pair).length ? pair : null;
    }
    else row[x.key] = str(formData, x.key) || null;
  }

  return { row };
}

/**
 * Who may write to the catalog, and which rows.
 *
 * These actions were staff-only, from when the catalog was one shared list that
 * only the platform curated. It is per-seller now, and a seller who opens
 * "Add · Brands" and is told the feature belongs to the platform team is being
 * refused the thing the empty-catalog notice just invited them to do.
 *
 * So: anyone with a showroom may ADD, and may EDIT anything in their own
 * catalog — including the rows a template installed, which is most of it. See
 * canWriteCatalogRow() below for the membership rule and for what it costs on
 * a platform with more than one showroom.
 *
 * DELETING stays limited to rows they created themselves, because it removes
 * the row for everyone and cannot be undone by whoever it surprises.
 *
 * Staff keep both, on every row: curating the shared catalog is the job.
 */
async function catalogWriter() {
  const staff = await staffForAction();
  if (!staff.error) return { isStaff: true, vendorId: null, viewer: staff.viewer };

  const vendor = await vendorForAction();
  if (vendor.error) return { error: vendor.error };

  return { isStaff: false, vendorId: vendor.vendorId, viewer: vendor.viewer };
}

export async function saveCatalogEntry(prevState, formData) {
  const writer = await catalogWriter();
  if (writer.error) return { ok: false, error: writer.error, errors: {}, token: Date.now() };

  const key = str(formData, 'entity');
  const id = str(formData, 'id');
  const entity = ENTITIES[key];
  if (!entity) return { ok: false, error: 'ENTITY_UNKNOWN' , token: stamp()};

  const { row, error: buildError } = buildRow(key, formData);
  if (buildError) return { ok: false, error: buildError , token: stamp()};

  try {
    const db = getMarketplaceDb();

    // Slug: keep the existing one on edit — changing it breaks live URLs that
    // already point at this catalog page.
    if (entity.hasSlug && !id) {
      const stem =
        slugify(str(formData, 'nameEn') || str(formData, 'nameAr')) || `item-${Date.now().toString(36)}`;

      let slug = stem;
      for (let attempt = 0; attempt < 3; attempt++) {
        let probe = db.from(entity.table).select('id').eq('slug', slug);
        if (entity.parent) probe = probe.eq(entity.parent.key, row[entity.parent.key]);
        const { data: clash } = await probe.limit(1);
        if (!clash?.length) break;
        slug = `${stem}-${Math.random().toString(36).slice(2, 6)}`;
      }
      row.slug = slug;
    }

    // Seller-created entries stay flagged for the merge queue — where there is
    // a flag to set. Asking for it on a table without the column cost a failed
    // insert and a retry to learn what the registry already knew.
    if (!id && entity.hasActive && !lacksColumn(key, 'is_custom')) row.is_custom = true;

    /**
     * Who made this row.
     *
     * Written on CREATE only. It is what puts the row in this seller's catalog
     * (see vendor_catalog_rows in schema.sql section 18) and what later decides
     * whether they may edit or delete it. Staff-created rows carry no vendor,
     * which is what makes them platform rows.
     */
    if (!id && !writer.isStaff && writer.vendorId && !lacksColumn(key, 'created_by_vendor_id')) {
      row.created_by_vendor_id = writer.vendorId;
    }

    // Editing or deleting somebody else's row — including one that arrived with
    // a template — is not theirs to do. Reported as "not yours" rather than
    // "not staff", which was the old message and told a seller nothing they
    // could act on.
    if (id && !(await canWriteCatalogRow(db, entity, id, writer))) {
      return { ok: false, error: 'NOT_YOUR_ENTRY', errors: {}, token: stamp() };
    }

    /**
     * ── A duplicate year is now just a duplicate ───────────────────────────
     *
     * This used to look for anybody's 2025 and adopt it, because `value` was
     * globally unique and a second showroom could not insert its own. Since
     * schema.sql §30 uniqueness is (value, created_by_vendor_id), so every
     * showroom holds its own 2025 and adopting a stranger's row would put a
     * row they own into someone else's catalog.
     *
     * So nothing special happens here any more. Adding a year you already have
     * trips your own unique constraint and `write` below reports it as
     * CATALOG_DUPLICATE, which is what it is.
     */

    /**
     * Writes, dropping any column this database has not got yet.
     *
     * schema.sql gains columns over time and is re-runnable, so a checkout can
     * be ahead of the deployed schema — spec_attributes.image_url is exactly
     * that case. Without this, ONE unknown column rejects the whole row and the
     * save fails with a message about a field the seller never filled in.
     */
    const write = async (payload, attempt = 0) => {
      // `select('id')` on insert so a brand-new spec's id is available for its
      // option list below — without it there is nothing to attach options to.
      const res = id
        ? await db.from(entity.table).update(payload).eq('id', id).select('id').maybeSingle()
        : await db.from(entity.table).insert(payload).select('id').maybeSingle();

      if (!res.error) return { ok: true, dropped: [], id: res.data?.id ?? id };

      // A unique constraint speaks in column and index names — "duplicate key
      // value violates unique constraint car_years_value_key" is a sentence
      // about the schema, shown to someone who typed a number in a box.
      if (/duplicate key value|violates unique constraint/i.test(res.error.message)) {
        return { ok: false, error: 'CATALOG_DUPLICATE', dropped: [] };
      }

      const missing = res.error.message.match(/'([a-z_]+)' column|column "?([a-z_]+)"? .*does not exist/i);
      const column = missing?.[1] ?? missing?.[2];

      if (column && column in payload && attempt < 4) {
        const { [column]: _drop, ...rest } = payload;
        const inner = await write(rest, attempt + 1);
        return { ...inner, dropped: [column, ...inner.dropped] };
      }
      return { ok: false, error: res.error.message, dropped: [] };
    };

    const result = await write(row);
    if (!result.ok) return { ok: false, error: result.error, token: stamp() };

    // Option list for a choice-type spec. Replace-in-place rather than diff:
    // the list is short and a wholesale swap cannot leave a stale row behind.
    // Values already in use keep their id, so existing listings still resolve.
    if (key === 'specs' && result.id) {
      const options = json(formData, 'options', null);
      if (Array.isArray(options)) {
        const keep = options.map((o) => o.id).filter(Boolean);

        let stale = db.from('spec_attribute_values').delete().eq('attribute_id', result.id);
        if (keep.length) stale = stale.not('id', 'in', `(${keep.join(',')})`);
        await stale;

        const rows = options
          .map((o, i) => ({
            ...(o.id ? { id: o.id } : {}),
            attribute_id: result.id,
            name: i18n(o.ar, o.en),
            sequence: i,
            active: true,
          }))
          .filter((o) => o.name.ar || o.name.en);

        if (rows.length) await db.from('spec_attribute_values').upsert(rows, { onConflict: 'id' });
      }
    }

    /**
     * A category edit applies to every spec that shares it.
     *
     * The category has no table of its own — it lives denormalised on each
     * spec row — so "rename Engine" means rewriting category_name on all ten
     * Engine specs. Matching happens on the ORIGINAL English name, because the
     * name is the key and it may be the very thing being renamed.
     *
     * Skipped when nothing about the category actually changed, so an ordinary
     * spec edit does not rewrite ten sibling rows for no reason.
     */
    let categoryRows = 0;
    if (key === 'specs') {
      const originalKey = str(formData, 'categoryKeyOriginal');
      if (originalKey) {
        const next = {
          category_name: row.category_name,
          category_icon_url: row.category_icon_url,
          category_sequence: row.category_sequence,
        };
        const renamed = (next.category_name?.en || next.category_name?.ar) !== originalKey;
        const changed =
          renamed ||
          next.category_icon_url !== (str(formData, 'categoryIconWas') || null) ||
          String(next.category_sequence) !== str(formData, 'categorySequenceWas');

        if (changed) {
          // The grouping key is `en || ar`, so an Arabic-only category is keyed
          // by its Arabic name and would never match an `->>en` filter. Match
          // the same way the key was built.
          const escaped = originalKey.replace(/"/g, '\\"');
          const { data: touched } = await db
            .from('spec_attributes')
            .update(next)
            .or(
              `category_name->>en.eq."${escaped}",` +
              `and(category_name->>en.is.null,category_name->>ar.eq."${escaped}")`
            )
            .neq('id', result.id ?? '')
            .select('id');

          categoryRows = touched?.length ?? 0;
        }
      }
    }

    /**
     * A kind rename applies to every option that carries it.
     *
     * Like spec categories, `kind` has no table of its own — it is a text
     * column repeated on each row — so renaming "fuel" to "fuel_type" means
     * rewriting it on all four fuel options. Matching happens on the ORIGINAL
     * value, because the thing being matched is the thing being renamed.
     */
    let kindRows = 0;
    if (entity.kinded) {
      const originalKind = str(formData, 'kindOriginal');
      if (originalKind && row.kind && row.kind !== originalKind) {
        const { data: touched } = await db
          .from(entity.table)
          .update({ kind: row.kind })
          .eq('kind', originalKind)
          .neq('id', result.id ?? '')
          .select('id');

        kindRows = touched?.length ?? 0;
      }
    }

    if (result.dropped.length) {
      bump();
      return {
        ok: true,
        error: 'SAVED_MINUS_COLUMNS',
        params: { columns: result.dropped.join(', ') },
        token: stamp(),
        saved: id ? 'updated' : 'created',
      };
    }

    bump();
    return {
      ok: true,
      error: null,
      token: stamp(),
      saved: id ? 'updated' : 'created',
      // Category and kind edits are bulk writes. Report the blast radius
      // rather than letting a dozen rows change quietly.
      categoryRows,
      kindRows,
    };
  } catch (err) {
    return { ok: false, error: err.message , token: stamp()};
  }
}

/**
 * Deactivate rather than delete, when the entity supports it.
 *
 * A brand referenced by a live listing cannot be removed — the FK is
 * `on delete restrict` and the listing would be orphaned. Deactivating hides
 * it from the pickers while leaving existing listings intact, which is almost
 * always what "remove this brand" actually means.
 */
export async function toggleCatalogActive(prevState, formData) {
  const writer = await catalogWriter();
  if (writer.error) return { ok: false, error: writer.error, errors: {}, token: Date.now() };

  const key = str(formData, 'entity');
  const id = str(formData, 'id');
  const next = str(formData, 'active') === 'true';
  const entity = ENTITIES[key];

  if (!entity?.hasActive) return { ok: false, error: 'CATALOG_NO_ACTIVE_FLAG' , token: stamp()};

  try {
    const db = getMarketplaceDb();

    // Deactivating a SHARED row hides it from every seller who installed it,
    // so it stays with whoever created it.
    if (!(await canWriteCatalogRow(db, entity, id, writer))) {
      return { ok: false, error: 'NOT_YOUR_ENTRY', token: stamp() };
    }

    const { error } = await db
      .from(entity.table).update({ active: next }).eq('id', id);

    if (error) return { ok: false, error: error.message , token: stamp()};
    bump();
    return { ok: true, error: null, token: stamp(), saved: next ? 'activated' : 'deactivated' };
  } catch (err) {
    return { ok: false, error: err.message , token: stamp()};
  }
}

export async function deleteCatalogEntry(prevState, formData) {
  const writer = await catalogWriter();
  if (writer.error) return { ok: false, error: writer.error, errors: {}, token: Date.now() };

  const key = str(formData, 'entity');
  const id = str(formData, 'id');
  const entity = ENTITIES[key];
  if (!entity) return { ok: false, error: 'ENTITY_UNKNOWN' , token: stamp()};

  try {
    const db = getMarketplaceDb();

    /**
     * ── "Unlink" no longer means anything ─────────────────────────────────
     *
     * There used to be two kinds of delete here. A row you created was yours to
     * destroy; a row you merely pointed at was shared with every other showroom
     * pointing at the same one, so deleting it was not on offer and it was
     * UNLINKED from your catalog instead.
     *
     * Since schema.sql §30 a catalog row belongs to exactly one showroom. There
     * is no such thing as a row you can see but did not get: if it is in your
     * catalog it is yours, and if it is not yours you cannot see it. So there
     * is nothing left to unlink FROM, and delete is just delete.
     */
    if (!(await canWriteCatalogRow(db, entity, id, writer))) {
      return { ok: false, error: 'NOT_YOUR_ENTRY', token: stamp() };
    }

    // Refuse before the database does, with a message that says what to do.
    const refs = await countListingRefs(key, id);
    if (refs > 0) {
      return {
        ok: false,
        error: 'IN_USE_BY_LISTINGS',
        params: { count: refs },
        token: stamp(),
      };
    }

    const deps = await countDependents(key, id);
    const cascading = Object.entries(deps).filter(([k, v]) => k !== 'listings' && v > 0);
    if (cascading.length && str(formData, 'confirmCascade') !== 'true') {
      return {
        ok: false,
        error: 'HAS_DEPENDENTS',
        params: { details: cascading.map(([k, v]) => `${v} ${k}`).join(', ') },
        needsCascadeConfirm: true,
        dependents: deps,
        token: stamp(),
      };
    }

    const { error } = await getMarketplaceDb().from(entity.table).delete().eq('id', id);
    if (error) return { ok: false, error: error.message , token: stamp()};

    bump();
    return { ok: true, error: null, token: stamp(), saved: 'deleted' };
  } catch (err) {
    return { ok: false, error: err.message , token: stamp()};
  }
}

/** Marks a seller-created entry as reviewed, clearing it from the merge queue. */
export async function approveCatalogEntry(prevState, formData) {
  const { error: denied } = await staffForAction();
  if (denied) return { ok: false, error: denied, errors: {}, token: Date.now() };

  const key = str(formData, 'entity');
  const id = str(formData, 'id');
  const entity = ENTITIES[key];
  if (!entity) return { ok: false, error: 'ENTITY_UNKNOWN' , token: stamp()};

  try {
    const { error } = await getMarketplaceDb()
      .from(entity.table).update({ approved: true }).eq('id', id);

    if (error) return { ok: false, error: error.message , token: stamp()};
    bump();
    return { ok: true, error: null, token: stamp(), saved: 'approved' };
  } catch (err) {
    return { ok: false, error: err.message , token: stamp()};
  }
}

/**
 * Deletes several rows in one pass.
 *
 * Checks each id individually rather than firing one bulk DELETE: a single
 * statement either takes everything or nothing, so one row referenced by a
 * listing would silently abort the other nineteen. This reports exactly what
 * went and what was refused.
 */
export async function bulkDeleteCatalog(prevState, formData) {
  const writer = await catalogWriter();
  if (writer.error) return { ok: false, error: writer.error, errors: {}, token: Date.now() };

  const key = str(formData, 'entity');
  const entity = ENTITIES[key];
  if (!entity) return { ok: false, error: 'ENTITY_UNKNOWN', token: stamp() };

  let ids = str(formData, 'ids').split(',').map((s) => s.trim()).filter(Boolean);

  /**
   * Narrowed to rows this caller created, rather than refused outright.
   *
   * A seller who ticks twenty rows — some theirs, some from a template — should
   * get their own removed and be told about the rest, not have the whole
   * operation rejected over rows they did not realise were shared.
   */
  if (!writer.isStaff && ids.length) {
    const { data: mine } = await getMarketplaceDb()
      .from(entity.table)
      .select('id')
      .in('id', ids)
      .eq('created_by_vendor_id', writer.vendorId ?? '00000000-0000-0000-0000-000000000000');

    const owned = new Set((mine ?? []).map((r) => r.id));
    const refused = ids.length - owned.size;
    ids = ids.filter((id) => owned.has(id));

    if (!ids.length) return { ok: false, error: 'NOT_YOUR_ENTRY', token: stamp() };
    if (refused) console.warn(`[catalog] bulk delete skipped ${refused} row(s) not owned by the caller`);
  }
  if (!ids.length) return { ok: false, error: 'NOT_FOUND', token: stamp() };

  try {
    const db = getMarketplaceDb();
    const deletable = [];
    const blocked = [];

    for (const id of ids) {
      const refs = await countListingRefs(key, id);
      if (refs > 0) blocked.push({ id, refs });
      else deletable.push(id);
    }

    let deleted = 0;
    if (deletable.length) {
      const { error } = await db.from(entity.table).delete().in('id', deletable);
      if (error) return { ok: false, error: error.message, token: stamp() };
      deleted = deletable.length;
    }

    bump();

    // Partial success is still success — say how many were held back rather
    // than failing the whole batch over one referenced row.
    return {
      ok: true,
      error: blocked.length ? 'BULK_PARTIAL' : null,
      params: { deleted, blocked: blocked.length },
      deleted,
      blocked: blocked.length,
      token: stamp(),
    };
  } catch (err) {
    return { ok: false, error: err.message, token: stamp() };
  }
}


/**
 * Removes an option kind, and with it every option filed under it.
 *
 * A kind is not a row — it exists only as a value repeated across
 * car_attributes — so "delete the kind" can only mean "delete its options".
 * That is a bulk destructive action on SHARED reference data, so it refuses
 * outright if any of those options is referenced by a listing: unpicking
 * "petrol" from thirty cars is not something a delete button should do
 * silently.
 */
export async function deleteCatalogKind(prevState, formData) {
  const { error: denied } = await staffForAction();
  if (denied) return { ok: false, error: denied, errors: {}, token: Date.now() };

  const kind = str(formData, 'kind');
  if (!kind) return { ok: false, error: 'CATALOG_KIND_REQUIRED', token: stamp() };

  try {
    const db = getMarketplaceDb();

    const { data: options, error: readError } = await db
      .from('car_attributes').select('id, slug').eq('kind', kind);

    if (readError) return { ok: false, error: 'DELETE_FAILED', detail: readError.message, token: stamp() };

    // A kind with NO options is a real kind, not a missing one — it is exactly
    // what "Add kind" produces before any options are filed under it. Bailing
    // out with NOT_FOUND here meant a kind created by mistake could never be
    // removed. Its own row still has to go, so fall through.
    const hasOptions = options?.length > 0;

    // attributes are stored on the listing as slugs, not ids, so the usage
    // check has to look inside the jsonb rather than join on a foreign key.
    const slugs = (options ?? []).map((o) => o.slug).filter(Boolean);
    let inUse = 0;
    if (slugs.length) {
      const { data: listings } = await db.from('listings').select('attributes').limit(2000);
      inUse = (listings ?? []).filter((l) =>
        Object.values(l.attributes ?? {}).some((v) => slugs.includes(v))
      ).length;
    }

    if (inUse > 0) {
      return {
        ok: false,
        error: 'IN_USE_BY_LISTINGS',
        params: { count: inUse },
        token: stamp(),
      };
    }

    if (hasOptions) {
      const { error } = await db.from('car_attributes').delete().eq('kind', kind);
      if (error) return { ok: false, error: 'DELETE_FAILED', detail: error.message, token: stamp() };
    }

    // The kind's own row, which holds its name, icon and show-on-card flag.
    // Skipping this left an orphan: the tab kept listing the kind with zero
    // options, and the delete that was meant to remove it now answered
    // NOT_FOUND — undeletable by the very code that created it.
    const { error: rowError } = await db
      .from('car_attribute_kinds').delete().eq('slug', kind);

    // Absent table is not a failure — the options are already gone, which is
    // the part that matters.
    if (rowError && !/does not exist|schema cache/i.test(rowError.message)) {
      return { ok: false, error: 'DELETE_FAILED', detail: rowError.message, token: stamp() };
    }

    bump();
    return {
      ok: true, error: null, token: stamp(),
      saved: 'kind-deleted', removed: options?.length ?? 0,
    };
  } catch (err) {
    return { ok: false, error: 'DELETE_FAILED', detail: err.message, token: stamp() };
  }
}


/**
 * Renames a kind across every option carrying it.
 *
 * The same rewrite saveCatalogEntry does as a side effect, exposed on its own
 * so the Kinds tab does not have to open an option just to rename its group.
 */
export async function renameCatalogKind(prevState, formData) {
  const { error: denied } = await staffForAction();
  if (denied) return { ok: false, error: denied, errors: {}, token: Date.now() };

  const from = str(formData, 'from');
  const to = str(formData, 'to');

  if (!from || !to) return { ok: false, error: 'CATALOG_KIND_REQUIRED', token: stamp() };
  if (from === to) return { ok: true, error: null, token: stamp(), saved: 'unchanged', moved: 0 };

  try {
    const db = getMarketplaceDb();

    // Merging into an existing kind is allowed — two near-duplicates like
    // "fuel" and "fuel_type" SHOULD be collapsible — but it is worth reporting
    // rather than doing silently.
    const { data: existing } = await db
      .from('car_attributes').select('id').eq('kind', to).limit(1);

    const { data: moved, error } = await db
      .from('car_attributes')
      .update({ kind: to })
      .eq('kind', from)
      .select('id');

    if (error) return { ok: false, error: 'SAVE_FAILED', detail: error.message, token: stamp() };
    if (!moved?.length) return { ok: false, error: 'NOT_FOUND', token: stamp() };

    bump();
    return {
      ok: true,
      error: null,
      token: stamp(),
      saved: 'kind-renamed',
      moved: moved.length,
      mergedInto: existing?.length ? to : null,
    };
  } catch (err) {
    return { ok: false, error: 'SAVE_FAILED', detail: err.message, token: stamp() };
  }
}

/**
 * Creates or renames an option kind, with its bilingual name.
 *
 * Two writes, deliberately in this order: the row in car_attribute_kinds
 * (which owns the name), then the slug on every option carrying the old one.
 * If the second fails the first is still valid — a named kind with stale
 * options is recoverable, whereas renamed options pointing at a row that was
 * never created are not.
 */
export async function saveCatalogKind(prevState, formData) {
  const { error: denied } = await staffForAction();
  if (denied) return { ok: false, error: denied, errors: {}, token: Date.now() };

  const original = str(formData, 'original');
  const nameAr = str(formData, 'nameAr');
  const nameEn = str(formData, 'nameEn');
  // Typed slug wins; otherwise it is derived from the name the same way every
  // other catalog row derives its own. kindSlug, not slugify — see slug.js.
  const slug = kindSlug(str(formData, 'slug') || nameEn || nameAr);

  if (!slug) return { ok: false, error: 'CATALOG_KIND_REQUIRED', token: stamp() };
  if (!nameAr && !nameEn) return { ok: false, error: 'CATALOG_NAME_REQUIRED', token: stamp() };

  // listings.attributes already owns these keys — year and mileage_km are read
  // as numbers by the card and the browse facets. A kind claiming one would
  // overwrite it with an option slug and break both with no error. Caught here
  // so the seller hears about it while naming, not weeks later.
  if (RESERVED_ATTRIBUTE_KEYS.includes(slug)) {
    return { ok: false, error: 'KIND_SLUG_RESERVED', params: { slug }, token: stamp() };
  }

  try {
    const db = getMarketplaceDb();

    const { error: upsertError } = await db
      .from('car_attribute_kinds')
      .upsert(
        {
          slug,
          name: i18n(nameAr, nameEn),
          // Presentation lives on the kind, not on each of its options — one
          // fuel icon, not one per fuel type.
          icon_url: str(formData, 'iconUrl') || null,
          image_url: str(formData, 'imageUrl') || null,
          show_on_card: formData.get('showOnCard') === 'on',
          sequence: num(formData, 'sequence') ?? 0,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' }
      );

    if (upsertError) {
      // The table arrives with schema.sql; name that rather than leaking a
      // driver message about a relation nobody has heard of.
      return { ok: false, error: 'KIND_TABLE_MISSING', detail: upsertError.message, token: stamp() };
    }

    // A rename has to carry its options across and retire the old row.
    let moved = 0;
    if (original && original !== slug) {
      const { data: touched } = await db
        .from('car_attributes').update({ kind: slug }).eq('kind', original).select('id');
      moved = touched?.length ?? 0;

      await db.from('car_attribute_kinds').delete().eq('slug', original);
    }

    bump();
    return { ok: true, error: null, token: stamp(), saved: original ? 'renamed' : 'created', moved };
  } catch (err) {
    return { ok: false, error: 'SAVE_FAILED', detail: err.message, token: stamp() };
  }
}
