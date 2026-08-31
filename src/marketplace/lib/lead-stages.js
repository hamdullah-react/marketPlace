/**
 * What a lead's stage is CALLED — for the showroom, and for the buyer.
 *
 * One module because the labels had already been written twice, in the leads
 * table and in the lead workspace, and the two had begun to disagree. A stage
 * that reads "Quoted" on one screen and "Offer made" on the next is two stages
 * as far as anybody using it is concerned.
 *
 * ── The key is not the label ────────────────────────────────────────────────
 *
 * `key` is the enum value in the database. It never changes: it is written into
 * leads.stage, into the partial index in schema.sql §21.4, and into every URL a
 * seller has bookmarked. Everything else here is presentation.
 *
 * ── Two audiences, two vocabularies ─────────────────────────────────────────
 *
 * The seller's labels are the ACTION that moved the lead — what you did, past
 * tense — because the old set was CRM vocabulary and a showroom's staff are not
 * CRM users. Nobody could say what should happen to a lead sitting in "New",
 * and "Won" and "Lost" read as verdicts the software had reached rather than
 * notes a salesperson writes.
 *
 * The buyer's labels are NOT the same words, and that is the important part of
 * this file. `lost` is the seller's private judgement that a deal died; telling
 * a customer they have been marked "Lost" is how you lose someone who was still
 * deciding. They see "Closed" — factual, and not a verdict on them. The same
 * care applies throughout: the buyer is told what is happening, never what the
 * showroom privately thinks of their chances.
 */

/** Every stage the enum allows, in pipeline order. */
export const LEAD_STAGE_KEYS = [
  'new',
  'contacted',
  'quoted',
  'won',
  'lost',
  'cancelled',
];

/** Stages where the showroom still owes an answer — the "open" pipeline. */
export const OPEN_STAGE_KEYS = ['new', 'contacted', 'quoted'];

/**
 * What the SHOWROOM sees.
 *
 * `hint` exists because a tab that needs explaining should carry its
 * explanation, rather than relying on somebody having been shown once.
 */
export const SELLER_STAGES = [
  {
    key: 'new',
    ar: 'لم نتواصل بعد',
    en: 'Not called yet',
    hintAr: 'طلب وصل ولم يتصل به أحد. ابدأ من هنا.',
    hintEn: 'Arrived, and nobody has rung them. Start here.',
    tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    key: 'contacted',
    ar: 'تم الاتصال',
    en: 'Called',
    hintAr: 'تحدثت معه، ولم تُرسل سعراً بعد.',
    hintEn: 'You have spoken to them, but not sent a price yet.',
    tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  },
  {
    key: 'quoted',
    ar: 'أرسلنا السعر',
    en: 'Price sent',
    hintAr: 'أرسلت له السعر وتنتظر رده.',
    hintEn: 'They have your price and you are waiting on them.',
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  {
    key: 'won',
    ar: 'تم البيع',
    en: 'Sold',
    hintAr: 'اشترى السيارة. انتهى الطلب بنجاح.',
    hintEn: 'They bought the car. Finished, and it counted.',
    tone: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  },
  {
    key: 'lost',
    ar: 'لم يشترِ',
    en: "Didn't buy",
    hintAr: 'انتهى الطلب دون بيع — اكتب السبب في صفحة الطلب.',
    hintEn: 'Ended without a sale — write why on the lead itself.',
    tone: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  },
  {
    key: 'cancelled',
    ar: 'ألغاه المشتري',
    en: 'Buyer cancelled',
    hintAr: 'سحب المشتري طلبه بنفسه. لا داعي للاتصال.',
    hintEn: 'The buyer withdrew this themselves. No need to call.',
    tone: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
    /**
     * Not the showroom's to set, and not offered as a tab until one exists.
     *
     * Only a buyer writes this stage (schema.sql §21.6). A seller closing a
     * dead deal means "Didn't buy" — if they could also pick "Buyer cancelled"
     * the two would blur, and the one report worth having (how many people
     * walked away on their own) would stop being trustworthy.
     */
    buyerOnly: true,
    onlyWhenPresent: true,
  },
];

/**
 * What the BUYER sees — never the seller's wording.
 *
 * `tone` is deliberately calm across the board. A buyer's own request list is
 * not a scoreboard, and colouring "Closed" red would make a neutral fact read
 * as a rejection.
 */
export const BUYER_STAGES = {
  new: {
    ar: 'أُرسل — بانتظار المعرض',
    en: 'Sent — waiting for the showroom',
    tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  contacted: {
    ar: 'تواصل معك المعرض',
    en: 'The showroom has been in touch',
    tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
  },
  quoted: {
    ar: 'وصلك عرض سعر',
    en: 'You have a price',
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  won: {
    ar: 'مكتمل',
    en: 'Completed',
    tone: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  },
  // NOT "you didn't buy". See the note at the top of this file.
  lost: {
    ar: 'مغلق',
    en: 'Closed',
    tone: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
  },
  cancelled: {
    ar: 'ألغيته',
    en: 'You cancelled this',
    tone: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
  },
};

const SELLER_BY_KEY = Object.fromEntries(SELLER_STAGES.map((s) => [s.key, s]));

/** Falls back to `new` rather than returning undefined — an unknown stage must
 *  still render a badge, not crash a table. */
export function sellerStage(key) {
  return SELLER_BY_KEY[key] ?? SELLER_BY_KEY.new;
}

export function buyerStage(key) {
  return BUYER_STAGES[key] ?? BUYER_STAGES.new;
}

/** Whether the buyer may still withdraw: only while somebody might still act
 *  on it. Cancelling a finished deal is not a thing that means anything. */
export function canBuyerCancel(stage) {
  return OPEN_STAGE_KEYS.includes(stage);
}

/**
 * The buyer's progress tracker.
 *
 * Four steps, because four is what a person can read at a glance and because
 * they are the four things that actually happen to a request: it was sent,
 * somebody rang, a price came back, it finished.
 *
 * `lost` and `cancelled` are NOT steps. A request that ended is not at a
 * position on this line — showing it as "stuck at step 2" would invite someone
 * to wait for a step 3 that is never coming. Those render as a stopped state
 * instead; see reachedStep returning -1.
 */
export const BUYER_STEPS = [
  { key: 'new', ar: 'أُرسل', en: 'Sent' },
  { key: 'contacted', ar: 'تواصل معك', en: 'Contacted' },
  { key: 'quoted', ar: 'عرض سعر', en: 'Price' },
  { key: 'won', ar: 'مكتمل', en: 'Done' },
];

/**
 * How far along, or -1 for a request that ended without finishing.
 *
 * -1 rather than null so a caller that forgets to check gets an index that
 * lights nothing up, instead of one that lights up the first step.
 */
export function reachedStep(stage) {
  const at = BUYER_STEPS.findIndex((s) => s.key === stage);
  return at;
}
