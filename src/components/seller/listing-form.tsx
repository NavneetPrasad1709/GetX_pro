"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImageIcon, PackageIcon, ZapIcon } from "lucide-react";
import {
  listingFormSchema,
  type ListingFormInput,
  type ListingFormParsed,
  type ListingType,
} from "@/lib/validators/listing";
import {
  createListingAction,
  updateListingAction,
} from "@/server/actions/listings";
import type { FormGame } from "@/server/services/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Create/edit listing form (Step 06). One Zod schema drives client + server.
 * The submit handler sends the RAW input values — the server action runs the
 * exact same schema again (transforms price → minor units there too).
 */

export type ListingFormInitial = {
  listingId: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "SOLD" | "REMOVED";
  values: ListingFormInput;
};

type Props = {
  catalog: FormGame[];
  /** Present = edit mode. */
  initial?: ListingFormInitial;
};

/** Attribute field metadata per listing type — drives the dynamic section. */
const ATTRIBUTE_FIELDS: Record<
  ListingType,
  Array<{
    key: string;
    label: string;
    placeholder: string;
    inputMode?: "numeric";
  }>
> = {
  ACCOUNT: [
    { key: "level", label: "Level", placeholder: "e.g. 40", inputMode: "numeric" },
    { key: "rank", label: "Rank", placeholder: "e.g. Legend League" },
    { key: "server", label: "Server / region", placeholder: "e.g. Asia" },
  ],
  ITEM: [
    { key: "rarity", label: "Rarity", placeholder: "e.g. Legendary" },
    { key: "server", label: "Server / region", placeholder: "e.g. Europe" },
  ],
  CURRENCY: [
    {
      key: "amount",
      label: "Amount per unit",
      placeholder: "e.g. 1000",
      inputMode: "numeric",
    },
    { key: "unit", label: "Unit", placeholder: "e.g. Diamonds" },
  ],
  BOOSTING: [
    { key: "currentRank", label: "From rank", placeholder: "e.g. Gold" },
    { key: "desiredRank", label: "To rank", placeholder: "e.g. Immortal" },
    {
      key: "estimatedDays",
      label: "Estimated days",
      placeholder: "e.g. 7",
      inputMode: "numeric",
    },
  ],
};

const TYPE_HINT: Record<ListingType, string> = {
  ACCOUNT: "Accounts are unique — stock is usually 1.",
  ITEM: "Stock = how many of this item you can deliver.",
  CURRENCY: "Stock = how many top-ups you can fulfil.",
  BOOSTING: "Stock = how many boost orders you can run in parallel.",
};

