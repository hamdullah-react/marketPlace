/**
 * The public pages an admin can manage on Admin → Website content.
 *
 * The LIST lives in code because a page is a file: a database row cannot create
 * a route. What lives in the database is only what an admin changed — page_seo
 * holds a row for a page once it has been customised, and a page with no row
 * uses the defaults written here.
 *
 * No imports and no secrets: read by the server (metadata, sitemap, JSON-LD)
 * and by the admin forms (placeholders and the Google preview).
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.alromaihcars.com').replace(/\/+$/, '');

/** Cache tags for the `use cache` readers in db/queries/site.js. */
export const SITE_TAGS = {
  settings: 'site-settings',
  languages: 'site-languages',
  hero: 'hero-slides',
  seo: 'page-seo',
  pages: 'site-pages',
  blog: 'blog-posts',
};

/**
 * Used until an admin saves their own — and whenever the SQL has not been run.
 *
 * This is the platform's OWN identity, not a dealership's. It carried the
 * Alromaih wordmark, which was the mark of one showroom on a marketplace that
 * hosts many, and it is what every page fell back to before an admin had saved
 * anything at all.
 */
export const BRAND_FALLBACK = {
  name: { ar: 'سوق الرميح', en: 'Sauda' },
  tagline: {
    ar: 'سيارات جديدة ومستعملة من معارض موثوقة، بأسعار واضحة وتواصل مباشر مع البائع.',
    en: 'New and used cars from verified showrooms — clear pricing, and a direct line to the seller.',
  },
  logoUrl: '/sauda/logo.png',
};

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

export const CHANGEFREQ = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
export const OG_TYPES = ['website', 'article', 'profile'];
export const TWITTER_CARDS = ['summary_large_image', 'summary'];

export const PAGE_GROUPS = {
  browse: { ar: 'التصفح', en: 'Browse' },
  selling: { ar: 'البيع', en: 'Selling' },
  info: { ar: 'معلومات', en: 'Information' },
  auth: { ar: 'الحساب', en: 'Account' },
};

/**
 * `index` is the page's search-engine default before an admin touches it. All
 * false for now, matching the site-wide noindex while the catalogue is demo
 * data — an admin turns a page on from its SEO screen at launch.
 */
