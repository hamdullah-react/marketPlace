import { Globe, AlertTriangle, Info } from 'lucide-react';

/**
 * Why the Country column is empty — said on the page, not in a SQL console.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * A blank Country column has three completely different causes and one
 * identical appearance:
 *
 *   nothing recorded yet   nobody has loaded a page since presence shipped
 *   no IP reached us       the reverse proxy is not forwarding the visitor's
 *                          address, so there is nothing to resolve a country
 *                          FROM. A server configuration problem.
 *   lookup failing         the address arrives, the geo service does not
 *                          answer. A code or provider problem.
 *
 * Diagnosing that by hand means opening the database and reading `last_ip`,
 * which is a reasonable thing to ask of the person who wrote the app and an
 * unreasonable thing to ship to whoever buys it. The data is already on this
 * page; this turns it into the sentence an operator can act on.
 *
 * ── It says nothing when there is nothing wrong ────────────────────────────
 *
 * The moment one country resolves, this renders null. A panel that explains a
 * healthy system is a panel people learn to scroll past, and then do not read
 * on the day it matters.
 */
export default function CountryDiagnosis({ users = [], locale = 'ar' }) {
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  /* Only the people who have actually been seen. An account that has never
     visited is not evidence of anything. */
  const seen = users.filter((u) => u.lastSeenAt);
  if (!seen.length) return null;

  /* Working. Say nothing. */
  if (seen.some((u) => u.country)) return null;

  const anyIp = seen.some((u) => u.hasIp);

  const { tone, icon: Icon, title, body } = anyIp
    ? {
        tone: 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300',
        icon: Info,
        title: t('تعذّر تحديد الدولة', 'The country lookup is not answering'),
        body: t(
          'عناوين الزوّار تصل إلى الخادم، لكن خدمة تحديد الدولة لا تستجيب. المشكلة في الخدمة الخارجية وليست في الإعداد — ستُملأ الخانة من تلقاء نفسها عند عودتها.',
          'Visitor addresses are reaching the server, but the service that turns one into a country is not responding. That is the third-party lookup, not your configuration — the column fills itself once it answers again.'
        ),
      }
    : {
        tone: 'border-red-500/30 bg-red-500/5 text-red-800 dark:text-red-300',
        icon: AlertTriangle,
        title: t('الخادم لا يستلم عنوان الزائر', 'Your server is not receiving visitor IP addresses'),
        body: t(
          'الخادم العكسي (nginx / Coolify / Traefik) لا يمرّر ترويسة X-Forwarded-For، فلا يوجد عنوان يمكن تحديد الدولة منه. هذا إعداد في الخادم وليس في التطبيق. وإذا كان الموقع خلف Cloudflare فستُحلّ المشكلة تلقائياً.',
          'Your reverse proxy (nginx / Coolify / Traefik) is not passing the X-Forwarded-For header, so there is no address to resolve a country from. This is a server setting, not an application one — and putting the site behind Cloudflare resolves it on its own.'
        ),
      };

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${tone}`}>
      <span className="relative mt-0.5 shrink-0">
        <Globe className="h-4 w-4 opacity-40" />
        <Icon className="absolute -end-1.5 -bottom-1.5 h-3 w-3" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        <p className="mt-1 opacity-90">{body}</p>
        <p className="mt-2 text-xs opacity-70">
          {t(
            'تُسجَّل الدولة عند تصفّح أي مستخدم مسجّل الدخول، خلال دقائق. لا حاجة لتسجيل الخروج والدخول.',
            'A country is recorded within minutes of any signed-in person loading a page — nobody needs to sign out and back in.'
          )}
        </p>
      </div>
    </div>
  );
}
