/**
 * THE CAR SPECIFICATION TEMPLATE — every fact a car has, in one list.
 *
 * ── What this replaced ────────────────────────────────────────────────────
 *
 * Specifications used to be a CATALOG ENTITY. A showroom opened Catalog →
 * Specifications, typed a name, picked a field type, typed a category name,
 * uploaded two icons, and then typed an option list for it — per specification,
 * eighty times, before they could describe one car. Nobody does that. What
 * actually happened is what the database shows: four showrooms each holding a
 * copy of the same 79 rows installed from a template scraped off another
 * dealership's site, with `seats`, `seatss`, `seatsss` and `setas` in the
 * original database as one person trying four times.
 *
 * A specification is not something a showroom invents. Every car has a
 * wheelbase, a drive type, airbags and a sunroof or not — the list is a
 * property of CARS, so it ships with the application like the form styles
 * (§20) and the badge colours (§25.1), and the seller's job is to say which
 * ones their car has. That is a checklist, which is what the Specifications tab
 * is now.
 *
 * ── The list is deliberately long ─────────────────────────────────────────
 *
 * Just over 200 entries, cross-checked against how Saudi spec pages are
 * actually written (sayarabay's Arabic field names for a petrol car and for an
 * EV) and against the sections every spec database uses — engine and
 * drivetrain, performance, dimensions and weights, capacities, tyres and
 * brakes, then safety, comfort and infotainment.
 *
 * Long is not a usability problem here, because the interaction is a tick: the
 * checklist has a search box, a category rail and a "common only" filter that
 * opens on the ~55 entries flagged `key`. Missing a specification IS a
 * problem — it is a fact about a car that no showroom on the platform can state,
 * and the seller's only recourse is to invent their own, which is how the
 * duplicates started.
 *
 * ── Slugs are matched to the OLD template on purpose ──────────────────────
 *
 * Where an entry means the same thing as one of the 79 scraped rows, it carries
 * that row's slug — `engine-capacity`, not `engine-displacement`;
 * `anti-lock-braking-system-abs`, not `abs`. That is what makes this safe to
 * deploy over a live database: mergeTemplate() joins on slug, so an existing
 * definition and its template entry are ONE row in the checklist, every
 * `listing_specs` row still points at the definition it always did, and no
 * showroom ends up with both "ABS" and "Anti-lock braking system (ABS)".
 *
 * A few of the old rows are near-duplicates of each other — `sunroof`,
 * `panoramic-sunroof` and `electric-sunroof-with-anti-leak` are three yes/no
 * questions where one choice field belongs, and `led-headlights` /
 * `halogen-headlights` likewise. The template states the clean version
 * (`sunroof` as a choice, `headlight-type` as a choice) and the old rows are
 * NOT deleted: they keep rendering on the cars that answered them and appear in
 * the checklist as the showroom's own extras, which they can clear once nothing
 * uses them. Rewriting somebody's answered specs to tidy a list is not a
 * trade worth making.
 *
 * ── kind, and why it is not display_type ──────────────────────────────────
 *
 * `kind` is what the CHECKLIST renders:
 *
 *   check   a tick. "Does the car have it." 150-odd of these, and the reason
 *           the tab is a checklist at all.
 *   number  a tick that reveals a number box — 1.6, 4963, 105.
 *   choice  a tick that reveals a dropdown of the entry's own `choices`.
 *   multi   the same list, as checkboxes, when several answers are true at
 *           once — "Driving modes" is Eco AND Sport AND Sand, not one of them.
 *           Stored as an array; save-listing already handles that shape.
 *   text    a tick that reveals a text box, for the handful that are genuinely
 *           free text (a tyre size, a sound system's brand).
 *
 * It maps to the existing `spec_attributes.display_type` through
 * DISPLAY_TYPE_OF_KIND, so nothing in the database changes shape and every
 * reader — the car page, the compare table, the browse facets — keeps working
 * untouched.
 *
 * Shared by server and client, so no imports beyond the icon vocabulary and no
 * secrets.
 */

/* ── Categories ──────────────────────────────────────────────────────────── */

/**
 * The sections, in the order a spec sheet is read.
 *
 * `sequence` leaves gaps of ten so a section can be inserted between two
 * without renumbering the rest — the same reason `listings.sequence` and the
 * nav groups leave room.
 */
export const SPEC_CATEGORIES = [
  { key: 'engine',       ar: 'المحرك وناقل الحركة',       en: 'Engine & transmission',   icon: 'engine',        sequence: 10 },
  { key: 'electric',     ar: 'الكهرباء والهجين',           en: 'Electric & hybrid',       icon: 'zap',           sequence: 20 },
  { key: 'performance',  ar: 'الأداء',                      en: 'Performance',             icon: 'activity',      sequence: 30 },
  { key: 'dimensions',   ar: 'الأبعاد والأوزان',           en: 'Dimensions & weights',    icon: 'ruler',         sequence: 40 },
  { key: 'chassis',      ar: 'الهيكل والتعليق والفرامل',  en: 'Chassis, suspension & brakes', icon: 'waves',    sequence: 50 },
  { key: 'wheels',       ar: 'العجلات والإطارات',          en: 'Wheels & tyres',          icon: 'disc-3',        sequence: 60 },
  { key: 'comfort',      ar: 'الراحة والملاءمة',           en: 'Comfort & convenience',   icon: 'snowflake',     sequence: 70 },
  { key: 'seats',        ar: 'المقاعد والفرش',             en: 'Seats & upholstery',      icon: 'armchair',      sequence: 80 },
  { key: 'infotainment', ar: 'الترفيه والاتصال',           en: 'Infotainment & connectivity', icon: 'monitor',   sequence: 90 },
  { key: 'safety',       ar: 'الأمان والسلامة',            en: 'Safety & security',       icon: 'shield-check',  sequence: 100 },
  { key: 'assist',       ar: 'مساعدات القيادة',            en: 'Driver assistance',       icon: 'radar',         sequence: 110 },
  { key: 'exterior',     ar: 'المظهر الخارجي',             en: 'Exterior',                icon: 'lightbulb',     sequence: 120 },
  { key: 'interior',     ar: 'التجهيزات الداخلية',         en: 'Interior',                icon: 'frame',         sequence: 130 },
  { key: 'record',       ar: 'الحالة والسجل',              en: 'Condition & record',      icon: 'file-text',     sequence: 140 },
];

export const SPEC_CATEGORY_BY_KEY = new Map(SPEC_CATEGORIES.map((c) => [c.key, c]));

/**
 * The eight section names the scraped catalog uses, and the template section
 * each one means.
 *
 * Named rather than inferred. These are the exact strings in
 * `spec_attributes.category_name` on both live databases — "External
 * equipment", "Ease and comfort", "Structure and dimensions" — and none of
 * them matches a template section by name, so without this every group on
 * every existing car page draws the neutral mark instead of its own.
 *
 * It is used for the ICON only, never to move a row between sections. A
 * showroom's answered specification stays under the heading it was saved
 * under; this just gives that heading a mark.
 */
const LEGACY_CATEGORY_ICON = new Map([
  ['engine', 'engine'],
  ['transmission', 'cog'],
  ['structure and dimensions', 'ruler'],
  ['ease and comfort', 'snowflake'],
  ['external equipment', 'lightbulb'],
  ['seats', 'armchair'],
  ['infotainment', 'monitor'],
  ['safety', 'shield-check'],
  /* Their Arabic spellings, for a catalog authored the other way round. */
  ['المحرك', 'engine'],
  ['ناقل الحركة', 'cog'],
  ['الهيكل والأبعاد', 'ruler'],
  ['السهولة والراحة', 'snowflake'],
  ['التجهيزات الخارجية', 'lightbulb'],
  ['المقاعد', 'armchair'],
  ['الترفيه', 'monitor'],
  ['الأمان', 'shield-check'],
]);

/** A section's mark from its NAME, for a category the template does not have. */
export const legacyCategoryIcon = (name) =>
  LEGACY_CATEGORY_ICON.get(String(name ?? '').trim().toLowerCase()) ?? null;

/**
 * The section that holds a definition the template does not name.
 *
 * Deliberately NOT in SPEC_CATEGORIES: nothing can be created into it — the
 * add form offers the real sections — and it renders only when a showroom has
 * something in it. A section that is always on the rail and usually empty is a
 * section people learn to skip.
 */
export const OWN_SECTION = {
  key: 'own',
  ar: 'مواصفاتك الخاصة',
  en: 'Your own specifications',
  icon: 'list-checks',
  sequence: 900,
};

/**
 * The sections this showroom actually has, template and theirs together.
 *
 * `rows` is spec_sections (§36) for one showroom. Each row is one of two
 * things, told apart by whether its key names a template section:
 *
 *   a template key   an override — they have renamed, re-iconed or moved one
 *                    of the 14 the application ships. The ENTRIES are
 *                    untouched; only the heading is theirs.
 *   anything else    a section of their own, which exists whether or not it
 *                    has anything in it yet. That is the whole point of §36
 *                    having a table: a denormalised heading cannot exist
 *                    before its first row.
 *
 * Returned in rail order. A showroom with no rows gets exactly SPEC_CATEGORIES,
 * which is what every showroom saw before §36.
 */
export function resolveSections(rows = []) {
  const overrides = new Map();
  const own = [];

  for (const row of rows) {
    const key = String(row?.key ?? '').trim();
    if (!key || row?.active === false) continue;

    const section = {
      key,
      ar: row.name?.ar || row.name?.en || key,
      en: row.name?.en || row.name?.ar || key,
      icon: row.icon || null,
      sequence: Number.isFinite(row.sequence) ? row.sequence : 500,
      /* So the editor knows whether removing it means deleting a row or
         simply forgetting an override. */
      saved: true,
      custom: !SPEC_CATEGORY_BY_KEY.has(key),
    };

    if (section.custom) own.push(section);
    else overrides.set(key, section);
  }

  const base = SPEC_CATEGORIES.map((c) => {
    const over = overrides.get(c.key);
    return over
      ? { ...c, ...over, icon: over.icon || c.icon, custom: false }
      : { ...c, saved: false, custom: false };
  });

  return [...base, ...own].sort((a, b) => a.sequence - b.sequence || a.key.localeCompare(b.key));
}

/* ── Shared choice lists ─────────────────────────────────────────────────── */

