/**
 * The questions nobody has written yet.
 *
 * Two FAQ lists exist on this marketplace — a showroom's questions about ONE
 * car (listing_faqs) and the platform's own (site_faqs) — and both start
 * empty. An empty FAQ is not a neutral state: the public page renders nothing,
 * the footer carries a link to a blank page, and the one piece of content on a
 * car page that can rank for a whole typed question is absent from every car.
 * So each list has five fallbacks, used only while the real list is empty.
 *
 * ── Every fallback answer has to be TRUE ───────────────────────────────────
 *
 * This is the whole constraint, and it is why the car's set is a FUNCTION
 * rather than a constant. "Does the price include VAT?" has a real answer per
 * listing (`vat_included`), and a generic "yes, prices include VAT" printed
 * under a car where it is false is worse than no FAQ at all — it is a price
 * the buyer was told and will not get.
 *
 * So nothing here asserts anything this platform cannot know: the answers are
 * about HOW THE MARKETPLACE WORKS (a request reaches the showroom, payment
 * happens at the showroom, there is no cart) plus the handful of facts the
 * listing row actually carries. Anything that depends on the individual car —
 * service history, accidents, previous owners — is left to the showroom, which
 * is the only party that knows.
 *
 * ── They are a STARTING POINT, not a substitute ────────────────────────────
 *
 * Both editors can load them as real, editable rows (see `faqEditorRows`), and
 * the moment a showroom or an admin saves anything the fallback stops being
 * used. That is the intended path: somebody edits five filled rows instead of
 * inventing five from an empty box.
 */

const pair = (id, qAr, qEn, aAr, aEn) => ({
  id,
  question: { ar: qAr, en: qEn },
  answer: { ar: aAr, en: aEn },
  /* Marks a row as not-from-the-database, for two readers: the editors, so
     loading them is not mistaken for editing saved rows, and the structured
     data, which must not mark up boilerplate repeated across every page. */
  fallback: true,
});

/**
 * The platform's own five.
 *
 * Deliberately the five things somebody asks BEFORE they trust a marketplace
 * with a car purchase, in the order they ask them: what this site actually
 * does, what it costs them, how they reach a seller, whether the seller is
 * real, and how to become one.
 */
export const SITE_FAQ_FALLBACK = [
  pair(
    'site-fallback-buying',
    'هل أشتري السيارة من خلال الموقع؟',
    'Do I buy the car through this site?',
    'لا. السوق يصلك بالمعرض الذي يعرض السيارة، والاتفاق والدفع وتسليم السيارة تتم مع المعرض نفسه. لا تُدفع أي مبالغ عبر الموقع.',
    'No. The marketplace puts you in touch with the showroom offering the car; the agreement, the payment and the handover all happen with that showroom. No money is taken through this site.'
  ),
  pair(
    'site-fallback-free',
    'هل استخدام الموقع مجاني للمشتري؟',
    'Is the site free for buyers?',
    'نعم، مجاني تماماً. تستطيع البحث ومقارنة السيارات وإرسال طلب للمعرض دون أي رسوم. المعارض هي التي تدفع للمنصة.',
    'Yes, entirely free. You can search, compare cars and send a request to a showroom without any fee. The showrooms are the ones who pay the platform.'
  ),
  pair(
    'site-fallback-contact',
    'كيف أتواصل مع المعرض؟',
    'How do I contact a showroom?',
    'من صفحة السيارة، أرسل طلباً. يصل المعرض اسمك ورقمك وما كتبته، فيتواصل معك مباشرة. تستطيع متابعة الطلب في «طلباتي» وإلغاؤه في أي وقت.',
    'From the car’s page, send a request. The showroom receives your name, your number and whatever you wrote, and contacts you directly. You can follow the request in “My requests”, and cancel it at any time.'
  ),
  pair(
    'site-fallback-verified',
    'هل المعارض موثّقة؟',
    'Are the showrooms verified?',
    'كل معرض يتقدّم بطلب ويُراجع قبل أن يُنشر، ويظهر وسم التوثيق في صفحته. ومع ذلك افحص السيارة وأوراقها بنفسك قبل الشراء — الموقع لا يفحص السيارات.',
    'Every showroom applies and is reviewed before it is published, and a verified badge appears on its page. Even so, inspect the car and its paperwork yourself before buying — the site does not inspect cars.'
  ),
  pair(
    'site-fallback-sell',
    'كيف أعرض سياراتي كمعرض؟',
    'How do I list my cars as a showroom?',
    'من «انضم كمعرض». بعد الموافقة تحصل على لوحة تحكم تضيف فيها سياراتك وتستقبل الطلبات، وتبدأ بفترة تجريبية مجانية.',
    'Through “Become a vendor”. Once approved you get a dashboard where you add your cars and receive requests, and it starts with a free trial period.'
  ),
];

/**
 * One car's five, resolved against the listing in front of the buyer.
 *
 * `facts` is read straight off the listing row — see listingDetailApi — so
 * every answer below is either about the marketplace itself or about a value
 * this car actually carries. Where a fact is absent the answer says to ask the
 * showroom rather than guessing on their behalf.
 */
