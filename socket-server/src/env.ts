/** Validated environment for the socket server (Step 11). */
export type Env = {
  port: number;
  allowedOrigin: string;
  appUrl: string;
  socketAuthSecret: string;
  internalApiSecret: string;
};

export function loadEnv(): Env {
  const socketAuthSecret = process.env.SOCKET_AUTH_SECRET ?? "";
  const internalApiSecret = process.env.INTERNAL_API_SECRET ?? "";
  // Fail fast — without these the server can neither authenticate sockets nor
  // persist messages, so refuse to start (Railway shows the crash + logs).
  if (!socketAuthSecret || !internalApiSecret) {
    throw new Error(
      "[socket-server] SOCKET_AUTH_SECRET and INTERNAL_API_SECRET are required",
    );
  }
  return {
    port: Number(process.env.PORT ?? 4000),
    allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    socketAuthSecret,
    internalApiSecret,
  };
}
