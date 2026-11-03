import { Lock } from 'lucide-react';
import { ROLE_LABELS, CAPABILITIES } from '@/marketplace/lib/team';

/**
 * "You were sent here because your role does not open that page."
 *
 * requireVendorCan() redirects to the dashboard with ?denied=<capability>
 * rather than to a 403, because a member who follows a bookmark to Billing has
 * not done anything wrong and must not be shown an error page — but a silent
 * bounce is worse than either. Somebody who clicks a link and lands somewhere
 * else assumes the link is broken, and reports it as a bug.
 *
 * ── It names WHO to ask ────────────────────────────────────────────────────
 *
 * The one thing a person in this position needs is the next step, and it is
 * never "try again": it is a colleague with a different role. So the line says
 * which roles hold the capability, from the same map that refused them.
 *
 * A server component with no state: it renders from the URL, so going anywhere
 * else clears it without anything having to dismiss it.
 */

const WHAT = {
  promotions: { ar: 'الترويج', en: 'Promotions' },
  storefront: { ar: 'إعدادات المعرض', en: 'Showroom settings' },
  billing: { ar: 'الاشتراك والمستحقات', en: 'Subscription and billing' },
  team: { ar: 'الفريق', en: 'Team' },
  danger: { ar: 'حذف المعرض والنسخ الاحتياطية', en: 'Deleting the showroom, and backups' },
  listings: { ar: 'الإعلانات', en: 'Listings' },
  leads: { ar: 'العملاء المحتملون', en: 'Leads' },
  analytics: { ar: 'التحليلات', en: 'Analytics' },
};

export default async function DeniedNotice({ searchParams, locale = 'ar' }) {
  const sp = await searchParams;
  const denied = typeof sp?.denied === 'string' ? sp.denied : null;

  /* Unknown capability → nothing. The value comes off the URL, so it is
     whatever somebody typed, and inventing a sentence for it would mean
     rendering an alarming lock icon on a hand-edited query string. */
  if (!denied || !WHAT[denied] || !CAPABILITIES[denied]) return null;

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const holders = CAPABILITIES[denied]
    .map((r) => t(ROLE_LABELS[r]?.ar, ROLE_LABELS[r]?.en))
    .filter(Boolean);

  const who = isAr ? holders.join(' أو ') : holders.join(' or ');

  return (
    <div className="px-4 lg:px-6">
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {t(
              `صلاحيتك لا تفتح "${t(WHAT[denied].ar, WHAT[denied].en)}"`,
              `Your role does not open “${WHAT[denied].en}”`
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              `هذه الصفحة لـ${who}. اطلب من مالك المعرض تغيير دورك إن كنت تحتاجها.`,
              `That page is for the ${who}. Ask the showroom’s owner to change your role if you need it.`
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
