/**
 * Log Service
 * Centralized audit log writing helper
 */

import { supabase } from "../config/supabase";
import { generateId } from "../utils/idGenerator";

export async function writeLog(userId: string, action: string, targetType?: string, targetId?: string, details?: unknown) {
  const newLog = {
    id: generateId("log"),
    user_id: userId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details || {},
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from("logs").insert(newLog);
  if (error) console.error("[Log] Failed to write log:", error.message);
}
