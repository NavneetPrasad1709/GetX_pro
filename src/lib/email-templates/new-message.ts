import { buildEmailHtml, type EmailMessage } from "./layout";

/** New chat message email — sent to the recipient (never the sender). */
export function newMessageEmail(vars: {
  senderName: string;
  link: string; // relative path to the conversation
}): EmailMessage {
  return {
    subject: `New message from ${vars.senderName} — GETX`,
    html: buildEmailHtml({
      preheader: `${vars.senderName} sent you a message`,
      heading: `New message from ${vars.senderName}`,
      body: [
        `${vars.senderName} just messaged you on GETX. Fast replies build trust and close more sales.`,
      ],
      cta: { label: "Open chat", url: vars.link },
    }),
  };
}