export function listingFaqFallback(facts = {}) {
  const {
    vatIncluded = true,
    hasTestDrive = false,
    warrantyMonths = null,
    city = '',
    sold = false,
  } = facts;

  const vat = vatIncluded
    ? {
        ar: 'السعر المعروض يشمل ضريبة القيمة المضافة. تبقى رسوم نقل الملكية والتأمين على المشتري، وهي ليست جزءاً من السعر.',
        en: 'The price shown includes VAT. Transfer fees and insurance are on the buyer and are not part of the price.',
      }
    : {
        ar: 'السعر المعروض قبل ضريبة القيمة المضافة. أكّد المبلغ النهائي مع المعرض قبل الاتفاق.',
        en: 'The price shown is before VAT. Confirm the final figure with the showroom before you agree to anything.',
      };

  const viewing = {
    ar:
      `نعم. أرسل طلباً من هذه الصفحة ورتّب موعداً مع المعرض لرؤية السيارة${city ? ` في ${city}` : ''}.` +
      (hasTestDrive ? ' وهذا المعرض يتيح تجربة القيادة.' : ''),
    en:
      `Yes. Send a request from this page and arrange a time with the showroom to see the car${city ? ` in ${city}` : ''}.` +
      (hasTestDrive ? ' This showroom also offers a test drive.' : ''),
  };

  const availability = sold
    ? {
        ar: 'هذه السيارة بيعت. الصفحة باقية للرجوع إليها، ويمكنك تصفّح سيارات المعرض الأخرى أو السيارات المشابهة أدناه.',
        en: 'This car has been sold. The page is kept for reference — browse the showroom’s other cars, or the similar ones below.',
      }
    : {
        ar: 'السيارة معروضة الآن. المعارض تحدّث إعلاناتها بنفسها، ولتأكيد التوفّر في اللحظة نفسها أرسل طلباً وسيردّ عليك المعرض.',
        en: 'It is listed as available. Showrooms keep their own listings up to date; to confirm availability right now, send a request and the showroom will come back to you.',
      };

  const warranty =
    Number(warrantyMonths) > 0
      ? {
          ar: `نعم، يذكر المعرض ضماناً لمدة ${warrantyMonths} شهراً. اطلب تفاصيل ما يغطيه كتابةً قبل الشراء.`,
          en: `Yes — the showroom states a ${warrantyMonths}-month warranty. Ask for what it covers in writing before you buy.`,
        }
      : {
          ar: 'لم يُذكر ضمان في هذا الإعلان. اسأل المعرض عن الضمان المتبقي من الوكيل وعن سجلّ الصيانة قبل الاتفاق.',
          en: 'No warranty is stated on this listing. Ask the showroom about any remaining manufacturer warranty, and about the service history, before you agree.',
        };

  return [
    pair(
      'car-fallback-contact',
      'كيف أستفسر عن هذه السيارة؟',
      'How do I ask about this car?',
      'أرسل طلباً من هذه الصفحة. يصل المعرض اسمك ورقمك مع سؤالك فيتواصل معك مباشرة — لا حاجة للبحث عن رقم.',
      'Send a request from this page. The showroom receives your name and number along with your question and contacts you directly — there is no number to go hunting for.'
    ),
    pair('car-fallback-vat', 'هل السعر يشمل الضريبة؟', 'Does the price include VAT?', vat.ar, vat.en),
    pair(
      'car-fallback-viewing',
      'هل أستطيع رؤية السيارة قبل الشراء؟',
      'Can I see the car before buying?',
      viewing.ar,
      viewing.en
    ),
    pair('car-fallback-available', 'هل السيارة متاحة؟', 'Is the car still available?', availability.ar, availability.en),
    pair('car-fallback-warranty', 'هل عليها ضمان؟', 'Is there a warranty?', warranty.ar, warranty.en),
  ];
}

/**
 * The public list, or the fallback while it is empty.
 *
 * `isFallback` travels with it because the caller has to know: the FAQPage
 * markup is emitted for a real list and withheld for boilerplate — see
 * FaqSection — and a page may want to say where the answers came from.
 */
export function faqsOrFallback(faqs, fallback) {
  const rows = Array.isArray(faqs) ? faqs : [];
  if (rows.length) return { faqs: rows, isFallback: false };
  return { faqs: fallback ?? [], isFallback: true };
}

/**
 * The same five, in the shape the editors hold a row in.
 *
 * Four flat strings rather than two bilingual objects, because that is what
 * FaqListEditor and both save actions already speak. `_k` is a stable React
 * key: rows are reordered in place, and a key derived from the index would
 * leave each field's own state behind when two rows swap.
 */
export function faqEditorRows(set) {
  return (set ?? []).map((f, i) => ({
    _k: `seed-${i}-${f.id}`,
    questionAr: f.question?.ar ?? '',
    questionEn: f.question?.en ?? '',
    answerAr: f.answer?.ar ?? '',
    answerEn: f.answer?.en ?? '',
    active: true,
  }));
}

/* A counter rather than a uuid: this only has to be unique within one open
   editor, and a monotonic number is readable in the DOM while debugging. */
let seq = 0;

/** A blank row, with the stable key the list needs to survive a reorder. */
export function newFaqRow() {
  seq += 1;
  return {
    _k: `new-${seq}`,
    questionAr: '',
    questionEn: '',
    answerAr: '',
    answerEn: '',
    active: true,
  };
}

/**
 * Saved rows, flattened for the editor.
 *
 * Both editors seed from this so neither has to remember the `_k` rule, and so
 * the flattening lives in one place instead of being written out twice — the
 * listing form and the admin screen had the same five lines each.
 */
export function savedFaqRows(faqs) {
  return (faqs ?? []).map((f, i) => ({
    _k: f.id ? `row-${f.id}` : `row-${i}`,
    questionAr: f.question?.ar ?? '',
    questionEn: f.question?.en ?? '',
    answerAr: f.answer?.ar ?? '',
    answerEn: f.answer?.en ?? '',
    active: f.active !== false,
  }));
}
