#!/usr/bin/env node
/**
 * Writes the SEO row for every public page — what Admin → Website content →
 * Pages SEO edits.
 *
 *   node src/marketplace/db/import/write-page-seo.cjs [--dry] [--env=local]
 *
 * page_seo was empty, so all 23 pages ran on the built-in title and
 * description in lib/sitePages.js and had nothing else: no keywords, no focus
 * phrase, no share-card words. Those built-ins are a fallback, not a strategy
 * — one line each, written so that a page is never blank.
 *
 * ── What is deliberately NOT written ───────────────────────────────────────
 *
 * twitter_title / twitter_description stay empty, because resolvePageSeo falls
 * back to the OG pair and an empty field that follows its neighbour cannot
 * drift away from it. Two copies of the same sentence can.
 *
 * og_image_url stays null so every page keeps using the site-wide share image
 * from Settings — change it in one place and all 23 follow.
 *
 * ── Structured data is WRITTEN, not left to the generator ──────────────────
 *
 * The generator in seo/pageMetadata.js still exists and is still the fallback:
 * clear the box on Pages SEO and the page goes back to it. But a graph that
 * only exists in code is not something a marketing team can change, and that
 * is the point of putting it in the row — see GRAPHS below.
 *
 * The graphs carry PLACEHOLDERS rather than URLs, because one row serves both
 * languages. fillTokens resolves them per request, so `{{url}}` is the Arabic
 * URL on the Arabic page and `{{phone}}` is whatever Settings → Contact says
 * today rather than what it said the day this ran.
 *
 * ── Everything but the three auth pages goes into the index ────────────────
 *
 * seo_index is true except on login, signup and forgot-password. Writing a row
 * makes the ROW the authority — `index: row ? row.seo_index !== false :
 * page.index` — so this is the switch that takes the site out of the "demo
 * catalogue, keep it hidden" state it shipped in.
 *
 * seo_follow is true everywhere, the noindex three included: "do not list this
 * page, but do follow its links to the cars" is the right pair for a login
 * form that links into the catalogue.
 *
 * ── Three tables, one run ──────────────────────────────────────────────────
 *
 * page_seo for the fixed pages, vendors for each showroom's storefront, and
 * the one SEO column the car importer left blank. Marketing changes any of it
 * from the admin afterwards; this is the starting point, not the law.
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ENV_FILE = (args.find((a) => a.startsWith('--env=')) ?? '').slice(6) === 'local' ? '.env.local' : '.env.vps';

function loadEnv(file) {
  const full = path.join(__dirname, '..', '..', '..', '..', file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1 || line.trimStart().startsWith('#')) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv(ENV_FILE);
const URL_BASE = env.MARKETPLACE_SUPABASE_URL || process.env.MARKETPLACE_SUPABASE_URL;
const KEY = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY || process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error(`No Supabase credentials in ${ENV_FILE} or the environment.`);
  process.exit(1);
}

async function rest(pathname, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* The page list is the one the app reads, PARSED rather than duplicated: a
   24th page added there must not silently keep running on defaults here. */
function sitePages() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'sitePages.js'), 'utf8');
  const re =
    /key:\s*'([a-z0-9-]+)',\s*path:\s*'([^']*)',\s*group:\s*'(\w+)',\s*index:\s*(true|false),\s*changefreq:\s*'(\w+)',\s*priority:\s*([\d.]+)/g;
  return [...src.matchAll(re)].map((m) => ({
    key: m[1],
    path: m[2],
    group: m[3],
    index: m[4] === 'true',
    changefreq: m[5],
    priority: Number(m[6]),
  }));
}

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

/* ── The copy ──────────────────────────────────────────────────────────────
 *
 * title: what a results page shows, under 60 characters because that is where
 * Google cuts. The brand is NOT repeated — the layout appends "| SAUDA" to
 * every title but the home page's, which is absolute and carries it itself.
 *
 * description: under 155, written as the promise the click is for rather than
 * a summary of the page's furniture.
 *
 * og: the same page as read in a WhatsApp or X preview — shorter, warmer, and
 * allowed to say "we" where a meta description states what is on offer.
 */
