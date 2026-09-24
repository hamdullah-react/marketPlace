import { getSiteSettings } from '@/marketplace/db/queries/site';
import { themeCss } from '@/marketplace/lib/theme';

/**
 * The admin's theme, written into the page as CSS variables.
 *
 * ── Why a <style> tag and not a stylesheet ──────────────────────────────────
 *
 * The values come from the database and can change between one request and the
 * next, so they cannot live in a file Tailwind compiles at build time. They are
 * variables rather than rules, which keeps this to a few hundred bytes: the
 * stylesheet still owns every selector, and this only re-points the tokens it
 * already reads.
 *
 * ── Why it renders nothing by default ───────────────────────────────────────
 *
 * themeCss() emits only what DIFFERS from globals.css. An admin who has not
 * touched Appearance, and a database where the `theme` column does not exist
 * yet, both add exactly zero bytes to the page.
 *
 * ── Placement ───────────────────────────────────────────────────────────────
 *
 * In the marketplace layout, so it covers browse, account, seller and admin at
 * once. Next hoists a <style> in a Server Component into <head>, and the
 * selectors are `:root,.light` / `.dark` — the same ones globals.css uses, at
 * the same specificity, arriving later. That ordering is what lets them win
 * without !important.
 *
 * getSiteSettings() is the cached read the header and footer already make, so
 * on any page that renders chrome this costs nothing.
 */
export default async function ThemeStyle() {
  const site = await getSiteSettings();
  const css = themeCss(site.theme);

  if (!css) return null;

  return <style id="mk-theme" dangerouslySetInnerHTML={{ __html: css }} />;
}
