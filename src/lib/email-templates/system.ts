import { buildEmailHtml, type EmailMessage } from "./layout";

/** Generic system email — KYC decisions + platform announcements. */
export function systemEmail(vars: {
  title: string;
  body: string;
  link?: string; // optional relative path
}): EmailMessage {
  return {
    subject: `GETX — ${vars.title}`,
    html: buildEmailHtml({
      preheader: vars.title,
      heading: vars.title,
      body: [vars.body],
      cta: vars.link ? { label: "Open GETX", url: vars.link } : undefined,
    }),
  };
}
