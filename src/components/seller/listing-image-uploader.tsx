"use client";

import { useRef, useState } from "react";
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ImagePlusIcon,
  Loader2Icon,
  StarIcon,
  XIcon,
} from "lucide-react";
import {
  LISTING_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
} from "@/lib/validators/upload";
import { cn } from "@/lib/utils";

/**
 * Listing image uploader (Step 12) — replaces the Step 06 placeholder. Uploads
 * go DIRECT browser → R2 via a presigned PUT (the /api/uploads/presign route
 * validates type + size server-side first). Supports preview, reorder, set
 * primary (index 0 = cover), and delete. Stores the public URLs in form state;
 * the listing service re-verifies every URL before saving.
 */

type Uploading = { id: string; name: string; error?: string };

async function uploadToR2(file: File): Promise<string> {
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "listing-image",
      contentType: file.type,
      size: file.size,
    }),
  });
  const data: { ok?: boolean; uploadUrl?: string; publicUrl?: string; error?: string } =
    await presign.json().catch(() => ({}));
  if (!presign.ok || !data.ok || !data.uploadUrl || !data.publicUrl) {
    throw new Error(data.error ?? "Upload could not start. Please try again.");
  }
  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("Upload to storage failed. Please try again.");
  return data.publicUrl;
}

export function ListingImageUploader({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [broken, setBroken] = useState<Record<string, true>>({});

  const total = value.length + uploads.length;
  const full = total >= MAX_LISTING_IMAGES;

  async function handleFiles(files: FileList | null) {
    if (!files || disabled) return;
    const room = MAX_LISTING_IMAGES - (value.length + uploads.length);
    const picked = Array.from(files).slice(0, Math.max(0, room));
    // Accumulate locally — `value` from the closure won't update between awaits.
    let current = [...value];

    for (const file of picked) {
      if (!LISTING_IMAGE_TYPES.includes(file.type as (typeof LISTING_IMAGE_TYPES)[number])) {
        pushError(file.name, "Only JPG, PNG or WebP images.");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        pushError(file.name, "Image is over 5 MB.");
        continue;
      }
      const id = `${file.name}-${file.size}-${current.length}-${file.lastModified}`;
      setUploads((u) => [...u, { id, name: file.name }]);
      try {
        const url = await uploadToR2(file);
        current = [...current, url].slice(0, MAX_LISTING_IMAGES);
        onChange(current);
        setUploads((u) => u.filter((x) => x.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: message } : x)));
      }
    }
    if (inputRef.current) inputRef.current.value = ""; // re-pick the same file later
  }

  function pushError(name: string, error: string) {
    setUploads((u) => [...u, { id: `${name}-${Math.random()}`, name, error }]);
  }
  function dismissUpload(id: string) {
    setUploads((u) => u.filter((x) => x.id !== id));
  }

  function setPrimary(i: number) {
    if (i <= 0) return;
    const next = [...value];
    const [img] = next.splice(i, 1);
    next.unshift(img);
    onChange(next);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 min-[521px]:grid-cols-4">
        {value.map((url, i) => (
          <figure
            key={url}
            className="group/img relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary"
          >
            {broken[url] ? (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-faint">
                <ImageIcon className="size-5" aria-hidden="true" />
                <span className="text-[10px]">Preview failed</span>
              </div>
            ) : (
              // Freshly uploaded R2 URL — plain <img> for the editor preview
              // (no next/image remotePattern needed here); falls back if broken.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={i === 0 ? "Cover image" : `Image ${i + 1}`}
                className="size-full object-cover"
                onError={() => setBroken((b) => ({ ...b, [url]: true }))}
              />
            )}

            {i === 0 ? (
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-primary-strong px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                <StarIcon className="size-3" aria-hidden="true" /> Cover
              </span>
            ) : null}

            <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-background/90 to-transparent p-1.5 opacity-100 transition-opacity min-[901px]:opacity-0 min-[901px]:group-hover/img:opacity-100 min-[901px]:group-focus-within/img:opacity-100">
              <IconBtn label="Move left" disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                <ChevronLeftIcon className="size-3.5" />
              </IconBtn>
              <IconBtn label="Set as cover" disabled={disabled || i === 0} onClick={() => setPrimary(i)}>
                <StarIcon className="size-3.5" />
              </IconBtn>
              <IconBtn label="Move right" disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)}>
                <ChevronRightIcon className="size-3.5" />
              </IconBtn>
              <IconBtn label="Remove image" disabled={disabled} danger onClick={() => remove(i)}>
                <XIcon className="size-3.5" />
              </IconBtn>
            </figcaption>
          </figure>
        ))}

        {/* in-flight + failed uploads */}
        {uploads.map((u) => (
          <div
            key={u.id}
            className={cn(
              "relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-2 text-center",
              u.error ? "border-destructive/50 bg-destructive/5" : "border-border bg-card/40",
            )}
          >
            {u.error ? (
              <>
                <AlertTriangleIcon className="size-5 text-destructive" aria-hidden="true" />
                <span className="line-clamp-2 text-[10px] text-destructive">{u.error}</span>
                <button
                  type="button"
                  onClick={() => dismissUpload(u.id)}
                  className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden="true" />
                <span className="line-clamp-1 text-[10px] text-muted-foreground">{u.name}</span>
              </>
            )}
          </div>
        ))}

        {/* add tile */}
        {!full ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            <ImagePlusIcon className="size-6" aria-hidden="true" />
            <span className="text-xs font-medium">Add image</span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={LISTING_IMAGE_TYPES.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="text-xs text-faint">
        Up to {MAX_LISTING_IMAGES} images · JPG, PNG or WebP · max 5 MB each. The
        first image is the cover buyers see — drag isn&apos;t needed, use the
        arrows and ☆ to reorder.
      </p>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md bg-background/80 text-foreground backdrop-blur-sm transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30",
        danger && "hover:bg-destructive/20 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}
