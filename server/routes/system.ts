/**
 * System Routes
 * /api/system/diagnostics, /api/system/reset, /api/system/sync-cloud, /api/system/generate-summary, /api/system/log-error
 * /api/state, /api/settings, /api/health
 */

import { Router } from "express";
import { supabase, testSupabaseConnection, dbConnected, dbSyncError } from "../config/supabase";
import { ENV } from "../config/env";
import { convertKeysToCamel } from "../utils/camelCase";
import { getMonthThaiName, getCurrentBuddhistYear, getCurrentMonth } from "../utils/thaiMonths";
import { generateId } from "../utils/idGenerator";
import { hashPassword } from "../utils/crypto";
import { loadFullState } from "../services/stateLoader";
import { writeLog } from "../services/logService";
import { asyncHandler } from "../middleware/errorHandler";
import { getAccessToken as getDriveAccessToken, parseFolderId, getOrCreateFolder, uploadFile } from "../services/googleDriveService";
import { REAL_STUDENTS } from "../data/seedStudents";
import { User, MonthlyBill, Transaction } from "../../src/types";

const router = Router();

// Health check endpoint for Cloud Run
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), dbConnected });
});

// System Diagnostics
router.get("/system/diagnostics", asyncHandler(async (req, res) => {
  const connected = await testSupabaseConnection();
  const { count: usersCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: billsCount } = await supabase.from("monthly_bills").select("*", { count: "exact", head: true });
  const { count: paymentsCount } = await supabase.from("payments").select("*", { count: "exact", head: true });
  const { count: txCount } = await supabase.from("transactions").select("*", { count: "exact", head: true });
  const { count: actCount } = await supabase.from("activities").select("*", { count: "exact", head: true });
  const { count: petCount } = await supabase.from("petitions").select("*", { count: "exact", head: true });

  // Count raw base64 images in images table
  const { count: rawBase64ImagesCount } = await supabase
    .from("images")
    .select("id", { count: "exact", head: true })
    .not("base64", "like", "google_drive:%");

  // Count embedded market cost items base64 notes
  const { count: rawBase64MarketNotesCount } = await supabase
    .from("market_items")
    .select("id", { count: "exact", head: true })
    .like("note", "SLIP_URL:data:image/%");

  const pendingMigrationCount = (rawBase64ImagesCount || 0) + (rawBase64MarketNotesCount || 0);

  let googleDriveConnected = false;
  let googleDriveError = "";
  try {
    const token = await getDriveAccessToken();
    googleDriveConnected = !!token;
  } catch (err: any) {
    googleDriveError = err.message;
  }

  res.json({
    firebase: { connected, error: dbSyncError, databaseId: "Supabase PostgreSQL", projectId: "student_fund" },
    mongodb: { connected, error: dbSyncError, database: "student_fund", uri: ENV.SUPABASE_URL ? "configured" : "not-configured" },
    localFile: { exists: false, sizeBytes: 0, path: "N/A (using Supabase)" },
    googleDrive: { 
      connected: googleDriveConnected, 
      error: googleDriveError, 
      rootFolderLink: ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK || "not-configured",
      pendingMigrationCount
    },
    counts: { users: usersCount || 0, bills: billsCount || 0, payments: paymentsCount || 0, transactions: txCount || 0, activities: actCount || 0, petitions: petCount || 0 }
  });
}));

// Client Error Logger Endpoint
router.post("/system/log-error", asyncHandler(async (req, res) => {
  const { errorMsg, componentStack, userId, url } = req.body;
  const logId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await supabase.from("logs").insert({
    id: logId,
    user_id: userId || "anonymous",
    action: "client_error",
    target_type: "system",
    target_id: url || "client_page",
    details: {
      message: errorMsg || "Unknown React error",
      stack: componentStack || "",
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip || ""
    },
    created_at: new Date().toISOString()
  });
  res.json({ success: true, logId });
}));

