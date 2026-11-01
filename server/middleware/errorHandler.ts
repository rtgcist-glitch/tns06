/**
 * Error Handler Middleware
 * - asyncHandler: wraps async route handlers to catch unhandled rejections
 * - centralizedErrorHandler: catches any unhandled errors from routes
 */

import express from "express";

/**
 * Wraps an async Express route handler to properly catch and forward errors.
 * Without this, async errors would be unhandled and could crash the server.
 */
export function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>
): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Centralized error handling middleware — must be registered LAST
 */
export function centralizedErrorHandler(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
  console.error("[Centralized Server Error Handler] Caught unhandled route error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้งค่ะ",
    details: process.env.NODE_ENV !== "production" ? err.stack : undefined
  });
}
