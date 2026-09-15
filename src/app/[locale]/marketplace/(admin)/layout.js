import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/marketplace/auth/session';
import { countPendingBoosts } from '@/marketplace/db/queries/boosts';
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
  const pendingBoosts = await countPendingBoosts();

  return (
    <AdminShell
      locale={locale}
      pendingBoosts={pendingBoosts}
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
