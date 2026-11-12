import 'server-only';

/**
 * A showroom's specification DEFINITIONS — the rows behind the checklist.
 *
 * queries/specs.ts reads specifications for DISPLAY: the car page's sheet, the
 * card's fact row, the browse facets. This file is the other side — what the
 * showroom's Specifications tab shows, creates and clears. Split because the
 * two have opposite shapes: display reads `listing_specs` and joins out to the
 * definition, this reads the definitions and knows nothing about any one car.
 *
 * Service-role only. Every caller is behind vendorForAction(…, 'listings') or
 * requireVendorCan('listings'). See schema.sql §35.
 *
 * ── Rows are created LAZILY, from the template ─────────────────────────────
 *
 * The 298-entry template in lib/spec-template.js is the list; a `spec_attributes`
 * row exists only once a showroom has actually ticked that specification on a
 * car. A showroom that never mentions a wading depth never gets a row for one,
 * so the table stays the size of what is in use rather than 298 rows per
 * showroom whether or not anybody wanted them — which is what the old
 * install-a-template model produced, four times over.
 *
 * ── What is NOT in here ───────────────────────────────────────────────────
 *
 * Any kind of migration. Nothing in this file renames, re-slugs or deletes an
 * existing definition, and nothing touches `listing_specs`. The template reuses
 * the scraped slugs precisely so that the old rows ARE the template's rows and
 * no migration is needed; see §35.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';
import {
  SPEC_CATEGORIES,
  SPEC_CATEGORY_BY_KEY,
  TEMPLATE_BY_SLUG,
  DISPLAY_TYPE_OF_KIND,
  definitionFromTemplate,
  mergeTemplate,
  resolveSections,
  OWN_SECTION,
  sequenceOf,
} from '@/marketplace/lib/spec-template';
import { isSpecIcon } from '@/marketplace/lib/spec-icons';

/**
 * The columns the checklist needs.
 *
 * `icon` and `category_icon` are §35's token columns. The `*_icon_url` pair is
 * deliberately NOT selected — those are the scraped files, nothing renders them
 * any more, and selecting them would invite somebody to.
 */
const DEF_SELECT = `
  id, slug, attribute_name, attribute_sequence,
  category_name, category_sequence, icon, category_icon,
  unit_code, display_type, show_on_card, is_key, active,
  is_custom, created_by_vendor_id
`;

/** A slug, in the one shape it is ever stored or compared in. */
const normalizeSlug = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * How many specifications a showroom may show on its cards.
 *
 * ── Why there is a cap at all ─────────────────────────────────────────────
 *
 * A card is about 300px wide and the fact strip is one row of it. getCardSpecs
 * has always taken `limit = 4` and called pickForCard to choose them, which
 * means a showroom that flagged eleven specifications got four of them picked
 * by a sort order they could not see — and the other seven did nothing at all
 * while looking, on the Specifications tab, exactly as switched-on as the four
 * that showed.
 *
 * So the limit moves to where the choice is made. Four is the number the card
 * renders, the number the tab enforces, and the same constant on both sides —
 * getCardSpecs still slices, so a database that is already over the limit
 * cannot produce a broken card while its seller trims the list down.
 */
export const CARD_LIMIT = 4;

/** The `tpl:<slug>` placeholder the checklist uses for an unsaved entry. */
export const TEMPLATE_PREFIX = 'tpl:';
export const isTemplateId = (id) => String(id ?? '').startsWith(TEMPLATE_PREFIX);
export const slugOfTemplateId = (id) => String(id ?? '').slice(TEMPLATE_PREFIX.length);

/**
 * This showroom's definitions, with their option lists.
 *
 * Never throws. A Specifications tab that 500s leaves a seller unable to
 * describe a car at all, and the template alone is a perfectly usable tab —
 * so a failed read degrades to "no definitions yet", which merges into exactly
 * the template and is what a new showroom sees anyway.
 *
 * Two tiers, like session.js's PROFILE_FULL: §35's columns are added by hand in
 * the SQL editor, and a select naming a column that does not exist fails the
 * WHOLE select in PostgREST (42703) — which on this table would mean a
 * checklist with no icons AND no definitions, so every tick would create a
 * duplicate row.
 */
export async function getVendorSpecDefinitions(vendorId) {
  if (!vendorId) return { definitions: [], iconsMissing: false, error: null };

  const db = getMarketplaceDb();

  const read = (columns) =>
    db
      .from('spec_attributes')
      .select(columns)
      .eq('created_by_vendor_id', vendorId)
      .eq('active', true)
      .order('category_sequence', { ascending: true })
      .order('attribute_sequence', { ascending: true });

  let iconsMissing = false;
  let { data, error } = await read(DEF_SELECT);

  if (error) {
    /* §35 not run yet. The tab still works; it simply cannot show or set an
       icon, and says so rather than looking broken. */
    const fallback = await read(DEF_SELECT.replace(', icon, category_icon', ''));
    if (fallback.error) {
      console.error('[specs] definitions unavailable:', fallback.error.message);
      return { definitions: [], iconsMissing: true, error: fallback.error.message };
    }
    data = fallback.data;
    iconsMissing = true;
  }

  const rows = data ?? [];
  const ids = rows.map((r) => r.id);

  /* Option lists in one flat query and grouped here, not as a nested select:
     PostgREST caps embedded rows per parent, and a forty-answer list silently
     truncating is the bug that only shows up on the one specification that has
     many answers. Same reasoning as getSpecDefinitions. */
  let optionsBy = new Map();
  if (ids.length) {
    const { data: values, error: valueError } = await db
      .from('spec_attribute_values')
      .select('id, attribute_id, name, sequence')
      .in('attribute_id', ids)
      .eq('active', true)
      .order('sequence', { ascending: true })
      .limit(4000);

    if (!valueError) {
      optionsBy = (values ?? []).reduce((map, v) => {
        const list = map.get(v.attribute_id) ?? [];
        list.push(v);
        return map.set(v.attribute_id, list);
      }, new Map());
    }
  }

  return {
    definitions: rows.map((r) => ({ ...r, options: optionsBy.get(r.id) ?? [] })),
    iconsMissing,
    error: null,
  };
}