export function ListingForm({ catalog, initial }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = !!initial;
  // Editing a live/paused listing never re-drafts it; only DRAFT can publish.
  const canPublish = !initial || initial.status === "DRAFT";

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
    // Three generics: raw input values, context, Zod-transformed output —
    // the resolver validates input and hands the handler the parsed shape.
  } = useForm<ListingFormInput, unknown, ListingFormParsed>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: initial?.values ?? {
      gameId: catalog[0]?.id ?? "",
      categoryId: catalog[0]?.categories[0]?.id ?? "",
      type: catalog[0]?.categories[0]?.kind ?? "ACCOUNT",
      title: "",
      description: "",
      price: "",
      stock: 1,
      deliveryType: "MANUAL",
      attributes: {},
      publish: false,
    },
  });

  // Warn before the tab closes/reloads with unsaved work (in-app nav guard
  // isn't supported by App Router — this covers the destructive cases).
  const submittedRef = useRef(false);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (isDirty && !submittedRef.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  // RHF focuses the first invalid field (shouldFocusError default); on a long
  // mobile form also scroll it into view so the tap never feels like a no-op.
  function onInvalid() {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  const gameId = watch("gameId");
  const categoryId = watch("categoryId");

  const game = useMemo(
    () => catalog.find((g) => g.id === gameId) ?? catalog[0],
    [catalog, gameId],
  );
  const category =
    game?.categories.find((c) => c.id === categoryId) ?? game?.categories[0];
  const kind: ListingType = category?.kind ?? "ACCOUNT";

  function onGameChange(nextGameId: string) {
    const nextGame = catalog.find((g) => g.id === nextGameId);
    const nextCategory = nextGame?.categories[0];
    setValue("gameId", nextGameId);
    if (nextCategory) {
      setValue("categoryId", nextCategory.id);
      setValue("type", nextCategory.kind);
      setValue("attributes", {}); // stale type-specific fields must not leak
    }
  }

  function onCategoryChange(nextCategoryId: string) {
    const nextCategory = game?.categories.find((c) => c.id === nextCategoryId);
    setValue("categoryId", nextCategoryId);
    if (nextCategory) {
      setValue("type", nextCategory.kind);
      setValue("attributes", {});
    }
  }

  async function submit(publish: boolean) {
    setServerError(null);
    // RAW values on purpose: the server action re-runs the same Zod schema
    // (including the price string → minor-units transform).
    const values = { ...getValues(), publish };

    const res = isEdit
      ? await updateListingAction({ listingId: initial.listingId, values })
      : await createListingAction(values);

    if (!res.ok) {
      setServerError(res.error ?? "Something went wrong. Please try again.");
      return;
    }

    submittedRef.current = true; // saved — beforeunload guard stands down
    toast.success(
      publish
        ? "Listing is live! Buyers can see it now."
        : isEdit
          ? "Changes saved."
          : "Draft saved — publish it whenever you're ready.",
    );
    router.push("/seller/listings");
    router.refresh();
  }

  const attributeErrors = errors.attributes as
    | Record<string, { message?: string } | undefined>
    | undefined;

  return (
    <form
      // handleSubmit runs validation; the publish flag is set per button.
      onSubmit={handleSubmit(() => submit(false), onInvalid)}
      className="flex flex-col gap-5"
      noValidate
    >
      {/* game + category */}
      <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="listing-game">Game</Label>
          <NativeSelect
            id="listing-game"
            value={gameId}
            disabled={isSubmitting}
            onChange={(e) => onGameChange(e.target.value)}
          >
            {catalog.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="listing-category">Category</Label>
          <NativeSelect
            id="listing-category"
            value={categoryId}
            disabled={isSubmitting}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            {(game?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* title */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="listing-title">Title</Label>
        <Input
          id="listing-title"
          placeholder="e.g. Level 40 Account · 200+ Shinies · Full Access"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "listing-title-error" : undefined}
          disabled={isSubmitting}
          {...register("title")}
        />
        {errors.title && (
          <p
            id="listing-title-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.title.message}
          </p>
        )}
      </div>

      {/* description */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="listing-description">Description</Label>
        <Textarea
          id="listing-description"
          rows={6}
          placeholder="What exactly does the buyer get? Delivery process, handover details, proof you can show…"
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? "listing-description-error" : undefined
          }
          disabled={isSubmitting}
          {...register("description")}
        />
        {errors.description && (
          <p
            id="listing-description-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.description.message}
          </p>
        )}
      </div>

      {/* price + stock */}
      <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="listing-price">Price (₹ INR)</Label>
          <Input
            id="listing-price"
            inputMode="decimal"
            placeholder="e.g. 4990 or 499.99"
            aria-invalid={!!errors.price}
            aria-describedby={errors.price ? "listing-price-error" : undefined}
            disabled={isSubmitting}
            {...register("price")}
          />
          {errors.price && (
            <p
              id="listing-price-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.price.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="listing-stock">Stock</Label>
          <Input
            id="listing-stock"
            type="number"
            min={0}
            max={99999}
            inputMode="numeric"
            aria-invalid={!!errors.stock}
            aria-describedby={
              errors.stock
                ? "listing-stock-hint listing-stock-error"
                : "listing-stock-hint"
            }
            disabled={isSubmitting}
            {...register("stock")}
          />
          <p id="listing-stock-hint" className="text-xs text-faint">
            {TYPE_HINT[kind]}
          </p>
          {errors.stock && (
            <p
              id="listing-stock-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.stock.message}
            </p>
          )}
        </div>
      </div>

      {/* delivery type */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Delivery</legend>
        <div className="grid grid-cols-1 gap-2.5 min-[521px]:grid-cols-2">
          {(
            [
              {
                value: "MANUAL",
                icon: PackageIcon,
                title: "Manual",
                blurb: "You deliver via chat after payment",
              },
              {
                value: "INSTANT",
                icon: ZapIcon,
                title: "Instant",
                blurb: "Auto-delivered codes/top-ups (Step 19)",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors has-checked:border-primary/60 has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                value={opt.value}
                disabled={isSubmitting}
                className="sr-only"
                {...register("deliveryType")}
              />
              <opt.icon
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>
                <span className="block text-sm font-semibold">{opt.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {opt.blurb}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* dynamic attributes */}
      <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4">
        <legend className="px-1 text-sm font-medium">
          {category?.name ?? "Listing"} details{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-3">
          {ATTRIBUTE_FIELDS[kind].map((field) => (
            <div key={field.key} className="flex flex-col gap-2">
              <Label htmlFor={`attr-${field.key}`}>{field.label}</Label>
              <Input
                id={`attr-${field.key}`}
                inputMode={field.inputMode}
                placeholder={field.placeholder}
                aria-invalid={!!attributeErrors?.[field.key]}
                aria-describedby={
                  attributeErrors?.[field.key]
                    ? `attr-${field.key}-error`
                    : undefined
                }
                disabled={isSubmitting}
                {...register(`attributes.${field.key}` as const)}
              />
              {attributeErrors?.[field.key]?.message && (
                <p
                  id={`attr-${field.key}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {attributeErrors[field.key]?.message}
                </p>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      {/* images placeholder — real R2 uploads land in Step 12 */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card/40 p-4">
        <ImageIcon
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Images coming soon</span>{" "}
          — secure uploads arrive in Step 12. Until then your listing shows a
          smart placeholder.
        </p>
      </div>

      {/* error summary next to the buttons — on a long mobile form the first
          invalid field can be far above the fold; this makes the failed tap
          visibly DO something even before the scroll lands. */}
      {Object.keys(errors).length > 0 && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          Some fields need attention — check the highlighted inputs above.
        </p>
      )}

      {serverError && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {canPublish && (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit(() => submit(true), onInvalid)}
          >
            {isSubmitting
              ? "Working…"
              : isEdit
                ? "Save & publish"
                : "Publish listing"}
          </Button>
        )}
        <Button
          type="submit"
          variant={canPublish ? "outline" : "default"}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Working…"
            : isEdit
              ? "Save changes"
              : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
