'use server';

/**
 * Install and remove catalog templates.
 *
 * A template is static JSON in src/marketplace/catalog-templates/, built by
 * build-catalog-templates.cjs. Installing writes its rows into the catalog and
 * records a receipt per row in catalog_template_installs; removing deletes
 * exactly those rows and nothing else.
 *
 * Images travel as FILES. A template stores `logo_file`, `attribute_icon_file`
 * and so on — paths under public/catalog-templates/ that ship with the repo.
 * Installing uploads each one into the marketplace-media bucket, registers it
 * in the media library, and writes the resulting URL onto the row. Removing
 * deletes them again. So an install owns its own copies and an uninstall
 * leaves nothing behind, in the bucket or in the library.
 *
 * Two rules the whole thing hangs on:
 *
 *   1. INSTALL NEVER OVERWRITES. A row that already exists is LINKED to this
 *      seller, not rewritten. Someone who renamed "Suzuki" or fixed a
 *      translation keeps their version — a template is a starting point, not
 *      an authority.
 *
 *   2. REMOVE NEVER DELETES WHAT IS IN USE. A brand a live listing points at
 *      is left alone and reported, rather than cascading a car's brand out
 *      from under it. The foreign keys are `on delete restrict` for exactly
 *      this reason; this just turns the error into a sentence.
 *
 * ── Per seller, over shared rows ────────────────────────────────────────────
 *
 * Installing is now something a SELLER does for their own catalog, not
 * something staff do once for the platform. A new showroom opens the Catalog
 * tab and finds it empty; what appears there is what they chose to install.
 *
 * The ROWS are still shared, though. There is one "Toyota", and every seller
 * who installs the brands template points at it — giving each vendor a private
 * copy would look tidier and break the marketplace, because a listing stores a
 * brand_id and forty Toyotas means the filter "Toyota" finds one seller's cars.
 *
 * So an install does one of two things per row:
 *
 *   the row does not exist yet  → create it, and record that this seller uses it
 *   the row already exists      → record that this seller uses it, and nothing more
 *
 * and removing deletes the seller's record of it, taking the shared row with it
 * only when nobody else is left pointing at it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { SHARED_BUCKET } from '@/marketplace/media/bucket';
import { vendorForAction } from '@/marketplace/auth/session';
import { MANIFEST, TEMPLATES } from '@/marketplace/catalog-templates/templates';
// Car images are not generated into templates.js: they are photos copied into
// each showroom's own library, not catalog rows. See carImagesTemplate.js.
import {
  CAR_IMAGES_KEY, carImagesManifest, installCarImages, removeCarImages,
} from '@/marketplace/media/carImagesTemplate';

const ASSETS = path.join(process.cwd(), 'public', 'catalog-templates');
// The SHARED bucket, on purpose. Template artwork backs catalog rows that
// several showrooms use, so it cannot live inside any one of their buckets.
const BUCKET = SHARED_BUCKET;

/**
 * Which column each `*_file` field fills once uploaded, and which media kind
 * it is filed under in the library.
 *
 * Driven by a table rather than an if-chain so adding an image to a template
 * is a line here, not a branch in the middle of the install.
 */
const IMAGE_FIELDS = {
  logo_file: { column: 'logo_url', folder: 'logos', kind: 'logo' },
  image_file: { column: 'image_url', folder: 'images', kind: 'photo' },
  icon_file: { column: 'icon_url', folder: 'icons', kind: 'icon' },
  attribute_icon_file: { column: 'attribute_icon_url', folder: 'spec-icons', kind: 'icon' },
  category_icon_file: { column: 'category_icon_url', folder: 'category-icons', kind: 'icon' },
};

const MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
};

/** How many uploads run at once. Enough to be quick, few enough to be polite. */
const UPLOAD_CONCURRENCY = 8;

async function inBatches(items, size, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return out;
}

