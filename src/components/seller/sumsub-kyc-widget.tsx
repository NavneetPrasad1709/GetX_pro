"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { BadgeCheckIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import {
  getOrCreateApplicantAction,
  pollKycStatusAction,
} from "@/server/actions/kyc-sumsub";

// SDK is client-only (uses window) — load it lazily, never on the server.
const SumsubWebSdk = dynamic(() => import("@sumsub/websdk-react"), { ssr: false });

type Phase = "loading" | "disabled" | "error" | "sdk" | "polling" | "approved" | "rejected" | "review";

const MAX_POLLS = 30;

/**
 * Sumsub embedded KYC (Step 29). Boots an applicant + SDK token via a server action; on no-keys it
 * returns "disabled" and this renders null so the parent shows the manual upload flow. After the SDK
 * `onComplete`, polls the server every 10s (≤5 min) for the GREEN/RED verdict.
 */
export function SumsubKycWidget({ onUnavailable }: { onUnavailable?: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const polls = useRef(0);

  const boot = useCallback(async () => {
    // NOTE: no synchronous setState here — phase starts at "loading"; the result sets it async.
    const res = await getOrCreateApplicantAction();
    if ("error" in res) {
      if (res.error === "sumsub_disabled" || res.error === "forbidden") {
        setPhase("disabled");
        onUnavailable?.();
      } else {
        setPhase("error");
      }
      return;
    }
    setToken(res.sdkToken);
    setPhase("sdk");
  }, [onUnavailable]);

  useEffect(() => {
    // boot() only setStates AFTER an awaited server action (standard async-on-mount) — the rule
    // can't see through the useCallback, so the setState is not actually synchronous here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void boot();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [boot]);

  function startPolling() {
    setPhase("polling");
    polls.current = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      polls.current += 1;
      const { status } = await pollKycStatusAction();
      if (status === "APPROVED") {
        clearInterval(pollRef.current!);
        setPhase("approved");
        router.refresh();
      } else if (status === "REJECTED") {
        clearInterval(pollRef.current!);
        setPhase("rejected");
      } else if (polls.current >= MAX_POLLS) {
        clearInterval(pollRef.current!);
        setPhase("review");
      }
    }, 10_000);
  }

  if (phase === "disabled") return null; // parent renders the manual fallback

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Preparing secure verification…
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="mb-2 text-destructive">Couldn&apos;t start verification. Please try again.</p>
        <button type="button" onClick={() => { setPhase("loading"); void boot(); }} className="rounded-md bg-primary-strong px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Try again
        </button>
      </div>
    );
  }

  if (phase === "approved") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
        <BadgeCheckIcon className="size-5 shrink-0 text-success" aria-hidden="true" />
        <span><span className="font-semibold">Identity verified!</span> You can now create listings.</span>
      </div>
    );
  }

  if (phase === "rejected") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <XCircleIcon className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <span>Verification failed. Please <a href="mailto:support@getx.live" className="font-semibold text-primary hover:underline">contact support</a>.</span>
      </div>
    );
  }

  if (phase === "polling") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <Loader2Icon className="size-4 animate-spin text-primary" aria-hidden="true" />
        Verifying your identity…
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
        Verification under review — we&apos;ll notify you shortly.
      </div>
    );
  }

  // phase === "sdk"
  return (
    <div className="w-full min-h-[600px] rounded-lg border border-border bg-card p-2">
      {token ? (
        <SumsubWebSdk
          accessToken={token}
          expirationHandler={async () => {
            const res = await getOrCreateApplicantAction();
            return "error" in res ? "" : res.sdkToken;
          }}
          onMessage={() => {}}
          onError={() => setPhase("error")}
          options={{ addViewportTag: false, adaptIframeHeight: true }}
          // @ts-expect-error — older typings don't list onComplete; the SDK fires it at flow end
          onComplete={() => startPolling()}
        />
      ) : null}
    </div>
  );
}
