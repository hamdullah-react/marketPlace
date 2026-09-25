import 'server-only';

/**
 * The marketplace's own postman.
 *
 * Its own on purpose, in both senses:
 *
 *   its own transport   MARKETPLACE_SMTP_* before the site-wide SMTP_*. The
 *                       marketplace mails strangers — sign-up codes, password
 *                       resets, order and lead notices — while the
 *                       dealership site mails a handful of colleagues. Those
 *                       are different sending reputations, different volumes
 *                       and different consequences when one gets suspended, so
 *                       they get different credentials. The fallback to SMTP_*
 *                       is there so nothing is broken before the second account
 *                       exists; it is not the intended end state.
 *
 *   its own module      nothing here imports @/lib/emailService. That file is
 *                       the dealership's lead pipeline, built around Odoo lead
 *                       shapes, and the marketplace stays separable from it for
 *                       the same reason it has its own database.
 *
 * ── Why the HTML is written with inline styles ──────────────────────────────
 *
 * Everywhere else in this codebase that would be wrong; here it is the only
 * thing that works. Mail clients strip <style> blocks, Gmail drops classes and
 * Outlook renders through Word. Tables and style attributes are the medium, not
 * a shortcut.
 */

import nodemailer from 'nodemailer';

/* ── Transport ───────────────────────────────────────────────────────────── */

/**
 * One account or the other — never halves of both.
 *
 * The fallback to the site's SMTP_* is chosen ONCE, by whether
 * MARKETPLACE_SMTP_HOST is set, and then every value comes from that same
 * prefix. Falling back per variable is the obvious way to write this and it is
 * wrong: leave MARKETPLACE_SMTP_PASSWORD blank while the host points at Zoho
 * and it quietly pairs a Zoho server with ZeptoMail's token. The result
 * authenticates as nobody and the error names neither account.
 *
 * A missing password inside a chosen prefix must read as missing, so the
 * message can say so.
 */
export function mailerConfig() {
  const dedicated = Boolean(process.env.MARKETPLACE_SMTP_HOST);
  const p = dedicated ? 'MARKETPLACE_SMTP_' : 'SMTP_';
  const read = (name) => process.env[`${p}${name}`] || '';

  const host = read('HOST');
  const port = parseInt(read('PORT') || '587', 10);
  const user = read('USER');
  const pass = read('PASSWORD');
  const from = read('FROM') || 'info@alromaihcars.com';

  // Port 465 is implicit TLS; everything else starts plain and upgrades with
  // STARTTLS. Deriving it from the port means one less variable to get wrong,
  // while an explicit *_SECURE still wins for providers that disagree.
  const explicit = process.env[`${p}SECURE`];
  const secure = explicit ? explicit === 'true' : port === 465;

  return { host, port, secure, user, pass, from, dedicated, prefix: p };
}

let _transport = null;
let _signature = '';

function transport() {
  const cfg = mailerConfig();

  const missing = ['HOST', 'USER', 'PASSWORD'].filter(
    (k) => !cfg[k === 'PASSWORD' ? 'pass' : k.toLowerCase()]
  );

  if (missing.length) {
    // Names the prefix actually in use, not both. Being told to check
    // MARKETPLACE_SMTP_* and SMTP_* when only one of them is consulted is how
    // someone ends up setting the variable that is being ignored.
    throw new Error(
      `Marketplace cannot send email: ${missing
        .map((k) => cfg.prefix + k)
        .join(', ')} ${missing.length > 1 ? 'are' : 'is'} not set in .env.local.`
    );
  }

  // Rebuilt when the credentials change rather than cached forever, so editing
  // .env in dev takes effect without restarting the server.
  const signature = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (_transport && _signature === signature) return _transport;

  _transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // A hung SMTP connection must not hold a server action open until the
    // platform kills the request — the person is watching a spinner.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  _signature = signature;

  return _transport;
}