/**
 * Put one template image in the bucket and register it in the library.
 *
 * Returns { url, storagePath } or null. A missing or unreadable file is not
 * fatal: a catalog row without its icon is a row without its icon, whereas a
 * failed install is a vendor with no catalog at all.
 *
 * ── Stored once, for everybody ──────────────────────────────────────────────
 *
 * These used to go to vendors/<installer>/templates/..., filed under whoever
 * happened to install first. That was wrong in both directions: one showroom's
 * media library filled up with forty icons it never uploaded, and the next
 * seller to install the same template got none — because their install creates
 * no new rows, so nothing was ever uploaded on their behalf.
 *
 * The artwork belongs to the catalog ROWS, and those rows are shared. So the
 * file is shared too: one copy at templates/..., owned by nobody, tagged with
 * the template it came from. getVendorMedia() then shows it to exactly the
 * sellers who installed that template.
 */
async function uploadAsset(db, template, relPath, folder, kind, cache) {
  if (!relPath) return null;
  if (cache.has(relPath)) return cache.get(relPath);

  // The path comes out of a JSON file in our own repo, but it still ends up in
  // a filesystem read — so it is resolved and then checked to be INSIDE the
  // assets directory rather than trusted.
  const abs = path.resolve(ASSETS, relPath);
  if (!abs.startsWith(path.resolve(ASSETS) + path.sep)) {
    cache.set(relPath, null);
    return null;
  }

  let body;
  try {
    body = await fs.readFile(abs);
  } catch {
    cache.set(relPath, null);
    return null;
  }

  const ext = (relPath.split('.').pop() || 'png').toLowerCase();
  const name = path.basename(relPath);
  const storagePath = `templates/${folder}/${name}`;

  /**
   * Already here from an earlier install by anyone at all.
   *
   * Worth a lookup: the third seller to install Brands would otherwise re-send
   * forty files that are byte-identical to the ones in the bucket. The tags are
   * still merged below, because one file can belong to more than one template.
   */
  const { data: known } = await db
    .from('media_assets')
    .select('id, url, tags')
    .eq('storage_path', storagePath)
    .maybeSingle();

  if (known?.url) {
    if (template && !(known.tags ?? []).includes(template)) {
      await db
        .from('media_assets')
        .update({ tags: [...new Set([...(known.tags ?? []), 'template', template])] })
        .eq('id', known.id);
    }
    const hit = { url: known.url, storagePath };
    cache.set(relPath, hit);
    return hit;
  }

  const { error } = await db.storage.from(BUCKET).upload(storagePath, body, {
    contentType: MIME[ext] ?? 'application/octet-stream',
    upsert: true,
  });
  if (error) {
    cache.set(relPath, null);
    return null;
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath);
  const result = { url: pub?.publicUrl ?? null, storagePath };

  // The library row is what makes the file pickable in the dashboard. Without
  // it the icon exists, is referenced, and cannot be chosen for anything else.
  await db.from('media_assets').upsert(
    {
      // No owner. This file backs a shared catalog row, so filing it under one
      // showroom would be claiming it for them. Visibility comes from the tag
      // and the installs table — see getVendorMedia().
      vendor_id: null,
      kind,
      storage_path: storagePath,
      url: result.url,
      filename: name,
      mime_type: MIME[ext] ?? null,
      size_bytes: body.length,
      tags: template ? ['template', template] : ['template'],
    },
    { onConflict: 'storage_path' }
  );

  cache.set(relPath, result);
  return result;
}

const ok = (data) => ({ ok: true, error: null, token: Date.now(), ...data });
const bad = (error) => ({ ok: false, error, token: Date.now() });

/**
 * One template, by key. Null when the key is unknown.
 *
 * A map lookup, not a file read — `key` arrives from a form field, and an
 * own-property check is the whole of the validation a lookup needs.
 */
function readTemplate(key) {
  return Object.hasOwn(TEMPLATES, key) ? TEMPLATES[key] : null;
}

