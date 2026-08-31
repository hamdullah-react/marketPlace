'use server';

/**
 * The lead-form builder — a seller deciding what to ask buyers.
 *
 * Every write here resolves the showroom from the SESSION, never from the form.
 * A field belongs to one showroom, is only ever read back scoped to that
 * showroom, and the RLS policy in schema.sql §20.3 refuses anything that gets
 * past this file. Posting another seller's vendor_id does nothing at all.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';
import { TYPES_WITH_OPTIONS, FIELD_TYPE_SET } from '@/marketplace/lib/form-fields';
import {
  FORM_STYLES, WIDTHS, HEX_COLOR, NUMERIC_TOKENS, COLOR_FIELDS,
  normaliseTheme, defaultTheme,
} from '@/marketplace/lib/form-styles';
import { LEAD_FORM_TEMPLATE, templateOptions } from '@/marketplace/lib/lead-form-template';

const FORM_STYLE_KEYS = new Set(FORM_STYLES.map((s) => s.key));
const WIDTH_KEYS = new Set(WIDTHS.map((w) => w.key));

const NUMERIC_BY_KEY = Object.fromEntries(NUMERIC_TOKENS.map((n) => [n.key, n]));

/**
 * 42703 is "column does not exist" — a database that has not run the newest
 * section of schema.sql yet.
 */
const isMissingColumn = (error) =>
  error?.code === '42703' ||
  /column .* does not exist|could not find the '.*' column/i.test(error?.message ?? '');

/**
 * Writes a row, dropping the columns this database does not have yet.
 *
 * Code deploys before somebody runs the SQL — always in that order — and in
 * between, a write naming a new column fails ENTIRELY. Not "the width was
 * ignored": PostgREST rejects the whole statement, so adding `width` to the
 * payload silently broke saving a field at all, which is how three buttons
 * that do nothing turn out to be a form that cannot be edited.
 *
 * So the newer columns are attempted, and on that specific failure they are
 * removed and the write is retried. Everything the seller typed still saves;
 * only the layout is deferred until the section is applied.
 */
const OPTIONAL_COLUMNS = ['width', 'tab_id'];

async function writeRow(query, row) {
  const first = await query(row);
  if (!first.error || !isMissingColumn(first.error)) return first;

  // An array too, because installing the starter template inserts ten rows in
  // one statement. Spreading an array into an object turns it into {0:…, 1:…}
  // and PostgREST is handed nonsense, so the shape has to be preserved.
  const strip = (one) => {
    const out = { ...one };
    for (const key of OPTIONAL_COLUMNS) delete out[key];
    return out;
  };

  const trimmed = Array.isArray(row) ? row.map(strip) : strip(row);

  console.warn(
    '[marketplace] lead form: saved without layout columns — run schema.sql §20.4 and §22'
  );

  return query(trimmed);
}

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, errors: {}, token: stamp(), ...data });
const bad = (error, errors = {}) => ({ ok: false, error, errors, token: stamp() });

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

/**
 * A stable machine name for a label.
 *
 * Generated ONCE, when the field is created, and never recomputed on edit —
 * this is the key the answers are filed under, so changing it would orphan
 * every lead that already answered the question.
 *
 * Arabic labels are common here and would slugify to nothing, so a label with
 * no Latin characters falls back to a generic stem plus a counter.
 */
function keyFrom(label) {
  const stem = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  return stem || 'field';
}

async function freeKey(db, vendorId, stem) {
  const { data } = await db
    .from('vendor_form_fields')
    .select('field_key')
    .eq('vendor_id', vendorId)
    .like('field_key', `${stem}%`);

  const taken = new Set((data ?? []).map((r) => r.field_key));
  if (!taken.has(stem)) return stem;

  for (let n = 2; n < 200; n += 1) {
    if (!taken.has(`${stem}_${n}`)) return `${stem}_${n}`;
  }
  return `${stem}_${Date.now().toString(36)}`;
}

/**
 * Options arrive as one per line, which is the fastest thing to type and the
 * only format that does not need a repeater UI with its own add/remove buttons.
 *
 * "value" and "label" are the same string on purpose. A separate stored value
 * is a database convenience that buys nothing here — the answer is read by a
 * human in a lead card, not joined against anything.
 */
