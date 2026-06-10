"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2Icon,
  Loader2Icon,
  ShieldCheckIcon,
  UploadIcon,
} from "lucide-react";
import { submitKycAction } from "@/server/actions/kyc";
import { KYC_DOC_TYPES, KYC_DOC_TYPE_LABEL, type KycDocType } from "@/lib/validators/kyc";
import {
  KYC_DOC_TYPES as KYC_MIME_TYPES,
  MAX_KYC_BYTES,
} from "@/lib/validators/upload";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ctaVariants } from "@/components/shared/cta-link";
import { cn } from "@/lib/utils";

/**
 * KYC upload (Step 12) — uploads the seller's ID document DIRECT to the PRIVATE
 * R2 bucket via a presigned PUT, then records the submission. The document is
 * never public; only admins can view it (short-lived signed GET, Step 15).
 */

type Status = "idle" | "working" | "done" | "error";

async function uploadPrivate(file: File): Promise<string> {
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "kyc-doc",
      contentType: file.type,
      size: file.size,
    }),
  });
  const data: { ok?: boolean; uploadUrl?: string; key?: string; error?: string } =
    await presign.json().catch(() => ({}));
  if (!presign.ok || !data.ok || !data.uploadUrl || !data.key) {
    throw new Error(data.error ?? "Upload could not start. Please try again.");
  }
  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("Upload to storage failed. Please try again.");
  return data.key;
}

export function KycUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<KycDocType>("NATIONAL_ID");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!KYC_MIME_TYPES.includes(file.type as (typeof KYC_MIME_TYPES)[number])) {
      setError("Upload a JPG, PNG, WebP or PDF.");
      return;
    }
    if (file.size > MAX_KYC_BYTES) {
      setError("Document is over 10 MB.");
      return;
    }

    setStatus("working");
    try {
      const key = await uploadPrivate(file);
      const res = await submitKycAction({ docType, key });
      if (!res.ok) {
        setError(res.error);
        setStatus("error");
        return;
      }
      setStatus("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (status === "done") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
        <CheckCircle2Icon className="size-5 shrink-0 text-success" aria-hidden="true" />
        <span>
          <span className="font-semibold">Document submitted.</span> Our team
          reviews verifications within 1–2 business days.
        </span>
      </div>
    );
  }

  const busy = status === "working";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheckIcon className="size-4 text-primary" aria-hidden="true" />
        Verify your identity
      </div>
      <p className="text-xs text-muted-foreground">
        Required to receive payouts. Your document is encrypted, stored privately,
        and only ever seen by our verification team — never shown publicly.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="kyc-doc-type">Document type</Label>
        <NativeSelect
          id="kyc-doc-type"
          value={docType}
          disabled={busy}
          onChange={(e) => setDocType(e.target.value as KycDocType)}
        >
          {KYC_DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {KYC_DOC_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(ctaVariants({ size: "lg" }), "w-full disabled:opacity-60")}
      >
        {busy ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Uploading…
          </>
        ) : (
          <>
            <UploadIcon className="size-4" aria-hidden="true" />
            Upload document
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={KYC_MIME_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <p className="text-center text-[11px] text-faint">
        JPG, PNG, WebP or PDF · max 10 MB · stored in a private bucket
      </p>
    </div>
  );
}