/** The manifest, plus how many rows of each template are currently installed. */
export async function getTemplates(vendorId = null) {
  const carImages = carImagesManifest();
  const manifest = carImages ? [...MANIFEST, carImages] : MANIFEST;

  const db = getMarketplaceDb();

  /**
   * Counted for THIS seller only.
   *
   * Without the filter every showroom saw "Installed" on all six templates the
   * moment anybody installed them, and the Install button turned into Remove
   * for a catalog they had never seen. Legacy platform-wide receipts carry a
   * null vendor_id and are deliberately not counted here — that is what makes
   * an existing seller's catalog start empty rather than pre-filled.
   */
  let query = db.from('catalog_template_installs').select('template');
  query = vendorId ? query.eq('vendor_id', vendorId) : query.is('vendor_id', null);

  const { data } = await query;
  const installed = {};
  for (const row of data ?? []) installed[row.template] = (installed[row.template] ?? 0) + 1;

  return manifest.map((t) => ({ ...t, installed: installed[t.key] ?? 0 }));
}

/**
 * Resolves a template's parent references.
 *
 * A template links by SLUG — `brand_slug`, `model_slug` — because it is
 * installed into a database whose uuids it cannot possibly know. This turns
 * those slugs back into ids at install time, which is also what makes the
 * `needs` order in the manifest matter: models are unusable until brands are in.
 *
 * ── Resolved inside THIS showroom's catalog ────────────────────────────────
 *
 * The lookups were unscoped, which was correct while one Toyota row was shared
 * by everyone and is wrong now that each showroom owns its own (§30). Without
 * the filter, installing Models would hang this seller's Camry off whichever
 * showroom's Toyota happened to be read first — a row they cannot see, edit or
 * delete, on a car they are selling.
 */
async function resolveParents(db, key, items, vendorId) {
  if (key === 'models') {
    const { data } = await db.from('car_brands').select('id, slug')
      .eq('created_by_vendor_id', vendorId);
    const byId = new Map((data ?? []).map((b) => [b.slug, b.id]));
    return items
      .map(({ brand_slug: parent, ...row }) => {
        const brand_id = byId.get(parent);
        return brand_id ? { ...row, brand_id } : null;
      })
      .filter(Boolean);
  }

  if (key === 'trims') {
    // Keyed on brand+model, because a model slug is unique per brand and not
    // globally — MG and Mazda both have a "3". Matching on the model alone
    // hands every such trim to whichever brand was read first, which is how
    // an MG trim ends up filed under Mazda.
    const [{ data: brands }, { data: models }] = await Promise.all([
      db.from('car_brands').select('id, slug').eq('created_by_vendor_id', vendorId),
      db.from('car_models').select('id, slug, brand_id').eq('created_by_vendor_id', vendorId),
    ]);
    const brandSlug = new Map((brands ?? []).map((b) => [b.id, b.slug]));

    const byPair = new Map();
    const byModel = new Map();
    for (const m of models ?? []) {
      byPair.set(`${brandSlug.get(m.brand_id)}/${m.slug}`, m.id);
      if (!byModel.has(m.slug)) byModel.set(m.slug, m.id);
    }

    return items
      .map(({ brand_slug: brand, model_slug: parent, ...row }) => {
        // The pair first; the bare model slug only as a fallback for a
        // template built before brands travelled with trims.
        const model_id = byPair.get(`${brand}/${parent}`) ?? byModel.get(parent);
        return model_id ? { ...row, model_id } : null;
      })
      .filter(Boolean);
  }

  return items;
}

