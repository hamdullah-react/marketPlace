import { getMarketplaceDb } from '@/marketplace/db/client';
import { DEFAULT_THEME, normaliseTheme } from '@/marketplace/lib/form-styles';

/**
 * The lead form a showroom asks buyers to fill in.
 *
 * Every seller sells something slightly different, so there is no field set
 * that suits all of them: a finance broker needs employer and monthly income, a
 * used-car dealer needs a trade-in and a budget, a parts shop needs a VIN.
 * Rather than shipping the union of everyone's questions and hiding most of
 * them, each showroom builds its own.
 *
 * Name, phone and message are NOT in here. They are asked on every form, they
 * are what makes a lead answerable, and a seller who deleted "phone" by
 * accident would be collecting leads they cannot act on.
 *
 * The rules for what a field can be live in @/marketplace/lib/form-fields, and
 * how it LOOKS in @/marketplace/lib/form-styles — both pure, so the browser can
 * use them too.
 *
 * ── Why these queries tolerate a missing column ─────────────────────────────
 *
 * `width` and `lead_form_style` arrive with schema.sql §20.4, and PostgREST
 * rejects an entire select over one unknown column. This code reaches a
 * database the moment it deploys; the SQL is run by a human, afterwards. Those
 * two facts are always in that order, and the page that would break in between
 * is a PUBLIC LISTING — every visitor, not just the seller.
 *
 * So the newer columns are asked for, and their absence falls back to the older
 * shape rather than taking the page down. The fallback disappears on its own
 * the moment the section is applied.
 */

const CORE =
  'id, field_key, label, help, placeholder, type, options, required, sort_order, active';

const WITH_LAYOUT = `${CORE}, width, tab_id`;

/** True for the specific "that column is not there" failure, and nothing else. */
const isMissingColumn = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === '42703' || /column .* does not exist|could not find/i.test(error?.message ?? '');

/**
 * A showroom's fields, in the order the seller arranged them.
 *
 * `activeOnly` is the whole difference between the buyer's form and the
 * builder: a buyer must never be shown a field the seller switched off, and the
 * seller has to see it in order to switch it back on.
 */
export async function getVendorFormFields(vendorId: string, { activeOnly = true } = {}) {
  if (!vendorId) return [];

  const run = (columns: string) => {
    let query = getMarketplaceDb()
      .from('vendor_form_fields')
      .select(columns)
      .eq('vendor_id', vendorId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (activeOnly) query = query.eq('active', true);
    return query;
  };

  const { data, error } = await run(WITH_LAYOUT);

  if (error) {
    if (!isMissingColumn(error)) throw new Error(`getVendorFormFields: ${error.message}`);

    // Pre-§20.4 database. Every field is full width, which is what the column
    // defaults to anyway.
    const retry = await run(CORE);
    if (retry.error) throw new Error(`getVendorFormFields: ${retry.error.message}`);
    return (retry.data ?? []).map((f) => ({
      ...(f as unknown as Record<string, unknown>),
      width: 'full',
      tab_id: null,
    }));
  }

  return data ?? [];
}

/**
 * Which of the five looks this showroom gave its form.
 *
 * Its own small query rather than a join onto the fields, because the field
 * list is sometimes empty and the style still has to be known — a form with no
 * custom questions still renders name, phone and message in the chosen style.
 */
export async function getVendorFormStyle(vendorId: string) {
  const fallback = { styleKey: 'classic', theme: DEFAULT_THEME };
  if (!vendorId) return fallback;

  const db = getMarketplaceDb();

  // Theme first, falling back to a style-only read. `lead_form_theme` arrived
  // after `lead_form_style`, and PostgREST rejects the WHOLE select over one
  // unknown column — so asking for both on a database that has only the older
  // one would lose the style as well as the theme.
  let { data, error } = await db
    .from('vendors')
    .select('lead_form_style, lead_form_theme')
    .eq('id', vendorId)
    .maybeSingle();

  if (error) {
    ({ data, error } = await db
      .from('vendors')
      .select('lead_form_style')
      .eq('id', vendorId)
      .maybeSingle());
  }

  // Same silent recovery as above: no column means nobody has chosen a look
  // yet, which is exactly what the default says.
  if (error) return fallback;

  const styleKey = data?.lead_form_style || 'classic';

  // The preset seeds the defaults for anything the theme does not carry, so it
  // has to go in — otherwise a showroom on Compact reads back Classic's
  // padding for every value it never changed.
  return { styleKey, theme: normaliseTheme(data?.lead_form_theme, styleKey) };
}

/**
 * A showroom's form tabs, in the seller's order.
 *
 * Returns [] rather than throwing when §22 has not been run: a form with no
 * tabs is a flat form, which is exactly what every showroom had before tabs
 * existed and what the renderer falls back to anyway.
 */
export async function getVendorFormTabs(vendorId: string) {
  if (!vendorId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('vendor_form_tabs')
    .select('id, label, sort_order')
    .eq('vendor_id', vendorId)
    .order('sort_order', { ascending: true });

  if (error) return [];
  return data ?? [];
}
