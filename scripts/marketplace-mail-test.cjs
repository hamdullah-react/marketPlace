/**
 * Checks the marketplace mail account end to end, outside Next.
 *
 *   node scripts/marketplace-mail-test.cjs you@example.com
 *
 * Two steps, reported separately, because they fail for different reasons:
 *   1. login   — wrong host/port/user/API key
 *   2. send    — login fine, but the provider refuses to relay (usually the
 *                From domain is not verified with the provider yet)
 *
 * Reads .env.local the same way src/marketplace/auth/mailer.js does:
 * MARKETPLACE_SMTP_* when MARKETPLACE_SMTP_HOST is set, otherwise SMTP_*.
 */

const nodemailer = require('nodemailer');

try {
  process.loadEnvFile('.env.local');
} catch {
  console.error('Could not read .env.local — run this from the project root.');
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/marketplace-mail-test.cjs you@example.com');
  process.exit(1);
}

const p = process.env.MARKETPLACE_SMTP_HOST ? 'MARKETPLACE_SMTP_' : 'SMTP_';
const read = (name) => process.env[`${p}${name}`] || '';
const port = parseInt(read('PORT') || '587', 10);
const cfg = {
  host: read('HOST'),
  port,
  secure: read('SECURE') ? read('SECURE') === 'true' : port === 465,
  user: read('USER'),
  pass: read('PASSWORD'),
  from: read('FROM') || 'info@alromaihcars.com',
};

const missing = ['host', 'user', 'pass'].filter((k) => !cfg[k]);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.map((k) => p + (k === 'pass' ? 'PASSWORD' : k.toUpperCase())).join(', ')}`);
  process.exit(1);
}
if (/PASTE_YOUR/i.test(cfg.pass)) {
  console.error(`${p}PASSWORD is still the placeholder — paste your real API key.`);
  process.exit(1);
}

console.log(`Using ${p}*  →  ${cfg.host}:${cfg.port} (secure=${cfg.secure}) as ${cfg.user}, from ${cfg.from}`);

const transport = nodemailer.createTransport({
  host: cfg.host,
  port: cfg.port,
  secure: cfg.secure,
  auth: { user: cfg.user, pass: cfg.pass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

(async () => {
  try {
    await transport.verify();
    console.log('1. login  OK');
  } catch (e) {
    console.error(`1. login  FAILED: ${e.message}`);
    process.exit(1);
  }

  try {
    const info = await transport.sendMail({
      from: cfg.from,
      to,
      subject: 'Alromaih Marketplace — mail test',
      text: 'If you can read this, marketplace email (OTP codes) is working. Test code: 12345678',
    });
    if (info.rejected?.length) throw new Error(`recipient refused: ${info.rejected.join(', ')}`);
    console.log(`2. send   OK → ${to} (${info.messageId})`);
  } catch (e) {
    console.error(`2. send   FAILED: ${e.message}`);
    console.error('   If login worked, check the From domain is verified in your provider dashboard.');
    process.exit(1);
  }
})();