export async function installTemplate(prevState, formData) {
  // A seller installing into their OWN catalog. Staff may name a vendor to act
  // for; a seller's own is used whatever the form says.
  const { vendorId, error: denied } = await vendorForAction(
    String(formData.get('vendor') ?? '') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: Date.now() };

  const key = String(formData.get('template') ?? '');

  if (key === CAR_IMAGES_KEY) {
    try {
      const result = await installCarImages(getMarketplaceDb(), vendorId);
      if (!result.ok) return bad(result.error);
      bumpMedia();
      return ok({ added: 0, linked: 0, photos: result.photos, folders: result.folders });
    } catch (err) {
      return bad(err.message);
    }
  }

  const tpl = await readTemplate(key);
  if (!tpl) return bad('UNKNOWN_TEMPLATE');

  const db = getMarketplaceDb();
  const table = tpl.table;

  // Specification VALUES live in their own table and are carried inside each
  // definition, so they are split off before the insert and written after.
  const values = new Map();
  let items = tpl.items.map((row) => {
    if (key === 'specifications') {
      const { values: list, ...rest } = row;
      if (list?.length) values.set(rest.slug, list);
      return rest;
    }
    return row;
  });

  items = await resolveParents(db, key, items, vendorId);
  if (!items.length) return bad('NOTHING_TO_INSTALL');

  /**
   * The columns that actually make a row unique, per table.
   *
   * NOT just `slug`. car_models is `unique (brand_id, slug)` and car_trims is
   * `unique (model_id, slug)`, because a model slug is unique per brand and
   * not globally — MG and Mazda both have a "3", Ford and Chery both have a
   * "5". Keying on the slug alone did two wrong things at once: it treated
   * Mazda's "3" as already installed when MG's was present, dropping it, and
   * it let two genuinely different rows through together, which is the
   * duplicate-key error this replaces.
   */
  const UNIQUE = {
    models: ['brand_id', 'slug'],
    trims: ['model_id', 'slug'],
    years: ['value'],
  };
  const unique = UNIQUE[key] ?? ['slug'];
  const identity = (row) => unique.map((c) => String(row[c] ?? '')).join('\u0000');

  /**
   * What this showroom ALREADY has — not what the platform has.
   *
   * This read the whole table, so the second showroom to install Brands linked
   * to the first one's twenty-six rows instead of getting its own. That was the
   * point of the old shared catalog and it is exactly what §30 ends: a template
   * is a starter file, and installing it gives you COPIES.
   *
   * Scoping it here is the whole change. A row this showroom already owns is
   * still skipped — installing twice must not produce two Toyotas — but a row
   * belonging to someone else is now invisible, so `fresh` picks it up and a
   * private copy is made.
   */
  /**
   * `owned` is false on a database where §30 has not been run yet: car_years
   * and spec_attributes only gain created_by_vendor_id there, and PostgREST
   * answers a filter on a column it cannot find with an error rather than an
   * empty set. Installing Years would then fail outright.
   *
   * So the scope is attempted and the old behaviour is the fallback. It is the
   * pre-§30 behaviour on the two pre-§30 tables — shared rows, linked not
   * copied — which is the honest thing to do until the column exists.
   */
  let owned = true;
  let { data: existing, error: scopeError } = await db
    .from(table)
    .select(['id', ...unique].join(', '))
    .eq('created_by_vendor_id', vendorId);

  if (scopeError && /created_by_vendor_id/.test(scopeError.message)) {
    owned = false;
    ({ data: existing } = await db.from(table).select(['id', ...unique].join(', ')));
  }

  const have = new Map((existing ?? []).map((r) => [identity(r), r.id]));

  /**
   * Three-way split, not two.
   *
   * A row this template names either does not exist yet (create it) or already
   * exists because another seller installed the same template (link to it).
   * The old code simply dropped the second case as "already installed", which
   * was right when the catalog was platform-wide and wrong now: the second
   * seller to install brands would have got zero rows and an empty catalog.
   *
   * Deduped against itself as well as the table — a template built from a
   * paginated source can legitimately contain the same row twice.
   */
  const seen = new Set();
  const fresh = [];
  const linkIds = [];

  for (const r of items) {
    const id = identity(r);
    if (seen.has(id)) continue;
    seen.add(id);

    const existingId = have.get(id);
    if (existingId) linkIds.push(existingId);
    else fresh.push(r);
  }

  let inserted = [];
  let uploaded = 0;
  // relative path → { url, storagePath }. Shared so an icon used by thirty
  // specifications is uploaded once, not thirty times.
  const assetCache = new Map();

  /**
   * The images, for EVERY row this template names — not only the new ones.
   *
   * This ran inside `if (fresh.length)` and was the bug behind "I installed a
   * template and the media library is still empty". The second seller to
   * install Brands creates no rows, so `fresh` is empty, so nothing was
   * uploaded and nothing was registered — while their catalog happily showed
   * logos belonging to files they could not pick for anything else.
   *
   * Doing it for all rows is cheap because uploadAsset() short-circuits on a
   * file already in the library: the work is one lookup per distinct image, not
   * one upload. The tag it merges is what makes the artwork visible to this
   * seller in getVendorMedia().
   *
   * Order still matters for the fresh rows: each is written with its final URL
   * rather than inserted bare and patched afterwards, because a patch pass is a
   * second failure point that leaves half the catalog iconless when it trips.
   */
  {
    const jobs = [];
    fresh.forEach((row, index) => {
      for (const [field, spec] of Object.entries(IMAGE_FIELDS)) {
        if (row[field]) jobs.push({ index, spec, rel: row[field] });
      }
    });

    // Rows that already existed need no URL written back — they carry theirs
    // already — so these jobs register the file and nothing else.
    const linkedSet = new Set(linkIds);
    for (const r of items) {
      if (!linkedSet.has(have.get(identity(r)))) continue;
      for (const [field, spec] of Object.entries(IMAGE_FIELDS)) {
        if (r[field]) jobs.push({ index: -1, spec, rel: r[field] });
      }
    }

    await inBatches(jobs, UPLOAD_CONCURRENCY, async (job) => {
      const asset = await uploadAsset(
        db, key, job.rel, job.spec.folder, job.spec.kind, assetCache
      );
      if (!asset) return null;

      if (job.index >= 0) fresh[job.index][job.spec.column] = asset.url;
      return asset;
    });

    uploaded = assetCache.size;
  }

  if (fresh.length) {
    // The `*_file` fields are template metadata, not columns — strip them or
    // the insert fails on a column that does not exist.
    const payload = fresh.map((row) => {
      const clean = { ...row };
      for (const field of Object.keys(IMAGE_FIELDS)) delete clean[field];
      // Owned outright. This is what puts the row in their catalog now that
      // membership is ownership rather than a receipt — see vendor_catalog_rows
      // in schema.sql §30.7. Omitted where the column does not exist yet, or
      // the insert fails on it.
      if (owned) clean.created_by_vendor_id = vendorId;
      return clean;
    });

    const { data, error } = await db.from(table).insert(payload).select(['id', ...unique].join(', '));
    if (error) return bad(error.message);
    inserted = data ?? [];
  }

  /**
   * The receipts, written after the rows exist so a failed insert leaves no
   * claim that it succeeded.
   *
   * Covers the rows just created AND the ones that were already there: both
   * mean "this seller's catalog contains this row", and only the receipt makes
   * it visible to them. Writing receipts only for inserts is what would leave
   * the second installer with an empty catalog.
   *
   * Which FILES a row carries is not recorded — see removeTemplate, which reads
   * them back off the row itself.
   */
  const rowIds = [...linkIds, ...inserted.map((r) => r.id)];

  if (rowIds.length) {
    const receipts = rowIds.map((row_id) => ({
      template: key, table_name: table, row_id, vendor_id: vendorId,
    }));

    const { error: receiptError } = await db
      .from('catalog_template_installs')
      .upsert(receipts, { onConflict: 'vendor_id, table_name, row_id' });
    if (receiptError) return bad(`installed, but not recorded: ${receiptError.message}`);
  }

  /**
   * ── Bring the rows that ALREADY exist back in line with the template ─────
   *
   * Rule 1 at the top of this file says an install never overwrites, and that
   * was right while a template could only ever ADD rows. It is wrong for a
   * button labelled "Install missing": when a template gains options, corrects
   * a translation or flags a spec to show on the card, every row it names
   * already exists — so the install reported success and changed nothing.
   * Silent, and indistinguishable from a template that was never updated.
   *
   * So a re-install now refreshes the fields the TEMPLATE owns.
   *
   * ── It updates, it does not ERASE ────────────────────────────────────
   *
   * A field the template leaves blank never blanks a column that has something
   * in it — so an icon somebody picked by hand survives a refresh that has no
   * icon to offer. Only what the template actually says is written.
   *
   * The trade, stated rather than hidden: a seller who renamed a SHARED row
   * loses that rename here. Shared rows are the platform's, and the button now
   * means what it says.
   */
  let refreshed = 0;
  if (linkIds.length) {
    const linked = new Set(linkIds);
    const payloads = [];

    for (const row of items) {
      const rowId = have.get(identity(row));
      if (!rowId || !linked.has(rowId)) continue;

      const payload = { id: rowId };

      for (const [field, value] of Object.entries(row)) {
        // `*_file` is template metadata rather than a column; the URL it
        // resolves to is added below.
        if (field in IMAGE_FIELDS) continue;
        if (value === null || value === undefined) continue;
        payload[field] = value;
      }

      for (const [field, spec] of Object.entries(IMAGE_FIELDS)) {
        const url = row[field] ? assetCache.get(row[field])?.url : null;
        if (url) payload[spec.column] = url;
      }

      payloads.push(payload);
    }

    /**
     * Grouped by their column set before writing.
     *
     * PostgREST builds ONE statement per request and needs every object in the
     * batch to carry the same keys — a mixed batch fails with "All object keys
     * must match". Templates are not uniform (a brand with no logo has no
     * logo_url), so rows are bucketed by signature: a handful of requests
     * rather than one per row.
     */
    const groups = new Map();
    for (const payload of payloads) {
      const signature = Object.keys(payload).sort().join(',');
      const group = groups.get(signature);
      if (group) group.push(payload);
      else groups.set(signature, [payload]);
    }

    for (const group of groups.values()) {
      const { error } = await db.from(table).upsert(group, { onConflict: 'id' });
      // Counted, not fatal. The rows this install CREATED are already in and
      // correct, and aborting here would report the whole install as failed.
      if (!error) refreshed += group.length;
    }
  }

  // ── spec option values ──
  let valueCount = 0;
  if (key === 'specifications' && values.size) {
    // Specifications are keyed on slug alone, so identity() is the slug here.
    const bySlug = new Map([...have, ...inserted.map((r) => [identity(r), r.id])]);
    const rows = [];
    for (const [slug, list] of values) {
      const attributeId = bySlug.get(slug);
      if (!attributeId) continue;
      list.forEach((name, i) => rows.push({ attribute_id: attributeId, name, sequence: i * 10 }));
    }

    if (rows.length) {
      /**
       * Skip the VALUES that are already there — not the attributes that have
       * any.
       *
       * ── The bug this replaces ────────────────────────────────────────────
       *
       * This used to collect the attribute_ids that had at least one value and
       * drop every template value for them. The intent was right — a
       * re-install must not double a dropdown — but the unit was wrong, and it
       * made the template UNABLE TO GROW. When transmission gained seven
       * options, the three already in the database were enough to reject all
       * ten, so re-installing reported success and changed nothing. Silent,
       * and indistinguishable from a template that had not been updated.
       *
       * Comparing value by value does both jobs: an option already present is
       * left exactly as it is, and one the template has added lands.
       *
       * ── Folded, because the label IS the identity ────────────────────────
       *
       * There is no shared key to match on: `source_id` is null for everything
       * a template installs, so the only thing an existing row and a template
       * value have in common is what they say. Compared case-insensitively and
       * trimmed, so "Automatic" does not arrive a second time as "automatic" —
       * two spellings of one answer in a dropdown is precisely the mess this
       * table exists to prevent.
       */
      const attributeIds = [...new Set(rows.map((r) => r.attribute_id))];
      const { data: already, error: readError } = await db
        .from('spec_attribute_values')
        .select('attribute_id, name')
        .in('attribute_id', attributeIds);

      // A failed READ must not become an insert of everything — that is how a
      // dropdown gets two of each. Better to add nothing and say so.
      if (readError) return bad(`could not read existing options: ${readError.message}`);

      const fold = (name) => String(name?.en ?? name?.ar ?? '').trim().toLowerCase();
      const optionKey = (attributeId, name) => `${attributeId}\u0000${fold(name)}`;
      const seen = new Set((already ?? []).map((r) => optionKey(r.attribute_id, r.name)));

      const toInsert = rows.filter((row) => {
        const mark = optionKey(row.attribute_id, row.name);
        if (!fold(row.name) || seen.has(mark)) return false;
        // Added as we go, so a template that lists the same option twice still
        // installs it once.
        seen.add(mark);
        return true;
      });

      if (toInsert.length) {
        const { error } = await db.from('spec_attribute_values').insert(toInsert);
        if (!error) valueCount = toInsert.length;
      }
    }
  }

  bump();
  return ok({
    added: inserted.length,
    // Rows that were already there and have been brought back in line with the
    // template. This is what "Install missing" does on a catalog that is
    // already populated, and reporting 0 added with nothing else is what made
    // an update look like a no-op.
    updated: refreshed,
    // Rows that were already in the shared catalog and are now in this
    // seller's. Reported separately from `added` because "26 added" would be a
    // lie for the second seller and "0 added" would look like a failure.
    linked: linkIds.length,
    values: valueCount,
    images: uploaded,
  });
}