/**
 * The specifications this showroom has chosen for its cards, in card order.
 *
 * Read separately from the checklist rather than derived from it, because the
 * panel at the top of the tab has to show the chosen four whether or not the
 * sections holding them are filtered, collapsed or scrolled past — which is
 * the whole point of putting them at the top. The order is the sheet's own, so
 * the panel lists them in the order the card will print them.
 *
 * Never throws, for the reason getVendorSpecDefinitions does not: a tab that
 * 500s leaves a seller unable to describe a car.
 */
export async function getCardSelection(vendorId) {
  if (!vendorId) return [];

  const db = getMarketplaceDb();

  const read = (columns) =>
    db
      .from('spec_attributes')
      .select(columns)
      .eq('created_by_vendor_id', vendorId)
      .eq('show_on_card', true)
      .eq('active', true)
      .order('category_sequence', { ascending: true })
      .order('attribute_sequence', { ascending: true });

  let { data, error } = await read('id, slug, attribute_name, category_name, icon, display_type');
  if (error) {
    /* §35 not run: no icon column. The panel still lists the choices. */
    const plain = await read('id, slug, attribute_name, category_name, display_type');
    if (plain.error) {
      console.error('[specs] card selection unavailable:', plain.error.message);
      return [];
    }
    data = plain.data;
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.attribute_name ?? {},
    section: r.category_name ?? {},
    icon: r.icon ?? null,
    displayType: r.display_type ?? 'text',
  }));
}

/**
 * Rewrite a choice list, without losing what cars have already answered.
 *
 * ── Retired, not deleted ──────────────────────────────────────────────────
 *
 * An answer a car chose is stored on `listing_specs` as the option's ID (see
 * saveSpecs) with the label snapshotted beside it. There is no foreign key, so
 * deleting the option row would not break the car page — the snapshot still
 * renders — but it WOULD break the thing the id is kept for: grouping and
 * filtering cars by the same answer. So a removed answer is marked inactive
 * instead. Every reader here filters on `active`, so it leaves the dropdown
 * and stays resolvable for the cars that chose it.
 *
 * ── Matched by name, so an unchanged answer keeps its id ──────────────────
 *
 * Reconciled rather than replaced wholesale. Replacing would hand every answer
 * a new id on every edit, which would orphan every car that had chosen one —
 * so "Automatic" typed again is the same row it was, and only what genuinely
 * changed is written.
 */
async function setSpecChoices(attributeId, rows = []) {
  const db = getMarketplaceDb();

  const { data: existing, error } = await db
    .from('spec_attribute_values')
    .select('id, name, sequence, active')
    .eq('attribute_id', attributeId);

  if (error) return { ok: false, error: error.message };

  const key = (name) =>
    String(name?.en ?? name?.ar ?? '').trim().toLowerCase();

  const pool = new Map();
  for (const row of existing ?? []) {
    const k = key(row.name);
    if (k && !pool.has(k)) pool.set(k, row);
  }

  const kept = new Set();
  const inserts = [];
  const updates = [];

  rows.forEach((row, i) => {
    const match = pool.get(key(row));
    if (match) {
      kept.add(match.id);
      /* Only when something actually differs — an edit that changed the type
         and left the answers alone should write nothing here. */
      if (
        match.name?.ar !== row.ar ||
        match.name?.en !== row.en ||
        match.sequence !== i * 10 ||
        match.active !== true
      ) {
        updates.push({ id: match.id, name: { ar: row.ar, en: row.en }, sequence: i * 10, active: true });
      }
      return;
    }
    inserts.push({
      attribute_id: attributeId,
      name: { ar: row.ar, en: row.en },
      sequence: i * 10,
      active: true,
    });
  });

  const retire = (existing ?? []).filter((r) => r.active && !kept.has(r.id)).map((r) => r.id);

  for (const row of updates) {
    const { id, ...rest } = row;
    const { error: upError } = await db.from('spec_attribute_values').update(rest).eq('id', id);
    if (upError) return { ok: false, error: upError.message };
  }

  if (inserts.length) {
    const { error: inError } = await db.from('spec_attribute_values').insert(inserts);
    if (inError) return { ok: false, error: inError.message };
  }

  if (retire.length) {
    const { error: offError } = await db
      .from('spec_attribute_values')
      .update({ active: false })
      .in('id', retire);
    if (offError) return { ok: false, error: offError.message };
  }

  return { ok: true, error: null, added: inserts.length, retired: retire.length };
}

const SECTION_SELECT = 'id, key, name, icon, sequence, active';

/**
 * This showroom's own section rows (§36).
 *
 * Never throws, and an empty list is the ordinary answer: a showroom that has
 * never renamed or added a heading has no rows here and sees the 14 the
 * application ships. A database without the table behaves the same way, which
 * is why a failure degrades to [] rather than taking the tab down.
 */
