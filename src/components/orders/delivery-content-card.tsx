"use client";

import { useState } from "react";
import { ZapIcon, CopyIcon, CheckIcon } from "lucide-react";

/**
 * Buyer's auto-delivered item (Step 19). The plaintext is decrypted SERVER-SIDE and passed in as a
 * prop — the encrypted blob never reaches the client. Highlighted card + copy-to-clipboard.
 */
export function DeliveryContentCard({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the <pre> is still selectable */
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ZapIcon className="size-4 text-primary" aria-hidden="true" />
          Your delivery
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        ⚡ Instant delivery — your item is ready. Keep it somewhere safe.
      </p>
      <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
        {content}
      </pre>
    </div>
  );
}