export async function removeTemplate(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(
    String(formData.get('vendor') ?? '') || null
  );
  if (denied) return { ok: false, error: denied, errors: {}, token: Date.now() };

  const key = String(formData.get('template') ?? '');

  if (key === CAR_IMAGES_KEY) {
    const result = await removeCarImages(getMarketplaceDb(), vendorId);
    if (!result.ok) return bad(result.error);
    bumpMedia();
    return ok({ removed: result.removed, inUse: result.inUse, files: result.files, keptShared: 0, photos: true });
  }

  const tpl = await readTemplate(key);
  if (!tpl) return bad('UNKNOWN_TEMPLATE');

  const db = getMarketplaceDb();

  // This seller's receipts only. Another showroom that installed the same
  // template keeps theirs, and keeps the rows.
  const { data: receipts, error } = await db
    .from('catalog_template_installs')
    .select('id, table_name, row_id')
    .eq('template', key)
    .eq('vendor_id', vendorId);

  if (error) return bad(error.message);
  if (!receipts?.length) return bad('NOT_INSTALLED');

  /**
   * Which image columns this template's rows carry.
   *
   * Derived from the fields the template actually uses, so a table is never
   * asked for a column it does not have — PostgREST rejects the whole select
   * over one unknown column, and a removal that cannot read is a removal that
   * cannot run.
   */
  const imageColumns = [...new Set(
    Object.entries(IMAGE_FIELDS)
      .filter(([field]) => tpl.items.some((row) => row[field]))
      .map(([, spec]) => spec.column)
  )];

  /**
   * The URLs the rows point at, read BEFORE they are deleted.
   *
   * This used to be a storage_paths column on the receipt. Reading the row
   * instead means nothing has to have been recorded at install time: a row
   * installed by any version of this code, on any database, can still have its
   * images cleaned up. One less column to migrate, one less thing to be out of
   * step with reality.
   */
  const urlsByRow = new Map();
  if (imageColumns.length) {
    const ids = receipts.map((r) => r.row_id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db
        .from(tpl.table)
        .select(['id', ...imageColumns].join(', '))
        .in('id', ids.slice(i, i + 200));
      for (const row of data ?? []) {
        urlsByRow.set(row.id, imageColumns.map((c) => row[c]).filter(Boolean));
      }
    }
  }

  /**
   * Which of these rows somebody ELSE is also using.
   *
   * The rows are shared, so removing a template from one catalog must not take
   * a brand out from under the showroom next door. Those rows lose this
   * seller's receipt and stay in the table.
   */
  const shared = new Set();
  if (receipts.length) {
    const ids = receipts.map((r) => r.row_id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db
        .from('catalog_template_installs')
        .select('row_id')
        .in('row_id', ids.slice(i, i + 200))
        .neq('vendor_id', vendorId);
      for (const r of data ?? []) shared.add(r.row_id);
    }
  }

  let removed = 0;
  let inUse = 0;
  // Rows that left this catalog but stayed in the table because another seller
  // still points at them. Reported so "removed 0" does not read as a failure.
  let keptShared = 0;
  // Collected as the rows go: a file is only orphaned once the row referencing
  // it is actually gone, and a row kept because a listing uses it keeps its
  // icon too.
  const orphaned = new Set();

  // One at a time, on purpose. A bulk delete fails as a unit the moment ONE
  // row is referenced by a listing, taking the other 25 with it; row by row,
  // the referenced ones are reported and the rest still go.
  for (const r of receipts) {
    // Out of THIS catalog either way — the receipt is what makes a row visible
    // to a seller, so dropping it is the removal from their point of view.
    await db.from('catalog_template_installs').delete().eq('id', r.id);

    if (shared.has(r.row_id)) {
      keptShared += 1;
      removed += 1;
      continue;
    }

    const { error: delError } = await db.from(r.table_name).delete().eq('id', r.row_id);

    if (delError) {
      // 23503 — foreign key violation. The row is in use by a real listing,
      // which is a reason to keep it, not an error to surface as a failure.
      if (delError.code === '23503') { inUse += 1; continue; }
      return bad(delError.message);
    }

    removed += 1;
    for (const url of urlsByRow.get(r.row_id) ?? []) orphaned.add(url);
  }

  const filesRemoved = await deleteOrphanedImages(db, tpl.table, imageColumns, orphaned);

  bump();
  return ok({ removed, inUse, files: filesRemoved, keptShared });
}

