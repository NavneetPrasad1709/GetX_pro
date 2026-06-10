"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createGuideAction } from "@/server/actions/guides";
import { GuideMarkdown } from "@/components/community/guide-markdown";
import { cn } from "@/lib/utils";

type Game = { id: string; name: string };

/**
 * New-guide editor (Step 27). Plain textarea + a live Markdown preview (Write/Preview tabs) — no heavy
 * editor dependency. Submits via the createGuideAction server action; the server gates role + validates.
 */
export function GuideEditorForm({ games, autoPublish }: { games: Game[]; autoPublish: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createGuideAction({ title, gameId, content });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/seller/guides");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "rounded-lg border p-3 text-sm",
          autoPublish
            ? "border-success/30 bg-success/10 text-success"
            : "border-warning/30 bg-warning/10 text-warning",
        )}
      >
        {autoPublish
          ? "You're a Trusted Veteran — your guide will be published immediately."
          : "Your guide will be reviewed by the GETX team before it's published."}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="g-title">Title</label>
        <input
          id="g-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 160))}
          maxLength={160}
          placeholder="e.g. How to value a Level 40 Pokémon GO account"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="g-game">Game</label>
        <select
          id="g-game"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium">Content (Markdown)</span>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            <button type="button" onClick={() => setTab("write")} className={cn("rounded px-2 py-1 font-semibold", tab === "write" ? "bg-muted text-foreground" : "text-muted-foreground")}>Write</button>
            <button type="button" onClick={() => setTab("preview")} className={cn("rounded px-2 py-1 font-semibold", tab === "preview" ? "bg-muted text-foreground" : "text-muted-foreground")}>Preview</button>
          </div>
        </div>
        {tab === "write" ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            placeholder="Write your guide in Markdown — headings, lists, code blocks all work."
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        ) : (
          <div className="min-h-[200px] rounded-lg border border-border bg-card p-3">
            {content.trim() ? <GuideMarkdown content={content} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
          </div>
        )}
        <p className="mt-1 text-xs text-faint">{content.length} characters · minimum 100</p>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending || !title.trim() || !gameId || content.trim().length < 100}>
          {pending ? "Publishing…" : autoPublish ? "Publish guide" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
