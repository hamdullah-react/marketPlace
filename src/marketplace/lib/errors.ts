/**
 * Error codes, translated at the edge.
 *
 * Server actions return a CODE, never a sentence. Building
 * "أدخل الاسم / Enter a name" on the server means an English user always sees
 * Arabic too, and there is no way to fix that without a redeploy — the server
 * does not know the viewer's language at the point a validator fails.
 *
 * The client owns the wording, so a single message renders in exactly one
 * language, and adding a third is a change here rather than in every action.
 */

export const ERRORS = {
  // ── generic ──
  UNKNOWN: { ar: 'حدث خطأ غير متوقع', en: 'Something went wrong' },
  MISSING_VENDOR: { ar: 'لم يُحدَّد البائع', en: 'No seller selected' },
  NOT_FOUND: { ar: 'العنصر غير موجود', en: 'Not found' },
  SAVE_FAILED: { ar: 'تعذّر الحفظ', en: 'Could not save' },
  DELETE_FAILED: { ar: 'تعذّر الحذف', en: 'Could not delete' },

  // ── store profile ──
  NAME_REQUIRED: { ar: 'أدخل اسم المتجر', en: 'Enter a store name' },

  // ── contact ──
  EMAIL_INVALID: { ar: 'بريد إلكتروني غير صالح', en: 'Invalid email address' },
  PHONE_INVALID: { ar: 'رقم جوال سعودي غير صالح', en: 'Invalid Saudi mobile number' },

  // ── business ──
  CR_INVALID: { ar: 'السجل التجاري يتكوّن من ١٠ أرقام', en: 'CR number must be 10 digits' },
  VAT_INVALID: { ar: 'الرقم الضريبي يتكوّن من ١٥ رقماً', en: 'VAT number must be 15 digits' },

  // ── localization ──
  LOCALE_INVALID: { ar: 'لغة غير مدعومة', en: 'Unsupported language' },

  // ── listing form ──
  BRAND_REQUIRED: { ar: 'اختر الماركة', en: 'Select a brand' },
  MODEL_REQUIRED: { ar: 'اختر الموديل', en: 'Select a model' },
  YEAR_REQUIRED: { ar: 'اختر سنة الصنع', en: 'Select a year' },
  CITY_REQUIRED: { ar: 'أدخل المدينة', en: 'Enter the city' },
  PRICE_INVALID: { ar: 'أدخل سعراً صحيحاً', en: 'Enter a valid price' },
  COMPARE_AT_TOO_LOW: {
    ar: 'يجب أن يكون السعر قبل الخصم أعلى من السعر',
    en: 'The "was" price must be higher than the price',
  },
  CONDITION_REQUIRED: { ar: 'اختر الحالة', en: 'Select a condition' },
  MILEAGE_REQUIRED: { ar: 'أدخل الممشى', en: 'Enter the mileage' },
  OPTION_UNKNOWN: { ar: 'خيار غير معروف', en: 'Unknown option' },
  MEDIA_REQUIRED: {
    ar: 'أضف صورة واحدة على الأقل قبل النشر',
    en: 'Add at least one photo before publishing',
  },
  // Only reachable if creating the category ALSO failed — see
  // ensureCarCategory in _actions/save-listing.js. It used to say "run seed.cjs
  // first", which is an instruction a seller cannot follow and should never
  // have been shown one.
  NO_CAR_CATEGORY: {
    ar: 'تعذّر تجهيز قسم السيارات. حدّث الصفحة وحاول مرة أخرى.',
    en: 'Could not set up the car category. Refresh and try again.',
  },

  // ── catalog ──
  ENTITY_UNKNOWN: { ar: 'نوع غير معروف', en: 'Unknown catalog type' },
  CATALOG_NAME_REQUIRED: { ar: 'أدخل الاسم بلغة واحدة على الأقل', en: 'Enter a name in at least one language' },
  CATALOG_VALUE_REQUIRED: { ar: 'أدخل قيمة', en: 'Enter a value' },
  CATALOG_PARENT_REQUIRED: { ar: 'اختر العنصر الأب', en: 'Pick a parent' },
  CATALOG_KIND_REQUIRED: { ar: 'اختر النوع', en: 'Pick a kind' },
  CATALOG_DUPLICATE: { ar: 'هذا العنصر موجود بالفعل في الكتالوج', en: 'That entry is already in the catalog' },
  CATALOG_NO_ACTIVE_FLAG: { ar: 'هذه القائمة لا تدعم التفعيل', en: 'This list has no active flag' },

  // ── delete guards ──
  IN_USE_BY_LISTINGS: {
    ar: 'مستخدم في {count} إعلان — عطّله بدلاً من حذفه',
    en: 'Used by {count} listing(s) — deactivate it instead',
  },
  HAS_DEPENDENTS: {
    ar: 'سيحذف أيضاً: {details}',
    en: 'This also deletes: {details}',
  },

  SAVED_MINUS_COLUMNS: {
    ar: 'حُفظ، لكن تعذّر حفظ: {columns} — أعد تشغيل schema.sql',
    en: 'Saved, but these were skipped: {columns} — re-run schema.sql',
  },

  BULK_PARTIAL: {
    ar: 'حُذف {deleted}. تعذّر حذف {blocked} لاستخدامها في إعلانات.',
    en: 'Deleted {deleted}. {blocked} kept — still used by listings.',
  },

  // ── option kinds ──
  KIND_SLUG_RESERVED: {
    ar: 'المعرّف "{slug}" محجوز للسنة والممشى والحالة والفئة — اختر غيره',
    en: '"{slug}" is reserved for year, mileage, condition and trim — pick another',
  },
  KIND_TABLE_MISSING: {
    ar: 'جدول الأنواع غير موجود — أعد تشغيل schema.sql',
    en: 'The kinds table does not exist yet — re-run schema.sql',
  },

  // ── listings ──
  STATE_NOT_ALLOWED: {
    ar: 'لا يمكن نقل الإعلان إلى هذه الحالة من هنا',
    en: 'A listing cannot be moved to that state from here',
  },
  IN_USE_BY_ORDERS: {
    ar: 'مرتبط بـ {count} طلب — لا يمكن حذفه. علّمه كمباع أو حوّله إلى مسودة.',
    en: 'Attached to {count} order(s) — it cannot be deleted. Mark it sold or move it to draft.',
  },
  NOTHING_SELECTED: {
    ar: 'لم تحدّد أي إعلان',
    en: 'Nothing is selected',
  },

  // ── authorization ──
  // Deliberately actionable rather than blunt: "not allowed" leaves someone
  // staring at a button, while "your session ended" tells them what to do.
  NOT_SIGNED_IN: {
    ar: 'انتهت جلستك. سجّل الدخول مرة أخرى.',
    en: 'Your session has ended. Sign in again.',
  },
  // Names the way out. Registering a showroom is now a deliberate step rather
  // than something that happened on first visit, so "not linked to a showroom"
  // is a state a buyer can be in perfectly legitimately — and telling them only
  // what is missing, without where to get it, is half a message.
  NOT_A_VENDOR: {
    ar: 'هذا الحساب ليس له معرض بعد. سجّل معرضك من صفحة «بيع سيارتك».',
    en: 'This account has no showroom yet. Register one from the "Sell Your Car" page.',
  },
  // ── Lead form ──────────────────────────────────────────────────────────────
  // Names the fix rather than saying "could not save": the questions DID save,
  // and the missing piece is a schema section nobody has run yet.
  LAYOUT_NOT_MIGRATED: {
    ar: 'حُفظت الأسئلة، لكن التنسيق يحتاج تشغيل schema.sql (القسمان 20.4 و22).',
    en: 'Your questions saved. The layout needs schema.sql sections 20.4 and 22 run first.',
  },
  FIELD_LABEL_REQUIRED: { ar: 'أدخل اسم الحقل', en: 'Give the field a label' },
  FIELD_TYPE_UNKNOWN: { ar: 'نوع حقل غير معروف', en: 'Unknown field type' },
  FIELD_OPTIONS_REQUIRED: {
    ar: 'أدخل خيارين على الأقل، كل خيار في سطر',
    en: 'Enter at least two choices, one per line',
  },
  FIELD_OPTION_UNKNOWN: { ar: 'خيار غير متاح', en: 'That choice is not on the list' },
  FIELD_REQUIRED: { ar: 'هذا الحقل مطلوب', en: 'This field is required' },
  FIELD_NUMBER: { ar: 'أدخل رقماً', en: 'Enter a number' },
  COLOR_INVALID: { ar: 'لون غير صالح', en: 'That is not a valid colour' },
  FIELD_LIMIT: {
    ar: 'وصلت للحد الأقصى: 25 حقلاً. أخفِ حقلاً قبل إضافة آخر.',
    en: 'That is the limit of 25 fields. Hide one before adding another.',
  },
  // NOT NAME_REQUIRED — that one is already taken by the showroom form and
  // means 'name your business'. Two keys, because they are two questions.
  CONTACT_NAME_REQUIRED: { ar: 'أدخل اسمك', en: 'Enter your name' },
  PHONE_REQUIRED: { ar: 'أدخل رقم جوالك', en: 'Enter your mobile number' },
  // The seller is the one person who must not be able to lead-capture himself.
  OWN_LISTING: {
    ar: 'هذه سيارتك — لا يمكنك إرسال استفسار لنفسك',
    en: 'This is your own car — you cannot send yourself a lead',
  },
  NO_PHONE: {
    ar: 'لم يضف هذا المعرض رقم تواصل. أرسل طلباً بدلاً من ذلك.',
    en: 'This showroom has not added a phone number. Send a request instead.',
  },
  NOT_STAFF: {
    ar: 'هذا الإجراء متاح لفريق المنصة فقط.',
    en: 'That is only available to the platform team.',
  },
  // Says WHOSE it is, not what rank you lack. A seller told "staff only" about
  // a brand they can see in their own catalog learns nothing; told it came
  // with a template, they know to use Templates → Remove instead.
  NOT_YOUR_ENTRY: {
    ar: 'هذا الصف جاء مع قالب ويشاركه بائعون آخرون — أزل القالب من تبويب القوالب بدلاً من ذلك. يمكنك تعديل ما أضفته بنفسك فقط.',
    en: 'This row came from a template and other showrooms share it — use Templates → Remove instead. You can edit only what you added yourself.',
  },

  // ── restore ──
  RESTORE_READ_FAILED: { ar: 'تعذّر قراءة النسخة الاحتياطية', en: 'Could not read the backup' },
  RESTORE_BAD_FILE: {
    ar: 'الملف ليس نسخة احتياطية صالحة',
    en: 'That file is not a valid backup',
  },
  RESTORE_WRONG_VENDOR: {
    ar: 'هذه النسخة تخص متجراً آخر',
    en: 'That backup belongs to a different store',
  },
  RESTORE_PARTIAL: {
    ar: 'اُستعيد جزء من البيانات — بعض الجداول فشلت',
    en: 'Some data was restored, but parts failed',
  },
  RESTORE_FAILED: { ar: 'تعذّر الاستيراد', en: 'Import failed' },

  // ── backup / data ──
  BACKUP_UPLOAD_FAILED: { ar: 'تعذّر رفع النسخة الاحتياطية', en: 'Could not upload the backup' },
  BACKUP_RECORD_FAILED: { ar: 'حُفظت النسخة لكن لم تُسجَّل', en: 'Backup saved but not recorded' },
  CONFIRM_MISMATCH: { ar: 'اكتب "{expected}" بالضبط للتأكيد', en: 'Type "{expected}" exactly to confirm' },

  // ── upload ──
  NO_FILE: { ar: 'لم يتم اختيار ملف', en: 'No file selected' },
  BAD_TYPE: { ar: 'نوع ملف غير مدعوم', en: 'Unsupported file type' },
  TOO_LARGE: { ar: 'الملف أكبر من ٨ ميجابايت', en: 'File is larger than 8 MB' },
  UPLOAD_FAILED: { ar: 'فشل الرفع', en: 'Upload failed' },
};

/**
 * Resolves a code to a sentence in one language.
 *
 * Falls back to the raw string when a code is unknown, so a database message
 * that slips through is still shown rather than swallowed into "Something went
 * wrong" — an untranslated error beats a silent one.
 */
export function errorText(
  code: string | null | undefined,
  locale = 'ar',
  params: Record<string, string | number> = {},
): string {
  if (!code) return '';

  // Widened on purpose: the whole point of the fallback below is that `code`
  // may be something ERRORS has never heard of — a raw Postgres message on its
  // way to a human. Typing it `keyof typeof ERRORS` would make that
  // unrepresentable and delete the branch.
  const entry = (ERRORS as Record<string, { ar: string; en: string } | undefined>)[code];
  if (!entry) return String(code);

  let text = locale === 'en' ? entry.en : entry.ar;
  for (const [key, value] of Object.entries(params)) {
    text = text.replaceAll(`{${key}}`, String(value));
  }
  return text;
}
