/**
 * Server-side specific TypeScript types
 */

import type express from "express";

export interface SseClient {
  id: string;
  res: express.Response;
}

// Re-usable inline types for Supabase query results
export interface BasicUser {
  id: string;
  student_id: string;
  password?: string;
  full_name: string;
  nickname?: string;
  email?: string;
  role: string;
  classroom?: string;
}

export interface MarketItemRecord {
  type: string;
  amount: number;
  quantity: number;
}

export interface ExternalIncome {
  id: string;
  amount: number;
  source: string;
  requestedBy: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  slipUrl?: string;
  activityId?: string;
  createdAt?: string;
}