// Generate Summary
router.post("/system/generate-summary", asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const state = await loadFullState();
  const dateReadable = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" });
  const totalBalance = (state.transactions || []).reduce((sum: number, tx: Transaction) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0) - 3802;
  const totalIncome = (state.transactions || []).filter((tx: Transaction) => tx.type === "income").reduce((sum: number, tx: Transaction) => sum + tx.amount, 0);
  const totalExpense = (state.transactions || []).filter((tx: Transaction) => tx.type === "expense").reduce((sum: number, tx: Transaction) => sum + tx.amount, 0);

  let latestCycle = { month: getCurrentMonth(), year: getCurrentBuddhistYear() };
  if (state.monthlyBills.length > 0) {
    const sorted = [...state.monthlyBills].sort((a: MonthlyBill, b: MonthlyBill) => b.year !== a.year ? b.year - a.year : b.month - a.month);
    latestCycle = { month: sorted[0].month, year: sorted[0].year };
  }
  const currentBills = state.monthlyBills.filter((b: MonthlyBill) => b.month === latestCycle.month && b.year === latestCycle.year);
  const paidMembers = currentBills.filter((b: MonthlyBill) => b.status === "paid").map((b: MonthlyBill) => { const u = state.users.find((user: User) => user.id === b.userId); return u ? `${u.fullName} (${u.nickname || ""})` : "ไม่พบ"; });
  const pendingReviewMembers = currentBills.filter((b: MonthlyBill) => b.status === "pending_review").map((b: MonthlyBill) => { const u = state.users.find((user: User) => user.id === b.userId); return u ? `${u.fullName} (${u.nickname || ""})` : "ไม่พบ"; });
  const unpaidMembers = currentBills.filter((b: MonthlyBill) => b.status === "pending").map((b: MonthlyBill) => { const u = state.users.find((user: User) => user.id === b.userId); return u ? `${u.fullName} (${u.nickname || ""})` : "ไม่พบ"; });

  const fundName = state.settings?.fundName || "เงินเก็บรุ่น";
  let summaryText = `🌟 รายงานสรุปบัญชีและสถานะกองทุน 🌟\n🏫 กองทุน: ${fundName}\n📅 อัปเดต ณ วันที่: ${dateReadable}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  summaryText += `💵 [สรุปยอดบัญชีรับ-จ่ายรวม]\n💰 ยอดเงินคงเหลือสุทธิ: ฿${totalBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n📈 รายรับสะสมทั้งหมด: ฿${totalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n📉 รายจ่ายสะสมทั้งหมด: ฿${totalExpense.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n\n`;
  summaryText += `🔔 [สถานะการจ่ายเงินค่าบำรุงรายเดือน]\nรอบบิลล่าสุด: เดือน${getMonthThaiName(latestCycle.month)} ${latestCycle.year}\n\n`;
  summaryText += `✅ ชำระเงินแล้ว (${paidMembers.length} คน):\n${paidMembers.length > 0 ? paidMembers.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  - ยังไม่มีการชำระเงิน"}\n\n`;
  summaryText += `⏳ รอตรวจสอบสลิป (${pendingReviewMembers.length} คน):\n${pendingReviewMembers.length > 0 ? pendingReviewMembers.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  - ไม่มีคิวรอยืนยัน"}\n\n`;
  summaryText += `❌ ยังไม่ได้ชำระเงิน (${unpaidMembers.length} คน):\n${unpaidMembers.length > 0 ? unpaidMembers.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  - สมาชิกทุกคนชำระครบถ้วนแล้ว! 🎉"}`;

  if (userId) await writeLog(userId, "generate_summary_backup", "system", undefined, { dateReadable });
  res.json({ success: true, summaryText, dateReadable });
}));

// System Images Migration to Google Drive
router.post("/system/migrate-images-to-drive", asyncHandler(async (req, res) => {
  const { userId, googleToken } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing parameters" });

  const { data: requester } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!requester || requester.role !== "treasurer") {
    return res.status(403).json({ error: "ขออภัย คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันการย้ายไฟล์ภาพ (เฉพาะเหรัญญิกหลักเท่านั้นค่ะ)" });
  }

  const driveConfigured = (googleToken || (ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL && ENV.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)) && ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK;
  if (!driveConfigured) {
    return res.status(400).json({ error: "กรุณาตั้งค่าลิงก์ Google Drive ในไฟล์ .env หรือเชื่อมต่อบัญชี Google ก่อนดำเนินการค่ะ" });
  }

  // 1. Fetch raw base64 images from images table
  const { data: rawImages, error: fetchErr } = await supabase
    .from("images")
    .select("id, base64")
    .not("base64", "like", "google_drive:%");

  if (fetchErr) throw fetchErr;

  let migratedCount = 0;
  const errors: string[] = [];

  const rootLink = ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK || "";
  const rootFolderId = parseFolderId(rootLink);
  if (!rootFolderId) {
    return res.status(400).json({ error: "ไม่สามารถสกัดรหัสโฟลเดอร์หลัก Google Drive จากลิงก์ที่ระบุได้ค่ะ" });
  }

  // 2. Loop through and upload to Drive
  for (const img of (rawImages || [])) {
    if (!img.base64 || !img.base64.startsWith("data:image/")) continue;

    try {
      let folderId = rootFolderId;
      let filename = `สลิป_ย้อนหลัง_${img.id}.jpg`;
      let folderPath: string[] = ["ทั่วไป"];

      // Context matching
      // A. Check payments table
      const { data: payment } = await supabase.from("payments").select("bill_id, user_id").eq("slip_url", `/api/images/${img.id}`).limit(1).maybeSingle();
      if (payment) {
        const { data: bill } = await supabase.from("monthly_bills").select("month, year").eq("id", payment.bill_id).single();
        const { data: user } = await supabase.from("users").select("full_name, student_id").eq("id", payment.user_id).single();

        const month = bill?.month || getCurrentMonth();
        const year = bill?.year || getCurrentBuddhistYear();
        const studentId = user?.student_id || "unknown";
        const fullName = user?.full_name || "member";
        const cleanName = fullName.replace(/[\s\/\\]+/g, "_");
        filename = `สลิป_${studentId}_${cleanName}.jpg`;
        folderPath = ["ค่าบำรุงรายเดือน", `ปี พ.ศ. ${year}`, `เดือน ${String(month).padStart(2, "0")}`];
      } else {
        // B. Check Wednesday Market advances
        const { data: marketWeekAdv } = await supabase.from("market_weeks").select("week_date, team_name").eq("advance_receipt_url", `/api/images/${img.id}`).limit(1).maybeSingle();
        if (marketWeekAdv) {
          const weekDate = marketWeekAdv.week_date;
          const teamName = marketWeekAdv.team_name || "กลุ่มจำหน่ายสินค้า";
          const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");
          filename = `สลิป_เงินทุนล่วงหน้า.jpg`;
          folderPath = ["ตลาดวันพุธ", `รอบวันที่ ${weekDate}_${cleanTeam}`];
        } else {
          // C. Check Wednesday Market additional advances
          const { data: marketWeekAdd } = await supabase.from("market_weeks").select("week_date, team_name").eq("additional_advance_receipt_url", `/api/images/${img.id}`).limit(1).maybeSingle();
          if (marketWeekAdd) {
            const weekDate = marketWeekAdd.week_date;
            const teamName = marketWeekAdd.team_name || "กลุ่มจำหน่ายสินค้า";
            const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");
            filename = `สลิป_เงินทุนเพิ่มเติม.jpg`;
            folderPath = ["ตลาดวันพุธ", `รอบวันที่ ${weekDate}_${cleanTeam}`];
          } else {
            // D. Check Activities/Projects
            const { data: actRefund } = await supabase.from("activities").select("title").eq("refund_slip_url", `/api/images/${img.id}`).limit(1).maybeSingle();
            if (actRefund) {
              const cleanTitle = actRefund.title.replace(/[\s\/\\]+/g, "_");
              filename = `สลิป_เงินทอนคงเหลือ.jpg`;
              folderPath = ["กิจกรรมและโครงการ", `โครงการ_${cleanTitle}`];
            }
          }
        }
      }

      folderId = await getOrCreateFolder(folderPath, rootFolderId, googleToken);
      const driveResult = await uploadFile(img.base64, filename, folderId, googleToken);

      await supabase.from("images").update({ base64: `google_drive:${driveResult.id}` }).eq("id", img.id);
      migratedCount++;
    } catch (err: any) {
      console.error(`Failed to migrate image ${img.id}:`, err.message);
      errors.push(`รูปภาพ ${img.id}: ${err.message}`);
    }
  }

  // 3. Scan market_items table for embedded base64 note (SLIP_URL:data:image/...)
  const { data: marketItems, error: itemsErr } = await supabase
    .from("market_items")
    .select("id, note, market_week_id, item_name")
    .like("note", "SLIP_URL:data:image/%");

  if (itemsErr) throw itemsErr;

  for (const item of (marketItems || [])) {
    try {
      const parts = item.note.split("|NOTE:");
      const rawBase64 = parts[0].replace("SLIP_URL:", "");
      const noteText = parts[1] || "";

      const { data: week } = await supabase.from("market_weeks").select("week_date, team_name").eq("id", item.market_week_id).single();
      const weekDate = week?.week_date || new Date().toISOString().split("T")[0];
      const teamName = week?.team_name || "กลุ่มจำหน่ายสินค้า";
      const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");

      const cleanItemName = item.item_name.replace(/[\s\/\\]+/g, "_");
      const filename = `ใบเสร็จ_สินค้า_${cleanItemName}.jpg`;
      const folderPath = ["ตลาดวันพุธ", `รอบวันที่ ${weekDate}_${cleanTeam}`];

      const folderId = await getOrCreateFolder(folderPath, rootFolderId, googleToken);
      const driveResult = await uploadFile(rawBase64, filename, folderId, googleToken);

      const imgId = generateId("img_mig");
      await supabase.from("images").insert({ id: imgId, base64: `google_drive:${driveResult.id}` });
      await supabase.from("market_items").update({ note: `SLIP_URL:/api/images/${imgId}|NOTE:${noteText}` }).eq("id", item.id);
      migratedCount++;
    } catch (err: any) {
      console.error(`Failed to migrate market item note ${item.id}:`, err.message);
      errors.push(`สินค้า ${item.item_name}: ${err.message}`);
    }
  }

  await writeLog(userId, "migrate_images_to_drive", "system", undefined, { migratedCount, errorsCount: errors.length });
  res.json({ success: true, migratedCount, errors });
}));

// Purge raw Base64 images from DB to free up storage space 100%
router.post("/system/purge-base64-slips", asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!user || user.role !== "treasurer") {
    return res.status(403).json({ error: "เฉพาะเหรัญญิกเท่านั้นที่มีสิทธิ์สั่งเคลียร์รูปภาพจากระบบ" });
  }

  // Find all images in 'images' table that are raw Base64 (not starting with google_drive:)
  const { data: rawImages, error: fetchErr } = await supabase
    .from("images")
    .select("id, base64")
    .not("base64", "like", "google_drive:%");

  if (fetchErr) throw fetchErr;

  const count = rawImages?.length || 0;
  if (count === 0) {
    return res.json({ success: true, purgedCount: 0, message: "ไม่มีรูปภาพ Base64 ตกค้างในระบบแล้วค่ะ (ฐานข้อมูลว่างเปล่า 100%)" });
  }

  const idsToPurge = (rawImages || []).map(img => img.id);

  // Delete raw base64 records from images table
  const { error: deleteErr } = await supabase.from("images").delete().in("id", idsToPurge);
  if (deleteErr) throw deleteErr;

  await writeLog(userId, "purge_base64_slips", "system", undefined, { purgedCount: count });

  res.json({
    success: true,
    purgedCount: count,
    message: `🎉 เคลียร์รูปภาพ Base64 ออกจากคลาวด์ DB สำเร็จเรียบร้อยจำนวน ${count} รูป! ฐานข้อมูลว่างเปล่าและเบาหวิว 100% แล้วค่ะ`
  });
}));


