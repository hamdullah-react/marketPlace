'use client';

/**
 * Light / dark, as one button.
 *
 * ── Why a button and not the dropdown that already existed ──────────────────
 *
 * components/ui/theme-toggle.jsx is a DropdownMenu offering Light and Dark —
 * two items, which is a menu to choose between two things when the control
 * itself could be the choice. It also paints itself with `bg-purple-50`,
 * `bg-white`, `text-gray-400` and `dark:bg-[#1e1e1e]`, so it sits ON the theme
 * rather than in it, and positions its hint with `mr-auto`, which is the wrong
 * side in Arabic. Nothing imported it.
 *
 * So this is a plain toggle in the marketplace's own idiom, next to
 * LanguageSwitcher, which is the control it sits beside in all three headers
 * and the one it should be indistinguishable from.
 *
 * ── Why `raised` and a lucide icon ──────────────────────────────────────────
 *
 * The same two decisions LanguageSwitcher documents. `raised` is the themed
 * surface utility, so the button follows Appearance instead of being a white
 * circle on a coloured bar; and a lucide icon inherits `currentColor`, which
 * is what every other icon in that row does.
 *
 * ── The hydration guard is not optional ─────────────────────────────────────
 *
 * Which theme is active is a browser fact — next-themes reads localStorage and
 * writes a class on <html> before paint. The server cannot know it, so the icon
 * would differ between the server HTML and the first client render, and React
 * discards server HTML when it finds a mismatch. useHydrated() renders the
 * server's answer until hydration is done; see hooks/use-hydrated.js for why it
 * is a store rather than useState + useEffect.
 *
 * The fallback is the Sun at the same size, because `defaultTheme="light"` in
 * components/theme-provider.jsx means light is what the server assumed.
 */

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useHydrated } from '@/hooks/use-hydrated';

export default function DarkModeToggle({ locale = 'en' }) {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  /* resolvedTheme, not theme: `theme` can be the string "system", which is not
     something to draw an icon for. enableSystem is false today, so the two
     agree — reading the resolved one means this keeps working if it is ever
     turned on. */
  const dark = hydrated && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      /* Same box as LanguageSwitcher at both breakpoints. A control of a
         different size in that row is a visible step in the header. */
      className="raised flex h-8 w-8 items-center justify-center rounded-full sm:h-10 sm:w-10"
      /* Names the DESTINATION, which is what a button does. Written in the
         language on screen, not the one being switched to. */
      aria-label={dark ? t('التبديل إلى الوضع الفاتح', 'Switch to light mode') : t('التبديل إلى الوضع الداكن', 'Switch to dark mode')}
      /* So a screen reader announces it as a toggle with a state rather than
         as a button that might do anything. */
      aria-pressed={dark}
      /* Before hydration the handler would act on a guess, and a click that
         sets the theme the page is already in looks like a dead button. */
      disabled={!hydrated}
    >
      {dark ? (
        <Moon className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" aria-hidden="true" />
      ) : (
        <Sun className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" aria-hidden="true" />
      )}
    </button>
  );
}
