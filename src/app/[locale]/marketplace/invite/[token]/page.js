import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import Image from 'next/image';
import { AlertCircle, Store, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { currentViewer } from '@/marketplace/auth/session';
import { inviteByToken, normalizeEmail } from '@/marketplace/db/queries/team';
import { ROLE_LABELS, ROLE_BLURBS, inviteStatus } from '@/marketplace/lib/team';
import { errorText } from '@/marketplace/lib/errors';
import { localized } from '@/marketplace/lib/listing';
import AcceptInvite from './AcceptInvite';

/**
 * Where an invitation link lands.
 *
 * ── Outside (seller), deliberately ─────────────────────────────────────────
 *
 * The person arriving here is, by definition, not a member of the showroom
 * yet. Under the (seller) group its layout would call requireVendor() and
 * redirect them to the application form — "become a seller" — which is both
 * wrong and the exact opposite of what the link is for. It also cannot live
 * under (auth): a signed-out visitor needs to sign in FROM here and come back.
 *
 * ── Three audiences, one page ──────────────────────────────────────────────
 *
 *   signed out            told which address to use, with both doors offered
 *                         and `next` pointing back here
 *   signed in, wrong one  told which address it was sent to, because a
 *                         forwarded link is the common cause and without
 *                         naming it they have no idea which account to use
 *   signed in, right one  one button
 *
 * The invitation is read with the service key, which is why there is no RLS
 * policy for the invitee — schema.sql §34.1 explains why a policy matched on
 * token or on email would be worse than none.
 *
 * ── What is NOT revealed before the address matches ────────────────────────
 *
 * The showroom's name and the role, to the right person only. A link is a
 * secret but it is a secret that gets forwarded, pasted into chats and left in
 * screenshots, so a page that printed "You have been invited to <showroom> as
 * an owner" to anybody holding the URL would be leaking who is hiring whom.
 * The wrong-account branch says only which address to use.
 */

/* Not `export const dynamic` — this project runs with cacheComponents, which
   rejects that segment config outright ("not compatible with
   nextConfig.cacheComponents"). `instant = false` is the setting the rest of
   the dashboard uses for the same reason: the session is read at the top of
   the component, so the shell cannot be prerendered without blocking. */
export const instant = false;

export const metadata = {
  title: 'Invitation',
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const [invite, viewer] = await Promise.all([
    inviteByToken(token).catch(() => null),
    currentViewer(),
  ]);

  const here = `/${locale}/marketplace/invite/${token}`;

  /* ── Nothing, or nothing usable ─────────────────────────────────────────── */
  const status = invite ? inviteStatus(invite) : null;

  if (!invite || status !== 'pending') {
    const code = !invite
      ? 'INVITE_INVALID'
      : status === 'accepted'
        ? 'INVITE_USED'
        : status === 'revoked'
          ? 'INVITE_REVOKED'
          : 'INVITE_EXPIRED';

    return (
      <Shell t={t} isAr={isAr}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            {t('هذه الدعوة لم تعد صالحة', 'This invitation is no longer valid')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{errorText(code, locale)}</p>
          <Button asChild variant="outline">
            <Link href={`/${locale}/marketplace`}>{t('إلى السوق', 'Go to the marketplace')}</Link>
          </Button>
        </CardContent>
      </Shell>
    );
  }

  /* ── Signed out ─────────────────────────────────────────────────────────── */
  if (!viewer) {
    const next = encodeURIComponent(here);

    return (
      <Shell t={t} isAr={isAr}>
        <CardHeader>
          <CardTitle className="text-base">
            {t('سجّل الدخول لقبول الدعوة', 'Sign in to accept this invitation')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'استخدم هذا البريد تحديداً — الدعوة مرتبطة به:',
              'Use this address specifically — the invitation is tied to it:'
            )}
          </p>
          <p dir="ltr" className="rounded-lg bg-black/5 px-3 py-2 text-sm font-medium dark:bg-white/10">
            {invite.email}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button asChild className="gap-2 bg-brand-primary text-white hover:bg-brand-dark">
              <Link href={`/${locale}/marketplace/login?next=${next}`}>
                <LogIn className="h-4 w-4" />
                {t('تسجيل الدخول', 'Sign in')}
              </Link>
            </Button>
            {/* Both doors, because the invitee usually has no account yet —
                that is the whole reason an invitation is keyed by email and not
                by a user id (§34.1). */}
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/${locale}/marketplace/signup?next=${next}`}>
                <UserPlus className="h-4 w-4" />
                {t('إنشاء حساب', 'Create an account')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Shell>
    );
  }

  /* ── Signed in as somebody else ─────────────────────────────────────────── */
  if (normalizeEmail(viewer.email) !== normalizeEmail(invite.email)) {
    return (
      <Shell t={t} isAr={isAr}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            {t('حساب مختلف', 'A different account')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{errorText('INVITE_WRONG_ACCOUNT', locale)}</p>

          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted-foreground">{t('أُرسلت إلى', 'Sent to')}:</dt>
              <dd dir="ltr" className="font-medium">{invite.email}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted-foreground">{t('أنت مسجّل بـ', 'You are signed in as')}:</dt>
              <dd dir="ltr" className="font-medium">{viewer.email}</dd>
            </div>
          </dl>

          <Button asChild variant="outline">
            <Link href={`/${locale}/marketplace/account`}>
              {t('إلى حسابي', 'Go to my account')}
            </Link>
          </Button>
        </CardContent>
      </Shell>
    );
  }

  /* ── The right person ───────────────────────────────────────────────────── */
  const showroom = localized(invite.vendors?.name, locale) || t('معرض', 'a showroom');
  const logo = invite.vendors?.logo_url;

  return (
    <Shell t={t} isAr={isAr}>
      <CardHeader>
        <div className="flex items-center gap-3">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-lg border border-border object-contain"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-black/5 dark:bg-white/10">
              <Store className="h-5 w-5 text-muted-foreground" />
            </span>
          )}
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{showroom}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {invite.invited_by_name
                ? t(`دعاك ${invite.invited_by_name}`, `Invited by ${invite.invited_by_name}`)
                : t('دعوة للانضمام إلى الفريق', 'An invitation to join the team')}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* What the role actually buys, before they accept — not after. */}
        <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
          <p className="text-sm font-medium text-brand-primary">
            {t(ROLE_LABELS[invite.role]?.ar, ROLE_LABELS[invite.role]?.en) ?? invite.role}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(ROLE_BLURBS[invite.role]?.ar, ROLE_BLURBS[invite.role]?.en)}
          </p>
        </div>

        <AcceptInvite locale={locale} token={token} />

        <p className="text-xs text-muted-foreground">
          {t(
            'بعد القبول ستجد لوحة تحكم المعرض في قائمة حسابك.',
            'Once you accept, the showroom’s dashboard appears in your account menu.'
          )}
        </p>
      </CardContent>
    </Shell>
  );
}

function Shell({ children, isAr }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center px-4 py-10">
      <Card className="w-full" dir={isAr ? 'rtl' : 'ltr'}>
        {children}
      </Card>
    </div>
  );
}
