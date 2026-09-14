/**
 * Catalog entity registry.
 *
 * Brands, models, trims, colours and attribute options are the same shape —
 * a bilingual name, an optional description, an icon, an image, a sort order
 * and an active flag. One config drives the queries, the server actions and
 * the management table, so adding a new catalog list is an entry here rather
 * than a seventh copy of the same CRUD.
 *
 * Shared by server and client, so it holds no imports and no secrets.
 */

/**
 * One row-type in the catalog manager.
 *
 * Every field past `table`/`ar`/`en` is optional because the six entities
 * genuinely differ — years carry no name, specs carry two, only brands have a
 * logo. That is the shape of the data, not laziness: making them required
 * would force `false` and `null` padding onto five entities to satisfy the
 * sixth, and the code already asks `if (e.hasLogo)` rather than assuming.
 */
export type CatalogEntityField = { key: string; ar: string; en: string; type?: string };

export type CatalogEntity = {
  table: string;
  ar: string;
  en: string;
  parent?: { key: string; entity?: string; ar?: string; en?: string } | null;
  hasSlug?: boolean;
  hasDescription?: boolean;
  hasIcon?: boolean;
  hasImage?: boolean;
  hasLogo?: boolean;
  hasActive?: boolean;
  hasSequence?: boolean;
  cascades?: string[];
  extra?: CatalogEntityField[];
  nameField?: string;
  iconField?: string;
  sequenceField?: string;
  numericOnly?: boolean;
  categorized?: boolean;
  kinded?: boolean;
  orderBy?: { column: string; ascending: boolean };
  options?: unknown;
  lacksColumns?: string[];
};

