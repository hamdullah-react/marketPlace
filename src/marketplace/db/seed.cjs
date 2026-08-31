#!/usr/bin/env node
/**
 * Seeds DB2 with a category tree, three vendors and demo listings across all
 * four types, so the browse pages have something real to render.
 *
 *   node src/marketplace/db/seed.cjs           # insert (idempotent on slug)
 *   node src/marketplace/db/seed.cjs --clear   # remove everything it inserted
 *
 * Demo listings carry attributes.__seed = true and demo- slugs, so --clear can
 * find them without touching anything a real vendor creates later. The category
 * tree and vendors are structural — keep them.
 *
 * Runs over HTTPS/PostgREST, so it needs no Postgres connection.
 */
const { loadEnv } = require('./_env.cjs');


const env = { ...loadEnv(), ...process.env };
const URL_ = env.MARKETPLACE_SUPABASE_URL;
const KEY = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
const CLEAR = process.argv.includes('--clear');

if (!URL_ || !KEY) {
  console.error('Missing MARKETPLACE_SUPABASE_URL / MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(method, pathname, body, prefer) {
  const res = await fetch(`${URL_}/rest/v1/${pathname}`, {
    method,
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Marketplace multilingual shape. */
const i18n = (ar, en) => { const o = {}; if (ar) o.ar = ar; if (en) o.en = en; return o; };

const upsert = (table, rows) =>
  rest('POST', `${table}?on_conflict=slug`, rows, 'resolution=merge-duplicates,return=representation');

// ── category tree ─────────────────────────────────────────────────────────────

const ROOTS = [
  { slug: 'parts', name_ar: 'قطع الغيار', name_en: 'Spare Parts', listing_type: 'part', icon: 'wrench', sort_order: 1 },
  { slug: 'cars', name_ar: 'السيارات', name_en: 'Cars', listing_type: 'car', icon: 'car', sort_order: 2 },
  { slug: 'services', name_ar: 'الخدمات', name_en: 'Services', listing_type: 'service', icon: 'sparkles', sort_order: 3 },
  { slug: 'accessories', name_ar: 'الإكسسوارات', name_en: 'Accessories', listing_type: 'accessory', icon: 'package', sort_order: 4 },
];

const CHILDREN = {
  parts: [
    { slug: 'brakes', name_ar: 'الفرامل', name_en: 'Brakes' },
    { slug: 'filters', name_ar: 'الفلاتر', name_en: 'Filters' },
    { slug: 'oils-fluids', name_ar: 'الزيوت والسوائل', name_en: 'Oils & Fluids' },
    { slug: 'batteries', name_ar: 'البطاريات', name_en: 'Batteries' },
    { slug: 'tyres', name_ar: 'الإطارات', name_en: 'Tyres' },
  ],
  cars: [
    { slug: 'sedan', name_ar: 'سيدان', name_en: 'Sedan' },
    { slug: 'suv', name_ar: 'دفع رباعي', name_en: 'SUV' },
    { slug: 'pickup', name_ar: 'بيك أب', name_en: 'Pickup' },
  ],
  services: [
    { slug: 'maintenance', name_ar: 'الصيانة', name_en: 'Maintenance' },
    { slug: 'detailing', name_ar: 'التلميع والتنظيف', name_en: 'Detailing' },
    { slug: 'inspection', name_ar: 'الفحص', name_en: 'Inspection' },
  ],
  accessories: [
    { slug: 'interior', name_ar: 'إكسسوارات داخلية', name_en: 'Interior' },
    { slug: 'exterior', name_ar: 'إكسسوارات خارجية', name_en: 'Exterior' },
    { slug: 'car-electronics', name_ar: 'إلكترونيات', name_en: 'Electronics' },
  ],
};

const VENDORS = [
  {
    slug: 'alromaih-parts', name_ar: 'مركز الرميح لقطع الغيار', name_en: 'Alromaih Parts Center',
    state: 'approved', verified: true, city: 'Riyadh',
    bio_ar: 'قطع غيار أصلية بضمان المصنع لجميع الموديلات.',
    bio_en: 'Genuine parts with factory warranty for all models.',
    policies: { returns_days: 14, warranty: 'manufacturer', hours: 'Sat–Thu 9:00–21:00' },
    rating_avg: 4.7, rating_count: 128,
  },
  {
    slug: 'riyadh-auto-care', name_ar: 'العناية بالسيارات الرياض', name_en: 'Riyadh Auto Care',
    state: 'approved', verified: true, city: 'Riyadh',
    bio_ar: 'خدمات صيانة وتلميع احترافية في قلب الرياض.',
    bio_en: 'Professional maintenance and detailing in central Riyadh.',
    policies: { returns_days: 0, warranty: 'service-90d', hours: 'Sat–Thu 8:00–20:00' },
    rating_avg: 4.5, rating_count: 64,
  },
  {
    slug: 'jeddah-tyre-house', name_ar: 'بيت الإطارات جدة', name_en: 'Jeddah Tyre House',
    state: 'approved', verified: false, city: 'Jeddah',
    bio_ar: 'إطارات وبطاريات بأفضل الأسعار مع التركيب.',
    bio_en: 'Tyres and batteries at the best prices, fitting included.',
    policies: { returns_days: 7, warranty: 'manufacturer', hours: 'Daily 9:00–23:00' },
    rating_avg: 4.2, rating_count: 41,
  },
];

// type, category slug, vendor slug, and the type-specific attributes
const LISTINGS = [
  ['part', 'brakes', 'alromaih-parts', {
    slug: 'demo-brake-pads-camry-2020', title_ar: 'طقم فحمات فرامل أمامية - كامري 2018-2023', title_en: 'Front Brake Pad Set — Camry 2018–2023',
    description_ar: 'فحمات فرامل أمامية أصلية تويوتا، تناسب كامري من 2018 حتى 2023.',
    description_en: 'Genuine Toyota front brake pads, fits Camry 2018 through 2023.',
    price: 385, compare_at: 450, stock: 24,
    attributes: { oem: '04465-33471', fits: ['Toyota Camry 2018-2023'], position: 'front', warranty_months: 12 },
  }],
  ['part', 'brakes', 'alromaih-parts', {
    slug: 'demo-brake-discs-land-cruiser', title_ar: 'أقراص فرامل أمامية - لاند كروزر', title_en: 'Front Brake Discs — Land Cruiser',
    description_ar: 'زوج أقراص فرامل أمامية مهواة، لاند كروزر 2016 فما فوق.',
    description_en: 'Pair of ventilated front discs, Land Cruiser 2016 and up.',
    price: 940, stock: 8,
    attributes: { oem: '43512-60181', fits: ['Toyota Land Cruiser 2016+'], position: 'front', warranty_months: 12 },
  }],
  ['part', 'filters', 'alromaih-parts', {
    slug: 'demo-oil-filter-hilux', title_ar: 'فلتر زيت - هايلكس', title_en: 'Oil Filter — Hilux',
    description_ar: 'فلتر زيت أصلي لهايلكس ديزل.', description_en: 'Genuine oil filter for Hilux diesel.',
    price: 45, stock: 120, attributes: { oem: '90915-YZZE1', fits: ['Toyota Hilux'], warranty_months: 6 },
  }],
  ['part', 'oils-fluids', 'alromaih-parts', {
    slug: 'demo-engine-oil-5w30-4l', title_ar: 'زيت محرك 5W-30 اصطناعي 4 لتر', title_en: 'Engine Oil 5W-30 Synthetic 4L',
    description_ar: 'زيت محرك اصطناعي بالكامل، عبوة 4 لتر.', description_en: 'Fully synthetic engine oil, 4 litre pack.',
    price: 165, compare_at: 195, stock: 60, attributes: { viscosity: '5W-30', volume_l: 4, synthetic: true },
  }],
  ['part', 'batteries', 'jeddah-tyre-house', {
    slug: 'demo-battery-70ah', title_ar: 'بطارية 70 أمبير مع التركيب', title_en: 'Battery 70Ah with Fitting',
    description_ar: 'بطارية 70 أمبير مع تركيب مجاني وضمان سنتين.',
    description_en: '70Ah battery, free fitting, two-year warranty.',
    price: 420, stock: 15, attributes: { capacity_ah: 70, warranty_months: 24, fitting_included: true },
  }],
  ['part', 'tyres', 'jeddah-tyre-house', {
    slug: 'demo-tyre-265-65-r17', title_ar: 'إطار 265/65 R17', title_en: 'Tyre 265/65 R17',
    description_ar: 'إطار مناسب للطرق الصحراوية والإسفلت.', description_en: 'All-terrain tyre for desert and asphalt.',
    price: 610, stock: 32, attributes: { size: '265/65 R17', season: 'all-terrain', warranty_months: 24 },
  }],
  ['car', 'suv', 'alromaih-parts', {
    slug: 'demo-land-cruiser-2021-gxr', title_ar: 'لاند كروزر GXR 2021', title_en: 'Land Cruiser GXR 2021',
    description_ar: 'لاند كروزر GXR موديل 2021، ممشى 68 ألف كم، فحص كامل.',
    description_en: 'Land Cruiser GXR 2021, 68,000 km, fully inspected.',
    price: 289000, attributes: { year: 2021, mileage_km: 68000, condition: 'used', transmission: 'automatic', fuel: 'petrol', trim: 'GXR' },
  }],
  ['car', 'sedan', 'alromaih-parts', {
    slug: 'demo-camry-2022-gle', title_ar: 'كامري GLE 2022', title_en: 'Camry GLE 2022',
    description_ar: 'كامري 2022 وكالة، ممشى 34 ألف كم، ضمان ساري.',
    description_en: 'Camry 2022, agency maintained, 34,000 km, warranty valid.',
    price: 98500, attributes: { year: 2022, mileage_km: 34000, condition: 'used', transmission: 'automatic', fuel: 'petrol', trim: 'GLE' },
  }],
  ['car', 'suv', 'riyadh-auto-care', {
    slug: 'demo-prado-2020-txl', title_ar: 'برادو TXL 2020', title_en: 'Prado TXL 2020',
    description_ar: 'برادو TXL 2020، ممشى 92 ألف كم، صيانة دورية بالوكالة.',
    description_en: 'Prado TXL 2020, 92,000 km, agency-serviced throughout.',
    price: 172000, compare_at: 185000,
    attributes: { year: 2020, mileage_km: 92000, condition: 'used', transmission: 'automatic', fuel: 'petrol', trim: 'TXL' },
  }],
  ['car', 'suv', 'jeddah-tyre-house', {
    slug: 'demo-tahoe-2023-ls', title_ar: 'تاهو LS 2023', title_en: 'Tahoe LS 2023',
    description_ar: 'تاهو 2023 بحالة الوكالة، ممشى 21 ألف كم فقط.',
    description_en: 'Tahoe 2023 in showroom condition, only 21,000 km.',
    price: 218000,
    attributes: { year: 2023, mileage_km: 21000, condition: 'used', transmission: 'automatic', fuel: 'petrol', trim: 'LS' },
  }],
  ['car', 'sedan', 'riyadh-auto-care', {
    slug: 'demo-accord-2021-lx', title_ar: 'أكورد LX 2021', title_en: 'Accord LX 2021',
    description_ar: 'أكورد 2021 اقتصادية، ممشى 55 ألف كم.',
    description_en: 'Economical Accord 2021, 55,000 km.',
    price: 76500,
    attributes: { year: 2021, mileage_km: 55000, condition: 'used', transmission: 'automatic', fuel: 'petrol', trim: 'LX' },
  }],
  ['car', 'sedan', 'jeddah-tyre-house', {
    slug: 'demo-elantra-2024', title_ar: 'النترا 2024', title_en: 'Elantra 2024',
    description_ar: 'النترا 2024 جديدة بالكامل، صفر كم.',
    description_en: 'Brand new Elantra 2024, zero kilometres.',
    price: 82000,
    attributes: { year: 2024, mileage_km: 0, condition: 'new', transmission: 'automatic', fuel: 'petrol', trim: 'Smart' },
  }],
  ['car', 'sedan', 'alromaih-parts', {
    slug: 'demo-sonata-2019-manual', title_ar: 'سوناتا 2019 عادي', title_en: 'Sonata 2019 Manual',
    description_ar: 'سوناتا 2019 ناقل حركة عادي، ممشى 128 ألف كم، سعر مناسب.',
    description_en: 'Sonata 2019 manual gearbox, 128,000 km, well priced.',
    price: 41000,
    attributes: { year: 2019, mileage_km: 128000, condition: 'used', transmission: 'manual', fuel: 'petrol', trim: 'Base' },
  }],
  ['car', 'pickup', 'alromaih-parts', {
    slug: 'demo-hilux-2022-diesel', title_ar: 'هايلكس 2022 ديزل', title_en: 'Hilux 2022 Diesel',
    description_ar: 'هايلكس ديزل 2022 دبل، ممشى 47 ألف كم.',
    description_en: 'Hilux diesel 2022 double cab, 47,000 km.',
    price: 121000,
    attributes: { year: 2022, mileage_km: 47000, condition: 'used', transmission: 'manual', fuel: 'diesel', trim: 'DLX' },
  }],
  ['car', 'pickup', 'jeddah-tyre-house', {
    slug: 'demo-dmax-2021', title_ar: 'دي ماكس 2021', title_en: 'D-Max 2021',
    description_ar: 'إيسوزو دي ماكس 2021 ديزل، ممشى 76 ألف كم.',
    description_en: 'Isuzu D-Max 2021 diesel, 76,000 km.',
    price: 89000,
    attributes: { year: 2021, mileage_km: 76000, condition: 'used', transmission: 'automatic', fuel: 'diesel', trim: 'LS' },
  }],
  ['car', 'sedan', 'riyadh-auto-care', {
    slug: 'demo-camry-hybrid-2023', title_ar: 'كامري هايبرد 2023', title_en: 'Camry Hybrid 2023',
    description_ar: 'كامري هايبرد 2023، توفير ممتاز في الوقود، ممشى 29 ألف كم.',
    description_en: 'Camry Hybrid 2023, excellent fuel economy, 29,000 km.',
    price: 132000, compare_at: 141000,
    attributes: { year: 2023, mileage_km: 29000, condition: 'used', transmission: 'automatic', fuel: 'hybrid', trim: 'Hybrid LE' },
  }],
  ['car', 'suv', 'alromaih-parts', {
    slug: 'demo-ev6-2024', title_ar: 'كيا EV6 2024 كهربائية', title_en: 'Kia EV6 2024 Electric',
    description_ar: 'كيا EV6 كهربائية بالكامل موديل 2024، صفر كم.',
    description_en: 'Fully electric Kia EV6 2024, zero kilometres.',
    price: 198000,
    attributes: { year: 2024, mileage_km: 0, condition: 'new', transmission: 'automatic', fuel: 'electric', trim: 'GT-Line' },
  }],
  ['car', 'suv', 'jeddah-tyre-house', {
    slug: 'demo-pajero-2018', title_ar: 'باجيرو 2018', title_en: 'Pajero 2018',
    description_ar: 'باجيرو 2018، ممشى 156 ألف كم، فحص كامل.',
    description_en: 'Pajero 2018, 156,000 km, fully inspected.',
    price: 58000,
    attributes: { year: 2018, mileage_km: 156000, condition: 'used', transmission: 'automatic', fuel: 'petrol', trim: 'GLS' },
  }],
  ['service', 'maintenance', 'riyadh-auto-care', {
    slug: 'demo-oil-change-service', title_ar: 'خدمة تغيير زيت شاملة', title_en: 'Full Oil Change Service',
    description_ar: 'تغيير زيت وفلتر مع فحص 20 نقطة.', description_en: 'Oil and filter change plus a 20-point check.',
    price: 249, attributes: { duration_minutes: 45, location: 'workshop', includes: ['oil', 'filter', '20-point check'] },
  }],
  ['service', 'detailing', 'riyadh-auto-care', {
    slug: 'demo-full-detailing', title_ar: 'تلميع وتنظيف شامل', title_en: 'Full Detailing Package',
    description_ar: 'تلميع خارجي وتنظيف داخلي عميق مع تعقيم.',
    description_en: 'Exterior polish and deep interior clean with sanitisation.',
    price: 750, compare_at: 900, attributes: { duration_minutes: 240, location: 'workshop', includes: ['polish', 'interior deep clean', 'sanitise'] },
  }],
  ['service', 'inspection', 'riyadh-auto-care', {
    slug: 'demo-pre-purchase-inspection', title_ar: 'فحص ما قبل الشراء', title_en: 'Pre-Purchase Inspection',
    description_ar: 'فحص 150 نقطة مع تقرير مفصل قبل شراء السيارة.',
    description_en: '150-point inspection with a detailed report before you buy.',
    price: 450, attributes: { duration_minutes: 90, location: 'mobile', includes: ['150-point check', 'written report'] },
  }],
  ['accessory', 'interior', 'jeddah-tyre-house', {
    slug: 'demo-floor-mats-premium', title_ar: 'دواسات أرضية فاخرة', title_en: 'Premium Floor Mats',
    description_ar: 'طقم دواسات مقاوم للماء، مقاس مخصص.', description_en: 'Waterproof custom-fit mat set.',
    price: 320, stock: 40, attributes: { material: 'TPE', pieces: 5, custom_fit: true },
  }],
  ['accessory', 'car-electronics', 'jeddah-tyre-house', {
    slug: 'demo-dashcam-4k', title_ar: 'كاميرا أمامية 4K', title_en: '4K Dashcam',
    description_ar: 'كاميرا تسجيل أمامية بدقة 4K مع رؤية ليلية.',
    description_en: '4K front dashcam with night vision.',
    price: 549, compare_at: 649, stock: 18, attributes: { resolution: '4K', night_vision: true, storage: 'microSD 64GB' },
  }],
];

async function clear() {
  console.log('  removing demo listings…');
  await rest('DELETE', 'listings?slug=like.demo-%25');
  console.log('  done. Categories and vendors kept (structural).');
}

async function seed() {
  // Roots first — children reference them by parent_id.
  const roots = await upsert('categories', ROOTS.map(({ name_ar, name_en, icon, ...r }) => ({ ...r, name: i18n(name_ar, name_en), icon_url: null })));
  const rootBySlug = Object.fromEntries(roots.map((r) => [r.slug, r]));
  console.log(`  categories (root):  ${roots.length}`);

  const childRows = [];
  for (const [parentSlug, kids] of Object.entries(CHILDREN)) {
    const parent = rootBySlug[parentSlug];
    kids.forEach((k, i) =>
      childRows.push({ ...k, parent_id: parent.id, listing_type: parent.listing_type, sort_order: i + 1 })
    );
  }
  const children = await upsert('categories', childRows.map(({ name_ar, name_en, ...r }) => ({ ...r, name: i18n(name_ar, name_en) })));
  const catBySlug = Object.fromEntries(children.map((c) => [c.slug, c]));
  console.log(`  categories (child): ${children.length}`);

  const vendors = await upsert('vendors', VENDORS.map(({ name_ar, name_en, bio_ar, bio_en, ...v }) => ({
    ...v,
    name: i18n(name_ar, name_en),
    bio: i18n(bio_ar, bio_en),
    approved_at: new Date().toISOString(),
  })));
  const vendorBySlug = Object.fromEntries(vendors.map((v) => [v.slug, v]));
  console.log(`  vendors:            ${vendors.length}`);

  // PostgREST rejects a bulk insert whose objects have differing key sets
  // (PGRST102). Cars and services carry no stock, only some rows have a
  // compare_at — so every row is built from the same explicit template.
  const now = new Date().toISOString();
  const rows = LISTINGS.map(([type, catSlug, vendorSlug, r]) => ({
    slug: r.slug,
    type,
    category_id: catBySlug[catSlug].id,
    vendor_id: vendorBySlug[vendorSlug].id,
    state: 'live',
    name: i18n(r.title_ar, r.title_en),
    description: i18n(r.description_ar, r.description_en),
    price: r.price,
    compare_at: r.compare_at ?? null,
    vat_included: true,
    stock: r.stock ?? null,
    attributes: { ...r.attributes, __seed: true },
    media: [],
    city: vendorBySlug[vendorSlug].city,
    views: Math.floor(Math.abs(Math.sin(r.slug.length * 7)) * 500),
    published_at: now,
  }));

  const listings = await upsert('listings', rows);
  console.log(`  listings:           ${listings.length}`);

  const byType = listings.reduce((acc, l) => ({ ...acc, [l.type]: (acc[l.type] ?? 0) + 1 }), {});
  console.log(`  by type:            ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join('  ')}`);
}

(async () => {
  console.log(`\n  ${URL_}\n`);
  try {
    if (CLEAR) await clear();
    else await seed();
    console.log('');
  } catch (e) {
    console.error(`\n  FAILED: ${e.message}\n`);
    process.exit(1);
  }
})();