const C = {
  fuel: [
    { ar: 'بنزين', en: 'Petrol' },
    { ar: 'ديزل', en: 'Diesel' },
    { ar: 'هايبرد', en: 'Hybrid' },
    { ar: 'هايبرد قابس', en: 'Plug-in hybrid' },
    { ar: 'كهربائي', en: 'Electric' },
    { ar: 'غاز طبيعي', en: 'CNG' },
  ],
  cylinderLayout: [
    { ar: 'متوالي', en: 'Inline' },
    { ar: 'على شكل V', en: 'V' },
    { ar: 'مسطح', en: 'Flat / Boxer' },
    { ar: 'دوّار', en: 'Rotary' },
  ],
  aspiration: [
    { ar: 'سحب طبيعي', en: 'Naturally aspirated' },
    { ar: 'تيربو', en: 'Turbocharged' },
    { ar: 'تيربو مزدوج', en: 'Twin-turbo' },
    { ar: 'سوبرتشارجر', en: 'Supercharged' },
  ],
  transmission: [
    { ar: 'أوتوماتيك', en: 'Automatic' },
    { ar: 'عادي', en: 'Manual' },
    { ar: 'CVT', en: 'CVT' },
    { ar: 'DCT مزدوج القابض', en: 'Dual-clutch (DCT)' },
    { ar: 'AMT', en: 'Automated manual (AMT)' },
    { ar: 'سرعة واحدة (كهربائي)', en: 'Single-speed (electric)' },
  ],
  drive: [
    { ar: 'دفع أمامي', en: 'Front-wheel drive (FWD)' },
    { ar: 'دفع خلفي', en: 'Rear-wheel drive (RWD)' },
    { ar: 'دفع رباعي دائم', en: 'All-wheel drive (AWD)' },
    { ar: 'دفع رباعي', en: 'Four-wheel drive (4WD)' },
  ],
  fuelSupply: [
    { ar: 'حقن متعدد MPI', en: 'Multi-point injection (MPI)' },
    { ar: 'حقن مباشر GDI', en: 'Direct injection (GDI)' },
    { ar: 'حقن ديزل TDI', en: 'Diesel direct injection (TDI)' },
    { ar: 'كاربريتر', en: 'Carburettor' },
  ],
  batteryType: [
    { ar: 'ليثيوم أيون', en: 'Lithium-ion' },
    { ar: 'ليثيوم حديد فوسفات LFP', en: 'LFP' },
    { ar: 'نيكل منغنيز كوبالت NMC', en: 'NMC' },
    { ar: 'بطارية صلبة', en: 'Solid-state' },
    { ar: 'نيكل هيدريد NiMH', en: 'NiMH' },
  ],
  chargePort: [
    { ar: 'تايب 2', en: 'Type 2' },
    { ar: 'CCS2', en: 'CCS2' },
    { ar: 'شاديمو', en: 'CHAdeMO' },
    { ar: 'GB/T', en: 'GB/T' },
    { ar: 'NACS', en: 'NACS' },
  ],
  hybridSystem: [
    { ar: 'هايبرد خفيف', en: 'Mild hybrid' },
    { ar: 'هايبرد كامل', en: 'Full hybrid' },
    { ar: 'هايبرد قابس', en: 'Plug-in hybrid' },
    { ar: 'مُمدّد المدى', en: 'Range extender' },
  ],
  bodyStyle: [
    { ar: 'سيدان', en: 'Sedan' },
    { ar: 'دفع رباعي SUV', en: 'SUV' },
    { ar: 'كروس أوفر', en: 'Crossover' },
    { ar: 'هاتشباك', en: 'Hatchback' },
    { ar: 'كوبيه', en: 'Coupe' },
    { ar: 'مكشوفة', en: 'Convertible' },
    { ar: 'وانيت', en: 'Pickup' },
    { ar: 'فان', en: 'Van' },
    { ar: 'ستيشن', en: 'Wagon' },
    { ar: 'عائلية MPV', en: 'MPV' },
  ],
  suspensionFront: [
    { ar: 'ماكفرسون', en: 'MacPherson strut' },
    { ar: 'مقصّين', en: 'Double wishbone' },
    { ar: 'متعدد الوصلات', en: 'Multi-link' },
    { ar: 'عمود التواء', en: 'Torsion bar' },
    { ar: 'هوائي', en: 'Air suspension' },
  ],
  suspensionRear: [
    { ar: 'متعدد الوصلات', en: 'Multi-link' },
    { ar: 'عارضة التواء', en: 'Torsion beam' },
    { ar: 'سفايح', en: 'Leaf spring' },
    { ar: 'مقصّين', en: 'Double wishbone' },
    { ar: 'هوائي', en: 'Air suspension' },
  ],
  brakes: [
    { ar: 'ديسك مهوّى', en: 'Ventilated disc' },
    { ar: 'ديسك', en: 'Disc' },
    { ar: 'طنبور', en: 'Drum' },
  ],
  steering: [
    { ar: 'كهربائي EPS', en: 'Electric (EPS)' },
    { ar: 'هيدروليكي', en: 'Hydraulic' },
    { ar: 'كهرو-هيدروليكي', en: 'Electro-hydraulic' },
  ],
  steeringAdjust: [
    { ar: 'ميلان فقط', en: 'Tilt only' },
    { ar: 'ميلان وامتداد', en: 'Tilt & telescopic' },
    { ar: 'كهربائي', en: 'Electric adjust' },
  ],
  parkingBrake: [
    { ar: 'إلكتروني', en: 'Electronic' },
    { ar: 'يدوي بالعتلة', en: 'Hand lever' },
    { ar: 'بالقدم', en: 'Foot pedal' },
  ],
  construction: [
    { ar: 'هيكل أحادي', en: 'Unibody' },
    { ar: 'هيكل على شاسيه', en: 'Body-on-frame' },
  ],
  wheelType: [
    { ar: 'ألمنيوم', en: 'Alloy' },
    { ar: 'حديد', en: 'Steel' },
    { ar: 'ألمنيوم مطروق', en: 'Forged alloy' },
  ],
  tyreType: [
    { ar: 'راديال بدون أنبوب', en: 'Radial tubeless' },
    { ar: 'يتحمل الثقب Run-flat', en: 'Run-flat' },
    { ar: 'لكل الطرق', en: 'All-terrain' },
    { ar: 'للطين والرمل', en: 'Mud-terrain' },
  ],
  spareWheel: [
    { ar: 'إطار كامل', en: 'Full-size spare' },
    { ar: 'إطار مؤقت', en: 'Space-saver' },
    { ar: 'طقم إصلاح', en: 'Repair kit' },
    { ar: 'لا يوجد', en: 'None' },
  ],
  climate: [
    { ar: 'يدوي', en: 'Manual' },
    { ar: 'أوتوماتيك', en: 'Automatic' },
    { ar: 'منطقتين', en: 'Dual-zone' },
    { ar: 'ثلاث مناطق', en: 'Tri-zone' },
    { ar: 'أربع مناطق', en: 'Four-zone' },
  ],
  upholstery: [
    { ar: 'قماش', en: 'Fabric' },
    { ar: 'جلد صناعي', en: 'Leatherette' },
    { ar: 'جلد', en: 'Leather' },
    { ar: 'جلد نابا', en: 'Nappa leather' },
    { ar: 'الكانتارا', en: 'Alcantara' },
    { ar: 'شامواه', en: 'Suede' },
  ],
  seatAdjust: [
    { ar: 'يدوي', en: 'Manual' },
    { ar: 'كهربائي 4 اتجاهات', en: 'Power, 4-way' },
    { ar: 'كهربائي 6 اتجاهات', en: 'Power, 6-way' },
    { ar: 'كهربائي 8 اتجاهات', en: 'Power, 8-way' },
    { ar: 'كهربائي 10 اتجاهات', en: 'Power, 10-way' },
    { ar: 'كهربائي 12 اتجاهاً', en: 'Power, 12-way' },
  ],
  headlight: [
    { ar: 'هالوجين', en: 'Halogen' },
    { ar: 'زينون HID', en: 'Xenon HID' },
    { ar: 'LED', en: 'LED' },
    { ar: 'LED كامل', en: 'Full LED' },
    { ar: 'مصفوفة LED', en: 'Matrix LED' },
    { ar: 'ليزر', en: 'Laser' },
  ],
  taillight: [
    { ar: 'هالوجين', en: 'Halogen' },
    { ar: 'LED', en: 'LED' },
    { ar: 'OLED', en: 'OLED' },
  ],
  sunroof: [
    { ar: 'لا يوجد', en: 'None' },
    { ar: 'فتحة عادية', en: 'Tilt-and-slide' },
    { ar: 'بانوراما', en: 'Panoramic' },
    { ar: 'بانوراما بفتحتين', en: 'Dual-panel panoramic' },
    { ar: 'سقف قابل للفك', en: 'Removable roof' },
  ],
  antenna: [
    { ar: 'زعنفة قرش', en: 'Shark fin' },
    { ar: 'عمود', en: 'Rod' },
    { ar: 'مدمج بالزجاج', en: 'Built-in' },
  ],
  paintType: [
    { ar: 'سادة', en: 'Solid' },
    { ar: 'ميتاليك', en: 'Metallic' },
    { ar: 'لؤلؤي', en: 'Pearl' },
    { ar: 'مطفي', en: 'Matte' },
  ],
  dashTrim: [
    { ar: 'بلاستيك', en: 'Plastic' },
    { ar: 'ناعم الملمس', en: 'Soft-touch' },
    { ar: 'خشب', en: 'Wood' },
    { ar: 'ألمنيوم', en: 'Aluminium' },
    { ar: 'كربون فايبر', en: 'Carbon fibre' },
  ],
  gearSelector: [
    { ar: 'عتلة', en: 'Lever' },
    { ar: 'قرص دوّار', en: 'Rotary dial' },
    { ar: 'أزرار', en: 'Buttons' },
    { ar: 'ذراع على المقود', en: 'Column stalk' },
  ],
  autonomy: [
    { ar: 'لا يوجد', en: 'None' },
    { ar: 'المستوى 1', en: 'Level 1' },
    { ar: 'المستوى 2', en: 'Level 2' },
    { ar: 'المستوى 2+', en: 'Level 2+' },
    { ar: 'المستوى 3', en: 'Level 3' },
  ],
  condition: [
    { ar: 'جديدة', en: 'New' },
    { ar: 'مستعملة', en: 'Used' },
    { ar: 'مستعملة معتمدة', en: 'Certified pre-owned' },
  ],
  regionalSpec: [
    { ar: 'خليجي', en: 'GCC' },
    { ar: 'سعودي', en: 'Saudi' },
    { ar: 'أمريكي', en: 'American' },
    { ar: 'أوروبي', en: 'European' },
    { ar: 'ياباني', en: 'Japanese' },
    { ar: 'صيني', en: 'Chinese' },
    { ar: 'كندي', en: 'Canadian' },
  ],
  serviceHistory: [
    { ar: 'صيانة كاملة بالوكالة', en: 'Full agency service history' },
    { ar: 'صيانة جزئية بالوكالة', en: 'Partial agency history' },
    { ar: 'صيانة كاملة خارج الوكالة', en: 'Full independent history' },
    { ar: 'لا يوجد سجل', en: 'No history' },
  ],
  warranty: [
    { ar: 'ضمان الوكيل', en: 'Agency warranty' },
    { ar: 'ضمان المعرض', en: 'Dealer warranty' },
    { ar: 'الضمان منتهي', en: 'Warranty expired' },
    { ar: 'بدون ضمان', en: 'No warranty' },
  ],
  insurance: [
    { ar: 'تأمين شامل', en: 'Comprehensive' },
    { ar: 'ضد الغير', en: 'Third-party' },
    { ar: 'لا يوجد', en: 'None' },
  ],
  paintCondition: [
    { ar: 'الصبغ الأصلي', en: 'Original paint' },
    { ar: 'صبغ جزئي', en: 'Partially repainted' },
    { ar: 'صبغ كامل', en: 'Fully repainted' },
  ],
};

/* ── The template ────────────────────────────────────────────────────────── */

/**
 * One entry per fact a car can carry.
 *
 * `key: true` marks the ~55 that nearly every listing wants, which is what the
 * checklist's "common only" filter shows and what the car page's Car
 * Information tiles draw from. `card: true` is the handful worth a line on a
 * listing CARD in a grid — four fit, so flagging more than four here would be
 * a decision the card has to break (see pickForCard in queries/specs.ts).
 */