const COPY = {
  home: {
    title: { ar: 'سودة — سيارات جديدة ومستعملة في السعودية', en: 'Sauda — New & Used Cars in Saudi Arabia' },
    description: {
      ar: 'اشترِ سيارتك القادمة من معارض موثوقة في السعودية: أسعار واضحة، مواصفات كاملة، وتواصل مباشر مع البائع.',
      en: 'Buy your next car from verified showrooms across Saudi Arabia — clear prices, full specifications and a direct line to the seller.',
    },
    keywords: {
      ar: ['سيارات للبيع', 'سيارات جديدة', 'سيارات مستعملة', 'معارض سيارات', 'أسعار السيارات في السعودية', 'شراء سيارة', 'سوق السيارات'],
      en: ['cars for sale saudi arabia', 'new cars', 'used cars', 'car showrooms', 'car prices saudi arabia', 'buy a car online', 'car marketplace'],
    },
    focus: { ar: 'سيارات للبيع في السعودية', en: 'cars for sale in saudi arabia' },
    og: {
      title: { ar: 'سيارتك القادمة، من معرض موثوق', en: 'Your next car, from a showroom you can trust' },
      description: {
        ar: 'سيارات جديدة ومستعملة بأسعار واضحة ومواصفات كاملة، والبائع على بعد اتصال.',
        en: 'New and used cars with clear prices, full specs, and the seller one tap away.',
      },
    },
  },

  cars: {
    title: { ar: 'سيارات للبيع في السعودية', en: 'Cars for Sale in Saudi Arabia' },
    description: {
      ar: 'تصفّح كل السيارات المعروضة للبيع، وفلترها حسب الماركة والموديل والسعر وعدد المقاعد ونوع الوقود وناقل الحركة والمدينة.',
      en: 'Browse every car for sale and filter by brand, model, price, seats, fuel, transmission, condition and city.',
    },
    keywords: {
      ar: ['سيارات للبيع', 'بحث سيارات', 'أسعار السيارات', 'سيارات الرياض', 'سيارات جدة', 'فلترة السيارات', 'إعلانات سيارات'],
      en: ['cars for sale', 'search cars', 'car prices', 'cars in riyadh', 'cars in jeddah', 'filter cars by price', 'car listings'],
    },
    focus: { ar: 'سيارات للبيع', en: 'cars for sale' },
    og: {
      title: { ar: 'كل السيارات المعروضة للبيع', en: 'Every car for sale, in one place' },
      description: {
        ar: 'فلتر حسب الماركة والسعر والمدينة، واقرأ المواصفات الكاملة قبل أن تتصل.',
        en: 'Filter by brand, price and city, and read the full spec sheet before you call.',
      },
    },
  },

  'cars-new': {
    title: { ar: 'سيارات جديدة للبيع — موديلات 2026', en: 'New Cars for Sale in Saudi Arabia' },
    description: {
      ar: 'سيارات جديدة بالضمان من معارض ووكلاء موثوقين، بأسعار شاملة الضريبة واللوحات، ومواصفات كاملة لكل فئة.',
      en: 'Brand-new cars from verified showrooms and dealers — prices including tax and plates, and a full spec sheet for every trim.',
    },
    keywords: {
      ar: ['سيارات جديدة', 'سيارات 2026', 'وكالة سيارات', 'سيارات زيرو', 'أسعار السيارات الجديدة', 'ضمان الوكيل'],
      en: ['new cars', '2026 models', 'brand new cars', 'dealer cars', 'new car prices saudi', 'cars with warranty'],
    },
    focus: { ar: 'سيارات جديدة للبيع', en: 'new cars for sale' },
    og: {
      title: { ar: 'سيارات جديدة بالضمان', en: 'New cars, with the warranty intact' },
      description: {
        ar: 'موديلات هذا العام من معارض موثوقة، بأسعار شاملة الضريبة واللوحات.',
        en: "This year's models from verified showrooms, priced with tax and plates in.",
      },
    },
  },

  'cars-used': {
    title: { ar: 'سيارات مستعملة للبيع في السعودية', en: 'Used Cars for Sale in Saudi Arabia' },
    description: {
      ar: 'سيارات مستعملة من معارض موثوقة، مع العداد والحالة والمواصفات الكاملة وصور حقيقية في كل إعلان.',
      en: 'Used cars from verified showrooms — mileage, condition, full specifications and real photos on every listing.',
    },
    keywords: {
      ar: ['سيارات مستعملة', 'سيارات مستعملة للبيع', 'سيارات نظيفة', 'ممشى قليل', 'أسعار السيارات المستعملة', 'سيارات مفحوصة'],
      en: ['used cars', 'second hand cars', 'pre-owned cars', 'low mileage cars', 'used car prices saudi', 'inspected used cars'],
    },
    focus: { ar: 'سيارات مستعملة للبيع', en: 'used cars for sale' },
    og: {
      title: { ar: 'مستعملة، ومعروفة التاريخ', en: 'Used cars with nothing hidden' },
      description: {
        ar: 'العداد والحالة والمواصفات مكتوبة في كل إعلان، بلا مفاجآت عند المعاينة.',
        en: 'Mileage, condition and the full spec sheet on every listing — no surprises at the viewing.',
      },
    },
  },

  brands: {
    title: { ar: 'ماركات وموديلات السيارات', en: 'Car Brands & Models' },
    description: {
      ar: 'كل ماركات السيارات المعروضة في سودة، مع موديلات كل ماركة وعدد السيارات المتاحة للبيع الآن.',
      en: 'Every car brand on Sauda, with its models and how many cars are for sale right now.',
    },
    keywords: {
      ar: ['ماركات السيارات', 'موديلات السيارات', 'سوزوكي', 'جيتور', 'وكلاء السيارات', 'تصفح حسب الماركة'],
      en: ['car brands', 'car models', 'suzuki', 'jetour', 'car makes', 'browse by brand'],
    },
    focus: { ar: 'ماركات السيارات', en: 'car brands' },
    og: {
      title: { ar: 'ابدأ من الماركة', en: 'Start from the badge' },
      description: {
        ar: 'كل ماركة وموديلاتها وعدد سياراتها المعروضة للبيع.',
        en: 'Every brand, its models, and how many of each are for sale.',
      },
    },
  },

  vendors: {
    title: { ar: 'معارض السيارات الموثوقة', en: 'Verified Car Showrooms & Dealers' },
    description: {
      ar: 'تصفّح معارض ووكلاء السيارات الموثوقين في السعودية، مع سيارات كل معرض ومدينته وطريقة التواصل معه.',
      en: 'Browse verified car showrooms and dealers across Saudi Arabia — each with its cars, its city and a way to reach it.',
    },
    keywords: {
      ar: ['معارض سيارات', 'وكالات سيارات', 'معارض الرياض', 'معارض جدة', 'تاجر سيارات موثوق', 'معرض سيارات قريب'],
      en: ['car showrooms', 'car dealers', 'showrooms in riyadh', 'dealers in jeddah', 'verified car dealer', 'car dealership'],
    },
    focus: { ar: 'معارض سيارات في السعودية', en: 'car showrooms in saudi arabia' },
    og: {
      title: { ar: 'معارض موثوقة، لا إعلانات مجهولة', en: 'Real showrooms, not anonymous ads' },
      description: {
        ar: 'كل معرض بسجله وسياراته ومدينته — تعرف مع من تتعامل قبل أن تتصل.',
        en: 'Every showroom with its record, its cars and its city — know who you are dealing with.',
      },
    },
  },

  parts: {
    title: { ar: 'قطع غيار السيارات', en: 'Car Spare Parts' },
    description: {
      ar: 'قطع غيار أصلية وبديلة من معارض وموردين موثوقين، مع السعر والتوافق مع الموديل قبل الطلب.',
      en: 'Genuine and aftermarket spare parts from trusted suppliers — price and model fitment stated before you order.',
    },
    keywords: {
      ar: ['قطع غيار', 'قطع غيار أصلية', 'قطع سيارات', 'فلاتر', 'بطاريات سيارات', 'إطارات'],
      en: ['spare parts', 'genuine car parts', 'aftermarket parts', 'car filters', 'car batteries', 'tyres'],
    },
    focus: { ar: 'قطع غيار سيارات', en: 'car spare parts' },
    og: {
      title: { ar: 'القطعة الصحيحة لموديلك', en: 'The right part for your model' },
      description: {
        ar: 'قطع أصلية وبديلة بأسعار واضحة، من موردين يمكنك التحقق منهم.',
        en: 'Genuine and aftermarket parts, clearly priced, from suppliers you can check.',
      },
    },
  },

  services: {
    title: { ar: 'خدمات وصيانة السيارات', en: 'Car Services & Maintenance' },
    description: {
      ar: 'صيانة دورية وفحص وتلميع وخدمات ما بعد البيع من ورش ومعارض موثوقة، بأسعار معلنة قبل الحجز.',
      en: 'Servicing, inspection, detailing and after-sales care from trusted workshops and showrooms, at prices stated up front.',
    },
    keywords: {
      ar: ['صيانة سيارات', 'فحص سيارة', 'ورشة سيارات', 'تلميع سيارات', 'خدمة ما بعد البيع', 'صيانة دورية'],
      en: ['car service', 'car inspection', 'car workshop', 'car detailing', 'after-sales service', 'periodic maintenance'],
    },
    focus: { ar: 'صيانة السيارات', en: 'car services' },
    og: {
      title: { ar: 'صيانة بسعر تعرفه مسبقًا', en: 'Servicing at a price you see first' },
      description: {
        ar: 'ورش ومعارض موثوقة، والسعر مكتوب قبل أن تحجز.',
        en: 'Trusted workshops and showrooms, with the price written down before you book.',
      },
    },
  },

  accessories: {
    title: { ar: 'إكسسوارات وتجهيزات السيارات', en: 'Car Accessories & Add-ons' },
    description: {
      ar: 'إكسسوارات داخلية وخارجية وتجهيزات للسيارات من معارض موثوقة، مع التوافق مع الموديل والسعر لكل قطعة.',
      en: 'Interior, exterior and performance accessories from trusted showrooms — fitment and price on every item.',
    },
    keywords: {
      ar: ['إكسسوارات سيارات', 'تجهيزات سيارات', 'دعاسات', 'شاشات سيارات', 'كشافات', 'جنوط'],
      en: ['car accessories', 'car add-ons', 'floor mats', 'car screens', 'led lights', 'alloy wheels'],
    },
    focus: { ar: 'إكسسوارات سيارات', en: 'car accessories' },
    og: {
      title: { ar: 'جهّز سيارتك كما تحب', en: 'Kit your car out properly' },
      description: {
        ar: 'إكسسوارات تناسب موديلك فعلًا، من معارض موثوقة.',
        en: 'Accessories that actually fit your model, from showrooms you can check.',
      },
    },
  },

  sell: {
    title: { ar: 'بِع سياراتك في سودة', en: 'Sell Your Cars on Sauda' },
    description: {
      ar: 'اعرض سياراتك أمام مشترين جادين في كل السعودية. افتح معرضك في دقائق، وأدِر إعلاناتك وطلباتك من لوحة واحدة.',
      en: 'Put your cars in front of serious buyers across Saudi Arabia. Open your showroom in minutes and run listings and leads from one dashboard.',
    },
    keywords: {
      ar: ['بيع سيارات', 'اعرض سيارتك', 'معرض إلكتروني', 'بيع سيارات أونلاين', 'منصة بيع السيارات', 'إعلان سيارة'],
      en: ['sell cars', 'list your car', 'online showroom', 'sell cars online', 'car selling platform', 'car listing'],
    },
    focus: { ar: 'بيع السيارات أونلاين', en: 'sell cars online' },
    og: {
      title: { ar: 'معرضك على الإنترنت، خلال دقائق', en: 'Your showroom online, in minutes' },
      description: {
        ar: 'إعلانات ومواصفات وطلبات شراء — من لوحة واحدة.',
        en: 'Listings, specs and buyer leads — all from one dashboard.',
      },
    },
  },

  'sell-apply': {
    title: { ar: 'طلب فتح معرض في سودة', en: 'Apply to Open a Showroom' },
    description: {
      ar: 'قدّم طلب فتح معرضك في سودة: بيانات المعرض والسجل التجاري، ويصلك الرد بعد المراجعة.',
      en: 'Apply to open your showroom on Sauda — send your details and commercial registration, and we reply once it is reviewed.',
    },
    keywords: {
      ar: ['طلب معرض', 'تسجيل معرض سيارات', 'انضم كبائع', 'حساب معرض', 'سجل تجاري'],
      en: ['showroom application', 'register a dealership', 'become a seller', 'vendor account', 'dealer sign up'],
    },
    focus: { ar: 'فتح معرض سيارات', en: 'open a car showroom' },
    og: {
      title: { ar: 'انضم كمعرض', en: 'Join as a showroom' },
      description: {
        ar: 'بياناتك وسجلك التجاري، ومراجعة سريعة من فريقنا.',
        en: 'Your details and CR, then a quick review by our team.',
      },
    },
  },

  fees: {
    title: { ar: 'رسوم البيع في سودة', en: 'Selling Fees on Sauda' },
    description: {
      ar: 'ما تدفعه عند البيع في سودة: الاشتراك والعمولة إن وُجدت، مكتوبة بوضوح وبلا رسوم مخفية.',
      en: 'What selling on Sauda costs: subscription and any commission, written plainly with no hidden charges.',
    },
    keywords: {
      ar: ['رسوم البيع', 'عمولة', 'تكلفة الإعلان', 'اشتراك المعارض', 'رسوم المنصة'],
      en: ['selling fees', 'commission', 'listing cost', 'showroom subscription', 'platform fees'],
    },
    focus: { ar: 'رسوم البيع', en: 'selling fees' },
    og: {
      title: { ar: 'الرسوم، بلا مفاجآت', en: 'The fees, with nothing hidden' },
      description: {
        ar: 'اشتراك وعمولة مكتوبان بوضوح قبل أن تبدأ.',
        en: 'Subscription and commission, both stated before you start.',
      },
    },
  },

  pricing: {
    title: { ar: 'أسعار اشتراك المعارض', en: 'Showroom Subscription Pricing' },
    description: {
      ar: 'خطط الاشتراك للمعارض: السعر والمدة وعدد الإعلانات وما تشمله كل خطة. التصفّح والشراء مجاني للمشترين.',
      en: 'Subscription plans for showrooms — price, length, listing limits and what each plan includes. Browsing and buying stays free for buyers.',
    },
    keywords: {
      ar: ['أسعار الاشتراك', 'خطط المعارض', 'باقات الإعلانات', 'تكلفة عرض السيارات', 'اشتراك شهري'],
      en: ['subscription pricing', 'showroom plans', 'listing packages', 'cost to list cars', 'monthly plans'],
    },
    focus: { ar: 'أسعار اشتراك المعارض', en: 'showroom subscription pricing' },
    og: {
      title: { ar: 'خطة لكل حجم معرض', en: 'A plan for every size of showroom' },
      description: {
        ar: 'السعر والمدة وعدد الإعلانات — في جدول واحد.',
        en: 'Price, length and listing limits — all in one table.',
      },
    },
  },

  'seller-terms': {
    title: { ar: 'شروط البائع', en: 'Seller Terms' },
    description: {
      ar: 'الشروط التي تحكم عرض السيارات والبيع في سودة: مسؤوليات المعرض، والمحتوى المسموح، وكيف ينتهي الحساب.',
      en: 'The terms that govern listing and selling on Sauda: what a showroom is responsible for, what may be listed, and how an account ends.',
    },
    keywords: {
      ar: ['شروط البائع', 'الشروط والأحكام', 'اتفاقية المعرض', 'سياسة البيع'],
      en: ['seller terms', 'terms and conditions', 'showroom agreement', 'selling policy'],
    },
    focus: { ar: 'شروط البائع', en: 'seller terms' },
    og: {
      title: { ar: 'شروط البيع في سودة', en: 'The rules for selling on Sauda' },
      description: {
        ar: 'ما يلتزم به المعرض، وما الذي يُسمح بعرضه.',
        en: 'What a showroom commits to, and what may be listed.',
      },
    },
  },

  about: {
    title: { ar: 'من نحن — سودة', en: 'About Sauda' },
    description: {
      ar: 'سودة سوق سيارات سعودي يجمع معارض موثوقة في مكان واحد، بأسعار واضحة وتواصل مباشر بين المشتري والبائع.',
      en: 'Sauda is a Saudi car marketplace that brings verified showrooms together in one place — clear prices and a direct line between buyer and seller.',
    },
    keywords: {
      ar: ['من نحن', 'عن سودة', 'سوق سيارات سعودي', 'فريق سودة', 'منصة سيارات'],
      en: ['about us', 'about sauda', 'saudi car marketplace', 'our team', 'car platform'],
    },
    focus: { ar: 'عن سودة', en: 'about sauda' },
    og: {
      title: { ar: 'من نحن', en: 'Who we are' },
      description: {
        ar: 'سوق سيارات سعودي يجمع المعارض الموثوقة في مكان واحد.',
        en: 'A Saudi car marketplace built around showrooms you can check.',
      },
    },
  },

  'how-it-works': {
    title: { ar: 'كيف يعمل سودة', en: 'How Sauda Works' },
    description: {
      ar: 'كيف تشتري وتبيع في سودة خطوة بخطوة: البحث والمقارنة وطلب عرض السعر والتواصل مع المعرض وإتمام الصفقة.',
      en: 'Buying and selling on Sauda, step by step: search, compare, request a quote, talk to the showroom and close the deal.',
    },
    keywords: {
      ar: ['كيف يعمل', 'طريقة الشراء', 'خطوات البيع', 'طلب عرض سعر', 'شرح المنصة'],
      en: ['how it works', 'how to buy a car', 'how to sell a car', 'request a quote', 'step by step'],
    },
    focus: { ar: 'كيف تشتري سيارة', en: 'how to buy a car' },
    og: {
      title: { ar: 'من البحث إلى المفتاح', en: 'From search to keys' },
      description: {
        ar: 'الخطوات بين أول بحث وتسلّم السيارة.',
        en: 'The few steps between a first search and the keys in your hand.',
      },
    },
  },

  help: {
    title: { ar: 'مركز المساعدة', en: 'Help Centre' },
    description: {
      ar: 'أدلة وإجابات عن الشراء والبيع والحساب والدفع في سودة، مرتّبة حسب الموضوع.',
      en: 'Guides and answers on buying, selling, accounts and payment on Sauda, sorted by topic.',
    },
    keywords: {
      ar: ['مركز المساعدة', 'الدعم', 'كيف أستخدم', 'مشكلة في الحساب', 'تواصل معنا'],
      en: ['help centre', 'support', 'how do i', 'account help', 'contact us'],
    },
    focus: { ar: 'مركز المساعدة', en: 'help centre' },
    og: {
      title: { ar: 'إجابة لكل سؤال', en: 'An answer for every question' },
      description: {
        ar: 'أدلة الشراء والبيع والحساب، مرتّبة حسب الموضوع.',
        en: 'Buying, selling and account guides, sorted by topic.',
      },
    },
  },

  faq: {
    title: { ar: 'الأسئلة الشائعة', en: 'Frequently Asked Questions' },
    description: {
      ar: 'إجابات عن أكثر ما يسأل عنه المشترون والمعارض: الأسعار والضمان والفحص والتواصل مع البائع والدفع.',
      en: 'Answers to what buyers and showrooms ask most: prices, warranty, inspection, reaching the seller and payment.',
    },
    keywords: {
      ar: ['الأسئلة الشائعة', 'أسئلة المشترين', 'هل السعر شامل الضريبة', 'ضمان السيارة', 'طرق الدفع'],
      en: ['faq', 'buyer questions', 'are prices vat inclusive', 'car warranty', 'payment methods'],
    },
    focus: { ar: 'الأسئلة الشائعة', en: 'frequently asked questions' },
    og: {
      title: { ar: 'أسئلة يسألها الجميع', en: 'The questions everyone asks' },
      description: {
        ar: 'الضريبة والضمان والفحص والدفع — مجاب عنها في مكان واحد.',
        en: 'Tax, warranty, inspection and payment — answered in one place.',
      },
    },
  },

  'buyer-protection': {
    title: { ar: 'حماية المشتري', en: 'Buyer Protection' },
    description: {
      ar: 'كيف يحميك سودة عند شراء سيارة: معارض موثقة، بيانات معلنة في كل إعلان، وطريقة واضحة للإبلاغ عن أي مشكلة.',
      en: 'How Sauda protects you when you buy: verified showrooms, disclosed details on every listing, and a clear way to report a problem.',
    },
    keywords: {
      ar: ['حماية المشتري', 'شراء آمن', 'نزاع', 'حقوق المشتري', 'بلاغ عن إعلان'],
      en: ['buyer protection', 'safe purchase', 'disputes', 'buyer rights', 'report a listing'],
    },
    focus: { ar: 'حماية المشتري', en: 'buyer protection' },
    og: {
      title: { ar: 'تشتري وأنت مطمئن', en: 'Buy with your eyes open' },
      description: {
        ar: 'معارض موثقة، بيانات معلنة، وطريق واضح للشكوى.',
        en: 'Verified showrooms, disclosed details, and a clear route if something goes wrong.',
      },
    },
  },

  blog: {
    title: { ar: 'أخبار وأدلة السيارات', en: 'Car News, Guides & Comparisons' },
    description: {
      ar: 'أخبار السيارات في السعودية وأدلة الشراء والمقارنات بين الموديلات ونصائح الصيانة، من فريق سودة.',
      en: 'Car news in Saudi Arabia, buying guides, model comparisons and maintenance advice from the Sauda team.',
    },
    keywords: {
      ar: ['أخبار السيارات', 'مقارنة سيارات', 'دليل شراء سيارة', 'أفضل سيارة', 'نصائح صيانة', 'أسعار السيارات 2026'],
      en: ['car news', 'car comparisons', 'car buying guide', 'best cars', 'maintenance tips', 'car prices 2026'],
    },
    focus: { ar: 'أخبار السيارات في السعودية', en: 'car news saudi arabia' },
    og: {
      title: { ar: 'اقرأ قبل أن تشتري', en: 'Read before you buy' },
      description: {
        ar: 'مقارنات وأدلة ونصائح من فريق يتابع السوق يوميًا.',
        en: 'Comparisons, guides and advice from a team that watches this market daily.',
      },
    },
  },

  login: {
    title: { ar: 'تسجيل الدخول', en: 'Log In to Your Account' },
    description: {
      ar: 'سجّل الدخول إلى حسابك في سودة لمتابعة سياراتك المحفوظة وطلباتك ومراسلاتك مع المعارض.',
      en: 'Sign in to your Sauda account to pick up your saved cars, your requests and your conversations with showrooms.',
    },
    keywords: { ar: ['تسجيل الدخول', 'حسابي', 'دخول'], en: ['log in', 'sign in', 'my account'] },
    focus: { ar: 'تسجيل الدخول', en: 'log in' },
    og: {
      title: { ar: 'تسجيل الدخول', en: 'Welcome back' },
      description: { ar: 'سياراتك المحفوظة وطلباتك بانتظارك.', en: 'Your saved cars and requests are where you left them.' },
    },
  },

  signup: {
    title: { ar: 'إنشاء حساب في سودة', en: 'Create a Sauda Account' },
    description: {
      ar: 'أنشئ حسابك المجاني لحفظ السيارات التي تعجبك، وطلب عروض الأسعار، والتواصل مباشرة مع المعارض.',
      en: 'Create a free account to save the cars you like, request quotes, and talk to showrooms directly.',
    },
    keywords: { ar: ['إنشاء حساب', 'تسجيل جديد', 'حساب مجاني'], en: ['create account', 'sign up', 'free account'] },
    focus: { ar: 'إنشاء حساب', en: 'create an account' },
    og: {
      title: { ar: 'أنشئ حسابك', en: 'Create your account' },
      description: {
        ar: 'احفظ السيارات التي تعجبك واطلب عرض سعر في ثوانٍ.',
        en: 'Save the cars you like and ask for a quote in seconds.',
      },
    },
  },

  'forgot-password': {
    title: { ar: 'استعادة كلمة المرور', en: 'Reset Your Password' },
    description: {
      ar: 'نسيت كلمة المرور؟ أدخل بريدك الإلكتروني ونرسل لك رابطًا لاستعادة الوصول إلى حسابك.',
      en: 'Forgot your password? Enter your email and we send you a link to get back into your account.',
    },
    keywords: { ar: ['استعادة كلمة المرور', 'نسيت كلمة المرور', 'استرجاع الحساب'], en: ['reset password', 'forgot password', 'account recovery'] },
    focus: { ar: 'استعادة كلمة المرور', en: 'reset password' },
    og: {
      title: { ar: 'استعادة الوصول', en: 'Get back in' },
      description: { ar: 'رابط الاستعادة يصلك على بريدك خلال دقيقة.', en: 'A reset link lands in your inbox within a minute.' },
    },
  },
};

