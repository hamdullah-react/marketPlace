/**
 * One <script type="application/ld+json"> for the pages that build their own
 * graph — a brand, a showroom, a help article, an article, a car.
 *
 * SeoJsonLd beside this one is for the FIXED pages: it reads a page_seo row and
 * emits what an admin wrote, or a WebPage. Neither can describe a row being
 * rendered, which is what each of these pages actually has to say.
 *
 * `<` is escaped because every value here is data somebody typed — a brand
 * name, a showroom's bio, an article's title — and a value that can close the
 * script tag is script injection on our own origin.
 */
export default function JsonLd({ data }) {
  if (!data) return null;

  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