export const ENTITIES = {
  brands: {
    table: 'car_brands',
    ar: 'الماركات', en: 'Brands',
    parent: null,
    hasSlug: true, hasDescription: true, hasIcon: true, hasImage: true, hasLogo: true,
    hasActive: true, hasSequence: true,
    // Deleting a brand cascades to its models and trims — the table warns first.
    cascades: ['car_models', 'car_trims'],
  },
  models: {
    table: 'car_models',
    ar: 'الموديلات', en: 'Models',
    parent: { key: 'brand_id', entity: 'brands', ar: 'الماركة', en: 'Brand' },
    hasSlug: true, hasDescription: true, hasIcon: true, hasImage: true,
    hasActive: true, hasSequence: true,
    cascades: ['car_trims'],
  },
  trims: {
    table: 'car_trims',
    ar: 'الفئات', en: 'Trims',
    parent: { key: 'model_id', entity: 'models', ar: 'الموديل', en: 'Model' },
    hasSlug: true, hasDescription: true, hasIcon: true, hasImage: true,
    hasActive: true, hasSequence: true,
    extra: [{ key: 'code', ar: 'الرمز', en: 'Code', type: 'text' }],
  },
  years: {
    table: 'car_years',
    ar: 'السنوات', en: 'Years',
    parent: null,
    // A year has no name to translate — it is a number.
    numericOnly: true,
    /**
     * A year belongs to the showroom that added it, like every other row here.
     *
     * This used to carry `ownedByReceipt` and a `lacksColumns` list, from when
     * car_years had no owner column and membership had to be faked with an
     * install receipt. schema.sql §30 gave it `created_by_vendor_id` and
     * rewrote vendor_catalog_rows to read ownership ONLY — at which point those
     * two were not merely redundant, they broke the save: the owner was
     * stripped on the way in and the row came out belonging to nobody.
     *
     * Two showrooms may now each hold 2025, because uniqueness is
     * (value, created_by_vendor_id).
     */
    // Rendered by the numericOnly branch of the form, not by the `extra` loop —
    // this entry is here so `value` is SELECTED and searchable.
    extra: [{ key: 'value', ar: 'السنة', en: 'Year', type: 'number', required: true }],
    orderBy: { column: 'value', ascending: false },
  },
  colors: {
    table: 'car_colors',
    ar: 'الألوان', en: 'Colours',
    parent: null,
    hasSlug: true, hasDescription: true, hasIcon: true, hasImage: true, hasSequence: true,
    extra: [{ key: 'hex', ar: 'اللون', en: 'Colour', type: 'color' }],
  },
  // `attributes` — the fuel / transmission / body_type option lists — used to
  // live here beside a `car_attribute_kinds` table that grouped them. Both are
  // gone: they were a second way to say what a SPECIFICATION already says, and
  // a seller filling in "Transmission: Automatic" on the Specifications tab
  // then had to pick it again from a dropdown that came from somewhere else.
  // A spec flagged `show_on_card` is what the card shows now. The tables are
  // untouched and anything in them is left alone; nothing reads them.
  /**
   * The NAMES an offer can carry — "عرض اليوم الوطني", "White Friday".
   *
   * Here rather than as free text on the offer itself, for the reason every
   * other list in this registry exists: typed text turns one occasion into
   * four spellings, and nothing can then group, filter or report on it. See
   * schema.sql §25.1.
   *
   * A seller installs the Saudi occasions from the Templates tab and adds
   * their own alongside.
   */
  offerNames: {
    table: 'offer_names',
    ar: 'أسماء العروض', en: 'Offer names',
    parent: null,
    hasSlug: true, hasDescription: true, hasIcon: true, hasImage: true,
    hasActive: true, hasSequence: true,
  },
  specs: {
    table: 'spec_attributes',
    ar: 'المواصفات', en: 'Specifications',
    parent: null,
    hasSlug: true, hasDescription: true, hasActive: true, hasImage: true,
    // Specs carry TWO names (category and attribute) and TWO icons, mirroring
    // how the car page groups them. That is why they aren't just `name`.
    // Specs are grouped by category on the car page, so the manager filters
    // by category the same way options filter by kind.
    categorized: true,
    /**
     * Owned like every other catalog row, since schema.sql §30.
     *
     * Specifications were the worst case of the missing-owner bug: the row
     * saved, belonged to nobody, and vanished from the tab it was added on — so
     * the same spec got typed again and again. `seats`, `seatss`, `seatsss` and
     * `setas` in the old database were one person trying four times.
     *
     * The workaround that lived here — a receipt-based membership flag and a
     * list declaring these columns absent — is gone. §30 added
     * created_by_vendor_id, is_custom and approved to this table and made
     * ownership the only thing vendor_catalog_rows reads, at which point
     * declaring the columns absent stripped the owner on save and reproduced
     * the exact bug it had been written to work around.
     */
    nameField: 'attribute_name',
    iconField: 'attribute_icon_url',
    sequenceField: 'attribute_sequence',
    extra: [
      // bilingual, not text: 'L' is 'لتر'. See the unit_code migration in
      // schema.sql for why this stopped being a plain string.
      { key: 'unit_code', ar: 'الوحدة', en: 'Unit', type: 'i18n' },
      { key: 'display_type', ar: 'نوع الحقل', en: 'Field type', type: 'select',
        options: ['text', 'numeric', 'yesno', 'select', 'multi'] },
      { key: 'show_on_card', ar: 'يظهر على البطاقة', en: 'Show on card', type: 'boolean' },
      { key: 'is_key', ar: 'مواصفة رئيسية', en: 'Key spec', type: 'boolean' },
    ],
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES);

/**
 * The same object, widened for lookup by a key that came from a URL or a form.
 *
 * ENTITIES keeps its literal type so `ENTITIES.brands.table` stays precise;
 * this view is what the helpers below index, because the key they are handed
 * is a `string` and may name nothing at all — which every one of them already
 * handles with `?? fallback` or an early return.
 */
// Through `unknown` because the six entries are literal types that each cover
// only part of CatalogEntity, so TS will not accept the direct cast.
export const ENTITY_BY_KEY = ENTITIES as unknown as Record<string, CatalogEntity | undefined>;

const REGISTRY = ENTITY_BY_KEY;

/** The jsonb column holding the display name for this entity. */
export const nameFieldOf = (key: string) => REGISTRY[key]?.nameField ?? 'name';
export const iconFieldOf = (key: string) => REGISTRY[key]?.iconField ?? 'icon_url';
export const sequenceFieldOf = (key: string) => REGISTRY[key]?.sequenceField ?? 'sequence';

/** Columns to select — only what the table actually renders. */
export function selectFor(key: string): string {
  const e = REGISTRY[key];
  if (!e) return '*';

  const cols = ['id'];
  if (e.hasSlug) cols.push('slug');
  if (!e.numericOnly) cols.push(nameFieldOf(key));
  if (e.nameField) cols.push('category_name', 'category_icon_url', 'category_sequence');
  if (e.hasDescription) cols.push('description');
  if (e.hasIcon || e.iconField) cols.push(iconFieldOf(key));
  if (e.hasImage) cols.push('image_url');
  if (e.hasLogo) cols.push('logo_url');
  if (e.hasSequence || e.sequenceField) cols.push(sequenceFieldOf(key));
  if (e.hasActive) cols.push('active');
  if (e.kinded) cols.push('kind');
  if (e.parent) cols.push(e.parent.key);
  for (const x of e.extra ?? []) cols.push(x.key);

  cols.push('is_custom', 'approved', 'created_by_vendor_id');

  return [...new Set(cols)].filter((c) => !lacksColumn(key, c)).join(', ');
}

/**
 * Does this table simply not have that column?
 *
 * Years and specs predate the custom-entry columns, and PostgREST errors on a
 * column that does not exist rather than ignoring it. This was a private map
 * inside selectFor, which meant the READ knew and the WRITE did not: every
 * spec save sent `is_custom` and `created_by_vendor_id`, got PGRST204 twice,
 * retried twice and reported "saved, minus columns" for fields the seller had
 * never seen. Three round trips and a warning, on every save.
 *
 * One declaration on the entity, so both sides ask the same question.
 */
export function lacksColumn(key: string, column: string): boolean {
  return (REGISTRY[key]?.lacksColumns ?? []).includes(column);
}