/**
 * Deletes the images the removed rows were using, and only those.
 *
 * Two things make this safe to run over a shared catalog:
 *
 *   · A URL that a SURVIVING row still points at is kept. One category icon is
 *     shared by every specification in that category, so removing the twelve
 *     that were free to go must not blind the one a listing is holding on to.
 *
 *   · Only files under a `templates/` prefix are touched. If a vendor replaced
 *     a template's logo with their own upload, the row points at their file,
 *     and their file is not this template's to delete.
 *
 * Bucket first, then the library rows: a library row pointing at a deleted file
 * renders a broken thumbnail in the picker, while a file with no row is merely
 * unreachable. Failing in that order leaves the tidier mess.
 */
async function deleteOrphanedImages(db, table, imageColumns, urls) {
  if (!urls.size || !imageColumns.length) return 0;

  const candidates = new Set(urls);

  // Anything a remaining row still uses drops out of the list.
  for (const column of imageColumns) {
    const list = [...candidates];
    for (let i = 0; i < list.length; i += 200) {
      const { data } = await db
        .from(table)
        .select(column)
        .in(column, list.slice(i, i + 200));
      for (const row of data ?? []) candidates.delete(row[column]);
    }
  }
  if (!candidates.size) return 0;

  // The library is what maps a public URL back to the object behind it.
  const paths = [];
  const list = [...candidates];
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await db
      .from('media_assets')
      .select('storage_path, url, tags')
      .in('url', list.slice(i, i + 200));

    for (const asset of data ?? []) {
      const p = asset.storage_path ?? '';

      // Two shapes, because template art used to be filed per vendor at
      // vendors/<id>/templates/... and is now shared at templates/... . A
      // database that has seen both must recognise both, or the older files
      // stop being cleaned up and quietly accumulate.
      const isTemplateFile = p.startsWith('templates/') || p.includes('/templates/');
      if (!isTemplateFile) continue;

      /**
       * One file, more than one template.
       *
       * A category icon can arrive with the categories template AND the
       * specifications one, and the tags record every template that claimed
       * it. Removing one of them does not orphan the file — the candidate
       * filter above only proves nothing in THIS table still points at it.
       * Keeping it costs a few kilobytes; deleting it blanks an icon somewhere
       * this function never looked.
       */
      const claims = (asset.tags ?? []).filter((tag) => tag !== 'template');
      if (claims.length > 1) continue;

      paths.push(p);
    }
  }
  if (!paths.length) return 0;

  let deleted = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(batch);
    if (error) continue;
    deleted += batch.length;
    await db.from('media_assets').delete().in('storage_path', batch);
  }

  return deleted;
}

/** The car-images template changes the media library, not the catalog. */
function bumpMedia() {
  revalidatePath('/[locale]/marketplace/seller/media', 'page');
  revalidatePath('/[locale]/marketplace/seller/catalog', 'page');
}

/** Everything that reads the catalog. Same list as catalog-crud's own bump(). */
function bump() {
  revalidatePath('/[locale]/marketplace/seller/catalog', 'page');
  revalidatePath('/[locale]/marketplace/cars', 'page');
  revalidatePath('/[locale]/marketplace/seller/listings/[id]', 'page');
  revalidatePath('/[locale]/marketplace/seller/listings/new', 'page');
}
