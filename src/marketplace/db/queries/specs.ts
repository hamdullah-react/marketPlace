import { getMarketplaceDb } from '@/marketplace/db/client';
import { localized } from '@/marketplace/lib/listing';
import { templateFor, legacyCategoryIcon, SPEC_CATEGORIES } from '@/marketplace/lib/spec-template';
import type { LooseRow } from '@/marketplace/lib/row';

/**
 * A specification's mark, falling back to the template's.
 *
 * ── Why the fallback is not optional ──────────────────────────────────────
 *
 * `spec_attributes.icon` is null on every row that predates §35 — which is
 * every row on a live database, because the scraped definitions carried a
 * FILE and the token column is new. Reading the column alone would mean a car
 * page whose whole specification sheet drew the neutral fallback mark until a
 * seller had been through 80 rows picking icons by hand, and the sheet would
 * look worse than it did with the borrowed artwork. Nobody would thank us for
 * that trade.
 *
 * So the template supplies the mark for any specification it names, through
 * templateFor — the SAME matcher the seller's checklist uses, so the editor
 * and the car page cannot show different marks for one specification. A
 * stored token always wins: it is the showroom's own choice, made on the row.
 *
 * templateFor rather than a plain slug lookup, and that is not a refinement.
 * The two live databases spell these differently — one has `torque`, the other
 * `engine-torque` — so a direct lookup found nothing on the second and a car
 * page with seventy-six filled-in specifications drew a neutral mark beside
 * every one of them. Measured, not theorised.
 *
 * A specification the template does not name and nobody has given a mark to
 * returns null, and SpecGlyph draws a neutral mark so the row keeps its
 * gutter.
 */
function iconFor(row: LooseRow): string | null {
  const own = typeof row?.icon === 'string' ? row.icon : null;
  if (own) return own;

  return templateFor(row)?.icon ?? null;
}

/**
 * A section's mark, the same way.
 *
 * Matched on the category's NAME rather than a key, because that is all the
 * row carries — there is no categories table for specifications, and
 * schema.sql §14 gives the reason. Both languages are tried, so a sheet
 * authored in Arabic finds its section too.
 *
 * Then the scraped names, which match no template section: every existing car
 * page is grouped under "External equipment", "Ease and comfort" and six
 * others, and without that second lookup every heading on every one of them
 * draws the neutral mark. See legacyCategoryIcon.
 */
function categoryIconFor(row: LooseRow): string | null {
  const own = typeof row?.category_icon === 'string' ? row.category_icon : null;
  if (own) return own;

  const name = row?.category_name as { ar?: string; en?: string } | null;
  const hit = SPEC_CATEGORIES.find((c) => c.en === name?.en || c.ar === name?.ar);
  if (hit) return hit.icon;

  return legacyCategoryIcon(name?.en) ?? legacyCategoryIcon(name?.ar);
}

/**
 * Spec sheet: definitions and per-listing values.
 *
 * Mirrors how the main site renders a car page — attributes grouped into
 * categories, each carrying its own icon at BOTH levels, ordered by
 * category_sequence then attribute_sequence. `show_on_card` marks the handful
 * that surface in the "Car Information" grid above the full sheet.
 *
 * ── The icons are tokens now, not URLs ────────────────────────────────────
 *
 * `attribute_icon_url` and `category_icon_url` held SVG files that arrived
 * with a template scraped off another dealership's site. Nothing here reads
 * them any more: §35 added `icon` and `category_icon`, which name one of the
 * icons this application ships, and ui/SpecGlyph.jsx draws them. The columns
 * are left in the table — see §35 on why dropping them buys nothing — and are
 * deliberately absent from every select below, so nothing can start rendering
 * them again by accident.
 */

const DEF_SELECT = `
  id, slug, category_name, category_icon, category_sequence,
  attribute_name, icon, attribute_sequence,
  unit_code, display_type, show_on_card, is_key
`;

/**
 * The same list without §35's two columns.
 *
 * schema.sql is run by hand, and a select naming a column that does not exist
 * fails the WHOLE select in PostgREST (42703) — which here would mean a car
 * page with no specification sheet at all. The same two-tier shape
 * session.js's PROFILE_FULL uses, and for the same reason.
 */