export const SPEC_TEMPLATE = [
  /* ── Engine & transmission ─────────────────────────────────────────────── */
  { slug: 'fuel-type', ar: 'نوع الوقود', en: 'Fuel type', cat: 'engine', kind: 'choice', choices: C.fuel, icon: 'fuel', key: true, card: true },
  { slug: 'engine-capacity', ar: 'سعة المحرك', en: 'Engine capacity', cat: 'engine', kind: 'number', unit: { ar: 'لتر', en: 'L' }, icon: 'engine', key: true, card: true },
  { slug: 'engine-type-cylinders', ar: 'نوع المحرك والأسطوانات', en: 'Engine type / cylinders', cat: 'engine', kind: 'text', icon: 'engine', key: true },
  { slug: 'cylinders', ar: 'عدد الأسطوانات', en: 'Cylinders', cat: 'engine', kind: 'number', icon: 'engine' },
  { slug: 'cylinder-layout', ar: 'ترتيب الأسطوانات', en: 'Cylinder layout', cat: 'engine', kind: 'choice', choices: C.cylinderLayout, icon: 'layers' },
  { slug: 'valves', ar: 'عدد الصمامات', en: 'Valves', cat: 'engine', kind: 'number', icon: 'cog' },
  { slug: 'aspiration', ar: 'نظام التغذية', en: 'Aspiration', cat: 'engine', kind: 'choice', choices: C.aspiration, icon: 'wind' },
  { slug: 'turbo', ar: 'تيربو', en: 'Turbo', cat: 'engine', kind: 'check', icon: 'wind', key: true },
  { slug: 'maximum-power', ar: 'أقصى قوة', en: 'Maximum power', cat: 'engine', kind: 'number', unit: { ar: 'حصان', en: 'hp' }, icon: 'bolt', key: true, card: true },
  { slug: 'power-rpm', ar: 'القوة عند', en: 'Power at', cat: 'engine', kind: 'number', unit: { ar: 'لفة/د', en: 'rpm' }, icon: 'gauge' },
  { slug: 'torque', ar: 'عزم الدوران', en: 'Torque', cat: 'engine', kind: 'number', unit: { ar: 'نيوتن.متر', en: 'Nm' }, icon: 'bolt', key: true },
  { slug: 'torque-rpm', ar: 'العزم عند', en: 'Torque at', cat: 'engine', kind: 'number', unit: { ar: 'لفة/د', en: 'rpm' }, icon: 'gauge' },
  { slug: 'transmission', ar: 'ناقل الحركة', en: 'Transmission', cat: 'engine', kind: 'choice', choices: C.transmission, icon: 'cog', key: true, card: true },
  { slug: 'gearbox-speeds', ar: 'عدد السرعات', en: 'Number of gears', cat: 'engine', kind: 'number', icon: 'cog', key: true },
  { slug: 'drive-type', ar: 'نوع الدفع', en: 'Drive type', cat: 'engine', kind: 'choice', choices: C.drive, icon: 'compass', key: true },
  { slug: 'low-range-transfer', ar: 'تخفيض (قير وطي)', en: 'Low-range transfer case', cat: 'engine', kind: 'check', icon: 'mountain' },
  { slug: 'differential-lock', ar: 'قافل تفاضلي', en: 'Differential lock', cat: 'engine', kind: 'check', icon: 'mountain' },
  { slug: 'driving-mode', ar: 'أنماط القيادة', en: 'Driving modes', cat: 'engine', kind: 'check', icon: 'settings', key: true },
  { slug: 'paddle-shifters', ar: 'مفاتيح نقل على المقود', en: 'Paddle shifters', cat: 'engine', kind: 'check', icon: 'gamepad-2' },
  { slug: 'idle-start-stop', ar: 'إيقاف وتشغيل تلقائي', en: 'Idle start-stop', cat: 'engine', kind: 'check', icon: 'recycle' },
  { slug: 'fuel-supply-system', ar: 'نظام إمداد الوقود', en: 'Fuel supply system', cat: 'engine', kind: 'choice', choices: C.fuelSupply, icon: 'droplet' },
  { slug: 'fuel-tank-capacity', ar: 'سعة خزان الوقود', en: 'Fuel tank capacity', cat: 'engine', kind: 'number', unit: { ar: 'لتر', en: 'L' }, icon: 'fuel', key: true },
  { slug: 'fuel-consumption', ar: 'معدل استهلاك الوقود', en: 'Fuel consumption', cat: 'engine', kind: 'number', unit: { ar: 'لتر/100كم', en: 'L/100km' }, icon: 'droplet', key: true },
  { slug: 'fuel-consumption-city', ar: 'الاستهلاك داخل المدينة', en: 'Fuel consumption (city)', cat: 'engine', kind: 'number', unit: { ar: 'لتر/100كم', en: 'L/100km' }, icon: 'droplet' },
  { slug: 'fuel-consumption-highway', ar: 'الاستهلاك على الطريق', en: 'Fuel consumption (highway)', cat: 'engine', kind: 'number', unit: { ar: 'لتر/100كم', en: 'L/100km' }, icon: 'droplet' },
  { slug: 'fuel-efficiency-rating', ar: 'كفاءة استهلاك الوقود', en: 'Fuel efficiency rating', cat: 'engine', kind: 'number', unit: { ar: 'كم/لتر', en: 'km/L' }, icon: 'leaf' },
  { slug: 'emission-standard', ar: 'معيار الانبعاثات', en: 'Emission standard', cat: 'engine', kind: 'text', icon: 'leaf' },
  { slug: 'co2-emissions', ar: 'انبعاث ثاني أكسيد الكربون', en: 'CO₂ emissions', cat: 'engine', kind: 'number', unit: { ar: 'جم/كم', en: 'g/km' }, icon: 'leaf' },
  { slug: 'additional-electric-motor', ar: 'محرك كهربائي إضافي', en: 'Additional electric motor', cat: 'engine', kind: 'check', icon: 'zap' },

  /* ── Electric & hybrid ─────────────────────────────────────────────────── */
  { slug: 'battery-capacity', ar: 'سعة البطارية', en: 'Battery capacity', cat: 'electric', kind: 'number', unit: { ar: 'ك.و.س', en: 'kWh' }, icon: 'battery', key: true, card: true },
  { slug: 'electric-range', ar: 'مدى السير الكهربائي', en: 'Electric range', cat: 'electric', kind: 'number', unit: { ar: 'كم', en: 'km' }, icon: 'route', key: true },
  { slug: 'hybrid-system', ar: 'نظام الهجين', en: 'Hybrid system', cat: 'electric', kind: 'choice', choices: C.hybridSystem, icon: 'zap' },
  { slug: 'battery-type', ar: 'نوع البطارية', en: 'Battery type', cat: 'electric', kind: 'choice', choices: C.batteryType, icon: 'battery' },
  { slug: 'electric-motor-count', ar: 'عدد المحركات الكهربائية', en: 'Electric motors', cat: 'electric', kind: 'number', icon: 'zap' },
  { slug: 'electric-motor-power', ar: 'قوة المحرك الكهربائي', en: 'Electric motor power', cat: 'electric', kind: 'number', unit: { ar: 'ك.و', en: 'kW' }, icon: 'zap' },
  { slug: 'ac-charging-time', ar: 'زمن الشحن بالتيار المتردد', en: 'AC charging time', cat: 'electric', kind: 'text', icon: 'plug', key: true },
  { slug: 'dc-charging-time', ar: 'زمن الشحن السريع', en: 'DC fast-charging time', cat: 'electric', kind: 'text', icon: 'plug-zap', key: true },
  { slug: 'ac-charger-power', ar: 'قدرة الشاحن المتردد', en: 'On-board AC charger', cat: 'electric', kind: 'number', unit: { ar: 'ك.و', en: 'kW' }, icon: 'plug' },
  { slug: 'dc-charger-power', ar: 'أقصى قدرة شحن سريع', en: 'Max DC charging power', cat: 'electric', kind: 'number', unit: { ar: 'ك.و', en: 'kW' }, icon: 'plug-zap' },
  { slug: 'charging-port-type', ar: 'نوع منفذ الشحن', en: 'Charging port', cat: 'electric', kind: 'choice', choices: C.chargePort, icon: 'plug' },
  { slug: 'portable-charging-cable', ar: 'كيبل شحن محمول', en: 'Portable charging cable', cat: 'electric', kind: 'check', icon: 'cable' },
  { slug: 'regenerative-braking', ar: 'فرملة استرجاعية', en: 'Regenerative braking', cat: 'electric', kind: 'check', icon: 'recycle' },
  { slug: 'heat-pump', ar: 'مضخة حرارية', en: 'Heat pump', cat: 'electric', kind: 'check', icon: 'heater' },
  { slug: 'vehicle-to-load', ar: 'تغذية الأجهزة من السيارة', en: 'Vehicle-to-load (V2L)', cat: 'electric', kind: 'check', icon: 'plug-zap' },
  { slug: 'battery-warranty', ar: 'ضمان البطارية', en: 'Battery warranty', cat: 'electric', kind: 'text', icon: 'badge-check' },

  /* ── Performance ───────────────────────────────────────────────────────── */
  { slug: 'acceleration-0-100', ar: 'التسارع 0-100 كم/س', en: '0-100 km/h', cat: 'performance', kind: 'number', unit: { ar: 'ثانية', en: 's' }, icon: 'timer', key: true },
  { slug: 'top-speed', ar: 'السرعة القصوى', en: 'Top speed', cat: 'performance', kind: 'number', unit: { ar: 'كم/س', en: 'km/h' }, icon: 'gauge', key: true },
  { slug: 'braking-distance', ar: 'مسافة الفرملة 100-0', en: 'Braking distance 100-0', cat: 'performance', kind: 'number', unit: { ar: 'متر', en: 'm' }, icon: 'disc' },
  { slug: 'towing-capacity', ar: 'قدرة السحب', en: 'Towing capacity', cat: 'performance', kind: 'number', unit: { ar: 'كجم', en: 'kg' }, icon: 'anchor' },
  { slug: 'payload-capacity', ar: 'الحمولة', en: 'Payload', cat: 'performance', kind: 'number', unit: { ar: 'كجم', en: 'kg' }, icon: 'scale' },
  { slug: 'gradeability', ar: 'قدرة الصعود', en: 'Gradeability', cat: 'performance', kind: 'number', unit: { ar: '%', en: '%' }, icon: 'mountain' },
  { slug: 'wading-depth', ar: 'عمق الخوض في الماء', en: 'Wading depth', cat: 'performance', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'waves' },

  /* ── Dimensions & weights ──────────────────────────────────────────────── */
  { slug: 'body-style', ar: 'نوع الهيكل', en: 'Body style', cat: 'dimensions', kind: 'choice', choices: C.bodyStyle, icon: 'car', key: true, card: true },
  { slug: 'length', ar: 'الطول', en: 'Length', cat: 'dimensions', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'ruler', key: true },
  { slug: 'width', ar: 'العرض', en: 'Width', cat: 'dimensions', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'move-horizontal', key: true },
  { slug: 'height', ar: 'الارتفاع', en: 'Height', cat: 'dimensions', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'move-vertical', key: true },
  { slug: 'wheelbase', ar: 'قاعدة العجلات', en: 'Wheelbase', cat: 'dimensions', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'ruler', key: true },
  { slug: 'front-track', ar: 'المسار الأمامي', en: 'Front track', cat: 'dimensions', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'move-horizontal' },
  { slug: 'rear-track', ar: 'المسار الخلفي', en: 'Rear track', cat: 'dimensions', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'move-horizontal' },
  { slug: 'ground-clearance', ar: 'الخلوص الأرضي', en: 'Ground clearance', cat: 'dimensions', kind: 'number', unit: { ar: 'ملم', en: 'mm' }, icon: 'move-vertical', key: true },
  { slug: 'kerb-weight', ar: 'الوزن الفارغ', en: 'Kerb weight', cat: 'dimensions', kind: 'number', unit: { ar: 'كجم', en: 'kg' }, icon: 'weight' },
  { slug: 'gross-weight', ar: 'الوزن الإجمالي', en: 'Gross vehicle weight', cat: 'dimensions', kind: 'number', unit: { ar: 'كجم', en: 'kg' }, icon: 'scale' },
  { slug: 'boot-capacity', ar: 'سعة الشنطة', en: 'Boot capacity', cat: 'dimensions', kind: 'number', unit: { ar: 'لتر', en: 'L' }, icon: 'luggage', key: true },
  { slug: 'boot-capacity-max', ar: 'سعة الشنطة بالمقاعد مطوية', en: 'Boot capacity, seats folded', cat: 'dimensions', kind: 'number', unit: { ar: 'لتر', en: 'L' }, icon: 'luggage' },
  { slug: 'front-trunk-capacity', ar: 'سعة الصندوق الأمامي', en: 'Front trunk capacity', cat: 'dimensions', kind: 'number', unit: { ar: 'لتر', en: 'L' }, icon: 'luggage' },
  { slug: 'doors', ar: 'عدد الأبواب', en: 'Doors', cat: 'dimensions', kind: 'number', icon: 'door-open', key: true },
  { slug: 'seating-capacity', ar: 'عدد المقاعد', en: 'Seating capacity', cat: 'dimensions', kind: 'number', unit: { ar: 'مقعد', en: 'seats' }, icon: 'users', key: true, card: true },
  { slug: 'seat-rows', ar: 'عدد الصفوف', en: 'Seat rows', cat: 'dimensions', kind: 'number', icon: 'rows-3' },
  { slug: 'turning-radius', ar: 'قطر الدوران', en: 'Turning radius', cat: 'dimensions', kind: 'number', unit: { ar: 'متر', en: 'm' }, icon: 'rotate-cw' },
  { slug: 'roof-load-capacity', ar: 'حمولة السقف', en: 'Roof load capacity', cat: 'dimensions', kind: 'number', unit: { ar: 'كجم', en: 'kg' }, icon: 'panel-top' },

  /* ── Chassis, suspension & brakes ──────────────────────────────────────── */
  { slug: 'body-construction', ar: 'بناء الهيكل', en: 'Body construction', cat: 'chassis', kind: 'choice', choices: C.construction, icon: 'layers' },
  { slug: 'front-suspension', ar: 'التعليق الأمامي', en: 'Front suspension', cat: 'chassis', kind: 'choice', choices: C.suspensionFront, icon: 'waves' },
  { slug: 'rear-suspension', ar: 'التعليق الخلفي', en: 'Rear suspension', cat: 'chassis', kind: 'choice', choices: C.suspensionRear, icon: 'waves' },
  { slug: 'adaptive-suspension', ar: 'تعليق متكيف', en: 'Adaptive suspension', cat: 'chassis', kind: 'check', icon: 'waves' },
  { slug: 'air-suspension', ar: 'تعليق هوائي', en: 'Air suspension', cat: 'chassis', kind: 'check', icon: 'waves' },
  { slug: 'front-brakes', ar: 'الفرامل الأمامية', en: 'Front brakes', cat: 'chassis', kind: 'choice', choices: C.brakes, icon: 'disc' },
  { slug: 'rear-brakes', ar: 'الفرامل الخلفية', en: 'Rear brakes', cat: 'chassis', kind: 'choice', choices: C.brakes, icon: 'disc' },
  { slug: 'steering-type', ar: 'نوع التوجيه', en: 'Steering type', cat: 'chassis', kind: 'choice', choices: C.steering, icon: 'life-buoy' },
  { slug: 'steering-adjustment', ar: 'تعديل المقود', en: 'Steering adjustment', cat: 'chassis', kind: 'choice', choices: C.steeringAdjust, icon: 'life-buoy' },
  { slug: 'parking-brake-type', ar: 'فرامل الانتظار', en: 'Parking brake', cat: 'chassis', kind: 'choice', choices: C.parkingBrake, icon: 'lock' },
  { slug: 'electronic-parking-brake', ar: 'فرامل انتظار إلكترونية', en: 'Electronic parking brake', cat: 'chassis', kind: 'check', icon: 'lock' },
  { slug: 'electronic-handbrake-with-auto-hold', ar: 'فرامل إلكترونية مع تثبيت تلقائي', en: 'Electronic handbrake with auto-hold', cat: 'chassis', kind: 'check', icon: 'hand' },

  /* ── Wheels & tyres ────────────────────────────────────────────────────── */
  { slug: 'wheels-size', ar: 'مقاس الجنوط', en: 'Wheel size', cat: 'wheels', kind: 'number', unit: { ar: 'إنش', en: 'inch' }, icon: 'disc-3', key: true },
  { slug: 'wheel-type', ar: 'نوع الجنوط', en: 'Wheel type', cat: 'wheels', kind: 'choice', choices: C.wheelType, icon: 'disc-3' },
  { slug: 'tyre-size', ar: 'مقاس الإطارات', en: 'Tyre size', cat: 'wheels', kind: 'text', icon: 'circle-dot', key: true },
  { slug: 'tyre-type', ar: 'نوع الإطارات', en: 'Tyre type', cat: 'wheels', kind: 'choice', choices: C.tyreType, icon: 'circle-dot' },
  { slug: 'spare-wheel', ar: 'الإطار الاحتياطي', en: 'Spare wheel', cat: 'wheels', kind: 'choice', choices: C.spareWheel, icon: 'disc-3' },
  { slug: 'tire-pressure-monitoring-system-tpms', ar: 'مراقبة ضغط الإطارات', en: 'Tyre pressure monitoring (TPMS)', cat: 'wheels', kind: 'check', icon: 'gauge-circle', key: true },
  { slug: 'locking-wheel-nuts', ar: 'صواميل أمان للجنوط', en: 'Locking wheel nuts', cat: 'wheels', kind: 'check', icon: 'lock' },

  /* ── Comfort & convenience ─────────────────────────────────────────────── */
  { slug: 'air-conditioning', ar: 'مكيف هواء', en: 'Air conditioning', cat: 'comfort', kind: 'check', icon: 'snowflake', key: true },
  { slug: 'climate-control', ar: 'تحكم تلقائي بالمناخ', en: 'Climate control', cat: 'comfort', kind: 'choice', choices: C.climate, icon: 'snowflake', key: true },
  { slug: 'second-row-ac-vents', ar: 'فتحات تكييف للصف الثاني', en: 'Second-row A/C vents', cat: 'comfort', kind: 'check', icon: 'air-vent', key: true },
  { slug: 'third-row-ac-vents', ar: 'فتحات تكييف للصف الثالث', en: 'Third-row A/C vents', cat: 'comfort', kind: 'check', icon: 'air-vent' },
  { slug: 'rear-climate-control', ar: 'تحكم مناخي خلفي مستقل', en: 'Rear climate control', cat: 'comfort', kind: 'check', icon: 'air-vent' },
  { slug: 'air-quality-control', ar: 'التحكم في جودة الهواء', en: 'Air quality control', cat: 'comfort', kind: 'check', icon: 'fan' },
  { slug: 'cabin-air-filter', ar: 'فلتر هواء المقصورة', en: 'Cabin air filter', cat: 'comfort', kind: 'check', icon: 'fan' },
  { slug: 'glovebox-cooling', ar: 'تبريد صندوق القفازات', en: 'Cooled glovebox', cat: 'comfort', kind: 'check', icon: 'snowflake' },
  { slug: 'cooled-centre-console', ar: 'كونسول وسطي مبرّد', en: 'Cooled centre console', cat: 'comfort', kind: 'check', icon: 'snowflake' },
  { slug: 'power-windows-front', ar: 'نوافذ كهربائية أمامية', en: 'Front power windows', cat: 'comfort', kind: 'check', icon: 'blinds', key: true },
  { slug: 'power-windows-rear', ar: 'نوافذ كهربائية خلفية', en: 'Rear power windows', cat: 'comfort', kind: 'check', icon: 'blinds' },
  { slug: 'one-touch-windows', ar: 'نوافذ بلمسة واحدة', en: 'One-touch windows', cat: 'comfort', kind: 'check', icon: 'blinds' },
  { slug: 'smart-entry-system', ar: 'دخول ذكي بدون مفتاح', en: 'Smart keyless entry', cat: 'comfort', kind: 'check', icon: 'key-round', key: true },
  { slug: 'engine-start-button', ar: 'زر تشغيل المحرك', en: 'Push-button start', cat: 'comfort', kind: 'check', icon: 'key-round', key: true },
  { slug: 'engine-start-via-fingerprint', ar: 'تشغيل ببصمة الإصبع', en: 'Fingerprint start', cat: 'comfort', kind: 'check', icon: 'fingerprint' },
  { slug: 'remote-engine-start', ar: 'تشغيل المحرك عن بُعد', en: 'Remote engine start', cat: 'comfort', kind: 'check', icon: 'smartphone' },
  { slug: 'automatic-tailgate', ar: 'باب خلفي كهربائي', en: 'Power tailgate', cat: 'comfort', kind: 'check', icon: 'luggage' },
  { slug: 'hands-free-tailgate', ar: 'باب خلفي بدون لمس', en: 'Hands-free tailgate', cat: 'comfort', kind: 'check', icon: 'luggage' },
  { slug: 'cruise-control', ar: 'مثبت السرعة', en: 'Cruise control', cat: 'comfort', kind: 'check', icon: 'gauge', key: true },
  { slug: 'speed-limiter', ar: 'محدد السرعة', en: 'Speed limiter', cat: 'comfort', kind: 'check', icon: 'gauge' },
  { slug: 'power-steering', ar: 'مقود معزز', en: 'Power steering', cat: 'comfort', kind: 'check', icon: 'life-buoy' },
  { slug: 'multifunction-steering-wheel', ar: 'مقود متعدد الوظائف', en: 'Multifunction steering wheel', cat: 'comfort', kind: 'check', icon: 'life-buoy', key: true },
  { slug: 'heated-steering-wheel', ar: 'مقود مدفأ', en: 'Heated steering wheel', cat: 'comfort', kind: 'check', icon: 'heater' },
  { slug: 'auto-dimming-rear-mirror', ar: 'مرآة داخلية ذاتية التعتيم', en: 'Auto-dimming rear-view mirror', cat: 'comfort', kind: 'check', icon: 'mirror' },
  { slug: 'rain-sensing-wipers', ar: 'مساحات بحساس مطر', en: 'Rain-sensing wipers', cat: 'comfort', kind: 'check', icon: 'cloud-rain' },
  { slug: 'rear-wiper', ar: 'مساحة خلفية', en: 'Rear wiper', cat: 'comfort', kind: 'check', icon: 'umbrella' },
  { slug: 'auto-headlights', ar: 'أضواء أمامية تلقائية', en: 'Automatic headlights', cat: 'comfort', kind: 'check', icon: 'lightbulb' },
  { slug: 'wireless-phone-charger', ar: 'شاحن لاسلكي للجوال', en: 'Wireless phone charger', cat: 'comfort', kind: 'check', icon: 'smartphone', key: true },
  { slug: 'usb-ports', ar: 'عدد منافذ USB', en: 'USB ports', cat: 'comfort', kind: 'number', icon: 'usb' },
  { slug: 'power-outlet-12v', ar: 'مقبس 12 فولت', en: '12V power outlet', cat: 'comfort', kind: 'check', icon: 'plug' },
  { slug: 'power-outlet-220v', ar: 'مقبس 220 فولت', en: '220V power outlet', cat: 'comfort', kind: 'check', icon: 'plug' },
  { slug: 'front-cup-holders', ar: 'حاملات أكواب أمامية', en: 'Front cup holders', cat: 'comfort', kind: 'check', icon: 'table' },
  { slug: 'rear-cup-holders', ar: 'حاملات أكواب خلفية', en: 'Rear cup holders', cat: 'comfort', kind: 'check', icon: 'table' },
  { slug: 'bottle-holders', ar: 'حاملات قوارير', en: 'Bottle holders', cat: 'comfort', kind: 'check', icon: 'table' },
  { slug: 'centre-console-armrest', ar: 'مسند ذراع وسطي', en: 'Centre console armrest', cat: 'comfort', kind: 'check', icon: 'table' },
  { slug: 'rear-centre-armrest', ar: 'مسند ذراع خلفي', en: 'Rear centre armrest', cat: 'comfort', kind: 'check', icon: 'table' },
  { slug: 'illuminated-vanity-mirrors', ar: 'مرايا زينة مضيئة', en: 'Illuminated vanity mirrors', cat: 'comfort', kind: 'check', icon: 'mirror' },
  { slug: 'rear-window-sunshades', ar: 'ستائر شمس خلفية', en: 'Rear sunshades', cat: 'comfort', kind: 'check', icon: 'blinds' },
  { slug: 'ambient-lighting', ar: 'إضاءة محيطية', en: 'Ambient lighting', cat: 'comfort', kind: 'check', icon: 'lamp' },
  { slug: 'cabin-fragrance', ar: 'معطر المقصورة', en: 'Cabin fragrance system', cat: 'comfort', kind: 'check', icon: 'sparkles' },
  { slug: 'cool-box', ar: 'ثلاجة صغيرة', en: 'Cool box', cat: 'comfort', kind: 'check', icon: 'snowflake' },

  /* ── Seats & upholstery ────────────────────────────────────────────────── */
  { slug: 'seat-upholstery', ar: 'فرش المقاعد', en: 'Seat upholstery', cat: 'seats', kind: 'choice', choices: C.upholstery, icon: 'crown', key: true },
  { slug: 'seat-colour', ar: 'لون المقاعد', en: 'Seat colour', cat: 'seats', kind: 'text', icon: 'palette' },
  { slug: 'driver-seat-adjustment-electric', ar: 'تعديل مقعد السائق كهربائياً', en: 'Driver seat, electric adjust', cat: 'seats', kind: 'choice', choices: C.seatAdjust, icon: 'armchair', key: true },
  { slug: 'driver-seat-adjustment-manual', ar: 'تعديل مقعد السائق يدوياً', en: 'Driver seat, manual adjust', cat: 'seats', kind: 'check', icon: 'armchair' },
  { slug: 'passenger-seat-adjustment-electric', ar: 'تعديل مقعد الراكب كهربائياً', en: 'Passenger seat, electric adjust', cat: 'seats', kind: 'choice', choices: C.seatAdjust, icon: 'armchair' },
  { slug: 'passenger-seat-adjustment-manual', ar: 'تعديل مقعد الراكب يدوياً', en: 'Passenger seat, manual adjust', cat: 'seats', kind: 'check', icon: 'armchair' },
  { slug: 'driver-seat-memory', ar: 'ذاكرة مقعد السائق', en: 'Driver seat memory', cat: 'seats', kind: 'check', icon: 'armchair' },
  { slug: 'lumbar-support', ar: 'دعم أسفل الظهر', en: 'Lumbar support', cat: 'seats', kind: 'check', icon: 'armchair' },
  { slug: 'thigh-support-extension', ar: 'امتداد دعم الفخذ', en: 'Thigh support extension', cat: 'seats', kind: 'check', icon: 'bed' },
  { slug: 'heated-front-seats', ar: 'مقاعد أمامية مدفأة', en: 'Heated front seats', cat: 'seats', kind: 'check', icon: 'heater' },
  { slug: 'heated-rear-seats', ar: 'مقاعد خلفية مدفأة', en: 'Heated rear seats', cat: 'seats', kind: 'check', icon: 'heater' },
  { slug: 'ventilated-front-seats', ar: 'مقاعد أمامية مهوّاة', en: 'Ventilated front seats', cat: 'seats', kind: 'check', icon: 'fan', key: true },
  { slug: 'ventilated-rear-seats', ar: 'مقاعد خلفية مهوّاة', en: 'Ventilated rear seats', cat: 'seats', kind: 'check', icon: 'fan' },
  { slug: 'massage-seats', ar: 'مقاعد بالمساج', en: 'Massage seats', cat: 'seats', kind: 'check', icon: 'sparkles' },
  { slug: 'folding-rear-seats', ar: 'مقاعد خلفية قابلة للطي', en: 'Folding rear seats', cat: 'seats', kind: 'check', icon: 'sofa' },
  { slug: 'split-folding-rear-seats', ar: 'طي المقاعد الخلفية بالتجزئة', en: 'Split-folding rear seats', cat: 'seats', kind: 'check', icon: 'sofa' },
  { slug: 'reclining-rear-seats', ar: 'مقاعد خلفية قابلة للإمالة', en: 'Reclining rear seats', cat: 'seats', kind: 'check', icon: 'bed' },
  { slug: 'sliding-rear-seats', ar: 'مقاعد خلفية منزلقة', en: 'Sliding rear seats', cat: 'seats', kind: 'check', icon: 'sofa' },
  { slug: 'third-row-seats', ar: 'مقاعد الصف الثالث', en: 'Third-row seats', cat: 'seats', kind: 'check', icon: 'rows-3', key: true },
  { slug: 'captain-seats', ar: 'مقاعد كابتن', en: 'Captain seats', cat: 'seats', kind: 'check', icon: 'armchair' },
  { slug: 'front-headrests-adjustable', ar: 'مساند رأس أمامية قابلة للتعديل', en: 'Adjustable front headrests', cat: 'seats', kind: 'check', icon: 'armchair' },
  { slug: 'rear-headrests', ar: 'مساند رأس خلفية', en: 'Rear headrests', cat: 'seats', kind: 'check', icon: 'armchair' },
  { slug: 'isofix-anchors', ar: 'تثبيت مقاعد الأطفال ISOFIX', en: 'ISOFIX child-seat anchors', cat: 'seats', kind: 'check', icon: 'baby', key: true },
  { slug: 'seatback-pockets', ar: 'جيوب ظهر المقاعد', en: 'Seatback pockets', cat: 'seats', kind: 'check', icon: 'table' },

  /* ── Infotainment & connectivity ───────────────────────────────────────── */
  { slug: 'information-display-screen', ar: 'شاشة وسطية', en: 'Central touchscreen', cat: 'infotainment', kind: 'check', icon: 'monitor', key: true },
  { slug: 'touchscreen-size', ar: 'مقاس الشاشة الوسطية', en: 'Touchscreen size', cat: 'infotainment', kind: 'number', unit: { ar: 'إنش', en: 'inch' }, icon: 'monitor', key: true },
  { slug: 'digital-instrument-cluster', ar: 'عدادات رقمية', en: 'Digital instrument cluster', cat: 'infotainment', kind: 'check', icon: 'monitor', key: true },
  { slug: 'digital-cluster-size', ar: 'مقاس شاشة العدادات', en: 'Instrument cluster size', cat: 'infotainment', kind: 'number', unit: { ar: 'إنش', en: 'inch' }, icon: 'monitor' },
  { slug: 'head-up-display', ar: 'شاشة عرض أمامية', en: 'Head-up display', cat: 'infotainment', kind: 'check', icon: 'projector', key: true },
  { slug: 'apple-carplay-android-auto', ar: 'آبل كاربلاي وأندرويد أوتو', en: 'Apple CarPlay & Android Auto', cat: 'infotainment', kind: 'check', icon: 'smartphone', key: true },
  { slug: 'central-screen-with-phone-mirroring', ar: 'عرض شاشة الجوال', en: 'Phone screen mirroring', cat: 'infotainment', kind: 'check', icon: 'smartphone' },
  { slug: 'wireless-phone-mirroring', ar: 'ربط الجوال لاسلكياً', en: 'Wireless phone mirroring', cat: 'infotainment', kind: 'check', icon: 'wifi' },
  { slug: 'bluetooth-connectivity', ar: 'بلوتوث', en: 'Bluetooth', cat: 'infotainment', kind: 'check', icon: 'bluetooth', key: true },
  { slug: 'am-fm-radio', ar: 'راديو AM/FM', en: 'AM/FM radio', cat: 'infotainment', kind: 'check', icon: 'radio' },
  { slug: 'mp3-auxiliary-input', ar: 'مدخل AUX / MP3', en: 'AUX / MP3 input', cat: 'infotainment', kind: 'check', icon: 'usb' },
  { slug: 'usb-interface-for-audio', ar: 'منفذ USB للصوت', en: 'USB audio interface', cat: 'infotainment', kind: 'check', icon: 'usb' },
  { slug: 'number-of-speakers', ar: 'عدد السماعات', en: 'Number of speakers', cat: 'infotainment', kind: 'number', icon: 'speaker', key: true },
  { slug: 'premium-sound-system', ar: 'نظام صوتي فاخر', en: 'Premium sound system', cat: 'infotainment', kind: 'text', icon: 'headphones', key: true },
  { slug: 'subwoofer', ar: 'مضخم صوت', en: 'Subwoofer', cat: 'infotainment', kind: 'check', icon: 'speaker' },
  { slug: 'rear-seat-entertainment', ar: 'ترفيه المقاعد الخلفية', en: 'Rear-seat entertainment', cat: 'infotainment', kind: 'check', icon: 'tv' },
  { slug: 'navigation-system', ar: 'نظام ملاحة', en: 'Navigation system', cat: 'infotainment', kind: 'check', icon: 'navigation', key: true },
  { slug: 'voice-control', ar: 'أوامر صوتية', en: 'Voice control', cat: 'infotainment', kind: 'check', icon: 'mic' },
  { slug: 'connected-car-app', ar: 'تطبيق للتحكم بالسيارة', en: 'Connected-car app', cat: 'infotainment', kind: 'check', icon: 'smartphone' },
  { slug: 'over-the-air-updates', ar: 'تحديثات عن بُعد', en: 'Over-the-air updates', cat: 'infotainment', kind: 'check', icon: 'cpu' },
  { slug: 'wifi-hotspot', ar: 'نقطة اتصال واي فاي', en: 'Wi-Fi hotspot', cat: 'infotainment', kind: 'check', icon: 'wifi' },
  { slug: 'digital-key', ar: 'مفتاح رقمي بالجوال', en: 'Digital key', cat: 'infotainment', kind: 'check', icon: 'smartphone' },

  /* ── Safety & security ─────────────────────────────────────────────────── */
  { slug: 'airbags-count', ar: 'عدد الوسائد الهوائية', en: 'Number of airbags', cat: 'safety', kind: 'number', icon: 'shield-check', key: true },
  { slug: 'front-airbags-srs', ar: 'وسائد هوائية أمامية', en: 'Front airbags (SRS)', cat: 'safety', kind: 'check', icon: 'shield-check', key: true },
  { slug: 'front-side-airbags', ar: 'وسائد هوائية جانبية أمامية', en: 'Front side airbags', cat: 'safety', kind: 'check', icon: 'shield-check' },
  { slug: 'rear-side-airbags', ar: 'وسائد هوائية جانبية خلفية', en: 'Rear side airbags', cat: 'safety', kind: 'check', icon: 'shield-check' },
  { slug: 'side-curtain-airbags', ar: 'وسائد هوائية ستائرية', en: 'Side curtain airbags', cat: 'safety', kind: 'check', icon: 'shield-check', key: true },
  { slug: 'knee-airbag', ar: 'وسادة هوائية للركبة', en: 'Knee airbag', cat: 'safety', kind: 'check', icon: 'shield-check' },
  { slug: 'centre-airbag', ar: 'وسادة هوائية وسطية', en: 'Centre airbag', cat: 'safety', kind: 'check', icon: 'shield-check' },
  { slug: 'anti-lock-braking-system-abs', ar: 'نظام منع انغلاق المكابح ABS', en: 'Anti-lock braking (ABS)', cat: 'safety', kind: 'check', icon: 'disc', key: true },
  { slug: 'electronic-brakeforce-distribution-ebd', ar: 'توزيع قوة الفرملة إلكترونياً EBD', en: 'Brakeforce distribution (EBD)', cat: 'safety', kind: 'check', icon: 'disc' },
  { slug: 'electronic-brake-assist-eba', ar: 'مساعد الفرملة الإلكتروني EBA', en: 'Brake assist (EBA)', cat: 'safety', kind: 'check', icon: 'disc' },
  { slug: 'vehicle-stability-assist-vsa', ar: 'ثبات السيارة الإلكتروني ESP/VSA', en: 'Stability control (ESP / VSA)', cat: 'safety', kind: 'check', icon: 'activity', key: true },
  { slug: 'traction-control', ar: 'التحكم في الجر', en: 'Traction control', cat: 'safety', kind: 'check', icon: 'activity' },
  { slug: 'hill-start-assist-hsa', ar: 'مساعد الانطلاق على المنحدر', en: 'Hill-start assist (HSA)', cat: 'safety', kind: 'check', icon: 'mountain' },
  { slug: 'hill-descent-control', ar: 'التحكم بالنزول على المنحدر', en: 'Hill-descent control', cat: 'safety', kind: 'check', icon: 'mountain' },
  { slug: 'trailer-stability-assist', ar: 'ثبات المقطورة', en: 'Trailer stability assist', cat: 'safety', kind: 'check', icon: 'anchor' },
  { slug: 'seatbelt-warning', ar: 'تحذير حزام الأمان', en: 'Seatbelt warning', cat: 'safety', kind: 'check', icon: 'bell-ring' },
  { slug: 'seatbelt-pretensioners', ar: 'أحزمة بشدّ مسبق', en: 'Seatbelt pretensioners', cat: 'safety', kind: 'check', icon: 'shield' },
  { slug: 'height-adjustable-seatbelts', ar: 'أحزمة قابلة لتعديل الارتفاع', en: 'Height-adjustable seatbelts', cat: 'safety', kind: 'check', icon: 'shield' },
  { slug: 'child-safety-locks', ar: 'أقفال أمان الأطفال', en: 'Child safety locks', cat: 'safety', kind: 'check', icon: 'baby' },
  { slug: 'central-locking', ar: 'قفل مركزي', en: 'Central locking', cat: 'safety', kind: 'check', icon: 'lock', key: true },
  { slug: 'power-door-locks', ar: 'أقفال أبواب كهربائية', en: 'Power door locks', cat: 'safety', kind: 'check', icon: 'lock' },
  { slug: 'speed-sensing-door-locks', ar: 'قفل الأبواب حسب السرعة', en: 'Speed-sensing door locks', cat: 'safety', kind: 'check', icon: 'lock' },
  { slug: 'door-ajar-warning', ar: 'تحذير باب غير مغلق', en: 'Door-ajar warning', cat: 'safety', kind: 'check', icon: 'triangle-alert' },
  { slug: 'engine-immobiliser', ar: 'مانع تشغيل المحرك', en: 'Engine immobiliser', cat: 'safety', kind: 'check', icon: 'fingerprint' },
  { slug: 'anti-theft-alarm', ar: 'إنذار ضد السرقة', en: 'Anti-theft alarm', cat: 'safety', kind: 'check', icon: 'siren' },
  { slug: 'emergency-call', ar: 'نداء الطوارئ', en: 'Emergency call (SOS)', cat: 'safety', kind: 'check', icon: 'phone-call' },
  { slug: 'dashcam', ar: 'كاميرا تسجيل', en: 'Dashcam', cat: 'safety', kind: 'check', icon: 'video' },
  { slug: 'first-aid-kit', ar: 'حقيبة إسعافات أولية', en: 'First-aid kit', cat: 'safety', kind: 'check', icon: 'life-ring' },
  { slug: 'fire-extinguisher', ar: 'طفاية حريق', en: 'Fire extinguisher', cat: 'safety', kind: 'check', icon: 'life-ring' },
  { slug: 'ncap-rating', ar: 'تقييم الأمان NCAP', en: 'NCAP safety rating', cat: 'safety', kind: 'number', unit: { ar: 'نجوم', en: 'stars' }, icon: 'star' },

  /* ── Driver assistance ─────────────────────────────────────────────────── */
  { slug: 'rear-camera-multi-angle-camera', ar: 'كاميرا خلفية', en: 'Rear camera', cat: 'assist', kind: 'check', icon: 'camera', key: true },
  { slug: 'front-camera', ar: 'كاميرا أمامية', en: 'Front camera', cat: 'assist', kind: 'check', icon: 'camera' },
  { slug: '360-degree-camera', ar: 'كاميرا 360 درجة', en: '360-degree camera', cat: 'assist', kind: 'check', icon: 'camera', key: true },
  { slug: 'rear-parking-sensors', ar: 'حساسات ركن خلفية', en: 'Rear parking sensors', cat: 'assist', kind: 'check', icon: 'radar', key: true },
  { slug: 'front-parking-sensors', ar: 'حساسات ركن أمامية', en: 'Front parking sensors', cat: 'assist', kind: 'check', icon: 'radar' },
  { slug: 'park-assist', ar: 'مساعد الركن', en: 'Park assist', cat: 'assist', kind: 'check', icon: 'square-parking' },
  { slug: 'automatic-parking', ar: 'ركن تلقائي', en: 'Automatic parking', cat: 'assist', kind: 'check', icon: 'square-parking' },
  { slug: 'blind-spot-monitoring', ar: 'مراقبة النقطة العمياء', en: 'Blind-spot monitoring', cat: 'assist', kind: 'check', icon: 'scan-eye', key: true },
  { slug: 'rear-cross-traffic-alert', ar: 'تحذير المرور الخلفي المتقاطع', en: 'Rear cross-traffic alert', cat: 'assist', kind: 'check', icon: 'scan-eye' },
  { slug: 'lane-departure-warning', ar: 'تحذير مغادرة المسار', en: 'Lane departure warning', cat: 'assist', kind: 'check', icon: 'signpost' },
  { slug: 'lane-keeping-assist', ar: 'مساعد تتبع المسار', en: 'Lane-keeping assist', cat: 'assist', kind: 'check', icon: 'signpost', key: true },
  { slug: 'lane-centring-assist', ar: 'مساعد التمركز في المسار', en: 'Lane-centring assist', cat: 'assist', kind: 'check', icon: 'signpost' },
  { slug: 'road-departure-mitigation-rdm', ar: 'منع الخروج عن الطريق RDM', en: 'Road-departure mitigation', cat: 'assist', kind: 'check', icon: 'signpost' },
  { slug: 'forward-collision-warning-fcw', ar: 'تحذير التصادم الأمامي', en: 'Forward collision warning', cat: 'assist', kind: 'check', icon: 'octagon-alert' },
  { slug: 'autonomous-emergency-braking', ar: 'فرملة طارئة تلقائية', en: 'Autonomous emergency braking', cat: 'assist', kind: 'check', icon: 'octagon-alert', key: true },
  { slug: 'pedestrian-detection', ar: 'اكتشاف المشاة', en: 'Pedestrian detection', cat: 'assist', kind: 'check', icon: 'footprints' },
  { slug: 'adaptive-cruise-control', ar: 'مثبت سرعة تكيفي', en: 'Adaptive cruise control', cat: 'assist', kind: 'check', icon: 'radar', key: true },
  { slug: 'stop-and-go', ar: 'توقف وانطلاق تلقائي', en: 'Stop-and-go', cat: 'assist', kind: 'check', icon: 'radar' },
  { slug: 'traffic-sign-recognition', ar: 'قراءة إشارات الطريق', en: 'Traffic-sign recognition', cat: 'assist', kind: 'check', icon: 'signpost' },
  { slug: 'driver-attention-monitor', ar: 'مراقبة انتباه السائق', en: 'Driver attention monitor', cat: 'assist', kind: 'check', icon: 'eye' },
  { slug: 'rear-occupant-alert', ar: 'تنبيه وجود راكب خلفي', en: 'Rear-occupant alert', cat: 'assist', kind: 'check', icon: 'baby' },
  { slug: 'adaptive-headlights', ar: 'أضواء أمامية متكيفة', en: 'Adaptive headlights', cat: 'assist', kind: 'check', icon: 'lightbulb' },
  { slug: 'automatic-high-beam', ar: 'الضوء العالي التلقائي', en: 'Automatic high-beam', cat: 'assist', kind: 'check', icon: 'lightbulb' },
  { slug: 'night-vision', ar: 'الرؤية الليلية', en: 'Night vision', cat: 'assist', kind: 'check', icon: 'eye' },
  { slug: 'autonomy-level', ar: 'مستوى القيادة الذاتية', en: 'Autonomy level', cat: 'assist', kind: 'choice', choices: C.autonomy, icon: 'cpu' },

  /* ── Exterior ──────────────────────────────────────────────────────────── */
  { slug: 'headlight-type', ar: 'نوع الأضواء الأمامية', en: 'Headlight type', cat: 'exterior', kind: 'choice', choices: C.headlight, icon: 'lightbulb', key: true },
  { slug: 'taillight-type', ar: 'نوع الأضواء الخلفية', en: 'Tail-light type', cat: 'exterior', kind: 'choice', choices: C.taillight, icon: 'lightbulb' },
  { slug: 'daytime-running-lights', ar: 'أضواء نهارية', en: 'Daytime running lights', cat: 'exterior', kind: 'check', icon: 'sun-dim', key: true },
  { slug: 'fog-lights', ar: 'أضواء ضباب', en: 'Fog lights', cat: 'exterior', kind: 'check', icon: 'lightbulb' },
  { slug: 'rear-fog-lights', ar: 'أضواء ضباب خلفية', en: 'Rear fog lights', cat: 'exterior', kind: 'check', icon: 'lightbulb' },
  { slug: 'cornering-lights', ar: 'أضواء الانعطاف', en: 'Cornering lights', cat: 'exterior', kind: 'check', icon: 'lightbulb' },
  { slug: 'headlight-washers', ar: 'غسيل الأضواء الأمامية', en: 'Headlight washers', cat: 'exterior', kind: 'check', icon: 'droplets' },
  { slug: 'headlight-height-adjustment-control', ar: 'تعديل ارتفاع الأضواء', en: 'Headlight height adjustment', cat: 'exterior', kind: 'check', icon: 'lightbulb' },
  { slug: 'puddle-lights', ar: 'أضواء أسفل الأبواب', en: 'Puddle lights', cat: 'exterior', kind: 'check', icon: 'lamp' },
  { slug: 'sunroof', ar: 'فتحة السقف', en: 'Sunroof', cat: 'exterior', kind: 'choice', choices: C.sunroof, icon: 'sun', key: true, card: true },
  { slug: 'roof-rails', ar: 'شبك السقف', en: 'Roof rails', cat: 'exterior', kind: 'check', icon: 'panel-top' },
  { slug: 'side-steps', ar: 'عتبات جانبية', en: 'Side steps', cat: 'exterior', kind: 'check', icon: 'footprints' },
  { slug: 'body-kit', ar: 'إضافات هيكل', en: 'Body kit', cat: 'exterior', kind: 'check', icon: 'sparkles' },
  { slug: 'rear-wing-spoiler', ar: 'جنح خلفي', en: 'Rear spoiler', cat: 'exterior', kind: 'check', icon: 'sparkles' },
  { slug: 'alloy-wheels', ar: 'جنوط ألمنيوم', en: 'Alloy wheels', cat: 'exterior', kind: 'check', icon: 'disc-3', key: true },
  { slug: 'electric-side-mirrors', ar: 'مرايا جانبية كهربائية', en: 'Electric side mirrors', cat: 'exterior', kind: 'check', icon: 'mirror', key: true },
  { slug: 'electric-folding-mirrors', ar: 'مرايا قابلة للطي كهربائياً', en: 'Electric folding mirrors', cat: 'exterior', kind: 'check', icon: 'mirror' },
  { slug: 'heated-side-mirrors', ar: 'مرايا جانبية مدفأة', en: 'Heated side mirrors', cat: 'exterior', kind: 'check', icon: 'heater' },
  { slug: 'mirror-turn-indicators', ar: 'إشارات على المرايا', en: 'Mirror turn indicators', cat: 'exterior', kind: 'check', icon: 'mirror' },
  { slug: 'chrome-door-handles', ar: 'مقابض أبواب كروم', en: 'Chrome door handles', cat: 'exterior', kind: 'check', icon: 'gem' },
  { slug: 'flush-door-handles', ar: 'مقابض مخفية', en: 'Flush door handles', cat: 'exterior', kind: 'check', icon: 'gem' },
  { slug: 'chrome-exterior-trim', ar: 'كروم خارجي', en: 'Chrome exterior trim', cat: 'exterior', kind: 'check', icon: 'gem' },
  { slug: 'tinted-windows', ar: 'زجاج مظلل', en: 'Tinted windows', cat: 'exterior', kind: 'check', icon: 'blinds' },
  { slug: 'privacy-glass', ar: 'زجاج عاتم للخصوصية', en: 'Privacy glass', cat: 'exterior', kind: 'check', icon: 'blinds' },
  { slug: 'rear-window-defogger', ar: 'مزيل تكثيف الزجاج الخلفي', en: 'Rear window defogger', cat: 'exterior', kind: 'check', icon: 'heater' },
  { slug: 'tow-hitch', ar: 'كلاب سحب', en: 'Tow hitch', cat: 'exterior', kind: 'check', icon: 'anchor' },
  { slug: 'mud-flaps', ar: 'واقيات طين', en: 'Mud flaps', cat: 'exterior', kind: 'check', icon: 'droplets' },
  { slug: 'antenna-type', ar: 'نوع الهوائي', en: 'Antenna type', cat: 'exterior', kind: 'choice', choices: C.antenna, icon: 'wifi' },
  { slug: 'paint-type', ar: 'نوع الصبغ', en: 'Paint type', cat: 'exterior', kind: 'choice', choices: C.paintType, icon: 'palette' },

  /* ── Interior ──────────────────────────────────────────────────────────── */
  { slug: 'dashboard-trim', ar: 'تشطيب الطبلون', en: 'Dashboard trim', cat: 'interior', kind: 'choice', choices: C.dashTrim, icon: 'frame' },
  { slug: 'leather-steering-wheel', ar: 'مقود جلد', en: 'Leather steering wheel', cat: 'interior', kind: 'check', icon: 'life-buoy', key: true },
  { slug: 'leather-gear-knob', ar: 'يد قير جلد', en: 'Leather gear knob', cat: 'interior', kind: 'check', icon: 'gem' },
  { slug: 'gear-selector-type', ar: 'نوع ناقل السرعات', en: 'Gear selector type', cat: 'interior', kind: 'choice', choices: C.gearSelector, icon: 'cog' },
  { slug: 'tachometer', ar: 'عداد دوران المحرك', en: 'Tachometer', cat: 'interior', kind: 'check', icon: 'gauge' },
  { slug: 'digital-odometer', ar: 'عداد مسافات رقمي', en: 'Digital odometer', cat: 'interior', kind: 'check', icon: 'hash' },
  { slug: 'trip-computer', ar: 'كمبيوتر الرحلة', en: 'Trip computer', cat: 'interior', kind: 'check', icon: 'monitor' },
  { slug: 'outside-temperature-display', ar: 'عرض حرارة الجو', en: 'Outside temperature display', cat: 'interior', kind: 'check', icon: 'thermometer' },
  { slug: 'digital-clock', ar: 'ساعة رقمية', en: 'Digital clock', cat: 'interior', kind: 'check', icon: 'watch' },
  { slug: 'low-fuel-warning', ar: 'تحذير انخفاض الوقود', en: 'Low-fuel warning', cat: 'interior', kind: 'check', icon: 'fuel' },
  { slug: 'service-reminder', ar: 'تنبيه الصيانة', en: 'Service reminder', cat: 'interior', kind: 'check', icon: 'wrench' },
  { slug: 'floor-mats', ar: 'دواسات أرضية', en: 'Floor mats', cat: 'interior', kind: 'check', icon: 'table' },
  { slug: 'boot-cover', ar: 'غطاء الشنطة', en: 'Boot cover', cat: 'interior', kind: 'check', icon: 'luggage' },
  { slug: 'cargo-net', ar: 'شبكة تثبيت الأمتعة', en: 'Cargo net', cat: 'interior', kind: 'check', icon: 'luggage' },
  { slug: 'boot-light', ar: 'إضاءة الشنطة', en: 'Boot light', cat: 'interior', kind: 'check', icon: 'lamp' },
  { slug: 'boot-power-socket', ar: 'مقبس كهرباء بالشنطة', en: 'Boot power socket', cat: 'interior', kind: 'check', icon: 'plug' },
  { slug: 'sunglasses-holder', ar: 'حافظة نظارات', en: 'Sunglasses holder', cat: 'interior', kind: 'check', icon: 'table' },
  { slug: 'rear-parcel-shelf', ar: 'رف خلفي', en: 'Rear parcel shelf', cat: 'interior', kind: 'check', icon: 'panel-top' },
  { slug: 'interior-colour', ar: 'لون المقصورة', en: 'Interior colour', cat: 'interior', kind: 'text', icon: 'palette' },

  /* ── Condition & record ────────────────────────────────────────────────── */
  { slug: 'vehicle-condition', ar: 'حالة السيارة', en: 'Condition', cat: 'record', kind: 'choice', choices: C.condition, icon: 'badge-check', key: true, card: true },
  { slug: 'regional-spec', ar: 'المواصفة الإقليمية', en: 'Regional spec', cat: 'record', kind: 'choice', choices: C.regionalSpec, icon: 'map-pin', key: true, card: true },
  { slug: 'mileage', ar: 'الممشى', en: 'Mileage', cat: 'record', kind: 'number', unit: { ar: 'كم', en: 'km' }, icon: 'gauge', key: true, card: true },
  { slug: 'previous-owners', ar: 'عدد المالكين السابقين', en: 'Previous owners', cat: 'record', kind: 'number', icon: 'users', key: true },
  { slug: 'first-owner', ar: 'المالك الأول', en: 'First owner', cat: 'record', kind: 'check', icon: 'users' },
  { slug: 'accident-free', ar: 'خالية من الحوادث', en: 'Accident free', cat: 'record', kind: 'check', icon: 'shield-check', key: true },
  { slug: 'paint-condition', ar: 'حالة الصبغ', en: 'Paint condition', cat: 'record', kind: 'choice', choices: C.paintCondition, icon: 'palette', key: true },
  { slug: 'service-history', ar: 'سجل الصيانة', en: 'Service history', cat: 'record', kind: 'choice', choices: C.serviceHistory, icon: 'file-text', key: true },
  { slug: 'warranty-status', ar: 'حالة الضمان', en: 'Warranty', cat: 'record', kind: 'choice', choices: C.warranty, icon: 'badge-check', key: true, card: true },
  { slug: 'warranty-until', ar: 'الضمان حتى', en: 'Warranty until', cat: 'record', kind: 'text', icon: 'calendar-days' },
  { slug: 'warranty-km', ar: 'الضمان حتى ممشى', en: 'Warranty until mileage', cat: 'record', kind: 'number', unit: { ar: 'كم', en: 'km' }, icon: 'badge-check' },
  { slug: 'periodic-inspection-valid', ar: 'الفحص الدوري ساري', en: 'Periodic inspection valid', cat: 'record', kind: 'check', icon: 'file-text', key: true },
  { slug: 'registration-valid-until', ar: 'الاستمارة سارية حتى', en: 'Registration valid until', cat: 'record', kind: 'text', icon: 'calendar-days' },
  { slug: 'insurance-status', ar: 'التأمين', en: 'Insurance', cat: 'record', kind: 'choice', choices: C.insurance, icon: 'shield' },
  { slug: 'finance-cleared', ar: 'مفكوكة من التمويل', en: 'Free of finance / lien', cat: 'record', kind: 'check', icon: 'file-text', key: true },
  { slug: 'customs-cleared', ar: 'مخلّصة جمركياً', en: 'Customs cleared', cat: 'record', kind: 'check', icon: 'file-text' },
  { slug: 'keys-count', ar: 'عدد المفاتيح', en: 'Keys included', cat: 'record', kind: 'number', icon: 'key-round' },
  { slug: 'non-smoker-vehicle', ar: 'لم يُدخّن فيها', en: 'Non-smoker vehicle', cat: 'record', kind: 'check', icon: 'leaf' },
  { slug: 'owner-manual-included', ar: 'كتالوج المالك متوفر', en: "Owner's manual included", cat: 'record', kind: 'check', icon: 'file-text' },
];