function parseOptions(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line) => ({ value: line, label: { ar: line, en: line } }));
}

const i18n = (ar, en) => {
  const out = {};
  if (ar) out.ar = ar;
  if (en) out.en = en;
  // Mirrored, so a form built only in Arabic still renders for an English
  // buyer rather than showing a blank label.
  if (ar && !en) out.en = ar;
  if (en && !ar) out.ar = en;
  return Object.keys(out).length ? out : null;
};

/* ── Create / edit ───────────────────────────────────────────────────────── */

export async function saveFormField(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  const labelAr = str(formData, 'labelAr');
  const labelEn = str(formData, 'labelEn');
  const type = str(formData, 'type') || 'text';
  const required = formData.get('required') === 'on' || formData.get('required') === 'true';
  const optionsRaw = str(formData, 'options');

  const errors = {};
  if (!labelAr && !labelEn) errors.labelAr = 'FIELD_LABEL_REQUIRED';
  if (!FIELD_TYPE_SET.has(type)) errors.type = 'FIELD_TYPE_UNKNOWN';

  const options = TYPES_WITH_OPTIONS.has(type) ? parseOptions(optionsRaw) : [];
  if (TYPES_WITH_OPTIONS.has(type) && options.length < 2) {
    errors.options = 'FIELD_OPTIONS_REQUIRED';
  }

  if (Object.keys(errors).length) return bad('VALIDATION', errors);

  const db = getMarketplaceDb();

  // Only a value from the fixed set of three. A width is a grid span, and an
  // unknown one would render as no span at all — a field that vanishes.
  const rawWidth = str(formData, 'width');
  const width = WIDTH_KEYS.has(rawWidth) ? rawWidth : 'full';

  // Null is a real value here — "not in a tab" — so an empty string has to
  // become null rather than being written as one.
  const tabId = str(formData, 'tabId') || null;

  const row = {
    width,
    tab_id: tabId,
    label: i18n(labelAr, labelEn),
    help: i18n(str(formData, 'helpAr'), str(formData, 'helpEn')),
    placeholder: i18n(str(formData, 'placeholderAr'), str(formData, 'placeholderEn')),
    type,
    options,
    required,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    // Scoped by vendor_id as well as id: an id from another showroom matches no
    // row and changes nothing, rather than being rejected with a message that
    // confirms it exists.
    const { error } = await writeRow(
      (payload) =>
        db.from('vendor_form_fields').update(payload).eq('id', id).eq('vendor_id', vendorId),
      row
    );

    if (error) return bad('SAVE_FAILED');
  } else {
    const { count } = await db
      .from('vendor_form_fields')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId);

    if ((count ?? 0) >= 25) return bad('FIELD_LIMIT');

    const { error } = await writeRow(
      (payload) => db.from('vendor_form_fields').insert(payload),
      {
        ...row,
        vendor_id: vendorId,
        field_key: await freeKey(db, vendorId, keyFrom(labelEn || labelAr)),
        sort_order: (count ?? 0) + 1,
        active: true,
      }
    );

    if (error) return bad('SAVE_FAILED');
  }

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  return ok();
}

/* ── Switch off / delete / reorder ───────────────────────────────────────── */

/**
 * Hiding a field rather than deleting it.
 *
 * The one a seller should reach for. Answers already given stay readable, and
 * the question stops being asked — which is almost always what "remove this
 * field" actually means.
 */
