/**
 * Notification Service
 * Centralized notification creation helper
 */

import { supabase } from "../config/supabase";
import { generateId } from "../utils/idGenerator";

export async function createNotification(userId: string, title: string, message: string, type: string, referenceId?: string, referenceType?: string) {
  const newNot = {
    id: generateId("not"),
    user_id: userId,
    title,
    message,
    type,
    reference_id: referenceId,
    reference_type: referenceType,
    is_read: false,
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from("notifications").insert(newNot);
  if (error) console.error("[Notification] Failed:", error.message);
}

export async function createNotificationsBulk(
  userIds: string[],
  title: string,
  message: string,
  type: string,
  referenceId?: string,
  referenceType?: string
) {
  if (!userIds || userIds.length === 0) return;
  const now = new Date().toISOString();
  const rows = userIds.map((userId) => ({
    id: generateId("not"),
    user_id: userId,
    title,
    message,
    type,
    reference_id: referenceId,
    reference_type: referenceType,
    is_read: false,
    created_at: now
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("[Notification Bulk] Failed:", error.message);
}