/* ── Lookups and mapping ─────────────────────────────────────────────────── */

export const TEMPLATE_BY_SLUG = new Map(SPEC_TEMPLATE.map((s) => [s.slug, s]));

/**
 * Matching a showroom's existing definition to a template entry.
 *
 * ── Why an exact slug comparison was not enough ───────────────────────────
 *
 * Because the two databases do not agree on what a slug looks like. The dev
 * copy of the scraped catalog has bare slugs — `torque`,
 * `front-airbags-srs` — and PRODUCTION has the same 81 rows with their
 * CATEGORY prefixed onto every one: `engine-torque`,
 * `safety-front-airbags-srs`, `external-equipment-sunroof`. One import ran
 * with the category in the key and the other did not.
 *
 * On an exact comparison that is the difference between 67 of 79 rows merging
 * and ONE of 81. The failure is not data loss — nothing is ever migrated — it
 * is worse to live with: the showroom would see "Torque" twice, once as their
 * own answered definition and once as a fresh template row, and ticking the
 * template's copy on the next car would create a SECOND definition. Two rows
 * for one fact, the showroom's cars split across both, and the browse facet
 * listing it twice. Exactly the duplication §35 exists to end, reintroduced by
 * the fix for it.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * Four candidates per definition, first match wins:
 *
 *   1. the slug itself
 *   2. the slug with its OWN category's name stripped off the front —
 *      derived from `category_name` on the row rather than guessed, so
 *      "engine-torque" is only ever shortened to "torque" for a row that
 *      says it is in Engine
 *   3. and 4. the same two with the hyphens removed, which is what closes
 *      `second-row-a-c-vents` against `second-row-ac-vents` — the same words
 *      split differently by whoever generated them
 *
 * A template entry can be claimed ONCE. Without that, `sunroof` and
 * `external-equipment-sunroof` on one showroom would both merge onto the same
 * entry and one of the two definitions would vanish from the checklist while
 * its cars still answered it.
 */