/* ── The structured data ───────────────────────────────────────────────────
 *
 * Written INTO page_seo rather than left to the generator, because the point
 * is that an admin can open Pages SEO and change it. The generator stays as
 * the fallback: clear the box and the page goes back to it.
 *
 * The placeholders are not decoration — one row serves both languages, so a
 * real URL typed here is the Arabic one on the English page. See fillTokens in
 * seo/pageMetadata.js for the list and for why an empty one removes its field.
 */
const crumbs = (...trail) => ({
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '{{site}}', item: '{{home}}' },
    ...trail.map((t, i) => ({ '@type': 'ListItem', position: i + 2, name: t.name, item: t.item })),
  ],
});

const page = (type = 'WebPage') => ({
  '@type': type,
  '@id': '{{url}}',
  url: '{{url}}',
  name: '{{title}}',
  description: '{{description}}',
  inLanguage: '{{locale}}',
  isPartOf: { '@type': 'WebSite', '@id': '{{siteUrl}}/#website', name: '{{site}}', url: '{{home}}' },
});

const here = { name: '{{title}}', item: '{{url}}' };

/** A listing page for a slice of the catalogue — cars, used cars, one make. */
const collection = () => ({
  '@context': 'https://schema.org',
  '@graph': [page('CollectionPage'), crumbs(here)],
});

