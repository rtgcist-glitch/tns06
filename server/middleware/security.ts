/**
 * Security Middleware
 * helmet, cors, trust proxy, JSON body parser, rate limiter
 */

import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";

export function applySecurityMiddleware(app: express.Application) {
  // Trust reverse proxy (Cloud Run / Nginx) to get correct client IP
  app.set("trust proxy", 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

  app.use(express.json({ limit: "10mb" }));
}

// Rate limit rules for authentication to avoid spamming/bruteforce
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Max 30 attempts per 15 minutes per IP
  message: { error: "คุณทำรายการเข้าสู่ระบบหรือกู้รหัสผ่านถี่เกินไป กรุณารอ 15 นาทีก่อนลองใหม่อีกครั้งค่ะ" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});
