/**
 * Email layout wrapper (Step 22).
 *
 * Builds a full, email-client-safe HTML document with GETX v10 branding. Rules:
 *   • Inline CSS only — Gmail/Outlook strip <style> blocks and external <link>s.
 *   • Table-based layout — the only thing that renders consistently across clients.
 *   • All interpolated text is HTML-escaped (titles / names are user-controlled).
 *   • All links are absolute — relative URLs don't work in email.
 */
import { siteConfig } from "@/config/site";

export type EmailButton = { label: string; url: string };

/** A ready-to-send email: subject line + full HTML body. */
export type EmailMessage = { subject: string; html: string };

export type EmailContent = {
  /** Hidden inbox-preview text shown after the subject in most clients. */
  preheader?: string;
  heading: string;
  /** One <p> per array entry. Plain text — escaped for you. */
  body: string[];
  cta?: EmailButton;
};

const COLOR = {
  pageBg: "#0a0b0d",
  cardBg: "#111318",
  border: "#21242c",
  accent: "#4d7cfe",
  text: "#f0f2f5",
  muted: "#8a8f9e",
} as const;

const FONT_HEAD = "'Poppins', Arial, sans-serif";
const FONT_BODY = "'Inter', system-ui, Arial, sans-serif";

/** Escape the 5 HTML-significant characters so user content can't break markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Turn a relative GETX path into an absolute URL (email links must be absolute). */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = siteConfig.url.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function buildEmailHtml(content: EmailContent): string {
  const unsubscribeUrl = absoluteUrl("/settings/notifications");
  const preheader = content.preheader ? escapeHtml(content.preheader) : "";

  const paragraphs = content.body
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${COLOR.text};">${escapeHtml(
          p,
        )}</p>`,
    )
    .join("");

  const button = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
         <tr>
           <td align="center" bgcolor="${COLOR.accent}" style="border-radius:8px;">
             <a href="${escapeHtml(absoluteUrl(content.cta.url))}" target="_blank"
                style="display:inline-block;padding:12px 26px;font-family:${FONT_HEAD};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
               ${escapeHtml(content.cta.label)}
             </a>
           </td>
         </tr>
       </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark light" />
  <title>${escapeHtml(siteConfig.name)}</title>
  <!-- Poppins/Inter load in clients that allow @import; Arial/system fallbacks elsewhere. -->
  <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.pageBg};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.pageBg};">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.pageBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
          <!-- Brand -->
          <tr>
            <td style="padding:0 4px 18px;">
              <span style="font-family:${FONT_HEAD};font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${COLOR.text};">GET<span style="color:${COLOR.accent};">X</span></span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:${COLOR.cardBg};border:1px solid ${COLOR.border};border-radius:14px;padding:30px 28px;">
              <h2 style="margin:0 0 16px;font-family:${FONT_HEAD};font-size:20px;font-weight:600;line-height:1.3;color:${COLOR.text};">${escapeHtml(
                content.heading,
              )}</h2>
              ${paragraphs}
              ${button}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:22px 4px 0;">
              <p style="margin:0;font-family:${FONT_BODY};font-size:12px;line-height:1.6;color:${COLOR.muted};">
                You received this because you have an account at ${escapeHtml(siteConfig.domain)}.
                <a href="${unsubscribeUrl}" target="_blank" style="color:${COLOR.muted};text-decoration:underline;">Manage email preferences</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