export async function toggleFormField(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { data: current } = await db
    .from('vendor_form_fields')
    .select('active')
    .eq('id', id)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (!current) return bad('NOT_FOUND');

  const { error } = await db
    .from('vendor_form_fields')
    .update({ active: !current.active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('vendor_id', vendorId);

  if (error) return bad('SAVE_FAILED');

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  return ok({ active: !current.active });
}

/**
 * Deleting a field for good.
 *
 * The answers are NOT touched. They live on the lead, carry their own label,
 * and describe a conversation that actually happened — deleting the question
 * afterwards does not un-ask it.
 */
export async function deleteFormField(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  const { error } = await getMarketplaceDb()
    .from('vendor_form_fields')
    .delete()
    .eq('id', id)
    .eq('vendor_id', vendorId);

  if (error) return bad('DELETE_FAILED');

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  return ok();
}

/** Moves one field up or down. The whole order is rewritten, so no gaps. */
export async function moveFormField(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  const direction = str(formData, 'direction') === 'up' ? -1 : 1;

  const db = getMarketplaceDb();
  const { data: fields } = await db
    .from('vendor_form_fields')
    .select('id, sort_order')
    .eq('vendor_id', vendorId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const list = fields ?? [];
  const index = list.findIndex((f) => f.id === id);
  if (index < 0) return bad('NOT_FOUND');

  const target = index + direction;
  if (target < 0 || target >= list.length) return ok();

  [list[index], list[target]] = [list[target], list[index]];

  // Renumbered from 1 every time. Swapping two sort_order values works until
  // two fields share one — which they do the moment a field is created while
  // another tab is reordering.
  for (let i = 0; i < list.length; i += 1) {
    await db
      .from('vendor_form_fields')
      .update({ sort_order: i + 1 })
      .eq('id', list[i].id)
      .eq('vendor_id', vendorId);
  }

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  return ok();
}

/**
 * The whole order at once, after a drag.
 *
 * Not a swap per row. Dragging a field from position eight to position one is
 * seven swaps, each its own round trip, and two of them racing is how two
 * fields end up sharing a sort_order — after which the list order is whatever
 * the secondary sort decides, which looks like the drag simply failed.
 *
 * Ids that are not this showroom's are dropped rather than rejected: the list
 * comes from a page that only ever rendered their own fields, so anything else
 * in it is noise, and refusing the whole reorder over one bad id would lose a
 * rearrangement the seller has already seen happen on screen.
 */
export async function reorderFormFields(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const wanted = str(formData, 'order').split(',').map((s) => s.trim()).filter(Boolean);
  if (!wanted.length) return ok();

  const db = getMarketplaceDb();

  const { data: mine } = await db
    .from('vendor_form_fields')
    .select('id')
    .eq('vendor_id', vendorId);

  const owned = new Set((mine ?? []).map((f) => f.id));
  const order = wanted.filter((id) => owned.has(id));

  // Renumbered from 1 rather than patched, so the sequence never develops gaps
  // or duplicates however many times this runs.
  for (let i = 0; i < order.length; i += 1) {
    await db
      .from('vendor_form_fields')
      .update({ sort_order: i + 1 })
      .eq('id', order[i])
      .eq('vendor_id', vendorId);
  }

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  return ok({ moved: order.length });
}

/**
 * Which of the five looks this showroom's form wears.
 *
 * Stored on the vendor, not on each field: it is one decision about the whole
 * form, and per-field styling is how a form ends up with five different input
 * shapes on one screen.
 *
 * An unknown key is ignored rather than rejected. The value only ever comes
 * from a fixed list of buttons, so anything else is a stale tab or a hand-made
 * post — and formStyle() falls back to the first preset when it reads one, so
 * storing it would be storing a value that renders as something else.
 */
export async function saveFormStyle(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const style = str(formData, 'style');
  if (!FORM_STYLE_KEYS.has(style)) return bad('FIELD_TYPE_UNKNOWN');

  const db = getMarketplaceDb();

  /**
   * A preset is a STARTING POINT, so picking one re-seeds the numbers.
   *
   * The alternative — keep whatever the seller had — means choosing "Compact"
   * and seeing nothing change because they had already widened the padding, and
   * a preset that does not visibly do anything is a preset nobody trusts.
   *
   * Colours are kept. Those are the showroom's identity, not part of a layout
   * choice, and silently resetting a brand colour because somebody tried a
   * different field shape is the kind of thing that stops people exploring.
   */
  const { data: current } = await db
    .from('vendors')
    .select('lead_form_theme')
    .eq('id', vendorId)
    .maybeSingle();

  const kept = normaliseTheme(current?.lead_form_theme, style);
  const seeded = defaultTheme(style);

  const theme = {
    ...seeded,
    accent: kept.accent,
    ...Object.fromEntries(COLOR_FIELDS.map((c) => [c.key, kept[c.key]])),
  };

  const { error } = await db
    .from('vendors')
    .update({ lead_form_style: style, lead_form_theme: theme })
    .eq('id', vendorId);

  // Same reasoning as writeRow(): before §20.4 the column is not there, and the
  // right answer is "your questions still saved, the look did not" rather than
  // an error the seller cannot act on.
  if (error && isMissingColumn(error)) return bad('LAYOUT_NOT_MIGRATED');
  if (error) return bad('SAVE_FAILED');

  // The buyer's form lives on every listing page, so the style change has to
  // reach them too — not only the builder.
  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  revalidatePath('/[locale]/marketplace/listing/[slug]', 'page');
  return ok({ style });
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */

/**
 * Create or rename a tab.
 *
 * A tab is a row rather than a string on each field, because renaming and
 * reordering are the two things a seller does most and both are broken by the
 * string approach — see schema.sql §22.
 */
export async function saveFormTab(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  const labelAr = str(formData, 'labelAr');
  const labelEn = str(formData, 'labelEn');

  if (!labelAr && !labelEn) return bad('VALIDATION', { labelAr: 'FIELD_LABEL_REQUIRED' });

  const db = getMarketplaceDb();
  const label = i18n(labelAr, labelEn);

  if (id) {
    const { error } = await db
      .from('vendor_form_tabs')
      .update({ label, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('vendor_id', vendorId);

    if (error) return bad(isMissingColumn(error) ? 'LAYOUT_NOT_MIGRATED' : 'SAVE_FAILED');
  } else {
    const { count } = await db
      .from('vendor_form_tabs')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId);

    // Six is already more than a lead form should need. A seller building ten
    // tabs is building a survey, and buyers do not finish surveys.
    if ((count ?? 0) >= 6) return bad('FIELD_LIMIT');

    const { error } = await db
      .from('vendor_form_tabs')
      .insert({ vendor_id: vendorId, label, sort_order: (count ?? 0) + 1 });

    // A database that has not run §22 has no table at all — reported as the
    // migration message rather than a bare failure the seller cannot act on.
    if (error) {
      const missing = error.code === '42P01' || isMissingColumn(error);
      return bad(missing ? 'LAYOUT_NOT_MIGRATED' : 'SAVE_FAILED');
    }
  }

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  return ok();
}

/**
 * Deletes a tab and RELEASES its fields.
 *
 * `on delete set null` on tab_id does the releasing (schema.sql §22): the
 * questions drop back into the untabbed list rather than being deleted with
 * their container. Deleting a folder should never delete the documents.
 */
export async function deleteFormTab(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  const { error } = await getMarketplaceDb()
    .from('vendor_form_tabs')
    .delete()
    .eq('id', id)
    .eq('vendor_id', vendorId);

  if (error) return bad('DELETE_FAILED');

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  return ok();
}

/* ── Layout: one column at a time ────────────────────────────────────────── */

/**
 * Resizing a field, and NOTHING else.
 *
 * This used to go through saveFormField from a small form carrying label, type,
 * required and options as hidden inputs — which meant every resize rewrote the
 * whole row from whatever that form happened to include. It did not include
 * help, placeholder or tab_id, so changing a field to half-width silently blanked
 * its helper text and dropped it out of its section.
 *
 * A one-column update cannot do that. It is also the honest shape: "make this
 * half width" is not an edit of the question.
 */
export async function setFieldWidth(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  const width = str(formData, 'width');

  if (!id) return bad('NOT_FOUND');
  // A width is a grid span. An unknown one would render as no span at all — a
  // field that vanishes — so it is refused rather than stored.
  if (!WIDTH_KEYS.has(width)) return bad('FIELD_TYPE_UNKNOWN');

  const { error } = await getMarketplaceDb()
    .from('vendor_form_fields')
    .update({ width, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('vendor_id', vendorId);

  if (error) return bad(isMissingColumn(error) ? 'LAYOUT_NOT_MIGRATED' : 'SAVE_FAILED');

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  revalidatePath('/[locale]/marketplace/listing/[slug]', 'page');
  return ok({ width });
}

/** Moving a field into a section, or out of every section. Same reasoning. */
export async function setFieldTab(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const id = str(formData, 'id');
  if (!id) return bad('NOT_FOUND');

  // Empty string means "no section", which is a real value — null — rather than
  // a missing one.
  const tabId = str(formData, 'tabId') || null;

  const db = getMarketplaceDb();

  // A tab id from another showroom would file this seller's question under
  // somebody else's section. Checked here rather than trusted from the form.
  if (tabId) {
    const { data: tab } = await db
      .from('vendor_form_tabs')
      .select('id')
      .eq('id', tabId)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (!tab) return bad('NOT_FOUND');
  }

  const { error } = await db
    .from('vendor_form_fields')
    .update({ tab_id: tabId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('vendor_id', vendorId);

  if (error) return bad(isMissingColumn(error) ? 'LAYOUT_NOT_MIGRATED' : 'SAVE_FAILED');

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  revalidatePath('/[locale]/marketplace/listing/[slug]', 'page');
  return ok({ tabId });
}

/**
 * Accent, corners and density.
 *
 * One axis per submit, merged over what is stored, so changing the accent does
 * not reset the radius somebody set last week. Every value is checked against
 * the closed set it came from; an unknown one is refused rather than written,
 * because a stored value that renders as nothing is worse than a rejected click
 * — the seller sees the form not change and assumes the feature is broken.
 */
export async function saveFormTheme(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const patch = {};

  /**
   * Numbers are CLAMPED, not rejected.
   *
   * Every one of these comes from a range input that cannot produce an
   * out-of-bounds value, so anything outside the range is a hand-made post
   * rather than a seller who needs telling. Clamping stores the nearest usable
   * value; rejecting would only be a way to fail a form nobody filled in.
   */
  for (const key of Object.keys(NUMERIC_BY_KEY)) {
    const raw = str(formData, key);
    if (raw === '') continue;

    const n = Number(raw);
    if (!Number.isFinite(n)) return bad('FIELD_NUMBER');

    const spec = NUMERIC_BY_KEY[key];
    patch[key] = Math.min(spec.max, Math.max(spec.min, Math.round(n)));
  }

  /**
   * Colours are REJECTED, not coerced.
   *
   * Each one ends up inside a CSS custom property on a page that strangers
   * load, so an unchecked string here is a value being written into a
   * stylesheet. Six hex digits and a hash, nothing else: no named colours, no
   * rgb(), and no room for anything that could close the declaration and open
   * something else.
   *
   * An empty string is a real instruction — "stop overriding this, go back to
   * the preset's own light and dark values" — so it stores null rather than
   * being skipped.
   */
  for (const key of ['accent', ...COLOR_FIELDS.map((c) => c.key)]) {
    if (!formData.has(key)) continue;

    const raw = str(formData, key);

    if (raw === '') {
      // The accent always has a value; there is no "unset" for it.
      if (key !== 'accent') patch[key] = null;
      continue;
    }

    if (!HEX_COLOR.test(raw)) return bad('COLOR_INVALID');
    patch[key] = raw.toLowerCase();
  }

  if (!Object.keys(patch).length) return ok();

  const db = getMarketplaceDb();

  const { data: current, error: readError } = await db
    .from('vendors')
    .select('lead_form_style, lead_form_theme')
    .eq('id', vendorId)
    .maybeSingle();

  if (readError && isMissingColumn(readError)) return bad('LAYOUT_NOT_MIGRATED');

  // Merged over what is stored, so changing the radius does not reset a colour
  // set last week. normaliseTheme fills anything neither carries.
  const theme = {
    ...normaliseTheme(current?.lead_form_theme, current?.lead_form_style ?? 'classic'),
    ...patch,
  };

  const { error } = await db
    .from('vendors')
    .update({ lead_form_theme: theme })
    .eq('id', vendorId);

  if (error) return bad(isMissingColumn(error) ? 'LAYOUT_NOT_MIGRATED' : 'SAVE_FAILED');

  // The buyer's form lives on every listing page, so the change has to reach
  // them too — not only the builder's preview.
  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  revalidatePath('/[locale]/marketplace/listing/[slug]', 'page');
  return ok({ theme });
}


/* ── The starter template ────────────────────────────────────────────────── */

/**
 * Fills an empty form with a professional starting point.
 *
 * ── Additive, never destructive ─────────────────────────────────────────────
 *
 * Nothing existing is touched. A field whose key is already present is SKIPPED,
 * so installing twice adds nothing and installing after a seller has built
 * three questions of their own leaves those three exactly as they are. That is
 * what makes the button safe to press when you are not sure what it does — the
 * worst case is questions you then delete, not questions you lose.
 *
 * ── Tabs first, then fields ─────────────────────────────────────────────────
 *
 * vendor_form_fields.tab_id points at vendor_form_tabs, so the sections have to
 * exist before a field can name one. A tab whose label a seller already used is
 * reused rather than duplicated.
 *
 * ── Not automatic ───────────────────────────────────────────────────────────
 *
 * Deliberately a button and not something that happens when a showroom is
 * approved. A form that appeared by itself is one nobody feels ownership of,
 * and a seller who never wanted it has to work out what to delete before they
 * can start. Asked for, it is a head start; imposed, it is a mess.
 */
export async function installLeadFormTemplate(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);

  const db = getMarketplaceDb();

  /* ── Sections ─────────────────────────────────────────────────────────── */

  const { data: existingTabs, error: tabReadError } = await db
    .from('vendor_form_tabs')
    .select('id, label, sort_order')
    .eq('vendor_id', vendorId);

  // 42P01 — schema.sql §22 has not been run. Reported as the migration message
  // rather than a bare failure, because that is something a person can act on.
  if (tabReadError) {
    const missing = tabReadError.code === '42P01' || isMissingColumn(tabReadError);
    return bad(missing ? 'LAYOUT_NOT_MIGRATED' : 'SAVE_FAILED');
  }

  const tabIdByKey = {};
  let nextTabOrder = (existingTabs ?? []).length;

  for (const tab of LEAD_FORM_TEMPLATE.tabs) {
    // Matched on the ENGLISH label: a seller who already made "Your current
    // car" should get their tab back, not a second one beside it.
    const already = (existingTabs ?? []).find(
      (row) => (row.label?.en ?? '').toLowerCase() === tab.label.en.toLowerCase()
    );

    if (already) {
      tabIdByKey[tab.key] = already.id;
      continue;
    }

    nextTabOrder += 1;
    const { data: created, error } = await db
      .from('vendor_form_tabs')
      .insert({ vendor_id: vendorId, label: tab.label, sort_order: nextTabOrder })
      .select('id')
      .single();

    if (error) return bad('SAVE_FAILED');
    tabIdByKey[tab.key] = created.id;
  }

  /* ── Questions ────────────────────────────────────────────────────────── */

  const { data: existingFields } = await db
    .from('vendor_form_fields')
    .select('field_key')
    .eq('vendor_id', vendorId);

  const taken = new Set((existingFields ?? []).map((f) => f.field_key));
  let nextOrder = (existingFields ?? []).length;

  const rows = [];

  for (const field of LEAD_FORM_TEMPLATE.fields) {
    if (taken.has(field.field_key)) continue;

    nextOrder += 1;
    rows.push({
      vendor_id: vendorId,
      field_key: field.field_key,
      label: field.label,
      help: field.help ?? null,
      placeholder: field.placeholder ?? null,
      type: field.type,
      options: TYPES_WITH_OPTIONS.has(field.type) ? templateOptions(field) : [],
      required: field.required ?? false,
      width: field.width ?? 'full',
      tab_id: tabIdByKey[field.tab] ?? null,
      sort_order: nextOrder,
      active: true,
    });
  }

  // Everything was already there. Not an error — it is the answer to "install
  // this twice", and saying so beats a success message that changed nothing.
  if (!rows.length) {
    revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
    return ok({ added: 0 });
  }

  // The 25-field ceiling saveFormField enforces, applied here too — otherwise
  // the one path that adds ten questions at once is the one that ignores it.
  if (taken.size + rows.length > 25) return bad('FIELD_LIMIT');

  // writeRow, so a database that has not run §20.4 or §22 still gets the
  // questions and only loses the layout.
  const { error } = await writeRow(
    (payload) => db.from('vendor_form_fields').insert(payload),
    rows
  );

  if (error) return bad('SAVE_FAILED');

  revalidatePath('/[locale]/marketplace/seller/lead-form', 'page');
  revalidatePath('/[locale]/marketplace/listing/[slug]', 'page');
  return ok({ added: rows.length });
}
