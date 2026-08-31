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

import { useEffect, useState, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import Image from 'next/image';

function LanguageSwitcherInternal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const currentLang = pathname.startsWith('/ar') ? 'ar' : 'en';
  const [lang, setLang] = useState(currentLang);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLang(currentLang);
  }, [currentLang]);

  const buttonStyle = () => {
    if (!mounted) return 'bg-white border border-gray-200';
    return theme === 'dark'
      ? 'bg-slate-800 hover:bg-slate-700 border border-slate-600'
      : 'bg-white hover:bg-gray-100 border border-gray-200';
  };

  const toggleLanguage = () => {
    const newLang = lang === 'ar' ? 'en' : 'ar';
    setLang(newLang);

    const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '');
    const queryString = searchParams.toString();
    router.push(queryString ? `/${newLang}${pathWithoutLocale}?${queryString}` : `/${newLang}${pathWithoutLocale}`);
  };

  return (
    <button
      onClick={toggleLanguage}
      /* 32px on a phone, 40px from sm. The header's controls sit in a fixed
         80px bar next to a logo, and at 40px each the row of them was the
         widest thing on a 320px screen. */
      className={`flex h-8 w-8 items-center justify-center rounded-full shadow-xs transition-all duration-300 sm:h-10 sm:w-10 ${buttonStyle()}`}
      /* Written in the language currently on screen, not the one being
         switched to — these were the wrong way round, so an English UI
         announced an Arabic label to screen readers and vice versa. */
      aria-label={lang === 'ar' ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic'}
    >
      <Image
        src={lang === 'ar' ? '/arbic.svg' : '/english.svg'}
        width={22}
        height={22}
        alt={lang === 'ar' ? 'Arabic' : 'English'}
        className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]"
      />
    </button>
  );
}

export default function LanguageSwitcher() {
  return (
    <Suspense
      fallback={
        /* Same box as the real button at both sizes — a fallback that is a
           different size is a layout shift on hydration. */
        <button className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-xs sm:h-10 sm:w-10">
          <Image
            src="/english.svg"
            width={22}
            height={22}
            alt="Language"
            className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]"
          />
        </button>
      }
    >
      <LanguageSwitcherInternal />
    </Suspense>
  );
}