/**
 * Handshake and authenticate without sending anything.
 *
 * Exists for the diagnostic in scripts/marketplace-mail-test.cjs. Auth
 * succeeding and delivery succeeding are different questions — a provider can
 * accept the login and still refuse to relay because the From domain is not
 * verified — so the script does both, in that order, and reports which one
 * broke.
 */
export async function verifyMailer() {
  await transport().verify();
  return mailerConfig();
}

/**
 * One place every marketplace email goes through.
 *
 * The OTP mail below is the first caller; order confirmations and lead
 * notices are the obvious next ones, and they should come through here rather
 * than build their own transport.
 */
export async function sendMarketplaceEmail({ to, subject, html, text, replyTo }) {
  const cfg = mailerConfig();

  const info = await transport().sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  // A provider can accept the message and still reject a recipient. Treated as
  // a failure: the caller's whole purpose was that this address receives it.
  if (info.rejected?.length) {
    throw new Error(`Recipient refused by ${cfg.host}: ${info.rejected.join(', ')}`);
  }

  return info;
}

/* ── The code email ──────────────────────────────────────────────────────── */

const COPY = {
  signup: {
    ar: {
      subject: 'رمز تأكيد حسابك — {name}',
      heading: 'أكّد بريدك الإلكتروني',
      lead: 'استخدم هذا الرمز لإكمال إنشاء حسابك في {name}.',
    },
    en: {
      subject: 'Your confirmation code — {name}',
      heading: 'Confirm your email',
      lead: 'Use this code to finish creating your {name} account.',
    },
  },
  recovery: {
    ar: {
      subject: 'رمز إعادة تعيين كلمة المرور — {name}',
      heading: 'إعادة تعيين كلمة المرور',
      lead: 'استخدم هذا الرمز لتعيين كلمة مرور جديدة.',
    },
    en: {
      subject: 'Your password reset code — {name}',
      heading: 'Reset your password',
      lead: 'Use this code to set a new password.',
    },
  },
};

const FOOTER = {
  ar: 'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة — لن يتغيّر شيء في حسابك.',
  en: 'If you did not ask for this code, ignore this email — nothing about your account changes.',
};

const EXPIRY = {
  ar: (m) => `ينتهي هذا الرمز خلال ${m} دقيقة.`,
  en: (m) => `This code expires in ${m} minutes.`,
};

const BRAND = '#0B6B3A';

/** Used when Admin → Settings could not be read. */
const DEFAULT_BRAND = { ar: 'سوق الرميح', en: 'Sauda' };

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** The copy for one email, with the app name from Admin → Settings filled in. */
function copyFor(purpose, isAr, brandName) {
  const name = brandName || DEFAULT_BRAND[isAr ? 'ar' : 'en'];
  const c = COPY[purpose][isAr ? 'ar' : 'en'];
  return {
    name,
    subject: c.subject.replaceAll('{name}', name),
    heading: c.heading,
    lead: c.lead.replaceAll('{name}', name),
  };
}

function codeHtml({ code, locale, purpose, minutes, brandName = null, logoUrl = null }) {
  const isAr = locale === 'ar';
  const c = copyFor(purpose, isAr, brandName);

  // An uploaded logo (an absolute https URL) is shown; otherwise the name.
  const mark = logoUrl && /^https:\/\//i.test(logoUrl)
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(c.name)}" height="40" style="display:block;height:40px;width:auto;border:0;">`
    : `<span style="color:${BRAND};font-size:20px;font-weight:bold;letter-spacing:1px;">${escapeHtml(c.name)}</span>`;

  return `<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="background:linear-gradient(135deg,${BRAND} 0%,#06170E 100%);padding:36px 20px;text-align:center;">
    <div style="display:inline-block;background:#ffffff;padding:12px 26px;border-radius:12px;">
      ${mark}
    </div>
  </div>

  <div style="max-width:520px;margin:-18px auto 0;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(11,107,58,.10);">
    <div style="padding:32px 28px;text-align:center;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#1f2937;">${c.heading}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#6b7280;">${escapeHtml(c.lead)}</p>

      <!-- dir=ltr on the digits themselves: a code is a sequence, and an RTL
           page would otherwise present it back to front. -->
      <div dir="ltr" style="display:inline-block;background:#E8F5EE;border:1px solid #BFE0CC;border-radius:12px;padding:18px 28px;margin-bottom:18px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:${BRAND};">${code}</span>
      </div>

      <p style="margin:0;font-size:13px;color:#9ca3af;">${EXPIRY[isAr ? 'ar' : 'en'](minutes)}</p>
    </div>

    <div style="border-top:1px solid #f0f0f0;padding:18px 28px;background:#fafafa;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">${FOOTER[isAr ? 'ar' : 'en']}</p>
    </div>
  </div>

  <p style="max-width:520px;margin:16px auto 32px;text-align:center;font-size:11px;color:#b0b0b0;">alromaihcars.com</p>
</body>
</html>`;
}

