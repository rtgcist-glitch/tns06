/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Entry Point - Modular Architecture
 * Supabase PostgreSQL Backend
 * 
 * Refactored from monolithic server.ts (2,189 lines) into modular structure
 * All API endpoints, business logic, and behavior are preserved identically
 */

import express from "express";
import path from "path";

// Config (must be first - validates env and initializes Supabase)
import { validateEnv, ENV } from "./config/env";
validateEnv();

import { testSupabaseConnection, supabase } from "./config/supabase";

// Middleware
import { applySecurityMiddleware } from "./middleware/security";
import { applyBroadcastHook, applyCacheControl, applyImageExtractor } from "./middleware/broadcastHook";
import { centralizedErrorHandler } from "./middleware/errorHandler";

// Route modules
import authRoutes from "./routes/auth";
import systemRoutes from "./routes/system";
import billsRoutes from "./routes/bills";
import paymentsRoutes from "./routes/payments";
import marketRoutes from "./routes/market";
import activitiesRoutes from "./routes/activities";
import membersRoutes from "./routes/members";
import miscRoutes from "./routes/misc";
import publicPreviewRoutes from "./routes/publicPreview";

// =============================================
// Global process exception handlers (stability)
// =============================================
process.on("uncaughtException", (err) => {
  console.error("CRITICAL: Caught uncaughtException:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL: Caught unhandledRejection:", reason);
});

// =============================================
// Graceful shutdown for Cloud Run
// =============================================
function setupGracefulShutdown(server: ReturnType<typeof app.listen>) {
  const shutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("[Server] HTTP server closed.");
      process.exit(0);
    });
    // Force close after 10 seconds
    setTimeout(() => {
      console.error("[Server] Force closing after timeout.");
      process.exit(1);
    }, 10000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// =============================================
// Auto cleanup helper for monthly bill slips older than 30 days
// =============================================
async function runAutoCleanupOldSlips() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString();

    const { data: oldPayments, error: fetchError } = await supabase
      .from("payments")
      .select("id, slip_url")
      .lt("created_at", dateStr)
      .like("slip_url", "/api/images/%");

    if (fetchError) throw fetchError;
    if (!oldPayments || oldPayments.length === 0) return;

    const imageIds = oldPayments.map(p => p.slip_url.replace("/api/images/", ""));

    // Fetch the images to inspect if they are stored in Google Drive or are base64
    const { data: dbImages, error: imgError } = await supabase
      .from("images")
      .select("id, base64")
      .in("id", imageIds);

    if (imgError) throw imgError;

    const base64ImageIds = (dbImages || [])
      .filter(img => img.base64 && !img.base64.startsWith("google_drive:"))
      .map(img => img.id);

    const driveImagesCount = (dbImages || []).length - base64ImageIds.length;

    console.log(`[Auto Cleanup] Found ${oldPayments.length} old monthly bill slips. ${base64ImageIds.length} are base64 (to be deleted), ${driveImagesCount} are on Google Drive (will be skipped).`);

    if (base64ImageIds.length > 0) {
      const { error: deleteError } = await supabase.from("images").delete().in("id", base64ImageIds);
      if (deleteError) throw deleteError;

      const paymentIdsToUpdate = oldPayments
        .filter(p => {
          const imgId = p.slip_url.replace("/api/images/", "");
          return base64ImageIds.includes(imgId);
        })
        .map(p => p.id);

      if (paymentIdsToUpdate.length > 0) {
        const { error: updateError } = await supabase.from("payments").update({ slip_url: "" }).in("id", paymentIdsToUpdate);
        if (updateError) throw updateError;
      }
      console.log(`[Auto Cleanup] Successfully cleaned up ${base64ImageIds.length} base64 monthly bill slips.`);
    } else {
      console.log("[Auto Cleanup] No base64 monthly bill slips to clean up.");
    }
  } catch (err: any) {
    console.error("[Auto Cleanup] Error:", err.message);
  }
}

// =============================================
// Express App Setup
// =============================================
const app = express();

// 1. Security middleware (helmet, cors, body parser, trust proxy)
applySecurityMiddleware(app);

// 2. Broadcast hook (auto-broadcast on successful mutations)
applyBroadcastHook(app);

// 3. Cache control for API routes
applyCacheControl(app);

// 4. Image extraction middleware
applyImageExtractor(app);

// 4.5 Guard if Supabase environment variables are not configured on Vercel yet
app.use("/api", (req, res, next) => {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: "ยังไม่ได้ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_KEY ในหน้า Settings -> Environment Variables ของ Vercel ค่ะ",
    });
  }
  next();
});

// 5. Mount all API routes under /api
app.use("/api", authRoutes);
app.use("/api", systemRoutes);
app.use("/api", billsRoutes);
app.use("/api", paymentsRoutes);
app.use("/api", marketRoutes);
app.use("/api", activitiesRoutes);
app.use("/api", membersRoutes);
app.use("/api", miscRoutes);
app.use("/api", publicPreviewRoutes);

// 6. Centralized error handler (must be LAST middleware)
app.use(centralizedErrorHandler);

// =============================================
// Server Start
// =============================================
async function startServer() {
  if (ENV.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const viteReact = (await import("@vitejs/plugin-react")).default;
    const tailwindcss = (await import("@tailwindcss/vite")).default;

    const vite = await createViteServer({
      configFile: false,
      plugins: [viteReact(), tailwindcss()],
      resolve: {
        alias: {
          "@": path.resolve(process.cwd(), "src"),
        },
      },
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(ENV.PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${ENV.PORT}`);
  });

  // Graceful shutdown
  setupGracefulShutdown(server);

  // Test Supabase connection on startup
  console.log("[Supabase] Testing connection...");
  await testSupabaseConnection();

  // Run auto cleanup and schedule it every 24 hours
  await runAutoCleanupOldSlips();
  setInterval(runAutoCleanupOldSlips, 24 * 60 * 60 * 1000);
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;