const DEF_SELECT_NO_ICONS = DEF_SELECT
  .replace('category_icon, ', '')
  .replace('icon, ', '');

/**
 * All definitions, already nested into the categories the UI renders.
 *
 * `locale` is not optional in practice: it used to be omitted here, so
 * groupByCategory fell back to its 'ar' default and every category heading
 * rendered in Arabic no matter who was looking. The rows themselves are fully
 * bilingual — only the heading was hardcoded.
 */
export async function getSpecDefinitions(locale = 'ar', vendorId = null) {
  const db = getMarketplaceDb();

  /**
   * Which specifications this seller's catalog contains.
   *
   * Same rule as brands and models, and it was missed: the Specifications tab
   * of the listing form was showing all eighty definitions — eleven categories
   * of them — to a seller whose catalog was empty and whose brand dropdown was
   * correctly blank. One form, two answers to "what is in your catalog".
   *
   * null means no filter, which is what the PUBLIC car page passes: a buyer
   * reading a spec sheet must see every spec the seller filled in, whoever
   * installed the definition.
   */
  let allowed = null;
  if (vendorId) {
    const { data: ids, error: scopeError } = await db
      .rpc('vendor_catalog_rows', { target: vendorId, tbl: 'spec_attributes' });

    // Section 18 not applied yet — fall back to the full list rather than
    // showing a seller an empty spec sheet they cannot explain.
    if (!scopeError) {
      allowed = [
        ...new Set(
          ((ids ?? []) as LooseRow[]).map((r) =>
            typeof r === 'string' ? r : r.vendor_catalog_rows,
          ),
        ),
      ].filter(Boolean) as string[];
      if (!allowed.length) return [];
    }
  }

  /* Spelled out twice rather than built from a variable: supabase-js parses
     the select string at the TYPE level, so a computed one types every row as a
     parser error and nothing downstream checks. */
  const scoped = <T>(q: T) => (allowed ? (q as { in: (a: string, b: string[]) => T }).in('id', allowed) : q);

  const withIcons = () =>
    scoped(
      db
        .from('spec_attributes')
        .select(`
          id, slug, category_name, category_icon, category_sequence,
          attribute_name, icon, attribute_sequence,
          unit_code, display_type, show_on_card, is_key
        `)
        .eq('active', true)
        .order('category_sequence', { ascending: true })
        .order('attribute_sequence', { ascending: true }),
    );

  const withoutIcons = () =>
    scoped(
      db
        .from('spec_attributes')
        .select(`
          id, slug, category_name, category_sequence,
          attribute_name, attribute_sequence,
          unit_code, display_type, show_on_card, is_key
        `)
        .eq('active', true)
        .order('category_sequence', { ascending: true })
        .order('attribute_sequence', { ascending: true }),
    );

  let rows: LooseRow[] = [];
  const first = await withIcons();

  /* §35 has not been run on this database. A sheet with no marks beats no
     sheet, so this retries without them rather than throwing. */
  if (first.error) {
    const plain = await withoutIcons();
    if (plain.error) throw new Error(`getSpecDefinitions: ${plain.error.message}`);
    rows = (plain.data ?? []) as LooseRow[];
  } else {
    rows = (first.data ?? []) as LooseRow[];
  }

  // Option lists for the choice-type attributes. Fetched as one flat query and
  // grouped in memory rather than as a nested select — PostgREST caps embedded
  // rows per parent, and a 12-option list silently truncating is the kind of
  // bug that only shows up on the one attribute that has many options.
  //
  // A failure here degrades to no options, which the editor renders as a text
  // box: the same behaviour as before this table existed, not a broken form.
  let optionsByAttribute = new Map<string, LooseRow[]>();
  try {
    const { data: values, error: valueError } = await db
      .from('spec_attribute_values')
      .select('id, attribute_id, name, sequence')
      .eq('active', true)
      .order('sequence', { ascending: true })
      .limit(2000);

    if (valueError) throw new Error(valueError.message);

    optionsByAttribute = (values ?? []).reduce((map, value) => {
      const list = map.get(value.attribute_id) ?? [];
      list.push(value as LooseRow);
      return map.set(value.attribute_id, list);
    }, new Map<string, LooseRow[]>());
  } catch {
    optionsByAttribute = new Map();
  }

  const withOptions = rows.map((row) => ({
    ...row,
    options: optionsByAttribute.get(row.id as string) ?? [],
  }));

  return groupByCategory(withOptions, locale);
}

