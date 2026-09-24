'use client';

/**
 * Language switcher — copied from the main site's LanguageToggle so the control
 * looks and behaves identically, but owned by the marketplace (no import from
 * @/MyComponents). Same flag SVGs, same 40px circle, same query-preserving
 * swap.
 *
 * The Suspense wrapper is required: useSearchParams() opts the subtree into
 * client-side rendering, and without a boundary that bailout would bubble up
 * and take the whole header with it.
 */

import { useState, useTransition, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Languages } from 'lucide-react';

function LanguageSwitcherInternal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * The URL is the language. The state below is only the OPTIMISM.
   *
   * `lang` used to be its own useState kept in step with the path by an effect,
   * which is a copy of a value React already has — so the flag lagged the URL
   * by a render, and a language change made anywhere else (a link, the back
   * button) left this button showing the old flag until something re-rendered
   * it.
   *
   * The optimism is still worth keeping: the flag should flip on click rather
   * than when the new route finishes loading. So the pending value applies only
   * while the transition is actually in flight, and the moment it settles the
   * pathname is the single answer again — which is what makes a back button, a
   * redirect or a second click impossible to get out of step.
   */
  const currentLang = pathname.startsWith('/ar') ? 'ar' : 'en';
  const [pendingLang, setPendingLang] = useState(null);
  const [switching, startSwitching] = useTransition();
  const lang = switching && pendingLang ? pendingLang : currentLang;

  /**
   * The brand, through CSS rather than through JS.
   *
   * This used to read `theme` from next-themes and pick one of three class
   * strings — which meant the control could not be styled until the client had
   * mounted, so it rendered plain white on the server and changed underneath
   * the visitor a frame later. It also made the switcher the only reason the
   * component needed `useTheme` and a hydration guard at all.
   *
   * `dark:` variants do the same job in the stylesheet, where it is free and
   * correct on the first paint. The colours are the brand tokens, so the
   * control follows the theme instead of sitting in it as a white circle.
   */
  const buttonStyle = 'raised';

  const toggleLanguage = () => {
    const newLang = lang === 'ar' ? 'en' : 'ar';
    setPendingLang(newLang);

    const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '');
    const queryString = searchParams.toString();
    const href = queryString
      ? `/${newLang}${pathWithoutLocale}?${queryString}`
      : `/${newLang}${pathWithoutLocale}`;

    startSwitching(() => router.push(href));
  };

  return (
    <button
      onClick={toggleLanguage}
      /* 32px on a phone, 40px from sm. The header's controls sit in a fixed
         80px bar next to a logo, and at 40px each the row of them was the
         widest thing on a 320px screen. */
      className={`flex h-8 w-8 items-center justify-center rounded-full sm:h-10 sm:w-10 ${buttonStyle}`}
      /* Written in the language currently on screen, not the one being
         switched to — these were the wrong way round, so an English UI
         announced an Arabic label to screen readers and vice versa. */
      aria-label={lang === 'ar' ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic'}
    >
      {/* A LINE icon, not the /english.svg artwork.

          Those files have fill="#0B6B3A" painted inside them, and nothing in
          CSS can recolour an image — so on a themed site the language button
          was the one control in the header still wearing the old green while
          the search, wishlist and account buttons beside it had followed the
          brand colour. A lucide icon inherits `currentColor`, which is what
          every other icon in this row already does. */}
      <Languages className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" aria-hidden="true" />
    </button>
  );
}

export default function LanguageSwitcher() {
  return (
    <Suspense
      fallback={
        /* Same box as the real button at both sizes — a fallback that is a
           different size is a layout shift on hydration. */
        <button className="raised flex h-8 w-8 items-center justify-center rounded-full sm:h-10 sm:w-10">
          <Languages className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" aria-hidden="true" />
        </button>
      }
    >
      <LanguageSwitcherInternal />
    </Suspense>
  );
}
