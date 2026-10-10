// Explicit CORS: allow-listed origins + the headers browsers need for
// cross-origin /sim/* (Vercel frontend) and /mcp (Inspector) use.
// Fail closed: production boots only with ALLOWED_ORIGINS set.
import type { CorsOptions } from "fastmcp";

const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

export function buildCors(): { cors: CorsOptions; origins: string[] } {
  const env = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const prod = process.env.NODE_ENV === "production";
  if (prod && env.length === 0) {
    throw new Error("refuse to boot: set ALLOWED_ORIGINS in production");
  }
  const origins = [...new Set([...(prod ? [] : DEV_ORIGINS), ...env])];
  const cors: CorsOptions = {
    origin: origins,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Mcp-Session-Id",
      "Mcp-Protocol-Version",
      "Last-Event-Id",
    ],
    maxAge: 86400,
  };
  return { cors, origins };
}
