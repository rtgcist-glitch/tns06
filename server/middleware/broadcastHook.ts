/**
 * Broadcast Hook Middleware
 * SSE client management & Supabase Realtime broadcast
 */

import express from "express";
import { supabase } from "../config/supabase";
import { extractImagesFromPayload } from "../services/imageService";
import type { SseClient } from "../types/server";

let sseClients: SseClient[] = [];

// Initialize Supabase Realtime channel for broadcasting safely
let supabaseRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabaseRealtimeChannel = supabase.channel("app-updates");
    supabaseRealtimeChannel.subscribe((status) => {
      console.log(`[Supabase Realtime] Server subscription status: ${status}`);
    });
  }
} catch (err) {
  console.warn("[Supabase Realtime] Could not subscribe channel at init:", err);
}

export function broadcastStateUpdate() {
  // 1. Broadcast over Supabase Realtime
  if (supabaseRealtimeChannel) {
    supabaseRealtimeChannel.send({
      type: "broadcast",
      event: "state_changed",
      payload: { timestamp: Date.now() },
    }).then((res) => {
      console.log("[Supabase Realtime] Broadcast sent successfully:", res);
    }).catch((err) => {
      console.error("[Supabase Realtime] Broadcast error:", err);
    });
  }

  // 2. Broadcast over SSE (as fallback)
  const message = `data: ${JSON.stringify({ type: "state_changed", timestamp: Date.now() })}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(message);
    } catch (e) {
      // Connection may have been closed
    }
  });
}

/**
 * Global hook to automatically broadcast database state changes on any successful POST/PUT/DELETE
 */
let broadcastDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const NON_MUTATING_PATHS = [
  "/auth/login",
  "/auth/email-login",
  "/realtime-stream",
  "/supabase-config",
  "/gemini/chat",
  "/system/generate-summary",
  "/system/sync-cloud",
  "/system/log-error"
];

export function applyBroadcastHook(app: express.Application) {
  app.use((req, res, next) => {
    res.on("finish", () => {
      if (req.method !== "GET" && req.path.startsWith("/api/") && res.statusCode >= 200 && res.statusCode < 300) {
        const isNonMutating = NON_MUTATING_PATHS.some((p) => req.path.includes(p));
        if (!isNonMutating) {
          if (process.env.VERCEL) {
            broadcastStateUpdate();
          } else {
            if (broadcastDebounceTimer) {
              clearTimeout(broadcastDebounceTimer);
            }
            broadcastDebounceTimer = setTimeout(() => {
              broadcastDebounceTimer = null;
              broadcastStateUpdate();
            }, 150);
          }
        }
      }
    });
    next();
  });
}

/**
 * Disable caching for all API endpoints
 */
export function applyCacheControl(app: express.Application) {
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
}

/**
 * Middleware to extract base64 images from any request payload
 */
export function applyImageExtractor(app: express.Application) {
  app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.body && req.method !== "GET") {
      try {
        req.body = await extractImagesFromPayload(req.body, req.path, req.body);
      } catch (err: any) {
        console.error("Failed to extract images from request payload:", err);
        return res.status(400).json({ error: err?.message || "ไม่สามารถประมวลผลไฟล์รูปภาพสลิปได้ค่ะ" });
      }
    }
    next();
  });
}

/**
 * SSE Realtime stream endpoint handler
 */
export function handleRealtimeStream(req: express.Request, res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const clientId = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // On Vercel Serverless Functions, send connected event and close cleanly to avoid serverless execution timeouts
  if (process.env.VERCEL) {
    res.write(`data: ${JSON.stringify({ type: "connected", clientId, serverless: true })}\n\n`);
    res.end();
    return;
  }

  const newClient: SseClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send connection acknowledgment
  res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

  // Keep-alive heartbeat
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(`: keep-alive\n\n`);
    } catch (e) {
      // Connection closed
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAliveInterval);
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
}
