import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireVendorCan } from '@/marketplace/auth/session';
import { getTeam } from '@/marketplace/db/queries/team';
import TeamManager from '../../../_components/TeamManager';
import { SITE_URL } from '@/marketplace/lib/sitePages';

/**
 * Seller → Settings → Team.
 *
 * This page rendered <ComingSoon/> while the whole mechanism sat finished and
 * unused in the database: schema.sql §17.2 created vendor_members in a
 * migration arguing that "a showroom has a manager and three salespeople, and
 * giving them a shared login is how an audit trail becomes useless", and then
 * the only way to add one of those salespeople was an INSERT typed by hand.
 *
 * ── Guarded by capability, not only by membership ──────────────────────────
 *
 * requireVendorCan('team') rather than requireVendor(). Every other seller
 * page asks only whether you belong to the showroom, which until now was the
 * only question the app could ask — see lib/team.js on `role` having been
 * carried onto the viewer and read by nothing. A staff member reaching this
 * page by URL is sent back to the dashboard with a line explaining why.
 */

export const instant = false;

export const metadata = {
  title: 'Team',
  robots: { index: false, follow: false },
};

export default async function SellerSettingsTeamPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('الفريق', 'Team')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'من يستطيع الدخول إلى لوحة تحكم معرضك، وما يستطيع فعله. كل شخص بحسابه — لا تشاركوا تسجيل دخول واحد.',
              'Who can open your showroom’s dashboard, and what they can do. Everybody gets their own account — never share one login.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TeamSkeleton />}>
            <Team searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ── Streaming section ───────────────────────────────────────────────────── */

async function Team({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendor, vendorId, userId } = await requireVendorCan('team', sp?.vendor ?? null);

  const { members, invites, invitesMissing, error } = await getTeam(vendorId);

  /* The one page that can repair a broken team must not be the page that
     breaks. getTeam never throws; a failure arrives as a message. */
  if (error) {
    console.error('[seller/settings/team] load failed:', error);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('الفريق غير متاح حالياً', 'The team is unavailable right now')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{t('حاول تحديث الصفحة بعد قليل.', 'Try refreshing in a moment.')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TeamManager
      locale={locale}
      vendorId={vendorId}
      myRole={vendor.role}
      myUserId={userId}
      members={members}
      invites={invites}
      invitesMissing={invitesMissing}
      /* So the Copy link button yields the same absolute URL the invitation
         email carries — see the note on the prop. */
      baseUrl={SITE_URL}
    />
  );
}

function TeamSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="raised-card rounded-xl p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
        <Skeleton className="mt-4 h-9 w-full" />
      </div>
      <div className="raised-card rounded-xl p-5">
        <Skeleton className="h-5 w-36" />
        {[0, 1].map((i) => (
          <div key={i} className="mt-4 flex items-center gap-3">
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-1.5 h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
