"use client";

import { useEffect, useState } from "react";
// Type-only import (erased at build); the ~40KB `io` runtime is lazy-loaded
// inside the effect so it never ships in guest/marketing first-load JS (P8-T1).
import type { Socket } from "socket.io-client";

/**
 * Shared Socket.io connection hook (Step 22). Fetches a short-lived auth token
 * from `/api/socket-token`, opens the websocket, and re-mints the token on every
 * reconnect (it's only valid for a few minutes). On connect, the socket server
 * auto-joins this user to their private `user:<id>` room, so consumers can simply
 * subscribe to server-pushed events (e.g. `notification:new`).
 *
 * Returns the live `Socket` (or `null` until connected / when disabled). Consumers
 * attach their own `socket.on(event, handler)` in an effect keyed on the socket.
 */

async function fetchSocketAuth(): Promise<{ token: string; url: string } | null> {
  try {
    const res = await fetch("/api/socket-token", { method: "POST" });
    if (!res.ok) return null;
    return (await res.json()) as { token: string; url: string };
  } catch {
    return null;
  }
}

export function useSocket(enabled = true): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let s: Socket | null = null;

    void (async () => {
      const authData = await fetchSocketAuth();
      if (!active || !authData) return;

      // Lazy-load socket.io-client only for authed users who actually connect.
      const { io } = await import("socket.io-client");
      if (!active) return;

      s = io(authData.url, {
        // Re-fetch a FRESH token on every (re)connect — tokens are short-lived.
        auth: (cb) =>
          fetchSocketAuth()
            .then((a) => cb({ token: a?.token ?? "" }))
            .catch(() => cb({ token: "" })),
        transports: ["websocket"],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      setSocket(s);
    })();

    return () => {
      active = false;
      s?.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return socket;
}