export const SEO_PAGES = [
  {
    key: 'home', path: '', group: 'browse', index: false, changefreq: 'daily', priority: 1,
    label: { ar: 'الرئيسية', en: 'Home' },
    title: { ar: 'سوق الرميح — سيارات جديدة ومستعملة', en: 'Sauda — New & Used Cars' },
    description: {
      ar: 'اشترِ سيارتك القادمة من معارض موثوقة في السعودية. سيارات جديدة ومستعملة بأسعار واضحة وتواصل مباشر مع البائع.',
      en: 'Buy your next car from verified showrooms across Saudi Arabia. New and used cars with clear prices and a direct line to the seller.',
    },
  },
  {
    key: 'cars', path: '/cars', group: 'browse', index: false, changefreq: 'daily', priority: 0.9,
    label: { ar: 'كل السيارات', en: 'All cars' },
    title: { ar: 'سيارات للبيع', en: 'Cars for sale' },
    description: {
      ar: 'تصفح كل السيارات المعروضة للبيع وفلترها حسب الماركة والموديل والسعر والمدينة.',
      en: 'Browse every car for sale and filter by brand, model, price and city.',
    },
  },
  {
    key: 'cars-new', path: '/cars/new', group: 'browse', index: false, changefreq: 'daily', priority: 0.8,
    label: { ar: 'سيارات جديدة', en: 'New cars' },
    title: { ar: 'سيارات جديدة', en: 'New Cars' },
    description: {
      ar: 'سيارات جديدة من معارض موثوقة، بأسعار واضحة وتواصل مباشر مع البائع.',
      en: 'Brand-new cars from verified showrooms — clear pricing and a direct line to the seller.',
    },
  },
  {
    key: 'cars-used', path: '/cars/used', group: 'browse', index: false, changefreq: 'daily', priority: 0.8,
    label: { ar: 'سيارات مستعملة', en: 'Used cars' },
    title: { ar: 'سيارات مستعملة', en: 'Used Cars' },
    description: {
      ar: 'سيارات مستعملة من معارض موثوقة، مع العداد والحالة والمواصفات الكاملة لكل إعلان.',
      en: 'Used cars from verified showrooms — mileage, condition and full specifications on every listing.',
    },
  },
  {
    key: 'brands', path: '/brands', group: 'browse', index: false, changefreq: 'weekly', priority: 0.7,
    label: { ar: 'الماركات', en: 'Brands' },
    title: { ar: 'الماركات', en: 'Car Brands' },
    description: {
      ar: 'كل ماركات السيارات المعروضة في السوق، مع الموديلات وعدد السيارات لكل ماركة.',
      en: 'Every car brand on the marketplace, with its models and how many cars are for sale.',
    },
  },
  {
    key: 'vendors', path: '/vendors', group: 'browse', index: false, changefreq: 'weekly', priority: 0.7,
    label: { ar: 'المعارض', en: 'Showrooms' },
    title: { ar: 'المعارض', en: 'Showrooms' },
    description: {
      ar: 'تصفح معارض ووكلاء السيارات الموثوقين في سوق الرميح.',
      en: 'Browse verified car showrooms and dealers on Sauda.',
    },
  },
  {
    key: 'parts', path: '/parts', group: 'browse', index: false, changefreq: 'weekly', priority: 0.5,
    label: { ar: 'قطع الغيار', en: 'Spare parts' },
    title: { ar: 'قطع الغيار', en: 'Spare Parts' },
    description: { ar: 'قطع غيار السيارات من معارض موثوقة.', en: 'Car spare parts from trusted showrooms.' },
  },
  {
    key: 'services', path: '/services', group: 'browse', index: false, changefreq: 'weekly', priority: 0.5,
    label: { ar: 'الخدمات', en: 'Services' },
    title: { ar: 'خدمات السيارات', en: 'Car Services' },
    description: { ar: 'خدمات السيارات من معارض موثوقة.', en: 'Car services from trusted showrooms.' },
  },
  {
    key: 'accessories', path: '/accessories', group: 'browse', index: false, changefreq: 'weekly', priority: 0.5,
    label: { ar: 'الإكسسوارات', en: 'Accessories' },
    title: { ar: 'إكسسوارات السيارات', en: 'Car Accessories' },
    description: { ar: 'إكسسوارات السيارات من معارض موثوقة.', en: 'Car accessories from trusted showrooms.' },
  },
  {
    key: 'sell', path: '/sell', group: 'selling', index: false, changefreq: 'monthly', priority: 0.7,
    label: { ar: 'البيع في السوق', en: 'Sell on Sauda' },
    title: { ar: 'بِع في سوق الرميح', en: 'Sell on Sauda' },
    description: {
      ar: 'اعرض سياراتك في سوق الرميح. افتح معرضك في دقائق وتواصل مع المشترين في كل السعودية.',
      en: 'List your cars on Sauda. Open your showroom in minutes and reach buyers across Saudi Arabia.',
    },
  },
  {
    key: 'sell-apply', path: '/sell/apply', group: 'selling', index: false, changefreq: 'monthly', priority: 0.4,
    label: { ar: 'طلب الانضمام كمعرض', en: 'Vendor application' },
    title: { ar: 'طلب الانضمام كمعرض', en: 'Vendor Application' },
    description: { ar: 'قدّم طلب فتح معرضك في سوق الرميح.', en: 'Apply to open your showroom on Sauda.' },
  },
  {
    key: 'fees', path: '/fees', group: 'selling', index: false, changefreq: 'monthly', priority: 0.4,
    label: { ar: 'الرسوم', en: 'Fees' },
    title: { ar: 'الرسوم', en: 'Fees' },
    description: { ar: 'رسوم البيع في سوق الرميح.', en: 'What it costs to sell on Sauda.' },
  },
  {
    // The highest-intent page a showroom can land on, which is why it outranks
    // /fees on priority: "what does it cost to list my cars" is a question
    // people type in, and this is the page that answers it with real numbers.
    key: 'pricing', path: '/pricing', group: 'selling', index: false, changefreq: 'weekly', priority: 0.8,
    label: { ar: 'الأسعار', en: 'Pricing' },
    title: { ar: 'أسعار الاشتراك للمعارض', en: 'Showroom subscription pricing' },
    description: {
      ar: 'خطط الاشتراك للمعارض في سوق الرميح — الأسعار والمدد وما تشمله كل خطة. التصفّح والشراء مجاني للمشترين.',
      en: 'Subscription plans for showrooms on Sauda — prices, lengths and what each plan includes. Browsing and buying stays free for buyers.',
    },
  },
  {
    key: 'seller-terms', path: '/seller-terms', group: 'selling', index: false, changefreq: 'yearly', priority: 0.3,
    label: { ar: 'شروط البائع', en: 'Seller terms' },
    title: { ar: 'شروط البائع', en: 'Seller Terms' },
    description: { ar: 'شروط وأحكام البيع في سوق الرميح.', en: 'The terms for selling on Sauda.' },
  },
  {
    key: 'about', path: '/about', group: 'info', index: false, changefreq: 'monthly', priority: 0.6,
    label: { ar: 'من نحن', en: 'About us' },
    title: { ar: 'من نحن', en: 'About us' },
    description: { ar: 'تعرّف على سوق الرميح وفريقه.', en: 'Get to know Sauda and the team behind it.' },
  },
  {
    key: 'how-it-works', path: '/how-it-works', group: 'info', index: false, changefreq: 'monthly', priority: 0.5,
    label: { ar: 'كيف يعمل', en: 'How it works' },
    title: { ar: 'كيف يعمل السوق', en: 'How It Works' },
    description: { ar: 'كيف تشتري وتبيع في سوق الرميح خطوة بخطوة.', en: 'How buying and selling on Sauda works, step by step.' },
  },
  {
    key: 'help', path: '/help', group: 'info', index: false, changefreq: 'monthly', priority: 0.5,
    label: { ar: 'مركز المساعدة', en: 'Help centre' },
    title: { ar: 'مركز المساعدة', en: 'Help Centre' },
    description: { ar: 'إجابات عن الأسئلة الشائعة حول سوق الرميح.', en: 'Answers to common questions about Sauda.' },
  },
  {
    key: 'buyer-protection', path: '/buyer-protection', group: 'info', index: false, changefreq: 'yearly', priority: 0.4,
    label: { ar: 'حماية المشتري', en: 'Buyer protection' },
    title: { ar: 'حماية المشتري', en: 'Buyer Protection' },
    description: { ar: 'كيف يحميك سوق الرميح عند شراء سيارة.', en: 'How Sauda protects you when you buy a car.' },
  },
  {
    // The one page here that earns traffic before anybody is shopping for a
    // car, which is why it is set to index by default while the catalogue is
    // still noindex: an article is ours to publish and true whenever it is read.
    key: 'blog', path: '/blog', group: 'info', index: true, changefreq: 'weekly', priority: 0.6,
    label: { ar: 'المدونة', en: 'Blog' },
    title: { ar: 'المدونة', en: 'Blog' },
    description: {
      ar: 'أدلة ومقارنات ونصائح لشراء وبيع السيارات في السعودية، من فريق سوق الرميح.',
      en: 'Guides, comparisons and advice on buying and selling cars in Saudi Arabia, from the Sauda team.',
    },
  },
  {
    key: 'login', path: '/login', group: 'auth', index: false, changefreq: 'yearly', priority: 0.1,
    label: { ar: 'تسجيل الدخول', en: 'Login' },
    title: { ar: 'تسجيل الدخول', en: 'Login' },
    description: { ar: 'سجّل الدخول إلى حسابك في سوق الرميح.', en: 'Sign in to your Sauda account.' },
  },
  {
    key: 'signup', path: '/signup', group: 'auth', index: false, changefreq: 'yearly', priority: 0.1,
    label: { ar: 'إنشاء حساب', en: 'Create account' },
    title: { ar: 'إنشاء حساب', en: 'Create an account' },
    description: { ar: 'أنشئ حسابك في سوق الرميح.', en: 'Create your Sauda account.' },
  },
  {
    key: 'forgot-password', path: '/forgot-password', group: 'auth', index: false, changefreq: 'yearly', priority: 0.1,
    label: { ar: 'استعادة كلمة المرور', en: 'Reset password' },
    title: { ar: 'استعادة كلمة المرور', en: 'Reset your password' },
    description: { ar: 'استعد الوصول إلى حسابك.', en: 'Get back into your account.' },
  },
];

export const SEO_PAGE_BY_KEY = Object.fromEntries(SEO_PAGES.map((p) => [p.key, p]));

/** Editable content pages, and the public page + SEO entry each one feeds. */
export const CONTENT_PAGES = [
  { slug: 'about', seoKey: 'about', label: { ar: 'من نحن', en: 'About us' } },
];

export const CONTENT_PAGE_BY_SLUG = Object.fromEntries(CONTENT_PAGES.map((p) => [p.slug, p]));

/** The public URL path of a page, e.g. /en/marketplace/cars. */
export const pagePath = (page, locale) => `/${locale}/marketplace${page?.path ?? ''}`;

/** The route pattern revalidatePath() wants for a page. */
export const pageRoute = (page) => `/[locale]/marketplace${page?.path ?? ''}`;
