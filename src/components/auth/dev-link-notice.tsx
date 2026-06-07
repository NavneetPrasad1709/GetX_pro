import Link from "next/link";

/**
 * Shows the verification/reset link in the UI — DEV ONLY (the server action
 * only returns `devLink` outside production). Replaced by real email (Resend)
 * in Step 22.
 */
export function DevLinkNotice({ url, label }: { url: string; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-left">
      <p className="font-mono text-xs tracking-widest text-primary uppercase">
        dev only
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      <Link
        href={url}
        className="mt-1 block text-sm break-all text-primary underline underline-offset-4"
      >
        {url}
      </Link>
    </div>
  );
}