/**
 * The plain-text part carries the code too — some clients show only that, and
 * it is what a screen reader reaches first.
 */
function codeText({ code, locale, purpose, minutes, brandName = null }) {
  const isAr = locale === 'ar';
  const c = copyFor(purpose, isAr, brandName);
  return [
    c.heading, '', c.lead, '', code, '',
    EXPIRY[isAr ? 'ar' : 'en'](minutes), '', FOOTER[isAr ? 'ar' : 'en'],
  ].join('\n');
}

/* ── A promotion request, to the platform team ───────────────────────────── */

/** A {ar, en} value as one line — English first, Arabic after when it differs. */
const bilingual = (value) => {
  if (value && typeof value === 'object') {
    return [...new Set([value.en, value.ar].filter(Boolean))].join(' — ');
  }
  return value ? String(value) : '';
};

/** A Saudi mobile as wa.me wants it: country code, digits only. */
const whatsappDigits = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('966')) return digits;
  if (digits.startsWith('05')) return `966${digits.slice(1)}`;
  if (digits.startsWith('5') && digits.length === 9) return `966${digits}`;
  return digits;
};

/**
 * "A seller asked to feature a car" — so the team does not have to be sitting
 * in the admin panel to hear about it, and can call the seller straight from
 * the email.
 *
 * Bilingual labels rather than one language: it goes to whoever runs the
 * platform, and the site's name and a seller's words can be in either.
 *
 * `request` is { carName, vendorName, days, price, note, phone, email, adminUrl };
 * the names may be {ar, en} objects.
 */
