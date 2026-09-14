/**
 * The starter lead form — what a showroom gets before it has decided anything.
 *
 * ── Why a template at all ───────────────────────────────────────────────────
 *
 * A seller who opens the builder to an empty list has to invent a lead form
 * from nothing, and most will add two questions and stop. The result is a
 * pipeline full of rows that say a name and a phone number, which is the
 * position they were in before the builder existed.
 *
 * This is what a competent salesperson asks on a first call, written down: how
 * soon, how they are paying, what they are driving now, and when to ring. Every
 * question earns its place by changing what the seller does next — a cash buyer
 * this week is a different morning from a finance enquiry in three months.
 *
 * ── It is a STARTING POINT, not a standard ──────────────────────────────────
 *
 * Installed on request, never silently, and every field is then the seller's to
 * rename, reorder, resize, move between sections, switch off or delete. A
 * finance broker will want employer and monthly income; a classic-car dealer
 * will throw out the trade-in section entirely. Neither is wrong.
 *
 * Nothing here is REQUIRED except the two questions that decide whether a lead
 * is worth calling today. A required field is a wall a buyer can bounce off,
 * and a showroom would rather have a half-filled lead than no lead.
 *
 * ── Keys are stable and hand-written ────────────────────────────────────────
 *
 * `field_key` is what answers are filed under, so these are chosen once and
 * never generated. That also makes installing twice a no-op: the second run
 * matches the existing keys and skips them, rather than producing
 * "budget" and "budget_2".
 */

export const LEAD_FORM_TEMPLATE = {
  /**
   * Three sections, because nine questions in one column is a form people
   * abandon halfway. Ordered as the conversation actually goes: what you want,
   * what you are bringing, how to reach you.
   */
  tabs: [
    { key: 'requirement', label: { ar: 'ما تبحث عنه', en: 'What you want' } },
    { key: 'tradein', label: { ar: 'سيارتك الحالية', en: 'Your current car' } },
    { key: 'contact', label: { ar: 'التواصل', en: 'Getting in touch' } },
  ],

  fields: [
    /* ── What they want ─────────────────────────────────────────────────── */
    {
      field_key: 'purchase_timeframe',
      tab: 'requirement',
      type: 'select',
      required: true,
      width: 'half',
      label: { ar: 'متى تنوي الشراء؟', en: 'When are you looking to buy?' },
      // The single most useful question on the form. It is what sorts a
      // morning's callbacks, and it is one tap to answer.
      help: {
        ar: 'يساعدنا على ترتيب أولوية طلبك.',
        en: 'Helps us know how quickly to get back to you.',
      },
      options: [
        { ar: 'خلال أيام', en: 'Within days' },
        { ar: 'خلال شهر', en: 'Within a month' },
        { ar: 'خلال ٣ أشهر', en: 'Within 3 months' },
        { ar: 'أستطلع فقط', en: 'Just researching' },
      ],
    },
    {
      field_key: 'payment_method',
      tab: 'requirement',
      type: 'radio',
      required: true,
      width: 'half',
      label: { ar: 'طريقة الدفع', en: 'How are you paying?' },
      // Chips rather than a dropdown: three short options, all worth seeing at
      // once, and it decides whether a finance desk is involved at all.
      options: [
        { ar: 'كاش', en: 'Cash' },
        { ar: 'تمويل بنكي', en: 'Bank finance' },
        { ar: 'تقسيط', en: 'Instalments' },
      ],
    },
    {
      field_key: 'budget',
      tab: 'requirement',
      type: 'number',
      width: 'half',
      label: { ar: 'ميزانيتك التقريبية', en: 'Your approximate budget' },
      placeholder: { ar: 'مثال: ٨٥٠٠٠', en: 'e.g. 85000' },
      help: { ar: 'بالريال. تقريبي يكفي.', en: 'In SAR. A rough figure is fine.' },
    },
    {
      field_key: 'finance_bank',
      tab: 'requirement',
      type: 'text',
      width: 'half',
      label: { ar: 'البنك المفضل (إن وُجد)', en: 'Preferred bank (if any)' },
      placeholder: { ar: 'الراجحي، الأهلي…', en: 'Al Rajhi, SNB…' },
    },

    /* ── What they are bringing ─────────────────────────────────────────── */
    {
      field_key: 'has_tradein',
      tab: 'tradein',
      type: 'checkbox',
      width: 'full',
      label: { ar: 'لديّ سيارة أرغب في مبادلتها', en: 'I have a car to trade in' },
    },
    {
      field_key: 'tradein_car',
      tab: 'tradein',
      type: 'text',
      width: 'half',
      label: { ar: 'السيارة الحالية', en: 'Current car' },
      placeholder: { ar: 'كامري ٢٠١٩', en: 'Camry 2019' },
    },
    {
      field_key: 'tradein_km',
      tab: 'tradein',
      type: 'number',
      width: 'half',
      label: { ar: 'الممشى (كم)', en: 'Mileage (km)' },
      placeholder: { ar: 'مثال: ٩٥٠٠٠', en: 'e.g. 95000' },
    },

    /* ── How to reach them ──────────────────────────────────────────────── */
    {
      field_key: 'city',
      tab: 'contact',
      type: 'text',
      width: 'half',
      label: { ar: 'مدينتك', en: 'Your city' },
      placeholder: { ar: 'الرياض', en: 'Riyadh' },
    },
    {
      field_key: 'best_time',
      tab: 'contact',
      type: 'select',
      width: 'half',
      label: { ar: 'أفضل وقت للاتصال', en: 'Best time to call' },
      options: [
        { ar: 'صباحاً', en: 'Morning' },
        { ar: 'بعد الظهر', en: 'Afternoon' },
        { ar: 'مساءً', en: 'Evening' },
        { ar: 'أي وقت', en: 'Any time' },
      ],
    },
    {
      field_key: 'test_drive',
      tab: 'contact',
      type: 'checkbox',
      width: 'full',
      label: { ar: 'أرغب بتجربة قيادة', en: 'I would like a test drive' },
    },
  ],
};

/**
 * The options a template field carries, in the shape the database stores.
 *
 * `value` and `label` are the same string on purpose, and the value is the
 * ENGLISH one: it is the key an answer is filed under, it is what a seller sees
 * when they export a CSV, and it must not change if somebody edits the Arabic
 * label later.
 */
export function templateOptions(field: { options?: { ar: string; en: string }[] | null }) {
  return (field.options ?? []).map((o) => ({
    value: o.en,
    label: { ar: o.ar, en: o.en },
  }));
}
