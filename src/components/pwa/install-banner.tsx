"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari proprietary flag
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Install prompt (Step 24). Android/Chrome: captures `beforeinstallprompt` and shows an Install
 * button. iOS/Safari (no such event): shows a static "Add to Home Screen" tip. Hidden when already
 * installed, dismissed (localStorage), or on desktop with no prompt. Rendered after main content.
 */
type Mode = "hidden" | "android" | "ios";

export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<Mode>("hidden");

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (isStandalone()) return;

    if (isIos()) {
      // One-time browser-capability detection — window is unavailable during render, so this
      // must run in an effect. Safe single set, not a render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("ios");
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android"); // inside an event handler — not a synchronous effect set
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const show = mode !== "hidden";
  const iosTip = mode === "ios";

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setMode("hidden");
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Install GETX"
      className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-primary bg-[#1a1b1f]/98 backdrop-blur-md duration-300 animate-in slide-in-from-bottom"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-96x96.png" alt="" width={32} height={32} className="rounded-lg" />
        <p className="min-w-0 flex-1 text-sm font-medium">
          {iosTip
            ? "Install GETX: tap Share, then “Add to Home Screen”."
            : "Install GETX for a faster, app-like experience."}
        </p>
        {iosTip ? null : (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-md bg-primary-strong px-4 py-2 font-heading text-sm font-bold text-primary-foreground hover:bg-primary-strong-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
