/**
 * A list of questions and answers, with its FAQPage structured data.
 *
 * Used by a CAR's page (the showroom's own questions about that car) and by
 * the site's FAQ page (the platform's). One component, because the two differ
 * in where the rows come from and in nothing else a reader can see — and
 * because the structured data is the part most worth writing once.
 *
 * ── The structured data is the point ────────────────────────────────────────
 *
 * A question-and-answer pair marked up as schema.org FAQPage is eligible for a
 * rich result, and it is the one kind of content on a marketplace that can
 * rank for the way people actually type — "is the 2022 Camry still under
 * warranty" rather than "camry". That is why the markup is emitted HERE rather
 * than left to each page: a page that renders the questions and forgets the
 * JSON-LD has done the work and thrown away the reason for it.
 *
 * ── What is deliberately NOT marked up ──────────────────────────────────────
 *
 * Nothing the reader cannot see. The queries already drop switched-off rows,
 * and this renders exactly what it marks up — same array, same order, one
 * pass. Marking up an answer that is hidden on the page is the specific thing
 * Google's FAQ guidelines call out, and the easiest way to do it by accident
 * is to build the JSON-LD from a different list than the DOM.
 *
 * ── Why an accordion, and why the first one is open ─────────────────────────
 *
 * Ten questions fully expanded is a wall nobody reads, and ten collapsed is a
 * row of bars that looks like navigation. The first answer is open so the
 * shape of the thing is obvious at a glance — it reads as a question that has
 * been answered, which is what makes somebody open the second one.
 *
 * `type="multiple"` because a reader comparing two answers should not have the
 * first one close when they open the second.
 *
 * ── It renders nothing when there is nothing ────────────────────────────────
 *
 * Most cars will never have a FAQ. An empty heading over an empty box is worse
 * than silence, and an empty FAQPage node is invalid structured data, so both
 * are skipped together.
 */

import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { localized } from '@/marketplace/lib/listing';

export default function FaqSection({
  faqs = [],
  locale = 'en',
  title = null,
  className = '',
  /**
   * Whether to emit the FAQPage node.
   *
   * On by default, and turned OFF in exactly two places: the automatic
   * fallback set (lib/faq.js), and the footer band, which appears on every
   * page of the site. Both are the same text repeated across many URLs, and
   * marking that up site-wide is boilerplate structured data — it earns
   * nothing, and a duplicated FAQPage node competes with the real one on
   * /faq. The questions still render; only the markup is withheld.
   */
  structured = true,
}) {
  const isAr = locale === 'ar';

  /**
   * Resolved ONCE, and both the markup and the DOM are built from this array.
   *
   * A pair with no question or no answer in this language is dropped rather
   * than rendered empty: a bilingual row half-filled is ordinary (see §20 on
   * why answers keep both languages), and an FAQPage entry with an empty
   * acceptedAnswer is invalid.
   */
  const items = faqs
    .map((f) => ({
      id: f.id,
      q: localized(f.question, locale).trim(),
      a: localized(f.answer, locale).trim(),
    }))
    .filter((f) => f.q && f.a);

  if (!items.length) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <section className={className} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Not dangerouslySetInnerHTML on a string the questions were pasted
          into: JSON.stringify escapes what it is given, and the one character
          that still breaks out of a <script> block is handled below. */}
      {structured ? (
      <script
        type="application/ld+json"

        dangerouslySetInnerHTML={{
          /* `</script>` inside an answer would close this tag early and turn
             the rest of the page into markup the browser tries to run. The
             forward slash is escaped so the sequence cannot be formed, which
             is valid JSON and invisible to a parser. */
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      ) : null}

      {title ? (
        <h2 className="mb-3 text-lg font-bold text-brand-primary sm:text-xl">{title}</h2>
      ) : null}

      <Accordion type="multiple" defaultValue={[items[0].id]} className="w-full">
        {items.map((f) => (
          <AccordionItem key={f.id} value={f.id}>
            <AccordionTrigger className="text-start text-sm font-semibold sm:text-base">
              {f.q}
            </AccordionTrigger>
            <AccordionContent className="whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
