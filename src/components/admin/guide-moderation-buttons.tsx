"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishGuideAction, unpublishGuideAction } from "@/server/actions/guides";

/** Admin publish / unpublish toggle for a guide (Step 27). Each action is audit-logged server-side. */
export function GuideModerationButtons({
  guideId,
  published,
}: {
  guideId: string;
  published: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: "publish" | "unpublish") {
    startTransition(async () => {
      const res = action === "publish"
        ? await publishGuideAction(guideId)
        : await unpublishGuideAction(guideId);
      if (res.ok) router.refresh();
    });
  }

  return published ? (
    <button
      type="button"
      onClick={() => run("unpublish")}
      disabled={pending}
      className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
    >
      Unpublish
    </button>
  ) : (
    <button
      type="button"
      onClick={() => run("publish")}
      disabled={pending}
      className="rounded-md bg-primary-strong px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-strong-hover disabled:opacity-60"
    >
      Publish
    </button>
  );
}