export async function getSpecSections(vendorId) {
  if (!vendorId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('spec_sections')
    .select(SECTION_SELECT)
    .eq('vendor_id', vendorId)
    .eq('active', true)
    .order('sequence', { ascending: true });

  if (error) {
    /* §36 not run. Worth one line in the log, because the add and rename
       controls will refuse and the seller should not have to guess why. */
    if (error.code !== '42P01') console.warn('[specs] sections unavailable:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Add a heading, or take one over.
 *
 * Creating a section whose key matches one of the template's is not an error
 * and not a duplicate — it is how a showroom RENAMES a shipped section, and
 * the upsert is what makes "rename Engine" and "add Armour" the same call.
 */
export async function createSpecSection({ vendorId, ar, en, icon = null, sequence = null }) {
  const nameAr = String(ar ?? '').trim();
  const nameEn = String(en ?? '').trim();
  if (!vendorId) return { section: null, error: 'NO_VENDOR' };
  if (!nameAr && !nameEn) return { section: null, error: 'NAME_REQUIRED' };

  /* From the ENGLISH name, like every other slug on this platform: a key is
     compared and stored, and an Arabic one would be percent-encoded into
     something nobody can read in a URL or a log. */
  const key = normalizeSlug(nameEn) || `section-${Date.now().toString(36)}`;

  const row = {
    vendor_id: vendorId,
    key,
    name: { ar: nameAr || nameEn, en: nameEn || nameAr },
    icon: isSpecIcon(icon) ? icon : null,
    /* After the template's 14, which end at 140. A seller who wants it
       elsewhere moves it; guessing a position inside their list would be
       worse than putting it at the end where they can see it. */
    sequence: Number.isFinite(sequence) ? sequence : 500,
    active: true,
  };

  const { data, error } = await getMarketplaceDb()
    .from('spec_sections')
    .upsert(row, { onConflict: 'vendor_id, key' })
    .select(SECTION_SELECT)
    .single();

  if (error) {
    if (error.code === '42P01') return { section: null, error: 'SECTIONS_UNAVAILABLE' };
    return { section: null, error: error.message };
  }

  return { section: data, error: null };
}

/**
 * Rename a section, change its mark, or move it.
 *
 * ── It rewrites the specifications in it, and that is the point ───────────
 *
 * A section's name is ALSO denormalised onto every specification row
 * (`category_name`), because the public car page groups a sheet by what it
 * finds on the row and must not join a seller's organisation table to print a
 * heading. So a rename has to write both, in one call, or the rail says
 * "Armour" and the car page still says "Interior".
 *
 * The rows are matched on the OLD name rather than by section key, because
 * the key is not on them — the same rule the catalog manager used for spec
 * categories before §36, and it is exact: those are precisely the rows that
 * print the heading being changed.
 *
 * A template section that has never been overridden has no row to update, so
 * this upserts one. Renaming "Engine & transmission" is creating the
 * override.
 */
export async function updateSpecSection({ vendorId, key, patch = {} }) {
  if (!vendorId || !key) return { ok: false, error: 'SECTION_NOT_FOUND' };

  const db = getMarketplaceDb();
  const template = SPEC_CATEGORY_BY_KEY.get(key);

  const { data: existing } = await db
    .from('spec_sections')
    .select(SECTION_SELECT)
    .eq('vendor_id', vendorId)
    .eq('key', key)
    .maybeSingle();

  if (!existing && !template) return { ok: false, error: 'SECTION_NOT_FOUND' };

  /* What it is called NOW — the override if there is one, otherwise what the
     application ships. This is what the rows to rewrite are matched on. */
  const before = existing?.name ?? (template ? { ar: template.ar, en: template.en } : null);

  const nextAr = 'ar' in patch ? String(patch.ar ?? '').trim() : before?.ar ?? '';
  const nextEn = 'en' in patch ? String(patch.en ?? '').trim() : before?.en ?? '';
  if (!nextAr && !nextEn) return { ok: false, error: 'NAME_REQUIRED' };

  const name = { ar: nextAr || nextEn, en: nextEn || nextAr };
  const icon = 'icon' in patch
    ? (isSpecIcon(patch.icon) ? patch.icon : null)
    : (existing?.icon ?? template?.icon ?? null);
  const sequence = Number.isFinite(patch.sequence)
    ? patch.sequence
    : existing?.sequence ?? template?.sequence ?? 500;

  const { data, error } = await db
    .from('spec_sections')
    .upsert(
      { vendor_id: vendorId, key, name, icon, sequence, active: true },
      { onConflict: 'vendor_id, key' },
    )
    .select(SECTION_SELECT)
    .single();

  if (error) {
    if (error.code === '42P01') return { ok: false, error: 'SECTIONS_UNAVAILABLE' };
    return { ok: false, error: error.message };
  }

  /* And the rows that print the old heading. Scoped to this showroom, so a
     rename never reaches another's sheet. A failure here is reported rather
     than swallowed: the rail would say one thing and the car page another,
     and that is exactly the drift the denormalised column risks. */
  let rewritten = 0;
  const oldEn = before?.en;
  if (oldEn && (oldEn !== name.en || icon !== (existing?.icon ?? template?.icon ?? null))) {
    const { data: moved, error: rowError } = await db
      .from('spec_attributes')
      .update({ category_name: name, category_icon: icon, category_sequence: sequence })
      .eq('created_by_vendor_id', vendorId)
      .eq('category_name->>en', oldEn)
      .select('id');

    if (rowError) {
      /* A pre-§35 table has no category_icon. Retry without it rather than
         leave the name half-changed. */
      const retry = await db
        .from('spec_attributes')
        .update({ category_name: name, category_sequence: sequence })
        .eq('created_by_vendor_id', vendorId)
        .eq('category_name->>en', oldEn)
        .select('id');

      if (retry.error) return { ok: false, section: data, error: retry.error.message };
      rewritten = (retry.data ?? []).length;
    } else {
      rewritten = (moved ?? []).length;
    }
  }

  return { ok: true, section: data, rewritten, error: null };
}

/**
 * Remove a section.
 *
 * ── The same button means two different things ────────────────────────────
 *
 * For a section the showroom MADE, this is a delete, and it is refused while
 * any specification is filed under it — for the reason the specification
 * delete is refused while a car answers one: the rows would keep printing a
 * heading nobody can edit any more, and the seller would have no way to find
 * them. Empty it first and the section goes.
 *
 * For an OVERRIDE of one of the sections the application ships, it is not a
 * delete at all. There is nothing to delete — the section exists in code —
 * so this forgets the rename and the heading goes back to what it ships with.
 *
 * ── Which is why a shipped section is never refused ───────────────────────
 *
 * Refusing it was the bug. A rename REWRITES the denormalised heading onto
 * every specification in the section (see updateSpecSection), so a shipped
 * section a showroom has renamed is, by construction, a section with rows
 * filed under the new name — and the in-use check then refused the reset
 * every single time. Measured: renaming "Engine & transmission" moved 8 rows,
 * and "Reset to default" came back SECTION_IN_USE, leaving the seller with a
 * heading they could not undo from the dashboard at all.
 *
 * So the rows are moved back FIRST, onto the name, mark and position the
 * template states, and only then is the override row dropped. The heading on
 * a car page and the heading on the rail stay in step, which is the whole
 * reason the column is denormalised in the first place.
 */
export async function deleteSpecSection({ vendorId, key }) {
  if (!vendorId || !key) return { ok: false, used: 0, error: 'SECTION_NOT_FOUND' };

  const db = getMarketplaceDb();
  const template = SPEC_CATEGORY_BY_KEY.get(key);

  const { data: existing } = await db
    .from('spec_sections')
    .select(SECTION_SELECT)
    .eq('vendor_id', vendorId)
    .eq('key', key)
    .maybeSingle();

  if (!existing) return { ok: false, used: 0, error: 'SECTION_NOT_FOUND' };

  const name = existing.name?.en || existing.name?.ar || '';

  if (template) {
    /* Back to the shipped heading. Matched on the name the rows carry NOW —
       the override's — so this reaches exactly the rows the rename moved and
       no others. A failure is reported rather than swallowed: dropping the
       override while the rows still read the old name would leave a heading
       the rail no longer lists and the seller cannot reach. */
    const shipped = { ar: template.ar, en: template.en };
    let restored = 0;

    if (name && name !== template.en) {
      const { data: moved, error: rowError } = await db
        .from('spec_attributes')
        .update({
          category_name: shipped,
          category_icon: template.icon ?? null,
          category_sequence: template.sequence,
        })
        .eq('created_by_vendor_id', vendorId)
        .eq('category_name->>en', name)
        .select('id');

      if (rowError) {
        /* A pre-§35 table has no category_icon. Retry without it rather than
           leave the heading half-restored. */
        const retry = await db
          .from('spec_attributes')
          .update({ category_name: shipped, category_sequence: template.sequence })
          .eq('created_by_vendor_id', vendorId)
          .eq('category_name->>en', name)
          .select('id');

        if (retry.error) return { ok: false, used: 0, error: retry.error.message };
        restored = (retry.data ?? []).length;
      } else {
        restored = (moved ?? []).length;
      }
    }

    const { data, error } = await db
      .from('spec_sections')
      .delete()
      .eq('vendor_id', vendorId)
      .eq('key', key)
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, used: 0, error: error.message };
    return { ok: Boolean(data), used: 0, restored, error: data ? null : 'SECTION_NOT_FOUND' };
  }

  /**
   * A section of their own, and it is ALWAYS deletable.
   *
   * ── Refusing it was the wrong answer ──────────────────────────────────
   *
   * This used to return SECTION_IN_USE whenever anything was filed under the
   * section, on the reasoning that the rows would otherwise keep printing a
   * heading nobody could edit. The reasoning was right and the conclusion was
   * not: it left a seller who had made a section, filled it, and then thought
   * better of the name with no way out at all. Emptying it first is not a way
   * out either — a specification a car has answered cannot be cleared
   * (listing_specs is ON DELETE RESTRICT), so one answered row made the
   * section permanent.
   *
   * So the specifications MOVE instead. They go to the catch-all the merge
   * already has for rows no section claims — "Your own specifications" — which
   * is a real heading on the rail, so they stay visible, editable, and can be
   * filed somewhere else afterwards.
   *
   * Nothing is deleted and no car changes: an answer keeps its own stored
   * label, and only the heading above it moves.
   */
  const { data: inside, error: insideError } = await db
    .from('spec_attributes')
    .select('id')
    .eq('created_by_vendor_id', vendorId)
    .eq('category_name->>en', name);

  if (insideError) return { ok: false, used: 0, error: insideError.message };

  let moved = 0;
  if ((inside ?? []).length) {
    const home = { ar: OWN_SECTION.ar, en: OWN_SECTION.en };
    const { data: shifted, error: moveError } = await db
      .from('spec_attributes')
      .update({
        category_name: home,
        category_icon: OWN_SECTION.icon,
        category_sequence: OWN_SECTION.sequence,
      })
      .in('id', (inside ?? []).map((r) => r.id))
      .eq('created_by_vendor_id', vendorId)
      .select('id');

    if (moveError) {
      /* A pre-§35 table has no category_icon. Retry without it rather than
         delete the section and strand its rows under a heading that is gone. */
      const retry = await db
        .from('spec_attributes')
        .update({ category_name: home, category_sequence: OWN_SECTION.sequence })
        .in('id', (inside ?? []).map((r) => r.id))
        .eq('created_by_vendor_id', vendorId)
        .select('id');

      if (retry.error) return { ok: false, used: (inside ?? []).length, error: retry.error.message };
      moved = (retry.data ?? []).length;
    } else {
      moved = (shifted ?? []).length;
    }
  }

  const { data, error } = await db
    .from('spec_sections')
    .delete()
    .eq('vendor_id', vendorId)
    .eq('key', key)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, used: 0, error: error.message };
  return { ok: Boolean(data), used: 0, moved, error: data ? null : 'SECTION_NOT_FOUND' };
}

/**
 * How many cars have answered each of these definitions.
 *
 * What the checklist's delete button needs: a definition no car uses can be
 * cleared, and one twelve cars use must not be, so the control says "12 cars"
 * instead of offering a button that fails.
 *
 * Counted across the WHOLE table rather than this showroom's listings. Since
 * §30 a definition belongs to one showroom, so those are the same set — but a
 * count scoped to the caller's own cars would report zero for a row another
 * showroom somehow shares, and then the delete would be refused by the foreign
 * key with no explanation. Counting what the database counts keeps the message
 * and the outcome in step.
 */
export async function specUsage(ids = []) {
  const wanted = [...new Set(ids.filter((id) => id && !isTemplateId(id)))];
  if (!wanted.length) return new Map();

  const { data, error } = await getMarketplaceDb()
    .from('listing_specs')
    .select('attribute_id, listing_id')
    .in('attribute_id', wanted)
    .limit(20000);

  if (error) return new Map();

  /* Distinct LISTINGS, not rows: one car answering one specification is one
     car, and the message says "cars". */
  const seen = new Map();
  for (const row of data ?? []) {
    const set = seen.get(row.attribute_id) ?? new Set();
    set.add(row.listing_id);
    seen.set(row.attribute_id, set);
  }

  return new Map([...seen].map(([id, set]) => [id, set.size]));
}

/**
 * The whole Specifications tab in one read: the template merged with this
 * showroom's definitions, plus how many cars use each saved one.
 */
export async function getSpecChecklist(vendorId, locale = 'ar') {
  const [{ definitions, iconsMissing, error }, sections, cardSpecs] = await Promise.all([
    getVendorSpecDefinitions(vendorId),
    getSpecSections(vendorId),
    getCardSelection(vendorId),
  ]);

  const groups = mergeTemplate(definitions, { locale, sections });
  const usage = await specUsage(definitions.map((d) => d.id));

  return {
    groups: groups.map((g) => ({
      ...g,
      items: g.items.map((i) => ({ ...i, usedBy: usage.get(i.id) ?? 0 })),
    })),
    /* The raw rows as well, so the editor can tell an override from a section
       of their own without re-deriving it from the groups. */
    sections,
    /* The card panel's own data. Derived from the definitions would miss the
       point: the panel is the one place the FOUR are visible together, and it
       has to be right even when the sections holding them are filtered out of
       the list below it. */
    cardSpecs,
    cardLimit: CARD_LIMIT,
    iconsMissing,
    error,
  };
}

/**
 * Turn template slugs into real definitions, and hand back their ids.
 *
 * Called by save-listing when a seller has ticked specifications their showroom
 * has no row for yet. Returns:
 *
 *   idBySlug      slug → the definition's uuid
 *   optionIdByKey `<slug>|<english answer>` → that answer's uuid
 *
 * The second one is what lets a first save store a CHOICE as an id. The
 * checklist cannot send an id for an answer that does not exist yet, so it
 * sends `{ar, en}`; once the definition and its answers are created here, the
 * caller swaps the text for the id, and the row ends up identical to one saved
 * on the second attempt. Without that, the same answer on two cars would be an
 * id on one and free text on the other, and the browse facet would list it
 * twice.
 *
 * ── Upsert, not insert ────────────────────────────────────────────────────
 *
 * `onConflict: 'slug, created_by_vendor_id'` — §30.3's constraint, asserted by
 * §35. Two cars saved in the same instant both find the definition missing and
 * both try to create it; an insert would fail one of the two saves over a
 * specification that now exists, which is the least recoverable moment to fail
 * in. The upsert makes the loser a no-op.
 */
export async function ensureSpecDefinitions(vendorId, slugs = []) {
  /* The showroom's headings, so a specification created into a renamed
     section carries the name they chose rather than the one shipped — the
     car page reads that column, not the section table. */
  const sections = await getSpecSections(vendorId);
  const idBySlug = new Map();
  const optionIdByKey = new Map();

  const wanted = [...new Set(slugs.map(normalizeSlug).filter(Boolean))].filter((s) =>
    TEMPLATE_BY_SLUG.has(s)
  );
  if (!vendorId || !wanted.length) return { idBySlug, optionIdByKey, error: null };

  const db = getMarketplaceDb();

  /* Already there? A seller editing a car for the second time ticks the same
     specifications, and re-upserting 40 rows on every save would churn the
     table for nothing. */
  const { data: existing } = await db
    .from('spec_attributes')
    .select('id, slug')
    .eq('created_by_vendor_id', vendorId)
    .in('slug', wanted);

  for (const row of existing ?? []) idBySlug.set(row.slug, row.id);

  const missing = wanted.filter((s) => !idBySlug.has(s));

  if (missing.length) {
    const rows = missing.map((slug) =>
      definitionFromTemplate(TEMPLATE_BY_SLUG.get(slug), vendorId, sections)
    );

    let created = null;
    let { data, error } = await db
      .from('spec_attributes')
      .upsert(rows, { onConflict: 'slug, created_by_vendor_id' })
      .select('id, slug');

    if (error) {
      /* §35's columns, or §30's owner column, absent on this database. Retry
         without the ones a pre-§35 table does not have rather than losing the
         seller's whole save over an icon. The same two-tier shape as the read
         above, and the reason lacksColumn() exists for the catalog entities. */
      const plain = rows.map(({ icon, category_icon, ...rest }) => rest);
      const retry = await db
        .from('spec_attributes')
        .upsert(plain, { onConflict: 'slug, created_by_vendor_id' })
        .select('id, slug');

      if (retry.error) {
        return { idBySlug, optionIdByKey, error: retry.error.message };
      }
      created = retry.data;
    } else {
      created = data;
    }

    for (const row of created ?? []) idBySlug.set(row.slug, row.id);

    /* The answers for every choice field just created. Without these the
       dropdown is empty next time and the editor says "no answers defined",
       which is how the old catalog model felt. */
    const optionRows = [];
    for (const slug of missing) {
      const id = idBySlug.get(slug);
      const entry = TEMPLATE_BY_SLUG.get(slug);
      if (!id || !entry?.choices?.length) continue;

      entry.choices.forEach((choice, i) => {
        optionRows.push({
          attribute_id: id,
          name: { ar: choice.ar, en: choice.en },
          sequence: (i + 1) * 10,
          active: true,
        });
      });
    }

    if (optionRows.length) {
      const { data: values, error: valueError } = await db
        .from('spec_attribute_values')
        .insert(optionRows)
        .select('id, attribute_id, name');

      if (valueError) {
        /* A choice with no answers still saves — the value lands as text and
           the sheet reads correctly. Worth logging, not worth failing a save. */
        console.warn('[specs] answers not created:', valueError.message);
      } else {
        const slugById = new Map([...idBySlug].map(([slug, id]) => [id, slug]));
        for (const v of values ?? []) {
          const slug = slugById.get(v.attribute_id);
          const en = v.name?.en;
          if (slug && en) optionIdByKey.set(`${slug}|${en}`, v.id);
        }
      }
    }
  }

  /* The answers of definitions that ALREADY existed, for the same swap. A
     showroom whose "Fuel type" row predates this feature has answers with ids,
     and a first tick must store the id rather than text beside them. */
  const presentIds = [...idBySlug.values()];
  if (presentIds.length) {
    const { data: values } = await db
      .from('spec_attribute_values')
      .select('id, attribute_id, name')
      .in('attribute_id', presentIds)
      .eq('active', true)
      .limit(4000);

    const slugById = new Map([...idBySlug].map(([slug, id]) => [id, slug]));
    for (const v of values ?? []) {
      const slug = slugById.get(v.attribute_id);
      const en = v.name?.en;
      const key = slug && en ? `${slug}|${en}` : null;
      if (key && !optionIdByKey.has(key)) optionIdByKey.set(key, v.id);
    }
  }

  return { idBySlug, optionIdByKey, error: null };
}

/**
 * A specification the template does not name.
 *
 * The template is 298 entries and will still be missing something — a Saudi
 * showroom selling armoured cars, a classic with a column shift. This is the
 * "new thing" half of the checklist, and it writes exactly the shape
 * definitionFromTemplate writes, so a custom row and a template row are the
 * same kind of thing everywhere downstream.
 *
 * `is_custom` marks it as the showroom's own, which is what §30's catalog
 * machinery already means by the flag.
 */
export async function createCustomSpec({
  vendorId,
  ar,
  en,
  kind = 'check',
  categoryKey = 'interior',
  icon = null,
  unitAr = '',
  unitEn = '',
  /** [{ ar, en }] for a list type. Already trimmed and capped by the action. */
  choices = [],
}) {
  const nameAr = String(ar ?? '').trim();
  const nameEn = String(en ?? '').trim();
  if (!vendorId) return { definition: null, error: 'NO_VENDOR' };
  if (!nameAr && !nameEn) return { definition: null, error: 'NAME_REQUIRED' };

  /* Resolved through the showroom's own sections, so a custom specification
     can be filed under a heading they added — which is most of the point of
     being able to add one. */
  const sections = await getSpecSections(vendorId);
  const resolved = resolveSections(sections);
  const cat =
    resolved.find((c) => c.key === categoryKey) ??
    SPEC_CATEGORY_BY_KEY.get(categoryKey) ??
    SPEC_CATEGORIES.at(-1);
  const display = DISPLAY_TYPE_OF_KIND[kind] ?? 'yesno';

  /* Derived from the English name where there is one, because a slug is a URL
     segment and an Arabic one would be percent-encoded into something nobody
     can read — the same rule blog_posts.slug states. A row with only an Arabic
     name gets a stable generated slug instead of a transliteration nobody
     asked for. */
  const base = normalizeSlug(nameEn) || `spec-${Date.now().toString(36)}`;

  const unit =
    unitAr || unitEn ? { ar: unitAr || unitEn, en: unitEn || unitAr } : null;

  const row = {
    slug: base,
    attribute_name: { ar: nameAr || nameEn, en: nameEn || nameAr },
    attribute_sequence: 9990,
    category_name: { ar: cat.ar, en: cat.en },
    category_sequence: cat.sequence,
    icon: isSpecIcon(icon) ? icon : null,
    category_icon: cat.icon ?? null,
    unit_code: unit,
    display_type: display,
    show_on_card: false,
    is_key: false,
    active: true,
    created_by_vendor_id: vendorId,
    is_custom: true,
    approved: true,
  };

  const db = getMarketplaceDb();
  let { data, error } = await db.from('spec_attributes').insert(row).select(DEF_SELECT).single();

  if (error?.code === '23505') {
    /* This showroom already has that slug — they are re-adding a name they
       already have, or the generated slug collided. Say which, rather than
       showing a constraint name. */
    return { definition: null, error: 'ALREADY_EXISTS' };
  }

  if (error) {
    /* §35 absent: drop the token columns and keep the specification. */
    const { icon: _icon, category_icon: _categoryIcon, ...plain } = row;
    const retry = await db
      .from('spec_attributes')
      .insert(plain)
      .select(DEF_SELECT.replace(', icon, category_icon', ''))
      .single();

    if (retry.error) {
      return {
        definition: null,
        error: retry.error.code === '23505' ? 'ALREADY_EXISTS' : retry.error.message,
      };
    }
    data = retry.data;
  }

  /**
   * The answers, for a list type.
   *
   * Written after the definition because they reference it, and NOT inside a
   * transaction — PostgREST has none to offer. The failure that leaves behind
   * is a list specification with no answers, which the checklist renders as an
   * empty dropdown and the seller can fix by deleting the row and adding it
   * again. The other order would be worse: orphan answer rows pointing at no
   * definition, which nothing can see or clear.
   */
  let options = [];
  if (choices.length && data?.id) {
    const { data: values, error: valueError } = await db
      .from('spec_attribute_values')
      .insert(
        choices.map((c, i) => ({
          attribute_id: data.id,
          name: { ar: c.ar, en: c.en },
          sequence: (i + 1) * 10,
          active: true,
        })),
      )
      .select('id, attribute_id, name, sequence');

    if (valueError) {
      console.warn('[specs] answers not created for %s:', data.slug, valueError.message);
    } else {
      options = values ?? [];
    }
  }

  return { definition: { ...data, options }, error: null };
}

/**
 * Clear a specification off the showroom's list.
 *
 * ── Refused while any car answers it ──────────────────────────────────────
 *
 * Counted here and reported in cars, so the seller reads "6 cars use this"
 * rather than a foreign-key violation. The count is NOT the real guard —
 * `listing_specs.attribute_id` is ON DELETE RESTRICT (§5, asserted by §35), so
 * the database refuses it whatever this function believes, which is what makes
 * offering the button safe at all. This is the same split as deleteInvite():
 * the message is a courtesy, the constraint is the rule.
 *
 * A template row that was never saved has nothing to delete, and the action
 * says so rather than reporting a success that removed nothing.
 */
export async function deleteSpecDefinition({ vendorId, id }) {
  if (!vendorId || !id || isTemplateId(id)) return { ok: false, usedBy: 0, error: 'NOT_SAVED' };

  const usage = await specUsage([id]);
  const usedBy = usage.get(id) ?? 0;
  if (usedBy > 0) return { ok: false, usedBy, error: 'IN_USE' };

  const db = getMarketplaceDb();

  /* The answers first. They CASCADE from the definition, so this is not
     strictly needed — but a definition whose delete is refused must not lose
     its answers on the way to being refused, and deleting them first would do
     exactly that. So: scoped by vendor, and only once the definition itself is
     gone. */
  const { data, error } = await db
    .from('spec_attributes')
    .delete()
    .eq('id', id)
    /* Scoped by owner as well as id, so a guessed id from another showroom
       deletes nothing — the same rule revokeInvite() states. */
    .eq('created_by_vendor_id', vendorId)
    .select('id')
    .maybeSingle();

  if (error) {
    /* 23503: a car answered it between the count and the delete. */
    return {
      ok: false,
      usedBy,
      error: error.code === '23503' ? 'IN_USE' : error.message,
    };
  }

  return { ok: Boolean(data), usedBy: 0, error: data ? null : 'NOT_FOUND' };
}

/**
 * Change what a specification looks like, or where it shows.
 *
 * `show_on_card` and `is_key` are the two flags the checklist edits, and both
 * belong to the DEFINITION rather than to one car — flagging "Mileage" to show
 * on the card shows it on every card in the showroom. The tab says so; this
 * function cannot, which is why the wording matters there.
 *
 * `icon` is validated against the closed set rather than stored as given. The
 * column has a shape check too (§35), and both exist on purpose: the check
 * stops a URL, and this stops a token that would render as the fallback mark
 * and look like the save had failed.
 */
export async function updateSpecDefinition({ vendorId, id, patch = {} }) {
  if (!vendorId || !id || isTemplateId(id)) return { ok: false, error: 'NOT_SAVED' };

  const db = getMarketplaceDb();

  /**
   * THIS SHOWROOM'S ROW, OR NOTHING.
   *
   * Checked up front, before anything is written, and it is not belt-and-
   * braces — it is the only thing standing in front of the option rows.
   *
   * Since §30 a specification belongs to exactly one showroom, and every
   * UPDATE below carries `.eq('created_by_vendor_id', vendorId)`, so a crafted
   * id cannot rewrite another showroom's name, type or flags: the statement
   * matches no row and returns NOT_FOUND.
   *
   * `spec_attribute_values` has no such column. It is keyed on attribute_id,
   * which is the whole of its identity, so setSpecChoices on an id belonging
   * to another showroom would happily rewrite THEIR dropdown — and the main
   * update failing afterwards would not put it back. The id arrives in a form
   * field, so that is reachable.
   *
   * Hence one read first. It also means an edit of a specification that was
   * deleted a moment ago reports NOT_FOUND instead of creating option rows
   * against an id that no longer exists.
   */
  const { data: owned, error: ownError } = await db
    .from('spec_attributes')
    .select('id')
    .eq('id', id)
    .eq('created_by_vendor_id', vendorId)
    .maybeSingle();

  if (ownError) return { ok: false, error: ownError.message };
  if (!owned) return { ok: false, error: 'NOT_FOUND' };

  const next = {};
  if ('isKey' in patch) next.is_key = Boolean(patch.isKey);
  if ('icon' in patch) next.icon = isSpecIcon(patch.icon) ? patch.icon : null;

  if ('ar' in patch || 'en' in patch) {
    const ar = String(patch.ar ?? '').trim();
    const en = String(patch.en ?? '').trim();
    if (!ar && !en) return { ok: false, error: 'NAME_REQUIRED' };
    next.attribute_name = { ar: ar || en, en: en || ar };
  }

  /**
   * The TYPE, after the fact.
   *
   * A seller who picked "Yes / no" and meant a dropdown had no way back: the
   * only route was to clear the specification and add it again, and clearing
   * is refused the moment a car answers it. So the type is editable, and
   * changing it is safe for the cars that have already answered — the answer
   * carries its own label (saveSpecs stores {raw, label} plus display_value),
   * so a sheet keeps rendering what it rendered before whatever the type now
   * says. What changes is the control the NEXT car gets.
   *
   * The option rows are deliberately left alone when a list becomes a number
   * or a text field. They cost nothing while nothing reads them, and a seller
   * who switches back gets their answers again instead of retyping them.
   */
  if ('kind' in patch) {
    const displayType = DISPLAY_TYPE_OF_KIND[patch.kind];
    if (!displayType) return { ok: false, error: 'KIND_INVALID' };
    next.display_type = displayType;
  }

  /* Only a number carries a unit, so switching away from one clears it —
     otherwise "Sunroof (L)" survives on the sheet. */
  if ('unitAr' in patch || 'unitEn' in patch) {
    const ar = String(patch.unitAr ?? '').trim();
    const en = String(patch.unitEn ?? '').trim();
    next.unit_code = ar || en ? { ar: ar || en, en: en || ar } : null;
  }

  /* Moving it to another heading. The section's name, mark and position are
     denormalised onto the row because that is what the car page groups by —
     see §36 — so all three move together or the sheet files it under one
     heading and sorts it under another. */
  if ('category' in patch && patch.category) {
    const resolved = resolveSections(await getSpecSections(vendorId));
    const cat = resolved.find((c) => c.key === patch.category);
    if (!cat) return { ok: false, error: 'CATEGORY_INVALID' };
    next.category_name = { ar: cat.ar, en: cat.en };
    next.category_sequence = cat.sequence;
    next.category_icon = cat.icon ?? null;
  }

  /**
   * The card flag, and the only part of this that can be REFUSED.
   *
   * Counted here rather than trusted from the client, because the count is
   * the rule: a tab open in two windows, or a double-click, would otherwise
   * put five specifications on the card between them. The row being changed is
   * excluded from the count, so re-flagging one that is already on is a no-op
   * rather than a refusal.
   */
  if ('showOnCard' in patch) {
    const wanted = Boolean(patch.showOnCard);

    if (wanted) {
      const { data: on, error: countError } = await db
        .from('spec_attributes')
        .select('id')
        .eq('created_by_vendor_id', vendorId)
        .eq('show_on_card', true)
        .eq('active', true)
        .neq('id', id);

      if (countError) return { ok: false, error: countError.message };

      const used = (on ?? []).length;
      if (used >= CARD_LIMIT) {
        return { ok: false, error: 'CARD_FULL', used, limit: CARD_LIMIT };
      }
    }

    next.show_on_card = wanted;
  }

  let answers = null;
  if (Array.isArray(patch.choices)) {
    answers = await setSpecChoices(id, patch.choices);
    if (!answers.ok) return { ok: false, error: answers.error };
  }

  if (!Object.keys(next).length) {
    /* An edit that only touched the answer list still succeeded. */
    return { ok: true, error: null, answers };
  }
  const { data, error } = await db
    .from('spec_attributes')
    .update(next)
    .eq('id', id)
    .eq('created_by_vendor_id', vendorId)
    .select('id')
    .maybeSingle();

  if (error) {
    /* The two §35 token columns are the only part of this that a pre-§35
       database lacks, and losing a type change because an icon could not be
       stored would be the wrong trade. `category_icon` is in here as well as
       `icon` now: moving a specification to another heading writes it, so a
       retry that dropped only `icon` would fail again on the same 42703. */
    const hasToken = 'icon' in next || 'category_icon' in next;
    if (hasToken && Object.keys(next).length > 1) {
      const { icon: _icon, category_icon: _categoryIcon, ...rest } = next;
      const retry = await db
        .from('spec_attributes')
        .update(rest)
        .eq('id', id)
        .eq('created_by_vendor_id', vendorId)
        .select('id')
        .maybeSingle();

      if (!retry.error) {
        return { ok: Boolean(retry.data), error: 'ICON_UNAVAILABLE', answers };
      }
    }
    return { ok: false, error: error.message };
  }

  return { ok: Boolean(data), error: data ? null : 'NOT_FOUND', answers };
}

/**
 * Create a definition for a template entry so a flag can be set on it.
 *
 * The checklist's "show on card" and icon controls are offered on entries the
 * showroom has no row for yet, because hiding them until the seller had ticked
 * the specification on some car would be a control that appears and disappears
 * for reasons nobody can see. Setting one creates the row — which is the same
 * lazy creation a tick does, just triggered a moment earlier.
 */
export async function materializeTemplateSpec(vendorId, slug) {
  const wanted = normalizeSlug(slug);
  if (!TEMPLATE_BY_SLUG.has(wanted)) return { id: null, error: 'UNKNOWN_SPEC' };

  const { idBySlug, error } = await ensureSpecDefinitions(vendorId, [wanted]);
  return { id: idBySlug.get(wanted) ?? null, error };
}

/** Exported for the actions' own validation, so the list lives in one place. */
export { SPEC_CATEGORIES, sequenceOf };
