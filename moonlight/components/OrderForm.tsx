"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ISLAMIC_VALUES, orderSchema, type OrderValues } from "@/lib/order";
import { submitOrder } from "@/lib/submitOrder";
import { cn } from "@/lib/utils";

const ages = ["2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

export function OrderForm({
  signedInEmail,
  signedInHasCredits = false,
}: {
  signedInEmail?: string | null;
  signedInHasCredits?: boolean;
}) {
  const router = useRouter();
  const lockedParentEmail = signedInEmail?.trim() || "";
  const isParentEmailLocked = Boolean(lockedParentEmail);
  const isSignedIn = Boolean(lockedParentEmail);
  const showFastTestOption = process.env.NODE_ENV !== "production";
  const fiveMinuteComingSoon = true;

  const form = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      childName: "",
      childAge: "5",
      interests: "",
      islamicValue: "patience",
      lengthMinutes: "2",
      narratorVoice: "female",
      parentEmail: lockedParentEmail,
      note: "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError: setFormError,
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    const result = await submitOrder(values);
    if (!result.ok) {
      setFormError("root", { message: result.message });
      return;
    }

    if (result.checkoutUrl) {
      // Full-page navigation to hosted Stripe checkout (external URL).
      // Stripe's success_url will route back to /thank-you?order_id=... where
      // the poller takes over.
      window.location.assign(result.checkoutUrl);
      return;
    }

    // Subscription-funded order: generation is already underway, jump the
    // customer straight to the polling screen.
    if (result.orderId) {
      router.push(`/thank-you?order_id=${result.orderId}`);
      return;
    }
    router.push("/thank-you");
  });

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-xl space-y-6 rounded-2xl border border-white/12 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur-md md:p-8"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="childName">Child&apos;s name</Label>
        <Input
          id="childName"
          autoComplete="given-name"
          className="h-11 bg-white/5"
          aria-invalid={!!errors.childName}
          {...register("childName")}
        />
        {errors.childName && (
          <p className="text-sm text-red-300">{errors.childName.message}</p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="childAge">Age</Label>
          <select
            id="childAge"
            className={cn(
              "h-11 w-full rounded-lg border border-input bg-white/5 px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              errors.childAge && "border-destructive"
            )}
            {...register("childAge")}
          >
            {ages.map((age) => (
              <option key={age} value={age}>
                {age} years
              </option>
            ))}
          </select>
          {errors.childAge && (
            <p className="text-sm text-red-300">{errors.childAge.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="islamicValue">Islamic value to reinforce</Label>
          <select
            id="islamicValue"
            className="h-11 w-full rounded-lg border border-input bg-white/5 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            {...register("islamicValue")}
          >
            {ISLAMIC_VALUES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="interests">What they love</Label>
        <Textarea
          id="interests"
          rows={3}
          placeholder="Dinosaurs, the moon, helping in the kitchen…"
          className="bg-white/5"
          aria-invalid={!!errors.interests}
          {...register("interests")}
        />
        {errors.interests && (
          <p className="text-sm text-red-300">{errors.interests.message}</p>
        )}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Story length</legend>
        <p className="text-sm text-white/60">
          2- and 3-minute stories are live now. 5-minute stories are coming
          soon.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              value="2"
              className="size-4 accent-amber-200"
              {...register("lengthMinutes")}
            />
            2 minutes
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              value="3"
              className="size-4 accent-amber-200"
              {...register("lengthMinutes")}
            />
            3 minutes
          </label>
          <label
            className={cn(
              "flex items-center gap-2 text-sm",
              fiveMinuteComingSoon
                ? "cursor-not-allowed text-white/50"
                : "cursor-pointer"
            )}
          >
            <input
              type="radio"
              value="5"
              className="size-4 accent-amber-200"
              disabled={fiveMinuteComingSoon}
              {...register("lengthMinutes")}
            />
            5 minutes (coming soon)
          </label>
          {showFastTestOption && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-amber-100/80">
              <input
                type="radio"
                value="test_5s"
                className="size-4 accent-amber-200"
                {...register("lengthMinutes")}
              />
              5 seconds (dev test)
            </label>
          )}
        </div>
        {errors.lengthMinutes && (
          <p className="text-sm text-red-300">{errors.lengthMinutes.message}</p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Narrator voice</legend>
        <p className="text-sm text-white/60">
          Choose the voice style your child prefers.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              value="female"
              className="size-4 accent-amber-200"
              {...register("narratorVoice")}
            />
            Female voice
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              value="male"
              className="size-4 accent-amber-200"
              {...register("narratorVoice")}
            />
            Male voice
          </label>
        </div>
        {errors.narratorVoice && (
          <p className="text-sm text-red-300">{errors.narratorVoice.message}</p>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="parentEmail">Parent email</Label>
        <Input
          id="parentEmail"
          type="email"
          autoComplete="email"
          inputMode="email"
          className={cn(
            "h-11 bg-white/5",
            isParentEmailLocked && "cursor-not-allowed opacity-80"
          )}
          aria-invalid={!!errors.parentEmail}
          readOnly={isParentEmailLocked}
          disabled={isParentEmailLocked}
          {...register("parentEmail")}
        />
        <p className="text-xs leading-relaxed text-white/55">
          {isParentEmailLocked
            ? "Using your signed-in account email. Sign out first if you need to order with a different email."
            : "Use your best email — Stripe sends your receipt here, and if you later create an account with this same address, we can attach your stories to your library automatically."}
        </p>
        {errors.parentEmail && (
          <p className="text-sm text-red-300">{errors.parentEmail.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Optional note</Label>
        <Textarea
          id="note"
          rows={2}
          placeholder="Siblings' names, how your child calls you, sensitivities…"
          className="bg-white/5"
          {...register("note")}
        />
      </div>

      {errors.root && (
        <p className="rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {errors.root.message}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting}
        className="w-full min-h-12 text-base shadow-lg shadow-amber-900/25"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Sending details…
          </>
        ) : (
          isSignedIn
            ? signedInHasCredits
              ? "Use 1 story credit and submit"
              : "Pay $4.99 and get 3 story credits"
            : "Pay $4.99 and submit"
        )}
      </Button>

      <p className="text-center text-xs leading-relaxed text-white/55">
        Pay through secure Stripe checkout. You&apos;ll return here — no signup
        required to listen. We prepare your story and open the player on this
        site in about a minute.
      </p>
    </form>
  );
}
