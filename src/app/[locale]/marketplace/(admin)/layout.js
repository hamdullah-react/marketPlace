import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/marketplace/auth/session';
import { getNotifications } from '@/marketplace/db/queries/notifications';
import { countPendingBoosts } from '@/marketplace/db/queries/boosts';
import { countAwaitingPayments } from '@/marketplace/db/queries/billing';
import { countPendingProofs } from '@/marketplace/db/queries/proofs';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import AdminShell from './_components/AdminShell';
import {
  listConversations, listMessageableVendors, unreadCounts,
} from '@/marketplace/db/queries/messages';

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
  const [
    pendingBoosts, awaitingPayments, pendingProofs, site, notifications,
    conversations, messageableVendors, messageUnread,
  ] = await Promise.all([
    countPendingBoosts(),
    /* The number on Finance and on Subscriptions. Two head-only counts, read
       here with the rest rather than inside the pages, because a badge has to be
       on the sidebar whichever page of the panel somebody is standing on — and a
       showroom waiting to be let back in must not depend on an admin happening
       to open Finance to be noticed. */
    countAwaitingPayments(),
    /* Receipts a showroom has sent and nobody has answered. Counted here with
       the rest so the badge is on the sidebar whichever page of the panel an
       admin is standing on — a showroom that paid this morning may be locked
       out right now, and must not wait for somebody to happen to open
       Finance. */
    countPendingProofs(),
    getSiteSettings(),
    /* The bell. Awaited here with the rest rather than streamed, because it is
       two indexed reads and it lives in the header — a bell that pops in a
       moment after the page is a bell somebody has already looked past. */
    getNotifications({ audience: 'admin' }).catch(() => ({ items: [], unread: 0 })),
    /* ── The messages drawer ──────────────────────────────────
       Three reads: the threads that exist, every showroom one could be started
       with, and the unread count per thread. Read in the LAYOUT because the
       badge belongs on the header whichever page of the panel somebody is
       standing on — the same argument as the two counts above.

       Not the message BODIES: the drawer fetches those when it opens, so a
       panel nobody opens the drawer on pays for three small reads rather than
       every conversation on the platform. Each catches its own failure, so a
       database without the MESSAGES section shows an empty drawer instead of
       failing the whole panel. */
    listConversations().catch(() => ({ items: [] })),
    listMessageableVendors().catch(() => ({ items: [] })),
    unreadCounts('admin').catch(() => ({ byVendor: new Map(), total: 0 })),
  ]);

  return (
    <AdminShell
      locale={locale}
      pendingBoosts={pendingBoosts}
      awaitingPayments={awaitingPayments}
      pendingProofs={pendingProofs}
      notifications={notifications}
      messages={{
        conversations: conversations.items ?? [],
        vendors: messageableVendors.items ?? [],
        /* Pairs, not a Map: a Map does not survive the boundary to a client
           component, and the drawer rebuilds it in one pass. */
        unreadPairs: [...(messageUnread.byVendor ?? new Map()).entries()],
        total: messageUnread.total ?? 0,
      }}
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