const slugify = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Hyphens removed, for comparing two spellings of the same words. */
const tighten = (value) => slugify(value).replace(/-/g, '');

/** The template, also keyed by its tightened slug. Built once. */
const TEMPLATE_BY_TIGHT = new Map(SPEC_TEMPLATE.map((s) => [tighten(s.slug), s]));

/**
 * The template entry a definition means, or null.
 *
 * `taken` is the set of slugs already claimed in this merge, so the caller
 * keeps one definition per entry.
 */
export function templateFor(def, taken = new Set()) {
  const slug = slugify(def?.slug);
  if (!slug) return null;

  const names = [def?.category_name?.en, def?.category_name?.ar].filter(Boolean);
  const candidates = [slug];

  for (const name of names) {
    const prefix = `${slugify(name)}-`;
    if (prefix.length > 1 && slug.startsWith(prefix)) candidates.push(slug.slice(prefix.length));
  }

  for (const candidate of candidates) {
    const hit = TEMPLATE_BY_SLUG.get(candidate);
    if (hit && !taken.has(hit.slug)) return hit;
  }
  for (const candidate of candidates) {
    const hit = TEMPLATE_BY_TIGHT.get(tighten(candidate));
    if (hit && !taken.has(hit.slug)) return hit;
  }

  return null;
}

