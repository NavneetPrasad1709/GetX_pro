/**
 * Mail service — DEV implementation.
 *
 * Real email (Resend) lands in Step 22. Until then auth links are logged to
 * the server console; in development the server actions ALSO return the link
 * so the UI can render it for one-click testing.
 */

export async function sendVerificationEmail(
  email: string,
  url: string,
): Promise<void> {
  console.log(
    `\n[mail] ── Email verification link for ${email} ──\n${url}\n` +
      `[mail] (Real email arrives with Resend in Step 22)\n`,
  );
}

export async function sendPasswordResetEmail(
  email: string,
  url: string,
): Promise<void> {
  console.log(
    `\n[mail] ── Password reset link for ${email} ──\n${url}\n` +
      `[mail] (Real email arrives with Resend in Step 22)\n`,
  );
}
