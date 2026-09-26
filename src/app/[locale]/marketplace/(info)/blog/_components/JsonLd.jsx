/**
 * Structured data for a blog page.
 *
 * SeoJsonLd next door builds its graph from a page's SEO row, which is the right
 * answer for a fixed page and cannot describe an article — a BlogPosting needs
 * the headline, the date and the author of the row being rendered.
 *
 * `<` is escaped exactly as SeoJsonLd does it: a title an admin typed is data,
 * and data that can close a script tag is an injection.
 */
export default function JsonLd({ data }) {
  if (!data) return null;

  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
