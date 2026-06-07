import { signIn } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * "Continue with Google / Discord" buttons (server component).
 * A provider's button only renders when its keys exist in .env — so this is
 * safe to ship before the OAuth apps are created. Plain <form action> posts
 * mean these work even before client JS hydrates.
 */

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-[#5865F2]">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.26.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.04.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.12c.13-.1.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1 0 .13c-.6.34-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .04-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z" />
    </svg>
  );
}

export function OAuthButtons({ callbackUrl }: { callbackUrl?: string }) {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const discordEnabled = Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
  );

  if (!googleEnabled && !discordEnabled) {
    // Dev hint only — in production simply render nothing.
    if (process.env.NODE_ENV === "production") return null;
    return (
      <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
        Google/Discord login is wired but needs keys in <code>.env</code> — see{" "}
        <code>.env.example</code>. (dev-only note)
      </p>
    );
  }

  const redirectTo = safeCallbackUrl(callbackUrl);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {googleEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              <GoogleIcon /> Continue with Google
            </Button>
          </form>
        )}
        {discordEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              <DiscordIcon /> Continue with Discord
            </Button>
          </form>
        )}
      </div>
      <div
        className="flex items-center gap-3 text-xs text-muted-foreground"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
