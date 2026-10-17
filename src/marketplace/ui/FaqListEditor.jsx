"use client";

/**
 * Editing an ordered list of bilingual question/answer pairs.
 *
 * Used by the listing form (a showroom's questions about one car) and by
 * Admin → Content → FAQ (the platform's own). The two differ in which action
 * receives the list and in nothing else, so this is the list and both callers
 * post its JSON through a hidden input.
 *
 * ── The language rule is the dashboard's, not this component's ──────────────
 *
 * Every other bilingual field in this dashboard is a BilingualField, whose
 * `mode` comes from settings.default_locale: 'ar' and 'en' render ONE box, and
 * only 'both' adds the two-language popup. This list used to print four boxes
 * per row regardless, which put an Arabic box and an Arabic placeholder in
 * front of an admin who had chosen to work in English — the exact complaint
 * that produced the mode setting in the first place.
 *
 * So the rows are BilingualFields now, and a seller or admin writing in one
 * language sees two boxes per question instead of four, with both values still
 * submitted either way.
 *
 * ── Controlled, and it owns no state ────────────────────────────────────────
 *
 * Every change goes out through onChange and comes back as `value`. The
 * alternative — keeping the rows here and telling the parent when they settle
 * — is how an editor ends up disagreeing with the form it is inside: the
 * parent serialises on submit, this one still has a keystroke in flight, and
 * one answer is silently a character short.
 *
 * BilingualField does hold its own state, seeded once from props, which is why
 * every row carries a stable `_k` (see newFaqRow). Keying by index would mean
 * two swapped rows keep each other's text: React would reuse the component at
 * that position and the seeded state would never be re-read.
 *
 * ── Order is the array, and nothing else ────────────────────────────────────
 *
 * There is no sort field to edit. The index IS the order, both save paths
 * write it from the index, and moving a row is a swap. A number somebody can
 * type is a number two rows can share.
 */

import { ChevronDown, ChevronUp, GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import BilingualField from "@/app/[locale]/marketplace/(seller)/_components/BilingualField";
import { newFaqRow } from "@/marketplace/lib/faq";

export default function FaqListEditor({
  value = [],
  onChange,
  locale = "en",
  name = "faqs",
  max = 20,
  // 'ar' | 'en' | 'both' — the same authoring mode every other field uses.
  mode = "both",
  /**
   * The five fallbacks, already flattened (faqEditorRows). Offered as a
   * one-press fill while the list is empty: five filled rows to edit beats
   * five to invent, and it is the same text the public page is showing until
   * something is saved.
   */
  defaults = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const rows = Array.isArray(value) ? value : [];

  const patch = (i, next) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...next } : r)));

  const add = () => onChange([...rows, newFaqRow()]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));

  const move = (i, by) => {
    const to = i + by;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {/* What the action reads. The rows are React state, so the value has to
          travel as a real input — a native form action submits inputs, not
          component state. */}
      <input type="hidden" name={name} value={JSON.stringify(rows)} />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t(
              "لا توجد أسئلة بعد. أضف الأسئلة التي يسألها المشترون فعلاً.",
              "No questions yet. Add the ones buyers actually ask."
            )}
          </p>

          {defaults?.length ? (
            <>
              <button
                type="button"
                onClick={() => onChange(defaults)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/40 px-3 py-2 text-sm font-medium text-brand-primary transition-colors hover:bg-brand-primary/5"
              >
                <Sparkles className="h-4 w-4" />
                {t(`ابدأ بـ ${defaults.length} أسئلة جاهزة`, `Start with ${defaults.length} ready-made questions`)}
              </button>
              {/* Said plainly, because it is the reason to press it: these are
                  already on the public page, and loading them here is how they
                  become yours to change. */}
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "هذه الأسئلة معروضة حالياً بشكل تلقائي. حمّلها لتعديلها وحفظها كأسئلتك.",
                  "These are what the page is showing by default. Load them to edit and save them as your own."
                )}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {rows.map((row, i) => (
        <div
          key={row._k ?? `row-${i}`}
          className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
        >
          <div className="mb-2 flex items-center gap-2">
            <GripVertical className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <span className="text-xs font-semibold text-muted-foreground">
              {t(`سؤال ${i + 1}`, `Question ${i + 1}`)}
            </span>

            <div className="ms-auto flex items-center gap-1">
              {/* Buttons rather than drag: a drag handle on a phone fights the
                  page's own scroll, and these lists are short enough that two
                  taps beat a gesture that sometimes scrolls instead. */}
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                aria-label={t("أعلى", "Move up")}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                aria-label={t("أسفل", "Move down")}
              >
                <ChevronDown className="h-4 w-4" />
              </button>

              {/* No confirmation. The row is only gone once the form is saved,
                  and adding one back costs a click — a dialog here would be
                  ceremony over something that is not yet destructive. */}
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                aria-label={t("حذف", "Remove")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* BilingualField posts its own pair of hidden inputs under this id.
              They are ignored by both save actions — the list travels as the
              JSON above — and the id is row-scoped so nothing collides with
              the rest of the form. */}
          <div className="space-y-3">
            <BilingualField
              id={`faqQuestion-${row._k ?? i}`}
              label={t("السؤال", "Question")}
              ar={row.questionAr ?? ""}
              en={row.questionEn ?? ""}
              mode={mode}
              locale={locale}
              maxLength={200}
              phAr="هل السيارة مفحوصة؟"
              phEn="Has the car been inspected?"
              onChange={({ ar, en }) => patch(i, { questionAr: ar, questionEn: en })}
            />

            <BilingualField
              id={`faqAnswer-${row._k ?? i}`}
              label={t("الإجابة", "Answer")}
              ar={row.answerAr ?? ""}
              en={row.answerEn ?? ""}
              mode={mode}
              locale={locale}
              textarea
              rows={3}
              maxLength={1000}
              phAr="أجب بوضوح وبجملة أو جملتين."
              phEn="Answer plainly, in a sentence or two."
              onChange={({ ar, en }) => patch(i, { answerAr: ar, answerEn: en })}
            />
          </div>

          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={row.active !== false}
              onChange={(e) => patch(i, { active: e.target.checked })}
              className="h-4 w-4 accent-[var(--brand-primary)]"
            />
            {/* Switched off rather than deleted, because a question that stops
                applying this month often applies again next month — and a
                hidden row must never reach the structured data, which is why
                the queries filter on it rather than the page. */}
            {t("ظاهر للمشترين", "Visible to buyers")}
          </label>
        </div>
      ))}

      {rows.length < max ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium transition-colors hover:border-brand-primary dark:border-gray-600"
          >
            <Plus className="h-4 w-4" />
            {t("أضف سؤالاً", "Add a question")}
          </button>

          {/* Appending rather than replacing once the list has rows in it: a
              button that silently discarded what somebody had written would be
              the one destructive control on this screen. */}
          {defaults?.length && rows.length ? (
            <button
              type="button"
              onClick={() => onChange([...rows, ...defaults].slice(0, max))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium transition-colors hover:border-brand-primary dark:border-gray-600"
            >
              <Sparkles className="h-4 w-4" />
              {t("أضف الأسئلة الجاهزة", "Add the ready-made ones")}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t(`الحد الأقصى ${max} أسئلة.`, `That is the maximum of ${max} questions.`)}
        </p>
      )}
    </div>
  );
}