export async function sendBoostRequestEmail({ to, request }) {
  let brandName = null;
  let logoUrl = null;
  try {
    const { getSiteSettings } = await import('@/marketplace/db/queries/site');
    const site = await getSiteSettings();
    brandName = site.name.en || site.name.ar;
    logoUrl = site.logoUrl;
  } catch {
    /* keep the defaults */
  }

  const name = brandName || DEFAULT_BRAND.en;
  const car = bilingual(request.carName);
  const showroom = bilingual(request.vendorName);
  const price = request.price == null ? '' : Number(request.price).toLocaleString('en', { maximumFractionDigits: 2 });
  const wa = request.phone ? whatsappDigits(request.phone) : '';

  const mark = logoUrl && /^https:\/\//i.test(logoUrl)
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}" height="40" style="display:block;height:40px;width:auto;border:0;">`
    : `<span style="color:${BRAND};font-size:20px;font-weight:bold;letter-spacing:1px;">${escapeHtml(name)}</span>`;

  const link = (href, label) =>
    `<a href="${escapeHtml(href)}" style="color:${BRAND};text-decoration:none;font-weight:600;">${escapeHtml(label)}</a>`;

  // [Arabic label, English label, value as HTML]. Rows with no value are left out.
  const rows = [
    ['السيارة', 'Car', escapeHtml(car)],
    ['المعرض', 'Showroom', escapeHtml(showroom)],
    ['الخطة', 'Plan', escapeHtml(`${request.days} days · ${request.days} يوم`)],
    ['السعر', 'Price', escapeHtml(price)],
    ['الجوال', 'Mobile', request.phone
      ? `${link(`tel:${request.phone}`, request.phone)} &nbsp;·&nbsp; ${link(`https://wa.me/${wa}`, 'WhatsApp')}`
      : ''],
    ['البريد', 'Email', request.email ? link(`mailto:${request.email}`, request.email) : ''],
    ['ملاحظة', 'Note', escapeHtml(request.note)],
  ].filter(([, , value]) => value);

  const html = `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="background:linear-gradient(135deg,${BRAND} 0%,#06170E 100%);padding:36px 20px;text-align:center;">
    <div style="display:inline-block;background:#ffffff;padding:12px 26px;border-radius:12px;">
      ${mark}
    </div>
  </div>

  <div style="max-width:560px;margin:-18px auto 0;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(11,107,58,.10);">
    <div style="padding:28px 28px 8px;text-align:center;">
      <h1 style="margin:0 0 4px;font-size:22px;color:#1f2937;">New promotion request</h1>
      <p dir="rtl" style="margin:0 0 6px;font-size:18px;color:#1f2937;">طلب ترويج جديد</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">A seller asked to feature a car. Contact them to arrange payment, then approve or reject it.</p>
    </div>

    <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0 8px;font-size:14px;">
      ${rows.map(([ar, en, value]) => `
      <tr>
        <td style="padding:10px 28px;border-top:1px solid #f0f0f0;color:#6b7280;white-space:nowrap;vertical-align:top;width:1%;">${en}<br><span dir="rtl" style="font-size:12px;color:#9ca3af;">${ar}</span></td>
        <td style="padding:10px 28px 10px 0;border-top:1px solid #f0f0f0;color:#1f2937;vertical-align:top;">${value}</td>
      </tr>`).join('')}
    </table>

    <div style="padding:8px 28px 28px;text-align:center;">
      <a href="${escapeHtml(request.adminUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:10px;">Review request · مراجعة الطلب</a>
    </div>
  </div>

  <p style="max-width:560px;margin:16px auto 32px;text-align:center;font-size:11px;color:#b0b0b0;">alromaihcars.com</p>
</body>
</html>`;

  const text = [
    'New promotion request · طلب ترويج جديد',
    '',
    ...rows.map(([ar, en]) => {
      const plain = {
        Car: car, Showroom: showroom, Plan: `${request.days} days`, Price: price,
        Mobile: request.phone ? `${request.phone} (WhatsApp: https://wa.me/${wa})` : '',
        Email: request.email, Note: request.note,
      }[en];
      return `${en} / ${ar}: ${plain}`;
    }),
    '',
    `Review: ${request.adminUrl}`,
  ].join('\n');

  return sendMarketplaceEmail({
    to,
    subject: `New promotion request — ${car}${showroom ? ` (${showroom})` : ''}`,
    html,
    text,
    // Replying to the alert writes to the seller.
    replyTo: request.email || undefined,
  });
}

/**
 * Sends one code. Throws on failure — the caller decides what the user is told,
 * because "we could not send it" and "we will not say whether that address
 * exists" are answers to different questions.
 */
export async function sendOtpEmail({ to, code, purpose = 'signup', locale = 'ar', minutes = 15 }) {
  const isAr = locale === 'ar';

  // The app name and logo from Admin → Settings. Imported lazily and never
  // allowed to stop a code from going out — the built-in name is the fallback.
  let brandName = null;
  let logoUrl = null;
  try {
    const { getSiteSettings } = await import('@/marketplace/db/queries/site');
    const site = await getSiteSettings();
    brandName = isAr ? site.name.ar : site.name.en;
    logoUrl = site.logoUrl;
  } catch {
    /* keep the defaults */
  }

  const payload = { code, locale, purpose, minutes, brandName, logoUrl };

  return sendMarketplaceEmail({
    to,
    subject: copyFor(purpose, isAr, brandName).subject,
    text: codeText(payload),
    html: codeHtml(payload),
  });
}