/**
 * Groups by category, keeping database order.
 *
 * A Map preserves insertion order, so the categories come out in
 * category_sequence order without a second sort — the query already did it.
 */
export function groupByCategory(rows: LooseRow[], locale = 'ar') {
  const groups = new Map();

  for (const row of rows) {
    const key = row.category_name?.en || row.category_name?.ar || 'General';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: localized(row.category_name, locale),
        /* A TOKEN, for SpecGlyph — not a URL for an <img>. */
        icon: categoryIconFor(row),
        sequence: row.category_sequence,
        items: [],
      });
    }
    groups.get(key).items.push(row);
  }

  return [...groups.values()];
}

export async function getListingSpecs(listingId: string) {
  if (!listingId) return [];

  const db = getMarketplaceDb();

  const read = (columns: string) =>
    db
      .from('listing_specs')
      .select(`id, attribute_id, value, display_value, sequence, spec_attributes ( ${columns} )`)
      .eq('listing_id', listingId)
      .order('sequence', { ascending: true });

  const { data, error } = await read(DEF_SELECT);
  if (!error) return data ?? [];

  const plain = await read(DEF_SELECT_NO_ICONS);
  if (plain.error) throw new Error(`getListingSpecs: ${plain.error.message}`);
  return plain.data ?? [];
}

/**
 * The card's spec row, for a whole page of listings in ONE query.
 *
 * Which specs appear is a catalog decision — the ones flagged `show_on_card`
 * on the specification itself. Nothing is hardcoded here, so a spec someone
 * flags tomorrow shows up with no change to this file or the card.
 *
 * One query for the whole grid, not one per card: a 24-car page doing it the
 * other way is 24 round trips for a four-icon row.
 *
 * Returns a Map of listing id → [{ label, value, icon }], already localized
 * and already trimmed to `limit`.
 */