/** How many entries the template holds, for the tab's own count. */
export const TEMPLATE_SIZE = SPEC_TEMPLATE.length;

/**
 * kind → the `display_type` the database already understands.
 *
 * This is the whole reason nothing downstream had to change. `yesno` is what
 * the old scraped rows used for a feature tick, and the car page, the compare
 * table and the browse facets all branch on these five values — so a checklist
 * built on `kind` writes rows that every existing reader already knows how to
 * render.
 */
export const DISPLAY_TYPE_OF_KIND = {
  check: 'yesno',
  number: 'numeric',
  choice: 'select',
  multi: 'multi',
  text: 'text',
  /**
   * A calendar value — "Warranty until", "First registered".
   *
   * Stored as the plain ISO date the input produces, so it sorts and compares
   * as a string without any parsing. It is a TYPE rather than a formatting
   * hint: the template already carries `warranty-until` as free text, which
   * is how one car reads "March 2027", another "2027-03-01" and a third
   * "بعد سنتين" — three answers nothing can order or filter.
   */
  date: 'date',
  /**
   * Several lines. "Service notes", "What was replaced".
   *
   * Distinct from `text` only in the control it gets, which is the whole
   * point: a one-line box invites a one-line answer, and a seller describing
   * a repair history in it writes nothing useful.
   */
  longtext: 'longtext',
};

