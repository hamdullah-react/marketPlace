/**
 * The vendor-defined lead form: what a field can be, and how one answer is
 * checked and stored.
 *
 * Pure on purpose — no database, no `server-only`. The builder renders the type
 * list in the browser, the buyer's form renders inputs from it, and the action
 * validates against it on the server. One definition, three readers; a second
 * copy in a client component is how a select ends up offering a type the server
 * rejects.
 */

/**
 * The field types a seller can ask for, and whether each carries choices.
 *
 * These are the TYPES, named for what they are. How each one draws itself is a
 * separate decision that lives in LeadFields — a multi-select renders as tags
 * with a cross on each picked one, but it is still a multi-select, and calling
 * it "chips" in the picker would name the paint instead of the thing.
 *
 * Why three choice types rather than one with a toggle: a dropdown suits a long
 * list (a city, a year) where a wall of options would bury the rest of the form;
 * tags suit a short one, because every option is visible without a tap. And
 * picking one of several is a different question from picking any number.
 */
export const FIELD_TYPES = [
  { type: 'text', ar: 'نص قصير', en: 'Short text', options: false },
  { type: 'textarea', ar: 'نص طويل', en: 'Paragraph', options: false },
  { type: 'number', ar: 'رقم', en: 'Number', options: false },
  { type: 'select', ar: 'قائمة منسدلة', en: 'Dropdown', options: true },
  { type: 'multiselect', ar: 'اختيار متعدد', en: 'Multi-select', options: true },
  { type: 'radio', ar: 'اختيار واحد', en: 'Single choice', options: true },
  { type: 'checkbox', ar: 'موافقة (نعم/لا)', en: 'Checkbox (yes/no)', options: false },
  { type: 'date', ar: 'تاريخ', en: 'Date', options: false },
  { type: 'phone', ar: 'جوال', en: 'Phone', options: false },
  { type: 'email', ar: 'بريد إلكتروني', en: 'Email', options: false },
];

export const FIELD_TYPE_SET = new Set(FIELD_TYPES.map((f) => f.type));

/** Which types carry a list of choices — the fact the UI keeps needing. */
export const TYPES_WITH_OPTIONS = new Set(
  FIELD_TYPES.filter((f) => f.options).map((f) => f.type)
);

export const isMultiValue = (type: string | null | undefined) => type === 'multiselect';

/** Saudi mobile, in the shapes people actually type it. */
export const SAUDI_PHONE = /^(?:\+?966|0)?5\d{8}$/;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Long enough to be useful, short enough that a lead card stays readable. */
export const ANSWER_MAX = 500;

/**
 * Checks one answer against the field it was given for.
 *
 * Returns `{ error }`, `{ skip: true }` for an optional blank, or `{ value }`
 * ready to store. Kept here rather than in the action so the builder's preview
 * and the buyer's form can enforce the same rules without restating them.
 *
 * The stored value carries its LABEL and TYPE, not just the text. A seller who
 * renames "Budget" to "Budget (SAR)" next month must not rewrite what four
 * hundred buyers were asked, and deleting a field must not blank the leads that
 * answered it — the definition renders the form, the answer records a
 * conversation that already happened.
 */
/** A field definition as the builder stores it. */
export type FormFieldDef = {
  field_key?: string;
  type?: string;
  label?: Record<string, string> | null;
  options?: { value: string; label?: unknown }[] | null;
  required?: boolean;
  [key: string]: unknown;
};

export function validateAnswer(field: FormFieldDef, raw: unknown) {
  const multi = isMultiValue(field.type);
  const empty = multi
    ? !(Array.isArray(raw) ? raw.length : 0)
    : raw === '' || raw === null || raw === undefined;

  if (empty) {
    // An unticked checkbox is an answer — "no" — not a missing one. A REQUIRED
    // checkbox means "you must agree", and not agreeing is a failure.
    if (field.required) return { error: 'FIELD_REQUIRED' };
    return { skip: true };
  }

  let value = raw;

  if (field.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return { error: 'FIELD_NUMBER' };
    value = n;
  }

  if (field.type === 'phone' && !SAUDI_PHONE.test(String(value).replace(/[\s-]/g, ''))) {
    return { error: 'PHONE_INVALID' };
  }

  if (field.type === 'email' && !EMAIL.test(String(value))) {
    return { error: 'EMAIL_INVALID' };
  }

  // A choice the seller does not offer is not a choice. Checked rather than
  // trusted: a <select> is only a select inside a browser.
  if (TYPES_WITH_OPTIONS.has(field.type ?? '')) {
    const allowed = new Set((field.options ?? []).map((o) => o.value));
    const picked = Array.isArray(value) ? value : [value];
    if (picked.some((v) => !allowed.has(v))) return { error: 'FIELD_OPTION_UNKNOWN' };
  }

  if (typeof value === 'string' && value.length > ANSWER_MAX) value = value.slice(0, ANSWER_MAX);
  if (Array.isArray(value)) value = value.slice(0, 25);

  return {
    value: { value, type: field.type, label: field.label ?? {} },
  };
}

/**
 * Turns stored answers into rows a seller can read in a lead card.
 *
 * Reads the label off the ANSWER first and only falls back to the live field
 * definition for older rows that predate stored labels.
 */
/** One stored answer: the value plus the label and type as they were then. */
type StoredAnswer = { value?: unknown; label?: Record<string, string> | null; type?: string };

export function readAnswers(
  answers: Record<string, unknown> = {},
  fields: FormFieldDef[] = [],
  locale = 'ar',
) {
  const byKey = new Map(fields.map((f) => [f.field_key, f]));

  return Object.entries(answers ?? {})
    .map(([key, entry]) => {
      const field = byKey.get(key);
      const stored: StoredAnswer | null =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry as StoredAnswer)
          : null;

      const label =
        stored?.label?.[locale] || stored?.label?.en || stored?.label?.ar ||
        field?.label?.[locale] || field?.label?.en || key;

      const raw = stored ? stored.value : entry;
      const type = stored?.type ?? field?.type ?? 'text';

      const value =
        Array.isArray(raw) ? raw.filter(Boolean).join('، ')
          : type === 'checkbox' ? (raw ? 'نعم / Yes' : '')
          : raw;

      return { key, label, value, type };
    })
    // A blank answer to an optional field is not information; it is an empty
    // row in a card somebody is trying to read at a glance.
    .filter((a) => a.value !== null && a.value !== undefined && a.value !== '');
}
