/**
 * The About document, drawn as React elements.
 *
 * A server component with no "use client": it ships no JavaScript, because it
 * is a function from a stored document to JSX.
 *
 * ── Why this exists instead of dangerouslySetInnerHTML ──────────────────────
 *
 * The obvious way to render rich text is to store the editor's HTML and print
 * it. On a multi-vendor marketplace that hands every showroom the ability to
 * put arbitrary markup on a page carrying our domain and a buyer's session —
 * and the usual defence, an HTML sanitiser, is a permanent argument with an
 * attacker: every sanitiser has a published bypass list, and one that is a
 * version behind is a hole nobody can see.
 *
 * So no HTML is stored (schema.sql §28) and no HTML is produced. This walks the
 * document and emits an element for each node type it RECOGNISES. A node type
 * it does not know renders as nothing. There is no branch in this file that can
 * turn stored data into markup, so there is nothing to sanitise and nothing to
 * bypass — the safety is structural rather than a filter that has to be right.
 *
 * The same rule applies to attributes, which is the half that is easy to
 * forget: an `href` is checked against a protocol allowlist here, on the way
 * out, and not only in the editor. The editor is a convenience for the seller;
 * this is the thing standing between a stored value and a buyer's browser.
 */

/* eslint-disable @next/next/no-img-element */

const SAFE_LINK = /^(https?:|mailto:|tel:)/i;

/** Only pictures that were uploaded — an absolute http(s) URL, nothing else. */
const SAFE_IMAGE = /^https?:\/\//i;

const ALIGN = {
  center: 'text-center',
  end: 'text-end',
  right: 'text-end',
  start: 'text-start',
  left: 'text-start',
  justify: 'text-justify',
};

/** Bold / italic / underline / strike / code / link, wrapped outside in. */
function withMarks(text, marks, key) {
  let node = text;

  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'underline':
        node = <u>{node}</u>;
        break;
      case 'strike':
        node = <s>{node}</s>;
        break;
      case 'code':
        node = <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{node}</code>;
        break;
      case 'link': {
        const href = String(mark.attrs?.href ?? '');
        // An unsafe scheme loses the link and keeps the words. Dropping the
        // text as well would silently delete a sentence the seller wrote.
        if (!SAFE_LINK.test(href)) break;
        node = (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-brand-primary underline underline-offset-2"
          >
            {node}
          </a>
        );
        break;
      }
      default:
        // An unknown mark is ignored; the text it wraps is still shown.
        break;
    }
  }

  return <span key={key}>{node}</span>;
}

function renderNodes(nodes) {
  return (nodes ?? []).map((node, i) => renderNode(node, i)).filter(Boolean);
}

function renderNode(node, key) {
  if (!node || typeof node !== 'object') return null;

  const align = ALIGN[node.attrs?.textAlign] ?? '';

  switch (node.type) {
    case 'text':
      return node.marks?.length
        ? withMarks(node.text ?? '', node.marks, key)
        : (node.text ?? '');

    case 'paragraph':
      return (
        <p key={key} className={`mb-3 leading-relaxed ${align}`}>
          {renderNodes(node.content)}
        </p>
      );

    case 'heading': {
      // The editor offers 2 and 3; the page's own h1 is the showroom name, so
      // anything else is clamped rather than allowed to outrank it.
      const level = node.attrs?.level === 3 ? 3 : 2;
      const Tag = level === 3 ? 'h3' : 'h2';
      const size = level === 3 ? 'text-base' : 'text-lg';

      return (
        <Tag key={key} className={`mb-2 mt-5 font-bold text-brand-primary first:mt-0 ${size} ${align}`}>
          {renderNodes(node.content)}
        </Tag>
      );
    }

    case 'bulletList':
      return (
        <ul key={key} className="mb-3 list-disc space-y-1 ps-5">
          {renderNodes(node.content)}
        </ul>
      );

    case 'orderedList':
      return (
        <ol key={key} className="mb-3 list-decimal space-y-1 ps-5">
          {renderNodes(node.content)}
        </ol>
      );

    case 'listItem':
      return <li key={key}>{renderNodes(node.content)}</li>;

    case 'blockquote':
      return (
        <blockquote key={key} className="mb-3 border-s-2 border-brand-primary ps-3 italic">
          {renderNodes(node.content)}
        </blockquote>
      );

    case 'horizontalRule':
      return <hr key={key} className="my-5 border-gray-200 dark:border-white/10" />;

    case 'hardBreak':
      return <br key={key} />;

    case 'image': {
      const src = String(node.attrs?.src ?? '');
      if (!SAFE_IMAGE.test(src)) return null;

      /**
       * Capped, not full-bleed.
       *
       * `max-w-full` alone is a cap on the CONTAINER, which on this card is the
       * whole column — so a square logo uploaded at 1000px filled the screen
       * and pushed the text that explains it two scrolls down. A picture inside
       * a paragraph of prose is an illustration; 20rem is about as tall as one
       * can be before it stops being read alongside the words.
       *
       * `w-auto` with `h-auto` keeps the aspect ratio whichever limit bites
       * first — a wide banner is bounded by the column, a tall or square one by
       * the height.
       */
      return (
        <img
          key={key}
          src={src}
          alt={node.attrs?.alt ?? ''}
          className="my-4 h-auto max-h-80 w-auto max-w-full rounded-lg"
          loading="lazy"
        />
      );
    }

    case 'codeBlock':
      return (
        <pre key={key} className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
          <code>{renderNodes(node.content)}</code>
        </pre>
      );

    case 'doc':
      return <div key={key}>{renderNodes(node.content)}</div>;

    default:
      return null;
  }
}

/** True when there is something worth showing — used to decide on a fallback. */
export function hasRichText(doc) {
  if (doc?.type !== 'doc' || !Array.isArray(doc.content)) return false;
  return doc.content.some((n) => n?.type !== 'paragraph' || n.content?.length);
}

export default function RichTextRender({ doc, className = '' }) {
  if (!hasRichText(doc)) return null;

  return (
    <div className={`text-sm text-gray-700 dark:text-gray-300 ${className}`}>
      {renderNodes(doc.content)}
    </div>
  );
}