export async function getCardSpecs(listingIds = [], locale = 'ar', limit = 4) {
  const ids = [...new Set(listingIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const db = getMarketplaceDb();

  /* Spelled out twice rather than interpolated: supabase-js parses the select
     string at the TYPE level, so a computed one makes every row a ParserError
     and nothing downstream type-checks. !inner plus the show_on_card filter is
     what makes the DATABASE do the selecting — pulling all forty specs per car
     and filtering here would move ten times the rows for the same four icons. */
  const cardQuery = () =>
    db
      .from('listing_specs')
      .select(
        `listing_id, value, display_value, sequence,
         spec_attributes!inner ( id, slug, attribute_name, icon, attribute_sequence, category_name, unit_code, display_type, show_on_card )`
      )
      .in('listing_id', ids)
      .eq('spec_attributes.show_on_card', true);

  const cardQueryNoIcon = () =>
    db
      .from('listing_specs')
      .select(
        `listing_id, value, display_value, sequence,
         spec_attributes!inner ( id, slug, attribute_name, attribute_sequence, category_name, unit_code, display_type, show_on_card )`
      )
      .in('listing_id', ids)
      .eq('spec_attributes.show_on_card', true);

  let rows: LooseRow[] = [];
  const first = await cardQuery();

  if (first.error) {
    /* §35 not run on this database. A fact strip with no marks beats a card
       that throws. */
    const plain = await cardQueryNoIcon();
    if (plain.error) throw new Error(`getCardSpecs: ${plain.error.message}`);
    rows = (plain.data ?? []) as LooseRow[];
  } else {
    rows = (first.data ?? []) as LooseRow[];
  }

  const out = new Map();
  for (const row of rows) {
    const def = row.spec_attributes as LooseRow | null;
    const value = specValue(row, locale);
    if (!def || !value) continue;

    const list = out.get(row.listing_id) ?? [];
    list.push({
      id: def.id,
      slug: def.slug,
      label: localized(def.attribute_name, locale),
      ...withValues(value, { ...row, display_type: def.display_type }),
      unit: localized(def.unit_code, locale) || null,
      icon: iconFor(def),
      sequence: def.attribute_sequence ?? 0,
    });
    out.set(row.listing_id, list);
  }

  for (const [id, list] of out) out.set(id, pickForCard(list, id, limit));
  return out;
}

/**
 * Choose which specs a card shows when more are flagged than fit.
 *
 * The row holds four; flagging eight is a reasonable thing for a catalog
 * manager to do, and the card still has four slots. So it picks four.
 *
 * NOT Math.random(). A card is rendered on the server and hydrated on the
 * client, and two different draws mean a hydration mismatch and a visible
 * flicker; re-drawing on every request would also make the same car show
 * different specs on every scroll back. Instead the listing's own id seeds the
 * shuffle, which gives what the randomness was actually for — variety ACROSS
 * the grid rather than eight identical rows of Transmission and Fuel — while
 * staying identical for one car every time it is drawn.
 *
 * Under the limit, order is the catalog's own: attribute_sequence.
 */
function pickForCard(list: LooseRow[], seedSource: string, limit: number) {
  const ordered = [...list].sort((a, b) => a.sequence - b.sequence);
  if (ordered.length <= limit) return ordered;

  // FNV-1a over the id. Small, dependency-free, and spreads adjacent ids —
  // which matters, because listing ids in a grid are often adjacent.
  let seed = 2166136261;
  for (const ch of String(seedSource)) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }

  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Fisher-Yates, then re-sorted: WHICH four is varied, the ORDER they appear
  // in is still the catalog's, so the row does not look shuffled.
  const pool = [...ordered];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    // Both indices are inside the array by construction of the loop.
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  return pool.slice(0, limit).sort((a, b) => a.sequence - b.sequence);
}

/**
 * The shape the detail page renders: categories → attributes → value, with
 * icons attached and empty values dropped.
 *
 * A spec sheet listing forty blank rows reads as a broken page, so anything the
 * seller left empty is omitted rather than shown as "—".
 */
/**
 * One spec's displayable value, whatever shape the column holds.
 *
 * `listing_specs.value` is jsonb and has held three shapes over time:
 *   { label: {ar, en} }  written by the seeder and the bilingual editor
 *   { raw: <scalar> }    written when a number or boolean was stored
 *   a bare scalar        the oldest rows
 *
 * Plus `display_value`, the flat text rendered at save time. Returning a STRING
 * unconditionally is the point — a caller that renders this into JSX cannot
 * defend itself against an object arriving here.
 */
function specValue(item: LooseRow, locale: string) {
  const v = item?.value;

  if (v && typeof v === 'object') {
    const label = localized(v.label, locale);
    if (label) return label;

    const raw = v.raw;
    // A re-save through the edit form nested the old value inside `raw`, so
    // look one level in before giving up on it.
    if (raw && typeof raw === 'object') {
      const nested = localized(raw.label, locale) || localized(raw, locale);
      if (nested) return nested;
    } else if (raw !== null && raw !== undefined) {
      return String(raw);
    }

    // A bare {ar, en} with no `label` wrapper.
    const direct = localized(v, locale);
    if (direct) return direct;
  } else if (v !== null && v !== undefined && v !== '') {
    return String(v);
  }

  // Rows written by the broken save literally contain "[object Object]".
  // Echoing that back is worse than showing nothing.
  const flat = item?.display_value ? String(item.display_value) : '';
  return flat === '[object Object]' ? '' : flat;
}

/**
 * The parts of a multi-answer spec — "Driving mode", "Safety features" — as a
 * list rather than one run-on line.
 *
 * A multi spec stores an ARRAY of option ids, and the label saved beside it is
 * those options' names joined with a comma. Rendered straight, that is a
 * sentence: "Sand Mode, Normal Mode, Sport Mode, Mud Mode, Normal Mode, Normal
 * Mode, Sport Mode…". Two things make it worse than it looks:
 *
 *   · Several options repeat the same mode, because the catalog options were
 *     scraped as whole combinations rather than single modes. Joining them
 *     repeats every mode as many times as it appears.
 *   · A comma-separated run of twelve items reads as prose, and a buyer
 *     scanning for "does it have Sport Mode" has to read all of it.
 *
 * Splitting on the comma and deduping fixes both at once, and needs no data
 * migration: for a well-formed option list — one mode per option — the split is
 * a no-op and the dedupe has nothing to remove.
 *
 * Only for multi. A select's value may legitimately contain a comma
 * ("Front-Wheel Drive (FWD), front axle"), and cutting that in half would
 * invent two answers where the catalog holds one.
 */
function withValues(text: string, item: LooseRow) {
  const values = splitValues(item, text);
  return { value: values.length ? values.join(', ') : text, values };
}

function splitValues(item: LooseRow, text: string) {
  const raw = item?.value?.raw ?? item?.value;
  const isMulti = item?.display_type === 'multi' || Array.isArray(raw);
  if (!isMulti || !text) return [];

  const seen = new Set();
  const out = [];
  // Both commas: Arabic writes ، (U+060C), and a bilingual catalog holds rows
  // punctuated each way.
  for (const part of String(text).split(/[,،]/)) {
    const value = part.trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const dedupeKey = value.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(value);
  }

  // One part is not a list — it is the value, and rendering it as a single
  // ticked row would dress a plain answer up as a choice among many.
  return out.length > 1 ? out : [];
}

export function buildSpecSheet(rows: LooseRow[], locale = 'ar') {
  const filled = (rows ?? []).filter((r: LooseRow) => {
    const v = r.value?.raw ?? r.value;
    return v !== null && v !== undefined && v !== '' && v !== false;
  });

  const flattened = filled.map((r: LooseRow) => ({
    ...r.spec_attributes,
    value: r.value,
    display_value: r.display_value,
  }));

  return groupByCategory(flattened, locale).map((group) => ({
    ...group,
    items: group.items.map((item: LooseRow) => ({
      id: item.id,
      slug: item.slug,
      label: localized(item.attribute_name, locale),
      icon: iconFor(item),
      // jsonb, like every other translatable — see schema.sql.
      unit: localized(item.unit_code, locale),
      displayType: item.display_type,
      isKey: item.is_key,
      showOnCard: item.show_on_card,
      // yes/no is NOT a boolean upstream — each such attribute owns four
      // options (Yes, No, Available, Not Available), because "this car has no
      // sunroof" and "this trim does not offer one" are different answers. So
      // it renders as its label, and only a genuinely stored boolean gets a
      // tick.
      boolean: typeof (item.value?.raw ?? item.value) === 'boolean',
      // ALWAYS a string. The old `||` chain ended in `item.value`, which is a
      // jsonb object — so any row whose label failed to localize fell through
      // to the object itself and React printed "[object Object]" in place of
      // every value on the page. specValue() coerces whatever shape the column
      // holds, and can only ever return text.
      //
      // `values` is the same answer as a list when the spec takes several —
      // empty otherwise, so a renderer can simply check it. `value` stays the
      // authoritative text and is rebuilt from the deduped list, so a consumer
      // with no room for ticks still loses the repeats.
      ...withValues(specValue(item, locale), item),
    })),
  }));
}

/** The "Car Information" tiles — the handful flagged to surface above the sheet. */
export function cardSpecs(sheet: LooseRow[], limit = 12) {
  return sheet
    .flatMap((g: LooseRow) => g.items as LooseRow[])
    .filter((i: LooseRow) => i.showOnCard || i.isKey)
    .filter((i: LooseRow) => !i.boolean || i.value === true || i.value === 'true')
    .slice(0, limit);
}

/**
 * Filter facets built from the SPEC SHEET, for the cars browse rail.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * The marketplace has two places a fact about a car can live: `listings.
 * attributes` (the catalog kinds — condition, and whatever else a seller sets
 * on the listing form) and `listing_specs` (the spec sheet). Transmission,
 * fuel, seats, body style and drive type are all in the SECOND one on real
 * listings, so a rail reading `attributes.transmission` finds nothing and
 * quietly hides its own Transmission section. That is what was happening.
 *
 * ── Grouped by category, driven by the catalog ──────────────────────────────
 *
 * The main site's DynamicFacets groups its generic facets by category and is
 * driven entirely by the attribute system. Same here: nothing below names a
 * particular attribute, so an attribute added to the catalog appears in the
 * rail on the next request, with its own icon and unit, and nobody edits a
 * component to make it happen.
 *
 * `display_value` is preferred over `value` when both exist, because that is
 * the string the seller saw when they chose it and the one the spec sheet
 * prints — a facet whose words differ from the car page is a facet nobody
 * trusts.
 */
export async function getSpecFacets(listingIds: string[] = [], locale = 'ar') {
  const ids = [...new Set(listingIds.filter(Boolean))];
  if (!ids.length) return [];

  const db = getMarketplaceDb();

  /* Two literals, for the reason given in getCardSpecs. */
  const facetQuery = () =>
    db
      .from('listing_specs')
      .select(
        `listing_id, value, display_value,
         spec_attributes!inner (
           id, slug, attribute_name, attribute_sequence, icon,
           category_name, category_sequence, category_icon,
           unit_code, display_type, active
         )`
      )
      .in('listing_id', ids)
      .eq('spec_attributes.active', true);

  const facetQueryNoIcons = () =>
    db
      .from('listing_specs')
      .select(
        `listing_id, value, display_value,
         spec_attributes!inner (
           id, slug, attribute_name, attribute_sequence,
           category_name, category_sequence,
           unit_code, display_type, active
         )`
      )
      .in('listing_id', ids)
      .eq('spec_attributes.active', true);

  let rows: LooseRow[] = [];
  const first = await facetQuery();

  if (first.error) {
    const plain = await facetQueryNoIcons();
    if (plain.error) throw new Error(`getSpecFacets: ${plain.error.message}`);
    rows = (plain.data ?? []) as LooseRow[];
  } else {
    rows = (first.data ?? []) as LooseRow[];
  }

  const attrs = new Map();

  for (const row of rows) {
    const def = row.spec_attributes as LooseRow | null;
    if (!def) continue;

    /* yesno is not a facet with two options — it is a switch, and "Leather
       steering wheel: No" is not something anybody filters FOR. Handled as a
       feature toggle further down rather than as a list of Yes/No pills. */
    const type = def.display_type || 'text';

    const label = row.display_value || specValue(row, locale);
    if (label == null || label === '') continue;

    const entry = attrs.get(def.slug) ?? {
      slug: def.slug,
      name: def.attribute_name,
      /* `icon`, not `iconUrl` — the rail draws it with SpecGlyph now, and
         leaving the old name would have let a URL-shaped prop keep flowing to
         a component that no longer takes one. */
      icon: iconFor(def),
      categoryName: def.category_name,
      categoryIcon: categoryIconFor(def),
      categorySequence: def.category_sequence ?? 0,
      sequence: def.attribute_sequence ?? 0,
      unit: localized(def.unit_code, locale) || null,
      displayType: type,
      values: new Map(),
      numbers: [],
    };

    /* A "multi" spec holds several answers in one row — "Normal Mode, Sport
       Mode". Split so each becomes its own option, or the rail offers one pill
       matching the exact combination one car happens to have. */
    const parts = type === 'multi'
      ? String(label).split(',').map((p) => p.trim()).filter(Boolean)
      : [String(label).trim()];

    for (const part of parts) {
      entry.values.set(part, (entry.values.get(part) ?? 0) + 1);
    }

    if (type === 'numeric') {
      const n = Number(String(label).replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) entry.numbers.push(n);
    }

    attrs.set(def.slug, entry);
  }

  return [...attrs.values()]
    .map((a) => ({
      slug: a.slug,
      name: a.name,
      icon: a.icon,
      categoryName: a.categoryName,
      categoryIcon: a.categoryIcon,
      categorySequence: a.categorySequence,
      sequence: a.sequence,
      unit: a.unit,
      displayType: a.displayType,
      range: a.numbers.length
        ? { min: Math.min(...a.numbers), max: Math.max(...a.numbers) }
        : null,
      values: [...a.values.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((x, y) => y.count - x.count),
    }))
    /* One answer given by every car is not a filter — it is a fact about the
       whole inventory, and a row that cannot narrow anything is a row that
       only makes the rail longer. */
    .filter((a) => a.displayType === 'numeric' || a.values.length > 1)
    .sort((a, b) =>
      a.categorySequence - b.categorySequence || a.sequence - b.sequence
    );
}

/**
 * The listing ids whose spec sheet matches every named filter.
 *
 * `{ 'fuel-type': ['Diesel'], transmission: ['CVT', 'Semi-Automatic'] }` means
 * diesel AND (CVT OR semi-automatic): two DIFFERENT questions are an AND, two
 * answers to the SAME question are an OR. Anything else surprises people —
 * ticking a second fuel should widen the results, not empty them.
 *
 * Returns null when nothing is being filtered, which the caller reads as "do
 * not narrow" rather than "nothing matched".
 */
export async function listingIdsMatchingSpecs(
  specFilters?: Record<string, string[]> | null,
  specRanges?: Record<string, { min?: number; max?: number }> | null,
  locale = 'ar',
) {
  const entries = Object.entries(specFilters || {}).filter(([, v]) => v?.length);
  const rangeEntries = Object.entries(specRanges || {}).filter(
    ([, r]) => Number.isFinite(r?.min) || Number.isFinite(r?.max)
  );
  if (!entries.length && !rangeEntries.length) return null;

  const slugs = [...new Set([...entries, ...rangeEntries].map(([slug]) => slug))];

  const { data, error } = await getMarketplaceDb()
    .from('listing_specs')
    .select('listing_id, value, display_value, spec_attributes!inner ( slug, display_type )')
    .in('spec_attributes.slug', slugs);

  if (error) throw new Error(`listingIdsMatchingSpecs: ${error.message}`);

  // slug -> Set(listing ids that answered it acceptably). A range and a value
  // list on the same attribute are two questions, so they get two buckets.
  const hits = new Map(
    [...entries.map(([s]) => `v:${s}`), ...rangeEntries.map(([s]) => `r:${s}`)]
      .map((k) => [k, new Set()])
  );

  for (const row of data ?? []) {
    const def = row.spec_attributes;
    if (!def) continue;

    const label = row.display_value || specValue(row, locale);
    if (label == null || label === '') continue;

    const wanted = specFilters?.[def.slug];
    if (wanted?.length) {
      const answers = def.display_type === 'multi'
        ? String(label).split(',').map((p) => p.trim())
        : [String(label).trim()];
      if (answers.some((a) => wanted.includes(a)))
        hits.get(`v:${def.slug}`)?.add(row.listing_id);
    }

    const range = specRanges?.[def.slug];
    if (range) {
      // Stripped of everything but the number: a numeric spec is stored with
      // its unit in the display value ("1.6 L"), and Number("1.6 L") is NaN.
      const n = Number(String(label).replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) {
        // Read into locals first: Number.isFinite() does not narrow the
        // optional away for the comparison that follows it.
        const min = range.min;
        const max = range.max;
        const okMin = !Number.isFinite(min) || n >= (min as number);
        const okMax = !Number.isFinite(max) || n <= (max as number);
        if (okMin && okMax) hits.get(`r:${def.slug}`)?.add(row.listing_id);
      }
    }
  }

  // The intersection: a car has to satisfy every question, not just one.
  let result = null;
  for (const set of hits.values()) {
    if (result == null) result = new Set(set);
    else for (const id of [...result]) if (!set.has(id)) result.delete(id);
  }

  return result ?? new Set();
}
