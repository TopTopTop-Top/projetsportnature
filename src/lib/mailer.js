/**
 * Envoi d'emails. Si SMTP_URL ou SMTP_HOST est défini et que `nodemailer` est installé,
 * envoie réellement ; sinon écrit le message dans la console (mode « log »).
 *
 * Variables : SMTP_URL  ou  SMTP_HOST [SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS], MAIL_FROM
 */

let cachedTransport;

function isSmtpConfigured() {
  return !!(process.env.SMTP_URL || process.env.SMTP_HOST);
}

function getTransport() {
  if (cachedTransport !== undefined) return cachedTransport;
  cachedTransport = null;
  if (!isSmtpConfigured()) return null;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const nodemailer = require("nodemailer");
    if (process.env.SMTP_URL) {
      cachedTransport = nodemailer.createTransport(process.env.SMTP_URL);
    } else {
      const port = Number(process.env.SMTP_PORT) || 587;
      const secure =
        process.env.SMTP_SECURE != null
          ? /^(1|true|yes)$/i.test(process.env.SMTP_SECURE)
          : port === 465;
      cachedTransport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
          : undefined,
      });
    }
  } catch (_e) {
    cachedTransport = null;
  }
  return cachedTransport;
}

/**
 * @param {{to:string, subject:string, text:string, html?:string}} message
 * @returns {Promise<{mode:'smtp'|'log', previewUrl:string|null, messageId?:string}>}
 */
async function sendMail({ to, subject, text, html } = {}) {
  const transport = getTransport();
  if (!transport) {
    console.log(
      `[mailer:log] To: ${to}\n[mailer:log] Subject: ${subject}\n[mailer:log]\n${String(
        text || ""
      )
        .split("\n")
        .map((l) => `[mailer:log] ${l}`)
        .join("\n")}`
    );
    return { mode: "log", previewUrl: null };
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "RavitoBox <no-reply@ravitobox.local>";
  const info = await transport.sendMail({ from, to, subject, text, html });
  let previewUrl = null;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    previewUrl = require("nodemailer").getTestMessageUrl(info) || null;
  } catch (_e) {
    previewUrl = null;
  }
  return { mode: "smtp", previewUrl, messageId: info.messageId };
}

module.exports = { sendMail, isSmtpConfigured };
