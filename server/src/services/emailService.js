import { config } from '../lib/config.js';

// PRD FR-24 (P2) — email is a SECOND channel only, and only when SMTP is
// configured. The in-app notification is always the primary, guaranteed
// channel; email is a best-effort mirror and its failure never blocks or
// fails the underlying event. With no SMTP configured this is a safe no-op.
let testTransport = null;
export function __setEmailTransportForTests(fn) {
  testTransport = fn;
}

export async function sendEmail({ to, subject, text }) {
  try {
    if (testTransport) return await testTransport({ to, subject, text });
    if (!config.smtp) return { skipped: true, reason: 'SMTP not configured' };
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.warn('Email mirror failed (in-app notification already delivered):', err.message);
    return { error: err.message };
  }
}
