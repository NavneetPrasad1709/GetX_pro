/**
 * Mail service — auth transactional email (verification + password reset).
 *
 * Sends via Resend when RESEND_API_KEY is configured (Step 22); otherwise logs
 * the link to the server console (dev) so flows still work without a key. The
 * server actions ALSO return the link in development for one-click testing.
 */
import { captureException } from "@sentry/nextjs";
import { getResend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { buildEmailHtml } from "@/lib/email-templates/layout";

async function sendAuthEmail(opts: {
  email: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  url: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(
      `\n[mail] ── ${opts.subject} for ${opts.email} ──\n${opts.url}\n` +
        `[mail] (set RESEND_API_KEY to send real email)\n`,
    );
    return;
  }
  try {
    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: opts.email,
      subject: opts.subject,
      html: buildEmailHtml({
        preheader: opts.heading,
        heading: opts.heading,
        body: [opts.body],
        cta: { label: opts.ctaLabel, url: opts.url },
      }),
    });
  } catch (err) {
    captureException(err);
    // Never lose the link on a transient send failure — fall back to the log.
    console.log(
      `\n[mail] send failed — ${opts.subject} link for ${opts.email}:\n${opts.url}\n`,
    );
  }
}

export async function sendVerificationEmail(
  email: string,
  url: string,
): Promise<void> {
  await sendAuthEmail({
    email,
    subject: "Verify your email — GETX",
    heading: "Verify your email",
    body: "Confirm your email address to finish setting up your GETX account. This link expires shortly.",
    ctaLabel: "Verify email",
    url,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  url: string,
): Promise<void> {
  await sendAuthEmail({
    email,
    subject: "Reset your password — GETX",
    heading: "Reset your password",
    body: "We received a request to reset your GETX password. If this was you, use the button below. If not, you can safely ignore this email.",
    ctaLabel: "Reset password",
    url,
  });
}