/** And back again, for a row that exists in the catalog but not the template. */
export const KIND_OF_DISPLAY_TYPE = {
  yesno: 'check',
  numeric: 'number',
  select: 'choice',
  /* Its own kind rather than collapsing into `choice`. The scraped catalog
     has real multi rows — "Driving modes" is one — and rendering them as a
     single dropdown would make a car that offers four modes able to claim
     only one. */
  multi: 'multi',
  text: 'text',
  date: 'date',
  longtext: 'longtext',
};

export const kindOfDisplayType = (displayType) =>
  KIND_OF_DISPLAY_TYPE[String(displayType ?? '')] ?? 'text';

/**
 * A template entry as the row `spec_attributes` wants.
 *
 * Called when a seller ticks something their catalog has no definition for —
 * see ensureSpecDefinitions in db/queries/spec-catalog.js. The category's name
 * and icon are denormalised onto the row because that is how this table has
 * always stored a category (there is no categories table for specs, and
 * schema.sql explains why), so they are read from SPEC_CATEGORIES here rather
 * than being left for the caller to remember.
 */
export function definitionFromTemplate(entry, vendorId, sections = []) {
  /* The showroom's own heading for this section when they have renamed it —
     the denormalised category_name below is what the public car page prints,
     so a tick must write the name they chose and not the one shipped. */
  const resolved = resolveSections(sections);
  const cat =
    resolved.find((c) => c.key === entry.cat) ?? SPEC_CATEGORY_BY_KEY.get(entry.cat);

  return {
    slug: entry.slug,
    attribute_name: { ar: entry.ar, en: entry.en },
    attribute_sequence: sequenceOf(entry),
    category_name: cat ? { ar: cat.ar, en: cat.en } : { ar: 'أخرى', en: 'Other' },
    category_sequence: cat?.sequence ?? 999,
    /* The TOKEN columns, not the *_icon_url ones. See lib/spec-icons.js on why
       the URLs are no longer written or read. */
    icon: entry.icon ?? null,
    category_icon: cat?.icon ?? null,
    unit_code: entry.unit ?? null,
    display_type: DISPLAY_TYPE_OF_KIND[entry.kind] ?? 'text',
    /**
     * OFF, whatever the template entry says.
     *
     * `entry.card` marks the twelve the template considers card-worthy, and
     * it is still what the Add-to-card panel suggests — but a row created by
     * a TICK must not claim a card slot nobody asked for. There are only four
     * (CARD_LIMIT), and a seller who ticked Fuel type, Engine capacity,
     * Transmission and Mileage in the course of describing one car would have
     * spent all four before reaching the panel, then be refused the one they
     * actually wanted.
     *
     * So the card is chosen explicitly, in one place, and ticking a
     * specification only ever answers it.
     */
    show_on_card: false,
    is_key: Boolean(entry.key),
    active: true,
    created_by_vendor_id: vendorId,
    is_custom: false,
    approved: true,
  };
}

