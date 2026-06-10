"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";

/** Copy-to-clipboard share box for the referral link (Prompt 22). */
export function ReferralShare({ url, code }: { url: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the input is selectable as a fallback */
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Join me on GETX", text: `Use my code ${code}`, url });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to copy */
      }
    }
    void copy();
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-sm text-foreground">{url}</code>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {copied ? <CheckIcon className="size-4 text-success" /> : <CopyIcon className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-strong px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Share2Icon className="size-4" />
          Share
        </button>
      </div>
    </div>
  );
}
