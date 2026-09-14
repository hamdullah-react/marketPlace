/**
 * The hero carousel's slides.
 *
 * ── This is a STAND-IN, and it is shaped like the real thing ────────────────
 *
 * Five slides, hardcoded, so the hero has something to show before the admin
 * can supply any. The shape is the point: when the endpoint exists, the only
 * change is where `slides` comes from —
 *
 *     export async function getHeroSlides(locale) {
 *       const { items } = await marketplaceApi.heroSlides({ locale });
 *       return { intervalMs: 5000, slides: items };
 *     }
 *
 * — and every consumer keeps working, because they already read this shape.
 * That is why it is an object with a `slides` array rather than a bare array:
 * an endpoint will want to return more than the list eventually (an autoplay
 * interval, a campaign id, an active-from date), and adding those to an object
 * breaks nobody, whereas turning an array into an object breaks everybody.
 *
 * ── One slide ───────────────────────────────────────────────────────────────
 *
 *   id           stable key. Not the array index — reordering slides in the
 *                admin must not make React reuse the wrong DOM node.
 *   title        { ar, en }  the headline, drawn over the image
 *   description  { ar, en }  one supporting line under it
 *   image        the photograph
 *   alt          { ar, en }  what the photograph SHOWS, which is not the same
 *                thing as the headline — a screen reader that hears the title
 *                twice learns nothing the second time
 *
 * Every text field is bilingual because the marketplace is, and because a
 * half-translated hero is the most visible place for a missing string to land.
 *
 * ── The images ──────────────────────────────────────────────────────────────
 *
 * Remote placeholder photography, plainly temporary. Rendered with a plain
 * <img> rather than next/image on purpose: next/image would need each host
 * added to `remotePatterns` in next.config.mjs, and adding a host for
 * throwaway art is a config change somebody has to remember to undo. Swap
 * `image` for your own uploads and the markup does not change.
 */

export const HERO_SLIDES = {
  /** Milliseconds between advances. Null turns autoplay off entirely. */
  intervalMs: 6000,

  slides: [
    {
      id: 'browse',
      title: {
        ar: 'وجهتك الأولى لبيع وشراء السيارات',
        en: 'Your unique destination for buying and selling cars',
      },
      description: {
        ar: 'تصفّح سياراتنا أو اعرض سيارتك للبيع بكل سهولة.',
        en: 'Explore our collection of cars or sell your vehicle with ease.',
      },
      image: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b',
      alt: { ar: 'سيارة دفع رباعي فاخرة', en: 'A luxury SUV' },
    },
    {
      id: 'verified',
      title: {
        ar: 'معارض موثوقة، بأسعار واضحة',
        en: 'Trusted showrooms, clear pricing',
      },
      description: {
        ar: 'كل معرض يمر بالتحقق قبل أن ينشر إعلانه الأول.',
        en: 'Every showroom is verified before its first listing goes live.',
      },
      image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7',
      alt: { ar: 'صالة عرض سيارات', en: 'A car showroom floor' },
    },
    {
      id: 'new',
      title: {
        ar: 'سيارات جديدة من الوكيل',
        en: 'Brand-new cars from the dealer',
      },
      description: {
        ar: 'موديلات هذا العام بضمان الوكيل وتواصل مباشر مع البائع.',
        en: "This year's models, under warranty, with a direct line to the seller.",
      },
      image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70',
      alt: { ar: 'سيارة رياضية جديدة', en: 'A new sports car' },
    },
    {
      id: 'used',
      title: {
        ar: 'مستعملة ومفحوصة بالكامل',
        en: 'Used, and fully inspected',
      },
      description: {
        ar: 'تقرير فحص وسجل واضح قبل أن تدفع ريالاً واحداً.',
        en: 'An inspection report and a clear history before you pay a riyal.',
      },
      image: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d',
      alt: { ar: 'سيارة مستعملة معروضة للبيع', en: 'A used car offered for sale' },
    },
    {
      id: 'sell',
      title: {
        ar: 'بِع سيارتك من معرضك',
        en: 'Sell your car from your own showroom',
      },
      description: {
        ar: 'أنشئ متجرك، أضف إعلاناتك، وتابع طلبات المشترين في مكان واحد.',
        en: 'Open your store, add listings, and track buyer requests in one place.',
      },
      image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d',
      alt: { ar: 'سيدان رياضية', en: 'A sports sedan' },
    },
  ],
};
