/**
 * Image Service
 * Image extraction, validation, and storage helpers
 * Integrated with Google Drive Service Account
 */

import { supabase } from "../config/supabase";
import { ENV } from "../config/env";
import * as drive from "./googleDriveService";
import { getCurrentBuddhistYear, getCurrentMonth } from "../utils/thaiMonths";
import { generateId } from "../utils/idGenerator";

/**
 * Helper to determine the organized path & filename based on API route context
 */
async function determineTargetFolderAndFilename(
  path?: string,
  body?: any
): Promise<{ folderId: string; filename: string }> {
  const rootLink = ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK || "";
  const rootFolderId = drive.parseFolderId(rootLink);
  
  let targetFolderId = rootFolderId;
  let filename = `image_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
  
  if (!rootFolderId) {
    return { folderId: "", filename };
  }
  
  try {
    // 1. Monthly bills path
    if ((path === "/api/payments/submit" || path === "/api/payments/upload-slip-admin") && body) {
      const { billId, userId } = body;
      const { data: bill } = await supabase.from("monthly_bills").select("month, year").eq("id", billId).single();
      const { data: user } = await supabase.from("users").select("full_name, student_id").eq("id", userId).single();
      
      const month = bill?.month || getCurrentMonth();
      const year = bill?.year || getCurrentBuddhistYear();
      const studentId = user?.student_id || "unknown";
      const fullName = user?.full_name || "member";
      
      const cleanName = fullName.replace(/[\s\/\\]+/g, "_");
      filename = `สลิป_${studentId}_${cleanName}.jpg`;
      
      const folderPath = ["ค่าบำรุงรายเดือน", `ปี พ.ศ. ${year}`, `เดือน ${String(month).padStart(2, "0")}`];
      targetFolderId = await drive.getOrCreateFolder(folderPath, rootFolderId);
    }
    
    // 2. Wednesday Market path
    else if (path && path.startsWith("/api/market/") && body) {
      const { marketWeekId, itemName } = body;
      const { data: week } = await supabase.from("market_weeks").select("week_date, team_name").eq("id", marketWeekId).single();
      
      const weekDate = week?.week_date || new Date().toISOString().split("T")[0];
      const teamName = week?.team_name || "กลุ่มจำหน่ายสินค้า";
      const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");
      
      if (path.includes("/advance/approve")) {
        filename = `สลิป_เงินทุนล่วงหน้า.jpg`;
      } else if (path.includes("/advance-additional/approve")) {
        filename = `สลิป_เงินทุนเพิ่มเติม.jpg`;
      } else if (itemName) {
        const cleanItemName = itemName.replace(/[\s\/\\]+/g, "_");
        filename = `ใบเสร็จ_สินค้า_${cleanItemName}.jpg`;
      } else {
        filename = `สลิป_ตลาด_${Date.now()}.jpg`;
      }
      
      const folderPath = ["ตลาดวันพุธ", `รอบวันที่ ${weekDate}_${cleanTeam}`];
      targetFolderId = await drive.getOrCreateFolder(folderPath, rootFolderId);
    }
    
    // 3. Activities / Projects path
    else if (path && path.startsWith("/api/activities/") && body) {
      const { activityId, title, source } = body;
      const { data: act } = await supabase.from("activities").select("title, document_urls").eq("id", activityId).single();
      
      const actTitle = act?.title || title || "โครงการกิจกรรม";
      const cleanTitle = actTitle.replace(/[\s\/\\]+/g, "_");
      
      // Check if custom Google Drive folder URL is supplied in document_urls
      const docUrls = act?.document_urls || [];
      const driveFolderUrl = docUrls.find((url: string) => url.includes("drive.google.com/drive/folders/"));
      
      if (driveFolderUrl) {
        const customFolderId = drive.parseFolderId(driveFolderUrl);
        if (customFolderId) {
          targetFolderId = customFolderId;
          console.log(`[Google Drive] Using activity specific folder: ${customFolderId}`);
        }
      } else {
        const folderPath = ["กิจกรรมและโครงการ", `โครงการ_${cleanTitle}`];
        targetFolderId = await drive.getOrCreateFolder(folderPath, rootFolderId);
      }
      
      if (path.includes("/external-income/propose")) {
        const cleanSource = (source || "ผู้สนับสนุน").replace(/[\s\/\\]+/g, "_");
        filename = `สลิป_เงินสนับสนุน_${cleanSource}.jpg`;
      } else if (path.includes("/settle/propose")) {
        filename = `สลิป_เงินทอนคงเหลือ.jpg`;
      } else if (path.includes("/budget/request")) {
        const cleanReqTitle = (title || "ใบเสร็จเบิกจ่าย").replace(/[\s\/\\]+/g, "_");
        filename = `ใบเสร็จ_ขอเบิก_${cleanReqTitle}.jpg`;
      } else {
        filename = `สลิป_กิจกรรม_${Date.now()}.jpg`;
      }
    }
    
    // 4. Default Fallback
    else {
      const folderPath = ["ทั่วไป"];
      targetFolderId = await drive.getOrCreateFolder(folderPath, rootFolderId);
    }
  } catch (err) {
    console.error("[Google Drive Path Resolver] Failed to resolve path:", err);
  }
  
  return { folderId: targetFolderId, filename };
}

/**
 * Core validation and extraction logic.
 * Saves file to Google Drive (if credentials exist) or locally in Supabase as fallback.
 */
export async function extractAndSaveImage(
  base64Str: string,
  path?: string,
  body?: any
): Promise<string> {
  if (!base64Str || typeof base64Str !== "string") return base64Str;
  if (!base64Str.startsWith("data:image/")) return base64Str;

  // 1. MIME Type Check
  const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("รูปแบบไฟล์สลิปไม่ถูกต้องค่ะ");
  }
  const mimeType = match[1];
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error("อนุญาตเฉพาะรูปภาพสลิปตระกูล JPG, PNG, และ WEBP เท่านั้นเพื่อความปลอดภัยค่ะ");
  }

  // 2. Size limit check (Max 5MB)
  const rawSizeBytes = base64Str.length * 0.75;
  if (rawSizeBytes > 5 * 1024 * 1024) {
    throw new Error("ขนาดไฟล์รูปภาพสลิปห้ามเกิน 5MB ค่ะ");
  }

  const imgId = generateId("img");

  // 3. Check if Google Drive is configured
  const driveConfigured = ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL && ENV.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK;
  
  if (driveConfigured) {
    try {
      const { folderId, filename } = await determineTargetFolderAndFilename(path, body);
      if (folderId) {
        console.log(`[Google Drive] Uploading ${filename} to folder ${folderId}...`);
        const driveResult = await drive.uploadFile(base64Str, filename, folderId);
        
        // Save the Google Drive file reference prefix in Supabase images table
        const { error } = await supabase.from("images").insert({
          id: imgId,
          base64: `google_drive:${driveResult.id}`
        });
        if (error) throw error;
        
        console.log(`[Google Drive] ✅ Successfully saved image reference ${imgId} linking to Drive File ${driveResult.id}`);
        return `/api/images/${imgId}`;
      }
    } catch (err: any) {
      console.warn("[Google Drive] Upload failed. Falling back to local storage:", err.message);
    }
  }

  // 4. Local Database Fallback (if Drive is not configured or fails)
  try {
    const { error } = await supabase.from("images").insert({ id: imgId, base64: base64Str });
    if (error) throw error;
    console.log(`[Supabase] Saved image ${imgId} locally (Fallback)`);
  } catch (err) {
    console.error("[Supabase] Failed to save image locally:", err);
    throw new Error("ไม่สามารถบันทึกไฟล์สลิปขึ้นระบบ Cloud ได้ กรุณาลองใหม่อีกครั้งค่ะ");
  }

  return `/api/images/${imgId}`;
}

export async function extractImagesFromPayload(
  obj: unknown,
  path?: string,
  body?: any
): Promise<unknown> {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    if (obj.startsWith("data:image/")) return await extractAndSaveImage(obj, path, body);
    
    // Support Wednesday Market's SLIP_URL:data:image/...|NOTE:... format
    if (obj.startsWith("SLIP_URL:data:image/")) {
      const parts = obj.split("|NOTE:");
      const rawBase64 = parts[0].replace("SLIP_URL:", "");
      const notePart = parts[1] || "";
      const savedImageUrl = await extractAndSaveImage(rawBase64, path, body);
      return `SLIP_URL:${savedImageUrl}|NOTE:${notePart}`;
    }
    
    return obj;
  }
  if (Array.isArray(obj)) {
    const newArr = [];
    for (const item of obj) {
      newArr.push(await extractImagesFromPayload(item, path, body));
    }
    return newArr;
  }
  if (typeof obj === "object") {
    const newObj: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      newObj[key] = await extractImagesFromPayload(record[key], path, body);
    }
    return newObj;
  }
  return obj;
}