const GRAPHS = {
  /**
   * The home page says who publishes this site and what the site is, and the
   * two are separate things — Organization is the company, WebSite is the
   * thing at this address. Both carry an `@id` that every other page points
   * at, which is what ties twenty WebPages to one publisher instead of
   * twenty unrelated pages.
   *
   * SearchAction is the sitelinks search box: it tells Google that a query can
   * be handed straight to /cars?q=…, so the result for a brand search can
   * carry its own search field. The URL is real — carsPageApi reads `q`.
   */
  home: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': '{{siteUrl}}/#organization',
        name: '{{site}}',
        url: '{{home}}',
        logo: '{{logo}}',
        image: '{{ogImage}}',
        email: '{{email}}',
        telephone: '{{phone}}',
        areaServed: { '@type': 'Country', name: 'Saudi Arabia' },
      },
      {
        '@type': 'WebSite',
        '@id': '{{siteUrl}}/#website',
        name: '{{site}}',
        description: '{{description}}',
        url: '{{home}}',
        inLanguage: ['ar', 'en'],
        publisher: { '@id': '{{siteUrl}}/#organization' },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: '{{home}}/cars?q={search_term_string}' },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  },

  cars: collection(),
  'cars-new': collection(),
  'cars-used': collection(),
  brands: collection(),
  vendors: collection(),
  parts: collection(),
  services: collection(),
  accessories: collection(),

  about: {
    '@context': 'https://schema.org',
    '@graph': [
      { ...page('AboutPage'), about: { '@id': '{{siteUrl}}/#organization' } },
      crumbs(here),
    ],
  },

  /* HowTo would be the tempting type here and would be wrong: HowTo markup has
     to match steps that are visibly on the page, and this page is prose. */
  'how-it-works': { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },

  /* NOT FAQPage. The FAQ page already emits one from the questions an admin
     wrote (FaqSection), and two FAQPage blocks on one URL is a duplicate that
     a rich-result test reports rather than merges. */
  faq: { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },

  help: { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
  'buyer-protection': { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
  'seller-terms': { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
  fees: { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
  sell: { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
  'sell-apply': { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },

  /* The plans themselves are not marked up. An Offer needs a price, and these
     are read from vendor_plans — writing today's numbers into a jsonb column
     is how a search result ends up quoting a price that changed in March. */
  pricing: { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },

  blog: {
    '@context': 'https://schema.org',
    '@graph': [
      { ...page('Blog'), publisher: { '@id': '{{siteUrl}}/#organization' } },
      crumbs(here),
    ],
  },

  login: { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
  signup: { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
  'forgot-password': { '@context': 'https://schema.org', '@graph': [page(), crumbs(here)] },
};

/**
 * ── Which pages go into the index ──────────────────────────────────────────
 *
 * Everything except these three. A login form, a signup form and a password
 * reset are the standard noindex set: they have nothing to rank for, they are
 * near-identical to every other site's, and a search result that lands a buyer
 * on a login screen is a bounce. They stay FOLLOW, so the links on them to the
 * catalogue are still crawled.
 *
 * Flipping any of them on afterwards is one toggle on that page's SEO screen.
 */
const NEVER_INDEX = new Set(['login', 'signup', 'forgot-password']);

/**
 * ── And the pages that have nothing on them yet ────────────────────────────
 *
 * These seven render <ComingSoon/>. Not thin content — NO content: a heading
 * and a line saying the section is on its way.
 *
 * Indexing them would be worse than leaving them out. A buyer searching "قطع
 * غيار سيارات" who lands on "coming soon" bounces, and a bounce from a result
 * is the signal that teaches a search engine not to show the domain for that
 * query again — so it costs the page that WILL exist here later. Google's own
 * guidance calls this thin content, and a site known for it ranks worse
 * overall, not just on the empty pages.
 *
 * Their copy, keywords and share cards are written anyway, so the day the
 * content lands the page is one toggle from being fully set up — Indexing, on
 * that page's SEO screen.
 */
const COMING_SOON = new Set([
  'parts',
  'services',
  'accessories',
  'fees',
  'buyer-protection',
  'seller-terms',
  'how-it-works',
]);

async function main() {
  console.log(`Target:   ${URL_BASE}   (from ${ENV_FILE})`);

  const pages = sitePages();
  if (!pages.length) throw new Error('Parsed no pages out of lib/sitePages.js — has its shape changed?');

  const missing = pages.filter((p) => !COPY[p.key]);
  if (missing.length) {
    console.error(`No copy written for: ${missing.map((p) => p.key).join(', ')}`);
    process.exit(1);
  }
  const extra = Object.keys(COPY).filter((k) => !pages.some((p) => p.key === k));
  if (extra.length) console.warn(`Copy for pages that no longer exist: ${extra.join(', ')}`);

  const rows = [];
  const tooLong = [];

  for (const page of pages) {
    const c = COPY[page.key];

    for (const lang of ['ar', 'en']) {
      if (c.title[lang].length > TITLE_MAX) tooLong.push(`${page.key} ${lang} title ${c.title[lang].length}/${TITLE_MAX}`);
      if (c.description[lang].length > DESCRIPTION_MAX)
        tooLong.push(`${page.key} ${lang} description ${c.description[lang].length}/${DESCRIPTION_MAX}`);
    }

    rows.push({
      page_key: page.key,
      meta_title: c.title,
      meta_description: c.description,
      meta_keywords: c.keywords,
      focus_keyword: c.focus,
      og_title: c.og.title,
      og_description: c.og.description,
      og_image_url: null,
      og_type: page.key === 'blog' ? 'article' : 'website',
      twitter_card: 'summary_large_image',
      twitter_title: {},
      twitter_description: {},
      twitter_image_url: null,
      canonical_url: null,
      seo_index: !NEVER_INDEX.has(page.key) && !COMING_SOON.has(page.key),
      seo_follow: true,
      seo_changefreq: page.changefreq,
      seo_priority: page.priority,
      structured_data: GRAPHS[page.key] ?? null,
    });
  }

  console.log(`\n${rows.length} pages\n`);
  for (const r of rows) {
    console.log(
      `  ${r.page_key.padEnd(17)}${String(r.meta_title.en).slice(0, 34).padEnd(36)}` +
        `kw ${String(r.meta_keywords.ar.length + r.meta_keywords.en.length).padStart(2)}   ` +
        `${(r.seo_index ? 'index' : 'noindex').padEnd(8)}p${String(r.seo_priority).padEnd(5)}` +
        (r.structured_data ? r.structured_data['@graph'].map((g) => g['@type']).join(' + ') : '—')
    );
  }

  if (tooLong.length) {
    console.log('\nOver the length a search result shows:');
    for (const w of tooLong) console.log('  ' + w);
  } else {
    console.log('\nEvery title ≤ 60 and every description ≤ 155 characters.');
  }

  if (DRY) {
    console.log('\nDRY RUN — nothing written to page_seo.');
    await siteWide();
    await showrooms();
    await cars();
    return;
  }

  await rest('page_seo', { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });

  const saved = await rest('page_seo?select=page_key&order=page_key.asc');
  console.log(`\nWritten. page_seo now holds ${saved.length} rows.`);
  console.log('Admin → Website content → Pages SEO lists them as customised.');

  await siteWide();
  await showrooms();
  await cars();
}

/**
 * ── The site's own row (§32) ───────────────────────────────────────────────
 *
 * The layout's fallbacks were borrowed: the <title> of a page with no title
 * was the company NAME, and the meta description was the TAGLINE — hero
 * marketing, written to sit under a photograph, standing in for the 155
 * characters under a search result.
 *
 * This fills in the real ones, plus the business details the home page's
 * Organization block publishes. Everything an admin can see and change on
 * Settings → SEO defaults and Settings → Business details.
 *
 * ── Skipped, loudly, when the SQL has not been run ─────────────────────────
 *
 * The columns arrive with §32 of schema.sql. Writing to a column that is not
 * there is a 400 from PostgREST naming the column, which is a confusing way to
 * be told that a migration is outstanding — so it is checked first and said
 * plainly.
 *
 * ── What is deliberately NOT invented ──────────────────────────────────────
 *
 * No CR number, no VAT number, no founding year, no coordinates, no tracking
 * ids. Those are FACTS about a company, and a plausible-looking invented one
 * is worse than a blank: a wrong CR number published as structured data is a
 * claim, and nobody would know to check it.
 */
async function siteWide() {
  const [row] = await rest('site_settings?select=*&id=eq.true&limit=1');

  if (!row || !('meta_title' in row)) {
    console.log('\nSite-wide SEO: SKIPPED — run §32 of schema.sql first, then this script again.');
    return;
  }

  const name = { ar: row.name?.ar || 'سودة', en: row.name?.en || 'SAUDA' };

  const update = {
    meta_title: {
      ar: 'سيارات جديدة ومستعملة في السعودية',
      en: 'New & Used Cars in Saudi Arabia',
    },
    meta_description: {
      ar: `اشترِ سيارتك من معارض موثوقة في السعودية عبر ${name.ar}: أسعار واضحة، مواصفات كاملة، وتواصل مباشر مع البائع.`,
      en: `Buy from verified showrooms across Saudi Arabia on ${name.en} — clear prices, full specifications and a direct line to the seller.`,
    },
    meta_keywords: {
      ar: ['سيارات للبيع', 'سيارات جديدة', 'سيارات مستعملة', 'معارض سيارات', 'سوق السيارات', 'أسعار السيارات'],
      en: ['cars for sale', 'new cars', 'used cars', 'car showrooms', 'car marketplace', 'car prices'],
    },
    /* %s is the page's own title. Arabic spends the 60-character budget faster,
       so its template is the shorter of the two. */
    title_template: { ar: `%s | ${name.ar}`, en: `%s | ${name.en}` },

    og_type: 'website',
    twitter_card: 'summary_large_image',

    /* Left exactly as it is. The kill switch is an admin's decision about
       whether the site is live, and an import has no business touching it. */

    legal_name: {},
    price_range: '$$',

    /* A weekday row and a weekend row, which is the shape of almost every
       showroom here. The TIMES are a guess an admin will correct in ten
       seconds; having the rows there is what makes them think to. */
    opening_hours: [
      { days: [1, 2, 3, 4], opens: '09:00', closes: '21:00' },
      { days: [6, 7], opens: '16:00', closes: '22:00' },
    ],

    contact_points: [
      ...(row.contact_phone || row.contact_email
        ? [
            {
              type: 'sales',
              phone: row.contact_phone || '',
              email: row.contact_email || '',
              languages: ['ar', 'en'],
            },
          ]
        : []),
    ],
  };

  console.log('\nSite-wide SEO');
  console.log(`  title        ${update.meta_title.en}`);
  console.log(`  description  ${update.meta_description.en.slice(0, 60)}…`);
  console.log(`  template     ${update.title_template.en}`);
  console.log(`  keywords     ${update.meta_keywords.ar.length} ar / ${update.meta_keywords.en.length} en`);
  console.log(`  hours        ${update.opening_hours.length} rows   contact points ${update.contact_points.length}`);
  console.log('  not written: CR, VAT, founding year, coordinates, tracking ids — facts, not copy.');

  if (DRY) return;

  await rest('site_settings?id=eq.true', { method: 'PATCH', body: update, prefer: 'return=minimal' });
  console.log('Written.');
}

/**
 * ── Each showroom's storefront ─────────────────────────────────────────────
 *
 * §27 gave vendors their own SEO columns and every one of them was null, so
 * every storefront fell back to "<name>" and its bio. That fallback is fine
 * and it is not a search result anyone wrote — "معرض سودة" tells a buyer
 * nothing the name did not, and the city, the stock and the word معرض are
 * exactly what they typed.
 *
 * Written from the showroom's OWN row — name, city, how many cars are live —
 * so this says something true about that showroom rather than the same
 * sentence with a name swapped in. The seller can rewrite any of it on their
 * Search & SEO tab.
 */
async function showrooms() {
  const vendors = await rest('vendors?select=id,slug,name,city,bio,state&order=slug.asc');
  if (!vendors.length) return;

  const live = await rest('listings?select=vendor_id,state&state=eq.live&limit=5000');
  const counts = new Map();
  for (const l of live) counts.set(l.vendor_id, (counts.get(l.vendor_id) ?? 0) + 1);

  console.log(`\n${vendors.length} showrooms\n`);
  const updates = [];

  for (const v of vendors) {
    const ar = v.name?.ar || v.name?.en || v.slug;
    const en = v.name?.en || v.name?.ar || v.slug;
    const city = v.city || null;
    const n = counts.get(v.id) ?? 0;

    const inAr = city ? ` في ${city}` : ' في السعودية';
    const inEn = city ? ` in ${city}` : ' in Saudi Arabia';
    const stockAr = n ? `${n} سيارة معروضة` : 'سيارات معروضة';
    const stockEn = n ? `${n} cars` : 'cars';

    const row = {
      meta_title: { ar: `معرض ${ar}${inAr}`, en: `${en} — Car Showroom${inEn}` },
      meta_description: {
        ar: `${stockAr} من معرض ${ar}${inAr}. تصفّح السيارات بالأسعار والمواصفات، وتواصل مع المعرض مباشرة.`,
        en: `${stockEn} from ${en}${inEn}. Browse them with prices and full specifications, and contact the showroom directly.`,
      },
      meta_keywords: {
        ar: [`معرض ${ar}`, 'معرض سيارات', ...(city ? [`معارض سيارات ${city}`, `سيارات ${city}`] : []), 'سيارات للبيع'],
        en: [`${en}`, 'car showroom', ...(city ? [`car dealers ${city}`, `cars in ${city}`] : []), 'cars for sale'],
      },
      focus_keyword: { ar: `معرض ${ar}`, en: `${en} showroom` },
      og_title: { ar: `معرض ${ar}`, en: `${en}` },
      og_description: {
        ar: `${stockAr}، بأسعار واضحة ومواصفات كاملة.`,
        en: `${stockEn}, with clear prices and full specifications.`,
      },
      /* Left alone: og_image_url falls back to the banner and then the logo,
         which is the showroom's own picture either way, and seo_index is the
         seller's switch — not something an import should decide for them. */
      og_type: 'profile',
    };

    console.log(`  ${v.slug.padEnd(22)}${String(row.meta_title.en).slice(0, 38).padEnd(40)}${n} live`);
    updates.push({ id: v.id, row });
  }

  if (DRY) return;

  for (const u of updates) {
    await rest(`vendors?id=eq.${u.id}`, { method: 'PATCH', body: u.row, prefer: 'return=minimal' });
  }
  console.log(`\nWritten. ${updates.length} storefronts.`);
}

/**
 * ── The one car field the importer left blank ──────────────────────────────
 *
 * post-cars.cjs fills meta_title, meta_description, meta_keywords, og_* and
 * canonical_url on all twenty cars. focus_keyword is the exception, and it is
 * not decoration: it is the phrase the SEO tab checks the copy AGAINST, so a
 * blank one means the editor's own scoring has nothing to score.
 *
 * The phrase is the car as somebody would type it — make, model, year — not
 * the listing's full title, which carries the trim and the showroom's wording.
 */
async function cars() {
  const listings = await rest(
    'listings?select=id,slug,name,focus_keyword,brand:car_brands(name),model:car_models(name),year:car_years(value)&limit=5000'
  );
  const blank = listings.filter((l) => !l.focus_keyword || !Object.keys(l.focus_keyword).length);

  console.log(`\n${listings.length} cars — ${blank.length} without a focus keyword`);
  if (!blank.length) {
    await scrubSourceBrand();
    return;
  }

  const updates = blank
    .map((l) => {
      const part = (o, lang) => o?.[lang] || o?.en || o?.ar || '';
      const build = (lang) =>
        [part(l.brand?.name, lang), part(l.model?.name, lang), l.year?.value]
          .filter(Boolean)
          .join(' ')
          .trim();

      const ar = build('ar');
      const en = build('en');
      if (!ar && !en) return null;

      return {
        id: l.id,
        row: { focus_keyword: { ...(ar ? { ar } : {}), ...(en ? { en } : {}) } },
      };
    })
    .filter(Boolean);

  for (const u of updates.slice(0, 3)) console.log(`   e.g. ${JSON.stringify(u.row.focus_keyword)}`);

  if (!DRY) {
    for (const u of updates) {
      await rest(`listings?id=eq.${u.id}`, { method: 'PATCH', body: u.row, prefer: 'return=minimal' });
    }
    console.log(`Written. ${updates.length} cars.`);
  }

  await scrubSourceBrand();
}

/**
 * ── Somebody else's name, in our own <title> ───────────────────────────────
 *
 * The scraped cars kept the SEO text they were written with, and that text was
 * written to sell them on the dealership they came from: every one of the
 * twenty ended "| الرميح للسيارات" or "| Alromaih Cars".
 *
 * Which is published, on this marketplace, as the thing a search result shows
 * — and then the title template appends this site's name after it, so a car
 * page reads "… | Alromaih Cars | SAUDA". It advertises a competitor from
 * inside our own search listing, and no amount of making the TEMPLATE dynamic
 * fixes it, because the name is in the data.
 *
 * ── Removed, not replaced ─────────────────────────────────────────────────
 *
 * The suffix is cut and nothing is put in its place. Substituting this site's
 * name would duplicate what the template already appends — "Jetour G700 |
 * SAUDA | SAUDA" — and the name belongs to the template, which is the one
 * place it can be changed from Settings.
 */
async function scrubSourceBrand() {
  /* The dealership as it was written, in both languages and in the three
     spellings the source used. Separators are eaten along with it so a title
     does not end in a dangling pipe or dash. */
  const BRANDS = [
    'الرميح للسيارات',
    'الرميح',
    'Alromaih Cars',
    'Alromaih Car',
    'Alromaih',
    'Al-Rumaih Motors',
    'Al-Rumaih',
  ];

  const scrub = (text) => {
    if (typeof text !== 'string' || !text) return text;

    let out = text;
    for (const brand of BRANDS) {
      // "… | brand", "… - brand", "… من brand", "… from brand", or bare.
      out = out.replace(
        new RegExp(`\\s*[|\\-–—]?\\s*(?:من|from|على|on)?\\s*${brand}\\s*`, 'gi'),
        ' '
      );
    }
    return out.replace(/\s{2,}/g, ' ').replace(/\s*[|\-–—]\s*$/, '').trim();
  };

  const scrubBoth = (value) => {
    if (!value || typeof value !== 'object') return null;
    const out = {};
    for (const lang of ['ar', 'en']) if (value[lang]) out[lang] = scrub(value[lang]);
    return out;
  };

  const FIELDS = ['meta_title', 'meta_description', 'og_title', 'og_description', 'twitter_title', 'twitter_description'];

  const rows = await rest(`listings?select=id,slug,${FIELDS.join(',')}&limit=5000`);
  const touched = [];

  for (const row of rows) {
    const patch = {};
    for (const field of FIELDS) {
      const cleaned = scrubBoth(row[field]);
      if (cleaned && JSON.stringify(cleaned) !== JSON.stringify(row[field])) patch[field] = cleaned;
    }
    if (Object.keys(patch).length) touched.push({ id: row.id, slug: row.slug, patch });
  }

  console.log(`\n${touched.length} car(s) whose SEO text names the dealership it was scraped from`);
  for (const t of touched.slice(0, 3)) {
    console.log(`   ${t.slug}`);
    if (t.patch.meta_title) console.log(`     → ${t.patch.meta_title.en ?? t.patch.meta_title.ar}`);
  }

  if (!DRY && touched.length) {
    for (const t of touched) {
      await rest(`listings?id=eq.${t.id}`, { method: 'PATCH', body: t.patch, prefer: 'return=minimal' });
    }
    console.log(`Written. ${touched.length} cars cleaned.`);
  }

  await photoAlts();
}

/**
 * ── Alt text, which is the only thing image search can read ───────────────
 *
 * Every scraped photo arrived with the alt text it was written with on the
 * site it came from:
 *
 *   "جيتور G700 2026 Thumbnail Image Photo - Alromaih Cars"
 *
 * Three things wrong with that, in rising order of cost:
 *
 *   · "Thumbnail Image Photo" describes the FILE, not the car. Alt text is
 *     read aloud to somebody who cannot see the picture and indexed as the
 *     description of it; "photo" is the one word it can safely assume.
 *   · The Arabic and the English were the SAME string — the Arabic alt was
 *     half English.
 *   · It names the dealership the car was scraped from. On a photo that is
 *     now in our own sitemap, which is to say: published to Google Images as
 *     a picture belonging to somebody else's showroom.
 *
 * Rewritten from the car's own catalog row — make, model, trim, year, and
 * whether the shot is inside or outside — so each photo says what it is, in
 * each language, and no two cars share a description.
 *
 * `category` is already on every media item (the importer filed them into
 * Exterior and Interior folders), so the inside/outside half costs nothing to
 * know.
 */
async function photoAlts() {
  const label = (value, lang) => value?.[lang] || value?.en || value?.ar || '';

  const WORDS = {
    ar: { exterior: 'من الخارج', interior: 'من الداخل', photo: 'صورة', of: 'للون' },
    en: { exterior: 'exterior', interior: 'interior', photo: 'photo', of: 'in' },
  };

  /** "Jetour G700 Comfort 2026 — exterior photo 2" */
  const altFor = (car, lang, category, n, colour) => {
    const w = WORDS[lang];
    const name = [
      label(car.brand?.name, lang),
      label(car.model?.name, lang),
      label(car.trim?.name, lang),
      car.year?.value,
    ]
      .filter(Boolean)
      .join(' ');

    if (!name) return null;

    const where = category === 'interior' ? w.interior : w.exterior;
    const paint = colour ? ` ${w.of} ${label(colour, lang)}` : '';

    return lang === 'ar'
      ? `${w.photo} ${name}${paint} ${where}${n > 1 ? ` ${n}` : ''}`
      : `${name}${paint} — ${where} ${w.photo}${n > 1 ? ` ${n}` : ''}`;
  };

  const select =
    'id,slug,media,brand:car_brands(name),model:car_models(name),trim:car_trims(name),year:car_years(value)';
  const cars = await rest(`listings?select=${select}&limit=5000`);

  const listingPatches = [];
  let photos = 0;

  for (const car of cars) {
    const media = Array.isArray(car.media) ? car.media : [];
    if (!media.length) continue;

    /* Numbered per category, so a car has "exterior photo", "exterior photo
       2" rather than "photo 7" — a count that means something to a reader. */
    const seen = { exterior: 0, interior: 0 };

    const next = media.map((item) => {
      const category = item?.category === 'interior' ? 'interior' : 'exterior';
      seen[category] += 1;

      const ar = altFor(car, 'ar', category, seen[category], null);
      const en = altFor(car, 'en', category, seen[category], null);
      if (!ar && !en) return item;

      photos += 1;
      return { ...item, alt: { ...(ar ? { ar } : {}), ...(en ? { en } : {}) } };
    });

    if (JSON.stringify(next) !== JSON.stringify(media)) {
      listingPatches.push({ id: car.id, slug: car.slug, media: next });
    }
  }

  /* The colour variants, which get the colour named in the alt — that IS the
     difference between those photos and the ones above. */
  const byListing = new Map(cars.map((c) => [c.id, c]));
  const variants = await rest(
    'listing_variants?select=id,listing_id,media,color:car_colors(name)&limit=5000'
  );

  const variantPatches = [];
  let variantPhotos = 0;

  for (const v of variants) {
    const car = byListing.get(v.listing_id);
    const media = Array.isArray(v.media) ? v.media : [];
    if (!car || !media.length) continue;

    const seen = { exterior: 0, interior: 0 };

    const next = media.map((item) => {
      const category = item?.category === 'interior' ? 'interior' : 'exterior';
      seen[category] += 1;

      const ar = altFor(car, 'ar', category, seen[category], v.color?.name);
      const en = altFor(car, 'en', category, seen[category], v.color?.name);
      if (!ar && !en) return item;

      variantPhotos += 1;
      return { ...item, alt: { ...(ar ? { ar } : {}), ...(en ? { en } : {}) } };
    });

    if (JSON.stringify(next) !== JSON.stringify(media)) variantPatches.push({ id: v.id, media: next });
  }

  console.log(
    `\nPhoto alt text: ${photos} listing photo(s) across ${listingPatches.length} car(s), ` +
      `${variantPhotos} colour photo(s) across ${variantPatches.length} variant(s)`
  );
  const sample = listingPatches[0]?.media?.[0]?.alt;
  if (sample) console.log(`   e.g. ${sample.en}\n        ${sample.ar}`);

  if (DRY) return;

  for (const p of listingPatches) {
    await rest(`listings?id=eq.${p.id}`, { method: 'PATCH', body: { media: p.media }, prefer: 'return=minimal' });
  }
  for (const p of variantPatches) {
    await rest(`listing_variants?id=eq.${p.id}`, { method: 'PATCH', body: { media: p.media }, prefer: 'return=minimal' });
  }
  console.log('Written.');

  await libraryAlts();
}

/**
 * The same photos as they appear in the seller's MEDIA LIBRARY.
 *
 * media_assets is a separate row per file (§6) and carries its own alt — the
 * one a seller sees when they pick a picture, and the one that travels if they
 * attach it to another listing. It was scraped too, so it names the same
 * dealership 343 times.
 *
 * Matched by storage path rather than by listing: a library row knows which
 * file it is, and the listing media above has just been given a correct
 * description of that exact file.
 */
async function libraryAlts() {
  const cars = await rest('listings?select=media&limit=5000');

  const byPath = new Map();
  for (const car of cars) {
    for (const item of Array.isArray(car.media) ? car.media : []) {
      if (item?.path && item?.alt) byPath.set(item.path, item.alt);
    }
  }

  const assets = await rest('media_assets?select=id,storage_path,alt&limit=5000');
  const patches = assets
    .filter((a) => byPath.has(a.storage_path))
    .map((a) => ({ id: a.id, alt: byPath.get(a.storage_path) }))
    .filter((p) => JSON.stringify(p.alt) !== JSON.stringify(assets.find((a) => a.id === p.id)?.alt));

  console.log(`Media library: ${patches.length} of ${assets.length} file(s) re-described`);

  if (DRY || !patches.length) return;

  for (const p of patches) {
    await rest(`media_assets?id=eq.${p.id}`, { method: 'PATCH', body: { alt: p.alt }, prefer: 'return=minimal' });
  }
  console.log('Written.');
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
