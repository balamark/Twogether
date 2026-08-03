#!/usr/bin/env node
// Standalone SMTP connectivity check. Loads .env, runs nodemailer
// transporter.verify() to perform the AUTH handshake without sending,
// and optionally fires a test email when --to <addr> is passed.
//
//   node scripts/verify-smtp.js
//   node scripts/verify-smtp.js --to you@example.com

require('dotenv').config();
const nodemailer = require('nodemailer');

function maskEmail(addr) {
  if (!addr || typeof addr !== 'string') return '(unset)';
  // Some providers use a fixed non-email SMTP login (Resend's is literally
  // "resend"). Those aren't secrets and aren't addresses — show them as-is.
  if (!addr.includes('@')) return addr;
  const [user, domain] = addr.split('@');
  const head = user.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

// Mirrors EmailService._fromAddress() so this script exercises the same
// sender the app would actually use.
function fromAddress(smtpUser) {
  const configured = (process.env.EMAIL_FROM || '').trim();
  if (configured) {
    const angled = configured.match(/<([^>]+)>/);
    return (angled ? angled[1] : configured).trim();
  }
  return smtpUser;
}

function maskSecret(secret) {
  if (!secret) return '(unset)';
  if (secret.length <= 4) return `(len=${secret.length})`;
  return `${secret[0]}…${secret[secret.length - 1]} (len=${secret.length})`;
}

function parseArgs(argv) {
  const out = { to: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--to' && argv[i + 1]) {
      out.to = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const cfg = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };

  console.log('SMTP config:');
  console.log(`  host:   ${cfg.host || '(unset)'}`);
  console.log(`  port:   ${cfg.port}`);
  console.log(`  secure: ${cfg.secure}`);
  console.log(`  user:   ${maskEmail(cfg.user)}`);
  console.log(`  pass:   ${maskSecret(cfg.pass)}`);
  console.log(`  from:   ${maskEmail(fromAddress(cfg.user))}${process.env.EMAIL_FROM ? '' : '  (EMAIL_FROM unset — falling back to SMTP_USER)'}`);
  console.log(`  reply:  ${maskEmail(process.env.EMAIL_REPLY_TO)}`);
  console.log('');

  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.error('FAIL — one of SMTP_HOST / SMTP_USER / SMTP_PASS is unset.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  try {
    await transporter.verify();
    console.log('OK    — SMTP verify succeeded (TLS + AUTH).');
  } catch (err) {
    console.error('FAIL  — SMTP verify failed.');
    console.error(`        code:         ${err.code}`);
    console.error(`        command:      ${err.command}`);
    console.error(`        responseCode: ${err.responseCode}`);
    console.error(`        message:      ${err.message}`);
    process.exit(1);
  }

  if (args.to) {
    try {
      const info = await transporter.sendMail({
        from: `"Twogether SMTP verify" <${fromAddress(cfg.user)}>`,
        replyTo: (process.env.EMAIL_REPLY_TO || '').trim() || undefined,
        to: args.to,
        subject: 'Twogether SMTP verification',
        text: 'If you see this, the SMTP credentials in your .env are working.\n\n'
          + 'Open this message\'s raw source and confirm SPF, DKIM and DMARC all\n'
          + 'say PASS, and that the DKIM domain matches the From: domain.',
      });
      console.log(`OK    — test email sent to ${maskEmail(args.to)} (messageId=${info.messageId}).`);
    } catch (err) {
      console.error(`FAIL  — sendMail to ${maskEmail(args.to)} failed: ${err.code} ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('(skip sendMail — pass --to <addr> to send a real test email)');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