/**
 * An entry's position inside its category.
 *
 * Derived from the order it is written in this file rather than stored on each
 * entry, because a hand-maintained sequence number on 200 rows is a list
 * somebody renumbers wrongly the first time they insert one in the middle.
 * Steps of ten, so a definition an admin reorders by hand has somewhere to go.
 */
const INDEX_IN_CATEGORY = (() => {
  const seen = new Map();
  const out = new Map();
  for (const entry of SPEC_TEMPLATE) {
    const n = (seen.get(entry.cat) ?? 0) + 1;
    seen.set(entry.cat, n);
    out.set(entry.slug, n * 10);
  }
  return out;
})();

export const sequenceOf = (entry) => INDEX_IN_CATEGORY.get(entry.slug) ?? 9990;

/**
 * The checklist: the template and the showroom's own definitions, as ONE list
 * of categories.
 *
 * Three kinds of row come out of this, and the distinction is the whole point:
 *
 *   · a template entry the showroom HAS a definition for → the definition's
 *     id, so ticking it writes against the row every existing listing_specs
 *     row already points at. Nothing is migrated and nothing is duplicated.
 *   · a template entry with no definition yet → id `tpl:<slug>`, resolved to a
 *     real row by ensureSpecDefinitions only if the seller actually ticks it.
 *     A showroom that never mentions a wading depth never gets a row for one.
 *   · a definition that is NOT in the template → the showroom's own, or one of
 *     the near-duplicate scraped rows. Kept, shown in its own category, and
 *     marked `custom` so the checklist offers to clear it.
 *
 * Matching is on `slug`, lower-cased and trimmed, because that is the one
 * column both sides agree on; names are translated and drift.
 */
export function mergeTemplate(definitions = [], { locale = 'ar', sections = [] } = {}) {
  const t = (ar, en) => (locale === 'ar' ? ar : en);

  /* The headings, with this showroom's renames and additions applied. The
     template's ENTRIES are unaffected — an entry belongs to a section by key,
     and a rename does not change a key. */
  const resolved = resolveSections(sections);
  const sectionByKey = new Map(resolved.map((c) => [c.key, c]));

  /**
   * template slug → the showroom's definition that means it.
   *
   * Resolved through templateFor rather than by a direct slug lookup, because
   * the two live databases spell these differently — see the note on it. A
   * definition that matches nothing is not in this map and falls through to
   * the showroom's own section below.
   */
  const byTemplateSlug = new Map();
  const claimedBy = new Map();
  const taken = new Set();

  for (const def of definitions) {
    const entry = templateFor(def, taken);
    if (!entry) continue;
    taken.add(entry.slug);
    byTemplateSlug.set(entry.slug, def);
    claimedBy.set(def.id, entry.slug);
  }

  /** category key → the group being built. */
  const groups = new Map();
  const group = (key, name, icon, sequence, meta = null) => {
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name,
        icon,
        sequence,
        /* What the rail's edit control needs: whether this heading already has
           a row of its own, and whether it is one the application ships. */
        saved: Boolean(meta?.saved),
        custom: Boolean(meta?.custom),
        nameAr: meta?.ar ?? name,
        nameEn: meta?.en ?? name,
        items: [],
      });
    }
    return groups.get(key);
  };

  /* Every section the showroom has, in rail order — including an empty one
     they have just created, which is the thing §36's table exists to allow.
     Empty groups are dropped at the end, except the ones they made: a section
     that vanished the moment it was created would read as a failed save. */
  for (const cat of resolved) {
    group(cat.key, t(cat.ar, cat.en), cat.icon, cat.sequence, cat);
  }

  const used = new Set();

  for (const entry of SPEC_TEMPLATE) {
    const def = byTemplateSlug.get(entry.slug);
    if (def) used.add(entry.slug);

    const kind = def ? kindOfDisplayType(def.display_type) : entry.kind;

    group(entry.cat, t(entry.cat, entry.cat), null, 999).items.push({
      /* The id the checklist stores against. `tpl:` is deliberately not a uuid
         so save-listing can tell the two apart without a lookup. */
      id: def?.id ?? `tpl:${entry.slug}`,
      slug: entry.slug,
      name: t(entry.ar, entry.en),
      nameAr: entry.ar,
      nameEn: entry.en,
      kind,
      unit: entry.unit ? t(entry.unit.ar, entry.unit.en) : null,
      icon: def?.icon || entry.icon || null,
      /* The showroom's own flags win where a definition exists — they are
         editable from the checklist, and the template's value is only ever the
         starting point. */
      /* The row's OWN flag, never the template's suggestion. An unsaved entry
         that displayed as card-on would flip itself off the moment a tick
         created it (definitionFromTemplate writes false), which reads as the
         save having lost something. `card` survives as `suggested` below, for
         the panel to recommend with. */
      showOnCard: Boolean(def?.show_on_card),
      suggested: Boolean(entry.card),
      isKey: def ? Boolean(def.is_key) : Boolean(entry.key),
      /* `choices` comes from the template for an unsaved entry and from the
         catalog once a definition exists, because by then the showroom may
         have added an answer of their own. */
      choices: def?.options?.length
        ? def.options.map((o) => ({ id: o.id, name: o.name }))
        : (entry.choices ?? []).map((c) => ({ id: null, name: { ar: c.ar, en: c.en } })),
      fromTemplate: true,
      saved: Boolean(def),
      custom: false,
    });
  }

  /* Everything the showroom holds that the template does not name — or that
     a sibling row claimed first. */
  for (const def of definitions) {
    const slug = slugify(def.slug);
    if (!slug || claimedBy.has(def.id)) continue;

    /**
     * Where a row the template does not name goes.
     *
     * Its category is a NAME on the row, not a key — there is no categories
     * table for specifications — so it is matched back to a template section
     * by name in either language. A specification the showroom added
     * themselves carries a section name this file wrote, so it lands in that
     * section and reads as part of the sheet.
     *
     * Everything else goes into ONE catch-all rather than a section per name.
     * The scraped categories do not line up with the template's — "External
     * equipment", "Ease and comfort", "Structure and dimensions" — and keeping
     * each one made the rail nineteen sections long on this database, five of
     * them holding two or three leftover rows each. Worse, it buried the thing
     * the seller actually wants to do with them: these are the twelve
     * near-duplicates the scrape produced, and collecting them in one place is
     * what makes "clear the ones nothing uses" a job somebody can finish.
     *
     * They are NOT guessed into a template section. Moving somebody's answered
     * specifications under a heading they never chose would be a worse lie
     * than an honest "yours".
     */
    const catName = def.category_name?.en || def.category_name?.ar || 'Other';
    const known = resolved.find((c) => c.en === catName || c.ar === catName);

    group(
      known?.key ?? OWN_SECTION.key,
      known ? t(known.ar, known.en) : t(OWN_SECTION.ar, OWN_SECTION.en),
      known?.icon ?? OWN_SECTION.icon,
      known?.sequence ?? OWN_SECTION.sequence,
      known ?? null,
    ).items.push({
      id: def.id,
      slug,
      name: def.attribute_name?.[locale] || def.attribute_name?.en || def.attribute_name?.ar || slug,
      nameAr: def.attribute_name?.ar ?? '',
      nameEn: def.attribute_name?.en ?? '',
      kind: kindOfDisplayType(def.display_type),
      unit: def.unit_code ? (def.unit_code[locale] ?? def.unit_code.en ?? def.unit_code.ar ?? null) : null,
      icon: def.icon || null,
      showOnCard: Boolean(def.show_on_card),
      isKey: Boolean(def.is_key),
      choices: (def.options ?? []).map((o) => ({ id: o.id, name: o.name })),
      fromTemplate: false,
      saved: true,
      custom: true,
    });
  }

  return [...groups.values()]
    /* An empty section is dropped unless the showroom made it — see above. */
    .filter((g) => g.items.length || g.custom)
    .sort((a, b) => a.sequence - b.sequence || a.key.localeCompare(b.key));
}
