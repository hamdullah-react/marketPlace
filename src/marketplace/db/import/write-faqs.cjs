#!/usr/bin/env node
/**
 * Writes five questions for every car, built from THAT car's own data.
 *
 *   node src/marketplace/db/import/write-faqs.cjs [--vendor=sauda] [--dry]
 *
 * ── Why generated and not scraped ──────────────────────────────────────────
 *
 * alromaihcars.com has no stored FAQ to copy. Its car page imports
 * generateCarFAQSchema() and builds the questions at render time from the
 * car's own fields — so there was never a table, a field or an endpoint to
 * read. This does the same thing, once, into listing_faqs, so a showroom can
 * edit what it says.
 *
 * ── Every answer has to be TRUE of THIS car ────────────────────────────────
 *
 * The rule lib/faq.js states, and the reason this reads the specs rather than
 * writing five sentences: "the price includes VAT" under a car where it does
 * not is a price the buyer was told and will not get. So each question is a
 * CANDIDATE with a guard, and one that has no data to answer from is skipped
 * rather than answered vaguely. The first five that survive are written.
 *
 * That also makes them differ car by car, which is the point — five identical
 * questions under twenty cars is the boilerplate this replaced.
 *
 * ── Not the dealership's copy ──────────────────────────────────────────────
 *
 * Their generator answers with "contact us for the best price" and points
 * servicing at Alromaih's own centres. This is a marketplace: the seller is
 * whichever showroom listed the car, so the answers talk about the showroom
 * and never promise anything on its behalf.
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const VENDOR_SLUG = flag('vendor', 'sauda');
const ENV_FILE = flag('env', 'vps') === 'local' ? '.env.local' : '.env.vps';
const DRY = args.includes('--dry');
const WANT = 5;

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
const URL_BASE = env.MARKETPLACE_SUPABASE_URL;
const KEY = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error(`No credentials in ${ENV_FILE}.`); process.exit(1); }

const enc = encodeURIComponent;
async function rest(p, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${p}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const select = (p) => rest(p);

/**
 * Read every row, not the first thousand.
 *
 * This instance runs with PGRST_DB_MAX_ROWS=1000, so `limit=5000` is accepted
 * and silently capped — the request succeeds, the array looks fine, and the
 * rows past the cap are simply absent. It cost one car its specifications and
 * showed up only as "4 questions" where every other car had five, which is
 * exactly the kind of miss a limit nobody sees produces.
 */
async function selectAll(path, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const page = await rest(`${path}&limit=${pageSize}&offset=${from}`);
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}
const insert = (t, r) => rest(t, { method: 'POST', body: r, prefer: 'return=representation' });

/** "Not specified" in either language is not an answer. */
const EMPTY = /^(غير محدد|غير متوفر|not specified|n\/?a|none|-)$/i;
const usable = (v) => typeof v === 'string' && v.trim() && !EMPTY.test(v.trim());

const money = (n, cur, loc) =>
  new Intl.NumberFormat(loc === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency', currency: cur || 'SAR', maximumFractionDigits: 0,
  }).format(Number(n) || 0);

