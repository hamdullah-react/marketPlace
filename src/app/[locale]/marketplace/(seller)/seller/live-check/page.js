import { setRequestLocale } from 'next-intl/server';
import { requireVendor } from '@/marketplace/auth/session';
import LiveCheck from './_components/LiveCheck';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Live check',
  robots: { index: false, follow: false },
};

/**
 * A page that tests the live-lead path link by link and shows the result.
 *
 * Not linked from the nav on purpose — a seller has no reason to look at this
 * unless something is wrong and they have been sent here. It is guarded by
 * requireVendor() like every other seller route, so it is not a public probe.
 */
export default async function LiveCheckPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { vendorId } = await requireVendor();

  return <LiveCheck vendorId={vendorId} locale={locale} />;
}
