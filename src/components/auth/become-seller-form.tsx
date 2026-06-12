"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  becomeSellerSchema,
  type BecomeSellerInput,
} from "@/lib/validators/auth";
import { becomeSellerAction } from "@/server/actions/auth";
import { COUNTRIES } from "@/config/countries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export function BecomeSellerForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BecomeSellerInput>({
    resolver: zodResolver(becomeSellerSchema),
    defaultValues: { displayName: "", country: "", bio: "" },
  });

  async function onSubmit(values: BecomeSellerInput) {
    setServerError(null);
    const res = await becomeSellerAction(values);
    if (!res.ok) {
      setServerError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    // Straight into the seller hub — first listing is one click away.
    router.push("/seller");
    router.refresh(); // header re-renders with the SELLER role
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="seller-display-name">Shop / display name</Label>
        <Input
          id="seller-display-name"
          placeholder="e.g. PoGo Legends Store"
          aria-invalid={!!errors.displayName}
          aria-describedby={
            errors.displayName ? "seller-display-name-error" : undefined
          }
          disabled={isSubmitting}
          {...register("displayName")}
        />
        {errors.displayName && (
          <p
            id="seller-display-name-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.displayName.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="seller-bio">
          Bio{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="seller-bio"
          placeholder="What do you sell? Why should buyers trust you?"
          aria-invalid={!!errors.bio}
          aria-describedby={errors.bio ? "seller-bio-error" : undefined}
          disabled={isSubmitting}
          {...register("bio")}
        />
        {errors.bio && (
          <p
            id="seller-bio-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.bio.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="seller-country">Country</Label>
        <NativeSelect
          id="seller-country"
          defaultValue=""
          autoComplete="country-name"
          aria-invalid={!!errors.country}
          aria-describedby={errors.country ? "seller-country-error" : undefined}
          disabled={isSubmitting}
          {...register("country")}
        >
          <option value="" disabled>
            Select your country
          </option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        {errors.country && (
          <p
            id="seller-country-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.country.message}
          </p>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          disabled={isSubmitting}
          aria-invalid={!!errors.agreeTerms}
          aria-describedby={
            errors.agreeTerms ? "seller-terms-error" : undefined
          }
          className="mt-0.5 size-4 shrink-0 accent-primary"
          {...register("agreeTerms")}
        />
        <span className="text-muted-foreground">
          I agree to the seller terms: sell only what I own, deliver what I
          promise, and accept escrow protection on every order.
        </span>
      </label>
      {errors.agreeTerms && (
        <p
          id="seller-terms-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {errors.agreeTerms.message}
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

      {/* default variant already styles the primary button — an explicit
          bg-primary here would override the AA-compliant -strong fill. */}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Opening your shop…" : "Open my shop — free"}
      </Button>
    </form>
  );
}
