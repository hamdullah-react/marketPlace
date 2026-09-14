import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getViewer } from '@/marketplace/auth/session';
import CompleteProfileForm from '../_components/CompleteProfileForm';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Complete your profile',
  robots: { index: false, follow: false },
};

/**
 * The gate itself.
 *
 * ── It calls getViewer(), NOT requireUser() ─────────────────────────────────
 *
 * requireUser() is what redirects an incomplete profile here. If this page used
 * it, the redirect would land on the page that performs the redirect, and the
 * browser would bounce between the two until it gave up. The sign-in check is
 * therefore done by hand — the one place in the marketplace that has to.
 *
 * ── What ?next is, and is not, for ─────────────────────────────────────────
 *
 * It exists for ONE case: somebody who is already complete and lands here by
 * accident is bounced straight on to where they were going. Saving the form
 * ignores it entirely and goes to the marketplace — see the action. Finishing
 * this is usually the end of signing up, and the useful thing to put in front
 * of a new person is the marketplace itself, not whatever URL happened to be in
 * the query string.
 *
 * ── And it lets a COMPLETE profile straight back out ────────────────────────
 *
 * Somebody who has already filled this in and comes back to the URL — a
 * bookmark, a back button, a second tab that finished first — should not be
 * shown a form asking for what they have already given. They are sent where
 * they were going instead.
 */
export default async function CompleteProfilePage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const rawNext = typeof sp?.next === 'string' ? sp.next : '';

  // Same check as the action's safeNext: an unvalidated ?next is an open
  // redirect, and this page is reached straight after signing in.
  const next =
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.includes('/marketplace/complete-profile')
      ? rawNext
      : '';

  const viewer = await getViewer();

  if (!viewer) {
    const back = `/${locale}/marketplace/complete-profile${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    redirect(`/${locale}/marketplace/login?next=${encodeURIComponent(back)}`);
  }

  if (viewer.profileComplete) redirect(next || `/${locale}/marketplace`);

  return (
    <CompleteProfileForm
      locale={locale}
      phone={viewer.phone ?? ''}
      fullName={viewer.fullName ?? ''}
    />
  );
}
