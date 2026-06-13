"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircleIcon, SendIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * GETX AI Support widget (Step 16). A floating, streaming chat that anyone (including
 * guests) can use on shop + dashboard pages. Pure client island — all AI inference is
 * server-side at /api/support/chat. Behaviour:
 *   • Hidden entirely unless NEXT_PUBLIC_SUPPORT_ENABLED === "true" (env feature flag).
 *   • If the API returns 503 (no ANTHROPIC_API_KEY), the widget silently hides itself.
 *   • Streams SSE deltas character-by-character; 20-turn cap with a soft reset banner.
 *   • a11y: role="dialog", aria-live message list, Escape to close, focus trap.
 */

const SUPPORT_ENABLED = process.env.NEXT_PUBLIC_SUPPORT_ENABLED === "true";
const MAX_TURNS = 20;
const MAX_CHARS = 500;
const WARN_CHARS = 480;

type Role = "user" | "assistant";
type ChatMessage = { id: number; role: Role; content: string };
type SsePayload = { delta?: string; done?: boolean; escalated?: boolean; error?: string };

export function SupportWidget({ liftForBottomNav = false }: { liftForBottomNav?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false); // set when the API reports the feature is off (503)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [historyFull, setHistoryFull] = useState(false);

  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const nextId = () => ++idRef.current;

  // Auto-scroll to the newest message as content streams in.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // Focus the input when the drawer opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape to close + simple focus trap while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const resetChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setEscalated(false);
    setHistoryFull(false);
    setInput("");
  }, []);

  const send = useCallback(async () => {
    const text = input.trim().slice(0, MAX_CHARS);
    if (!text || streaming) return;
    if (messages.length >= MAX_TURNS) {
      setHistoryFull(true);
      return;
    }

    setError(null);
    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
    const assistantId = nextId();
    const history = [...messages, userMsg];
    setMessages([...history, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const dropAssistant = () =>
      setMessages((cur) => cur.filter((m) => m.id !== assistantId));

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (res.status === 503) {
        setHidden(true); // feature is off — disappear without an error
        return;
      }
      if (res.status === 429) {
        dropAssistant();
        setError("Too many messages — please wait a bit and try again.");
        return;
      }
      if (!res.ok || !res.body) {
        dropAssistant();
        setError("AI temporarily unavailable. Please try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDelta = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let payload: SsePayload;
          try {
            payload = JSON.parse(json) as SsePayload;
          } catch {
            continue;
          }
          if (payload.error) {
            setError(payload.error);
            continue;
          }
          if (typeof payload.delta === "string") {
            sawDelta = true;
            const delta = payload.delta;
            setMessages((cur) =>
              cur.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m,
              ),
            );
          }
          if (payload.done && payload.escalated) setEscalated(true);
        }
      }
      if (!sawDelta) dropAssistant();
    } catch (err) {
      dropAssistant();
      if ((err as Error).name !== "AbortError") {
        setError("Connection lost. Check your internet.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages]);

  if (!SUPPORT_ENABLED || hidden) return null;

  const charTone = input.length >= WARN_CHARS ? "text-warning" : "text-faint";

  return (
    <div
      className={cn(
        "fixed right-4 z-50 sm:right-6",
        // On pages with a ≤900px bottom nav (dashboard), lift the launcher above it.
        liftForBottomNav ? "bottom-[6rem] min-[901px]:bottom-6" : "bottom-4 sm:bottom-6",
      )}
    >
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="GETX Support Chat"
          aria-modal="false"
          className={cn(
            "flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
            // Mobile: near-full-width sheet; desktop: anchored panel.
            liftForBottomNav
              ? "fixed inset-x-3 bottom-[5.5rem] h-[66vh] max-h-[440px] min-[901px]:absolute min-[901px]:inset-auto min-[901px]:right-0 min-[901px]:bottom-14 min-[901px]:h-[520px] min-[901px]:w-[380px]"
              : "fixed inset-x-3 bottom-3 h-[70vh] max-h-[460px] sm:absolute sm:inset-auto sm:right-0 sm:bottom-14 sm:h-[520px] sm:w-[380px]",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-3">
            <span className="grid size-7 place-items-center rounded-full bg-primary-strong text-primary-foreground">
              <MessageCircleIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-heading text-sm font-semibold">GETX Support</p>
              <p className="text-[11px] text-muted-foreground">
                AI assistant · replies in seconds
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="Close support chat"
              onClick={() => setOpen(false)}
            >
              <XIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            aria-live="polite"
            aria-label="Conversation"
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 ? (
              <div className="mt-2 rounded-xl border border-border bg-background/50 p-3 text-[13px] text-muted-foreground">
                Hi! Ask me about your orders, escrow, fees, payouts or disputes. For
                anything I can&apos;t solve, I&apos;ll hand you to a human.
              </div>
            ) : null}

            {messages.map((m) => {
              const isUser = m.role === "user";
              const showDots = !isUser && m.content === "" && streaming;
              return (
                <div
                  key={m.id}
                  className={cn("flex", isUser ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap",
                      isUser
                        ? "bg-primary-strong text-primary-foreground"
                        : "border border-border bg-background/60 text-foreground",
                    )}
                  >
                    {showDots ? <TypingDots /> : m.content}
                  </div>
                </div>
              );
            })}

            {escalated ? (
              <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12px] font-medium text-success">
                Your query has been escalated — a team member will follow up.
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
              >
                {error}
              </div>
            ) : null}
          </div>

          {/* History-full reset banner */}
          {historyFull ? (
            <div className="flex items-center gap-2 border-t border-border bg-warning/10 px-3 py-2 text-[12px] text-warning">
              <span className="flex-1">Chat history full — start a new conversation?</span>
              <Button size="xs" variant="outline" onClick={resetChat}>
                New chat
              </Button>
            </div>
          ) : null}

          {/* Composer */}
          <div className="border-t border-border px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={MAX_CHARS}
                disabled={streaming || historyFull}
                placeholder="Type your message…"
                aria-label="Message GETX Support"
                className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              />
              <Button
                size="icon"
                aria-label="Send message"
                disabled={streaming || historyFull || input.trim().length === 0}
                onClick={() => void send()}
              >
                <SendIcon className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-1 flex justify-between px-0.5">
              <span className="text-[10px] text-faint">Enter to send · Shift+Enter for a new line</span>
              <span className={cn("text-[10px] tabular-nums", charTone)}>
                {input.length}/{MAX_CHARS}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating launcher */}
      <button
        type="button"
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-14 place-items-center rounded-full bg-primary-strong text-primary-foreground shadow-xl transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {open ? (
          <XIcon className="size-6" aria-hidden="true" />
        ) : (
          <MessageCircleIcon className="size-6" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </span>
  );
}