// Force sync
router.post("/system/sync-cloud", asyncHandler(async (req, res) => {
  const connected = await testSupabaseConnection();
  if (!connected) return res.status(500).json({ error: "ไม่สามารถเชื่อมต่อ Supabase ได้" });
  res.json({ success: true, message: "ข้อมูลจาก Supabase ถูกต้องและพร้อมใช้งานแล้วค่ะ! 🔄" });
}));

// System Reset
router.post("/system/reset", asyncHandler(async (req, res) => {
  const { userId, keepUsers, keepSettings } = req.body;
  const hashedDefault = hashPassword("123456");
  if (!keepUsers) {
    await supabase.from("users").delete().neq("id", "");
    const seedUsers = REAL_STUDENTS.map(item => {
      const studentId = `169214210${item.idSuffix}`;
      return {
        id: `usr_${studentId}`, student_id: studentId, full_name: item.name, nickname: item.nickname,
        email: studentId === "169214210002" ? "kritsana.khw@rmutsvmail.com" : `${studentId}@student.university.ac.th`,
        role: item.role, position: item.pos, phone: "", password: hashedDefault, is_active: true, classroom: item.classroom,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
    });
    await supabase.from("users").upsert(seedUsers, { onConflict: "id" });
  } else {
    await supabase.from("users").update({ password: hashedDefault }).neq("id", "");
  }

  if (!keepSettings) {
    await supabase.from("settings").delete().neq("id", "");
    await supabase.from("settings").upsert({
      id: "main", fund_name: "เงินเก็บTns รุ่น06", monthly_fee: 150,
      promptpay_number: "081-234-5678", promptpay_name: "นภาวรรณ แก้วดี (เหรัญญิกกองทุน)",
      promptpay_qr_url: "", bank_name: "พร้อมเพย์"
    }, { onConflict: "id" });
  }

  await Promise.all([
    supabase.from("monthly_bills").delete().neq("id", ""),
    supabase.from("payments").delete().neq("id", ""),
    supabase.from("transactions").delete().neq("id", ""),
    supabase.from("market_items").delete().neq("id", ""),
    supabase.from("market_teams").delete().neq("id", ""),
    supabase.from("market_weeks").delete().neq("id", ""),
    supabase.from("activities").delete().neq("id", ""),
    supabase.from("budget_requests").delete().neq("id", ""),
    supabase.from("announcements").delete().neq("id", ""),
    supabase.from("notifications").delete().neq("id", ""),
    supabase.from("logs").delete().neq("id", ""),
    supabase.from("petitions").delete().neq("id", ""),
    supabase.from("password_resets").delete().neq("id", ""),
  ]);

  await writeLog(userId || "usr_169214210002", "reset_system", "system", undefined, { message: "รีเซ็ตข้อมูลระบบเป็นค่าเริ่มต้น", keepUsers, keepSettings });
  res.json({ success: true, message: "รีเซ็ตระบบสำเร็จแล้วค่ะ!" });
}));

// GET State - Main data endpoint
router.get("/state", asyncHandler(async (req, res) => {
  const state = await loadFullState();
  res.json(state);
}));

// Update Settings
router.post("/settings", asyncHandler(async (req, res) => {
  const { fundName, monthlyFee, promptpayNumber, promptpayName, promptpayQrUrl, bankName, userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const numericFee = Number(monthlyFee);
  const settingsData = {
    id: "main", fund_name: fundName, monthly_fee: numericFee, promptpay_number: promptpayNumber,
    promptpay_name: promptpayName, promptpay_qr_url: promptpayQrUrl || "", bank_name: bankName || "พร้อมเพย์",
    updated_at: new Date().toISOString()
  };
  await supabase.from("settings").upsert(settingsData, { onConflict: "id" });
  await supabase.from("monthly_bills").update({ amount: numericFee }).eq("status", "pending");

  await writeLog(userId, "update_settings", "settings", "global", settingsData);
  const { data: updatedSettings } = await supabase.from("settings").select("*").eq("id", "main").single();
  res.json({ success: true, settings: convertKeysToCamel(updatedSettings) });
}));

// Supabase config for client-side realtime
router.get("/supabase-config", (req, res) => {
  res.json({
    supabaseUrl: ENV.SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || "",
  });
});

export default router;
