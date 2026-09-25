import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/marketplace/auth/session';
import { getNotifications } from '@/marketplace/db/queries/notifications';
import { countPendingBoosts } from '@/marketplace/db/queries/boosts';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import AdminShell from './_components/AdminShell';

/**
 * (admin) — platform admins only. Never indexed.
 *
 * requireAdmin() sends a signed-out visitor to login and anyone who is not an
 * admin back to the marketplace. Like the seller layout, this is the entrance,
 * not the protection: every admin action checks adminForAction() itself,
 * because a layout does not re-run on navigation.
 */
export const instant = false;
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const viewer = await requireAdmin();
  const [pendingBoosts, site, notifications] = await Promise.all([
    countPendingBoosts(),
    getSiteSettings(),
    /* The bell. Awaited here with the rest rather than streamed, because it is
       two indexed reads and it lives in the header — a bell that pops in a
       moment after the page is a bell somebody has already looked past. */
    getNotifications({ audience: 'admin' }).catch(() => ({ items: [], unread: 0 })),
  ]);

  return (
    <AdminShell
      locale={locale}
      pendingBoosts={pendingBoosts}
      notifications={notifications}
      currency={site.currency}
      brand={{
        name: locale === 'en' ? site.name.en : site.name.ar,
        logoUrl: site.logoUrl,
        logoDarkUrl: site.logoDarkUrl,
      }}
      viewer={{
        // The admin's own id — the live panel listens on their personal topic.
        userId: viewer.userId,
        name: viewer.fullName || viewer.email,
        email: viewer.email,
        avatarUrl: viewer.avatarUrl,
        isVendor: viewer.vendors.length > 0,
      }}
    >
      {children}
    </AdminShell>
  );
}
