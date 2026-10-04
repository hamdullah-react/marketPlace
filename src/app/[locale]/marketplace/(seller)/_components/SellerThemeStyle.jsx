import { getMarketplaceDb } from '@/marketplace/db/client';
import { themeCss } from '@/marketplace/lib/theme';

/**
 * One showroom's theme, written into the page as CSS variables — for its
 * dashboard and for nothing else.
 *
 * ── The scope IS the feature ────────────────────────────────────────────────
 *
 * The platform's own ThemeStyle emits `:root,.light`, which is the whole
 * document. This one emits against `[data-mk-theme="seller"]`, the attribute on
 * the dashboard's wrapper (see SellerShell).
 *
 * That works because a custom property cascades from the ELEMENT it is declared
 * on: `:root` sets the variables on <html>, this sets them again on the
 * wrapper, and for the wrapper and everything inside it the nearer declaration
 * applies. Specificity never comes into it — the two rules target different
 * elements — so a showroom's colours cannot be beaten by the platform's and,
 * much more importantly, cannot escape into the marketplace around them.
 *
 * A seller must not be able to repaint the public site. A buyer comparing three
 * showrooms in one session would otherwise find the page changing colour at
 * every step, and every seller would hold a lever over how the platform looks
 * to people who are not their customers. Containing it structurally means that
 * is not a rule anybody has to remember.
 *
 * ── Why it reads the column directly ────────────────────────────────────────
 *
 * One narrow select against a primary key, on a layout that has already
 * resolved the vendor. Threading `theme` through requireVendor() would widen a
 * projection that every seller request makes, to serve a <style> tag that is
 * usually empty.
 *
 * ── Why it usually renders nothing ──────────────────────────────────────────
 *
 * themeCss() emits only what DIFFERS from globals.css, and the action stores
 * null for the built-in look. A showroom that has never opened Appearance, and
 * a database where the column does not exist yet, both add exactly zero bytes.
 *
 * It never throws. A dashboard that failed to render because a colour could not
 * be read would be a far worse bug than one that is the wrong shade of green.
 */
export default async function SellerThemeStyle({ vendorId }) {
  if (!vendorId) return null;

  let theme = null;

  try {
    const { data } = await getMarketplaceDb()
      .from('vendors')
      .select('theme')
      .eq('id', vendorId)
      .maybeSingle();

    theme = data?.theme ?? null;
  } catch {
    // 42703 until the schema is re-run. The default look is the right answer.
    return null;
  }

  const css = themeCss(theme, { scope: '[data-mk-theme="seller"]' });
  if (!css) return null;

  return <style id="mk-theme-seller" dangerouslySetInnerHTML={{ __html: css }} />;
}