async function main() {
  const [vendor] = await select(`vendors?slug=eq.${enc(VENDOR_SLUG)}&select=id,slug,name,city&limit=1`);
  if (!vendor) throw new Error(`No showroom "${VENDOR_SLUG}".`);
  const V = vendor.id;
  const shopAr = vendor.name?.ar || vendor.name?.en || 'المعرض';
  const shopEn = vendor.name?.en || vendor.name?.ar || 'the showroom';

  console.log(`Target:   ${URL_BASE} (${ENV_FILE})`);
  console.log(`Showroom: ${vendor.slug}${DRY ? '   — DRY RUN' : ''}\n`);

  const listings = await select(
    `listings?vendor_id=eq.${V}&select=id,slug,name,price,currency,vat_included,available_on_request,city,state,warranty_months,has_test_drive,attributes,` +
    `car_brands(name),car_models(name),car_years(value),car_trims(name)&limit=500`
  );

  const specRows = await selectAll(
    'listing_specs?select=listing_id,value,display_value,spec_attributes!inner(slug)'
  );
  const specsByListing = new Map();
  for (const r of specRows) {
    if (!specsByListing.has(r.listing_id)) specsByListing.set(r.listing_id, {});
    const label = r.value?.label ?? {};
    specsByListing.get(r.listing_id)[r.spec_attributes.slug] = {
      ar: usable(label.ar) ? label.ar : (usable(r.display_value) ? r.display_value : null),
      en: usable(label.en) ? label.en : (usable(r.display_value) ? r.display_value : null),
    };
  }

  const variantRows = await selectAll('listing_variants?select=listing_id,car_colors(name)&order=id');
  const coloursByListing = new Map();
  for (const v of variantRows) {
    if (!v.car_colors?.name) continue;
    if (!coloursByListing.has(v.listing_id)) coloursByListing.set(v.listing_id, []);
    coloursByListing.get(v.listing_id).push(v.car_colors.name);
  }

  let written = 0, short = 0;

  for (const l of listings) {
    const S = specsByListing.get(l.id) ?? {};
    /* Either slug. Three specs were renamed to the canonical names the
       browse filters look for (`transmission`, `fuel-type`, `seats`); a
       catalog that still carries the category-prefixed ones must keep
       answering, so both are tried. */
    const spec = (slugs, lang) => {
      for (const k of [].concat(slugs)) if (S[k]?.[lang]) return S[k][lang];
      return null;
    };
    const has = (slugs) => [].concat(slugs).some((k) => S[k]?.ar || S[k]?.en);

    const nameAr = l.name?.ar || l.name?.en || 'هذه السيارة';
    const nameEn = l.name?.en || l.name?.ar || 'this car';
    const year = l.car_years?.value ?? null;
    const colours = coloursByListing.get(l.id) ?? [];
    const sold = l.state === 'sold_out';
    const cityAr = l.city || vendor.city || '';
    const cityEn = l.city || vendor.city || '';

    /* The pool, richest first. Each entry is skipped when its `when` is false,
       so a car missing a spec gets the next question instead of a vague one. */
    const pool = [
      // 1. Price — every car has one.
      {
        when: Number(l.price) > 0,
        q: { ar: `كم سعر ${nameAr}؟`, en: `How much is the ${nameEn}?` },
        a: {
          ar: `سعر ${nameAr} هو ${money(l.price, l.currency, 'ar')}${l.vat_included ? ' شامل ضريبة القيمة المضافة' : ' قبل ضريبة القيمة المضافة'}. رسوم نقل الملكية والتأمين على المشتري وليست جزءاً من السعر، وأي خصم أو تفاصيل التمويل تُتفق مع ${shopAr} مباشرة.`,
          en: `The ${nameEn} is listed at ${money(l.price, l.currency, 'en')}${l.vat_included ? ', VAT included' : ', before VAT'}. Transfer fees and insurance are on the buyer and are not part of the price; any discount or finance terms are agreed with ${shopEn} directly.`,
        },
      },
      // 2. Engine and fuel.
      {
        when: has(['fuel-type', 'engine-fuel-type']) || has('engine-engine-capacity') || has('engine-maximum-power'),
        q: { ar: `ما مواصفات محرك ${nameAr}؟`, en: `What engine does the ${nameEn} have?` },
        a: {
          ar: [
            spec(['fuel-type', 'engine-fuel-type'], 'ar') && `نوع الوقود: ${spec(['fuel-type', 'engine-fuel-type'], 'ar')}.`,
            spec('engine-engine-capacity', 'ar') && `سعة المحرك: ${spec('engine-engine-capacity', 'ar')}.`,
            spec('engine-maximum-power', 'ar') && `أقصى قوة: ${spec('engine-maximum-power', 'ar')}.`,
            spec('engine-torque', 'ar') && `عزم الدوران: ${spec('engine-torque', 'ar')}.`,
          ].filter(Boolean).join(' '),
          en: [
            spec(['fuel-type', 'engine-fuel-type'], 'en') && `Fuel type: ${spec(['fuel-type', 'engine-fuel-type'], 'en')}.`,
            spec('engine-engine-capacity', 'en') && `Engine capacity: ${spec('engine-engine-capacity', 'en')}.`,
            spec('engine-maximum-power', 'en') && `Maximum power: ${spec('engine-maximum-power', 'en')}.`,
            spec('engine-torque', 'en') && `Torque: ${spec('engine-torque', 'en')}.`,
          ].filter(Boolean).join(' '),
        },
      },
      // 3. Gearbox and drive.
      {
        when: has(['transmission', 'transmission-transmission']) || has('transmission-drive-type'),
        q: { ar: `ما نوع ناقل الحركة في ${nameAr}؟`, en: `What transmission does the ${nameEn} have?` },
        a: {
          ar: [
            spec(['transmission', 'transmission-transmission'], 'ar') && `ناقل الحركة: ${spec(['transmission', 'transmission-transmission'], 'ar')}.`,
            spec('transmission-drive-type', 'ar') && `نظام الدفع: ${spec('transmission-drive-type', 'ar')}.`,
            spec('transmission-driving-mode', 'ar') && `أوضاع القيادة: ${spec('transmission-driving-mode', 'ar')}.`,
          ].filter(Boolean).join(' '),
          en: [
            spec(['transmission', 'transmission-transmission'], 'en') && `Transmission: ${spec(['transmission', 'transmission-transmission'], 'en')}.`,
            spec('transmission-drive-type', 'en') && `Drive type: ${spec('transmission-drive-type', 'en')}.`,
            spec('transmission-driving-mode', 'en') && `Driving modes: ${spec('transmission-driving-mode', 'en')}.`,
          ].filter(Boolean).join(' '),
        },
      },
      // 4. How many it carries.
      {
        when: has(['seats', 'structure-and-dimensions-seats']),
        q: { ar: `كم عدد مقاعد ${nameAr}؟`, en: `How many seats does the ${nameEn} have?` },
        a: {
          ar: `${nameAr} بعدد مقاعد ${spec(['seats', 'structure-and-dimensions-seats'], 'ar')}.` +
            (spec('seats-seat-upholstery', 'ar') ? ` تنجيد المقاعد: ${spec('seats-seat-upholstery', 'ar')}.` : ''),
          en: `The ${nameEn} seats ${spec(['seats', 'structure-and-dimensions-seats'], 'en')}.` +
            (spec('seats-seat-upholstery', 'en') ? ` Upholstery: ${spec('seats-seat-upholstery', 'en')}.` : ''),
        },
      },
      // 5. Colours actually offered on THIS listing.
      {
        when: colours.length > 0,
        q: { ar: `ما الألوان المتاحة من ${nameAr}؟`, en: `What colours is the ${nameEn} available in?` },
        a: {
          ar: `الألوان المعروضة على هذا الإعلان: ${colours.map((c) => c.ar || c.en).filter(Boolean).join('، ')}. توفّر أي لون يُؤكَّد مع ${shopAr} قبل الاتفاق.`,
          en: `The colours listed for this car are ${colours.map((c) => c.en || c.ar).filter(Boolean).join(', ')}. Confirm availability of any one of them with ${shopEn} before you agree to anything.`,
        },
      },
      // 6. Safety, when the sheet says something concrete.
      {
        when: has('safety-front-airbags-srs') || has('safety-anti-lock-braking-system-abs'),
        q: { ar: `ما تجهيزات السلامة في ${nameAr}؟`, en: `What safety equipment does the ${nameEn} have?` },
        a: {
          ar: [
            spec('safety-front-airbags-srs', 'ar') && `الوسائد الهوائية الأمامية: ${spec('safety-front-airbags-srs', 'ar')}.`,
            spec('safety-anti-lock-braking-system-abs', 'ar') && `نظام منع انغلاق المكابح (ABS): ${spec('safety-anti-lock-braking-system-abs', 'ar')}.`,
            spec('safety-tire-pressure-monitoring-system-tpms', 'ar') && `مراقبة ضغط الإطارات: ${spec('safety-tire-pressure-monitoring-system-tpms', 'ar')}.`,
          ].filter(Boolean).join(' '),
          en: [
            spec('safety-front-airbags-srs', 'en') && `Front airbags: ${spec('safety-front-airbags-srs', 'en')}.`,
            spec('safety-anti-lock-braking-system-abs', 'en') && `ABS: ${spec('safety-anti-lock-braking-system-abs', 'en')}.`,
            spec('safety-tire-pressure-monitoring-system-tpms', 'en') && `Tyre-pressure monitoring: ${spec('safety-tire-pressure-monitoring-system-tpms', 'en')}.`,
          ].filter(Boolean).join(' '),
        },
      },
      // 7. Running cost, where the sheet gives a figure.
      {
        when: has('engine-fuel-consumption'),
        q: { ar: `كم يستهلك ${nameAr} من الوقود؟`, en: `What is the fuel consumption of the ${nameEn}?` },
        a: {
          ar: `استهلاك الوقود المعلن: ${spec('engine-fuel-consumption', 'ar')}. الرقم من بيانات الصانع، والاستهلاك الفعلي يختلف بحسب القيادة والطريق والحمولة.`,
          en: `The quoted fuel consumption is ${spec('engine-fuel-consumption', 'en')}. That figure is the manufacturer's; real consumption varies with how and where it is driven.`,
        },
      },
      // 8. Seeing it — always answerable.
      {
        when: true,
        q: { ar: `هل يمكنني معاينة ${nameAr} قبل الشراء؟`, en: `Can I see the ${nameEn} before buying?` },
        a: {
          ar: sold
            ? `هذه السيارة مُباعة، ولم تعد متاحة للمعاينة. تواصل مع ${shopAr} لمعرفة ما إذا كان يتوفر مثلها.`
            : `نعم. أرسل طلباً من هذه الصفحة وسيتواصل معك ${shopAr} لترتيب موعد${cityAr ? ` في ${cityAr}` : ''}.` +
              (l.has_test_drive ? ' وهذا المعرض يتيح تجربة القيادة.' : ''),
          en: sold
            ? `This car has been sold and is no longer available to view. Contact ${shopEn} to ask whether another like it is in stock.`
            : `Yes. Send a request from this page and ${shopEn} will arrange a time${cityEn ? ` in ${cityEn}` : ''}.` +
              (l.has_test_drive ? ' This showroom also offers a test drive.' : ''),
        },
      },
      // 9. Warranty, only where a real number exists.
      {
        when: Number(l.warranty_months) > 0,
        q: { ar: `هل ${nameAr} مشمولة بضمان؟`, en: `Does the ${nameEn} come with a warranty?` },
        a: {
          ar: `نعم، الضمان المذكور لهذا الإعلان ${l.warranty_months} شهراً. تفاصيل ما يغطيه تُؤخذ من ${shopAr} كتابةً عند الشراء.`,
          en: `Yes — the warranty stated on this listing is ${l.warranty_months} months. Get what it covers in writing from ${shopEn} at purchase.`,
        },
      },
      // 10. New or used — recorded on every listing, so this is the backstop
      //     that keeps a sparsely-specced car from falling short of five.
      {
        when: Boolean(l.attributes?.condition),
        q: { ar: `هل ${nameAr} جديدة أم مستعملة؟`, en: `Is the ${nameEn} new or used?` },
        a: {
          ar: l.attributes.condition === 'new'
            ? `هذا الإعلان لسيارة جديدة${year ? ` موديل ${year}` : ''} معروضة لدى ${shopAr}. اطلب الأوراق والفحص قبل الاتفاق كما تفعل مع أي شراء.`
            : `هذا الإعلان لسيارة مستعملة${year ? ` موديل ${year}` : ''} معروضة لدى ${shopAr}. اطلب سجل الصيانة وتقرير الفحص قبل الاتفاق.`,
          en: l.attributes.condition === 'new'
            ? `This listing is a new${year ? ` ${year}` : ''} car offered by ${shopEn}. Ask for the paperwork and an inspection before agreeing, as with any purchase.`
            : `This listing is a used${year ? ` ${year}` : ''} car offered by ${shopEn}. Ask for the service history and an inspection report before agreeing.`,
        },
      },
      // 11. Wheels, which the sheet carries for almost every car.
      {
        when: has('structure-and-dimensions-wheels-size'),
        q: { ar: `ما مقاس جنوط ${nameAr}؟`, en: `What wheel size does the ${nameEn} have?` },
        a: {
          ar: `مقاس الجنوط المذكور: ${spec('structure-and-dimensions-wheels-size', 'ar')}.` +
            (spec('structure-and-dimensions-steering-adjustment', 'ar') ? ` تعديل المقود: ${spec('structure-and-dimensions-steering-adjustment', 'ar')}.` : ''),
          en: `The listed wheel size is ${spec('structure-and-dimensions-wheels-size', 'en')}.` +
            (spec('structure-and-dimensions-steering-adjustment', 'en') ? ` Steering adjustment: ${spec('structure-and-dimensions-steering-adjustment', 'en')}.` : ''),
        },
      },
      // 12. Model year, when the catalog has one.
      {
        when: Boolean(year),
        q: { ar: `ما موديل سنة ${nameAr}؟`, en: `What model year is the ${nameEn}?` },
        a: {
          ar: `هذا الإعلان لموديل ${year}${l.car_trims?.name?.ar ? ` من فئة ${l.car_trims.name.ar}` : ''}. تأكّد من مطابقة السنة في الاستمارة قبل إتمام الشراء.`,
          en: `This listing is a ${year} model${l.car_trims?.name?.en ? `, ${l.car_trims.name.en} trim` : ''}. Check the year on the registration matches before completing a purchase.`,
        },
      },
    ];

    const chosen = pool
      .filter((c) => c.when)
      .filter((c) => (c.a.ar || '').trim() && (c.a.en || '').trim())
      .slice(0, WANT);

    if (chosen.length < WANT) short += 1;

    if (DRY) {
      console.log(`  ${(l.slug ?? l.id).slice(0, 44).padEnd(46)} ${chosen.length} question(s)`);
      written += chosen.length;
      continue;
    }

    await rest(`listing_faqs?listing_id=eq.${l.id}`, { method: 'DELETE' });
    const rows = chosen.map((c, i) => ({
      listing_id: l.id,
      vendor_id: V,
      question: c.q,
      answer: c.a,
      sort_order: i,
      active: true,
    }));
    if (rows.length) await insert('listing_faqs', rows);

    written += rows.length;
    console.log(`  ${(l.slug ?? l.id).slice(0, 44).padEnd(46)} ${rows.length} question(s)`);
  }

  console.log(`\n${DRY ? 'Would write' : 'Wrote'} ${written} question(s) across ${listings.length} car(s).`);
  if (short) console.log(`${short} car(s) had data for fewer than ${WANT} — those were left shorter rather than padded.`);
}

main().catch((err) => { console.error(`\nFailed: ${err.message}`); process.exit(1); });
