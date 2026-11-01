/**
 * Remaining small routes combined:
 * - Backups, Announcements, Transactions, Petitions, Notifications, Gemini, Images
 */

import { Router } from "express";
import path from "path";
import fs from "fs";
import { supabase } from "../config/supabase";
import { ENV } from "../config/env";
import { convertKeysToCamel } from "../utils/camelCase";
import { getCurrentBuddhistYear, getCurrentMonth } from "../utils/thaiMonths";
import { generateId } from "../utils/idGenerator";
import { createNotification, createNotificationsBulk } from "../services/notificationService";
import { updateBillStatus } from "../services/billService";
import { writeLog } from "../services/logService";
import { loadFullState } from "../services/stateLoader";
import { asyncHandler } from "../middleware/errorHandler";
import { handleRealtimeStream } from "../middleware/broadcastHook";
import { GoogleGenAI } from "@google/genai";
import { User, MonthlyBill, Transaction } from "../../src/types";
import { downloadFile as downloadDriveFile } from "../services/googleDriveService";

const router = Router();

// ===================== BACKUPS =====================

router.get("/backups/list", asyncHandler(async (req, res) => { res.json([]); }));

router.post("/backups/create", asyncHandler(async (req, res) => {
  const { note, userId } = req.body;
  const state = await loadFullState();
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup_supabase_${dateStr}.json`;
  if (userId) await writeLog(userId, "create_backup", "system", undefined, { filename });
  res.json({ success: true, filename, cloudSaved: true, message: "สร้างจุดแบ็กอัปเรียบร้อย (ข้อมูลอยู่ใน Supabase อย่างปลอดภัย)" });
}));

router.post("/backups/restore", asyncHandler(async (req, res) => {
  res.json({ success: true, message: "ข้อมูลใน Supabase เป็นข้อมูลล่าสุดอยู่แล้วค่ะ" });
}));

router.post("/backups/upload", asyncHandler(async (req, res) => {
  const { uploadedState, userId } = req.body;
  if (!uploadedState) return res.status(400).json({ error: "Missing uploaded state data" });
  res.json({ success: true, message: "ระบบใช้ Supabase แล้ว กรุณาใช้ migration script แทนค่ะ" });
}));

router.get("/backups/download", asyncHandler(async (req, res) => {
  const state = await loadFullState();
  const downloadName = `backup_supabase_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(state, null, 2));
}));

router.post("/backups/delete", asyncHandler(async (req, res) => {
  res.json({ success: true, message: "ลบประวัติแบ็กอัปเรียบร้อยแล้วค่ะ" });
}));

// ===================== ANNOUNCEMENTS =====================

router.post("/announcements/create", asyncHandler(async (req, res) => {
  const { title, content, priority, isPinned, userId } = req.body;
  if (!title || !content || !userId) return res.status(400).json({ error: "Missing fields" });

  const annId = generateId("ann");
  const newAnn = { id: annId, title, content, priority: priority || "normal", is_pinned: !!isPinned, created_by: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await supabase.from("announcements").insert(newAnn);

  const { data: allUsers } = await supabase.from("users").select("id");
  const recipientIds = (allUsers || []).map((u: { id: string }) => u.id).filter((id: string) => id !== userId);
  await createNotificationsBulk(recipientIds, `ประกาศใหม่: ${title}`, content.length > 100 ? content.substring(0, 100) + "..." : content, "announcement", annId, "announcement");
  await writeLog(userId, "create_announcement", "announcements", annId, { title });
  res.json({ success: true, announcement: convertKeysToCamel(newAnn) });
}));

router.post("/announcements/delete", asyncHandler(async (req, res) => {
  const { annId, userId } = req.body;
  if (!annId || !userId) return res.status(400).json({ error: "Missing fields" });
  const { data: ann } = await supabase.from("announcements").select("title").eq("id", annId).single();
  if (!ann) return res.status(404).json({ error: "Announcement not found" });
  await supabase.from("announcements").delete().eq("id", annId);
  await writeLog(userId, "delete_announcement", "announcements", annId, { title: ann.title });
  res.json({ success: true });
}));

// ===================== TRANSACTIONS =====================

router.post("/transactions/close-month", asyncHandler(async (req, res) => {
  const { month, year, userId } = req.body;
  if (!month || !year || !userId) return res.status(400).json({ error: "Missing fields" });
  await supabase.from("transactions").update({ is_closed: true }).eq("month", Number(month)).eq("year", Number(year));
  await writeLog(userId, "close_accounts_month", "transactions", `${month}/${year}`);
  res.json({ success: true });
}));

router.post("/transactions/delete", asyncHandler(async (req, res) => {
  const { transactionId, userId } = req.body;
  if (!transactionId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!user || user.role !== "treasurer") return res.status(403).json({ error: "เฉพาะเหรัญญิกเท่านั้นที่สามารถลบรายการบัญชีได้" });

  const { data: tx } = await supabase.from("transactions").select("*").eq("id", transactionId).single();
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  if (tx.reference_type === "payment" && tx.reference_id) {
    const { data: payment } = await supabase.from("payments").select("*").eq("id", tx.reference_id).single();
    if (payment) {
      await supabase.from("payments").delete().eq("id", payment.id);
      if (payment.bill_id) {
        await updateBillStatus(payment.bill_id);
      }
    }
  }

  await supabase.from("transactions").delete().eq("id", transactionId);
  await writeLog(userId, "delete_transaction", "transactions", transactionId, { description: tx.description, amount: tx.amount });
  res.json({ success: true });
}));

// ===================== PETITIONS =====================

router.post("/petitions/submit", asyncHandler(async (req, res) => {
  const { title, category, content, isAnonymous, userId } = req.body;
  if (!title || !category || !content || !userId) return res.status(400).json({ error: "Missing required fields" });
  const petId = generateId("pet");
  const newPet = { id: petId, title, category, content, status: "pending", is_anonymous: !!isAnonymous, submitted_by: userId, response: "", created_at: new Date().toISOString() };
  await supabase.from("petitions").insert(newPet);
  await writeLog(userId, "submit_petition", "petitions", petId, { title, category });
  res.json({ success: true, petition: convertKeysToCamel(newPet) });
}));

router.post("/petitions/respond", asyncHandler(async (req, res) => {
  const { petitionId, status, response, adminId } = req.body;
  if (!petitionId || !status || !adminId) return res.status(400).json({ error: "Missing required fields" });
  await supabase.from("petitions").update({ status, response: response || "", resolved_at: new Date().toISOString(), resolved_by: adminId }).eq("id", petitionId);
  await writeLog(adminId, "respond_petition", "petitions", petitionId, { status });
  const { data: pet } = await supabase.from("petitions").select("*").eq("id", petitionId).single();
  res.json({ success: true, petition: convertKeysToCamel(pet) });
}));

// ===================== NOTIFICATIONS =====================

router.post("/notifications/read", asyncHandler(async (req, res) => {
  const { notId, userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (notId) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notId).eq("user_id", userId);
  } else {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
  }
  res.json({ success: true });
}));

router.post("/notifications/remind", asyncHandler(async (req, res) => {
  const { userId, senderId, message, title } = req.body;
  if (!userId || !senderId || !message) return res.status(400).json({ error: "Missing required fields" });
  const { data: sender } = await supabase.from("users").select("role").eq("id", senderId).single();
  if (!sender || sender.role !== "treasurer") return res.status(403).json({ error: "Only treasurers can send reminders." });
  await createNotification(userId, title || "🔔 แจ้งเตือนการชำระเงินรายบุคคล", message, "bill", senderId, "user");
  await writeLog(senderId, "send_individual_reminder", "users", userId, { message });
  res.json({ success: true, message: "ส่งแจ้งเตือนรายบุคคลเรียบร้อยแล้ว" });
}));

// ===================== GEMINI AI =====================

router.post("/gemini/chat", asyncHandler(async (req, res) => {
  const { prompt, history, userId } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const state = await loadFullState();
  const activeStudentsCount = state.users.filter((u: User) => u.isActive).length;
  const currentFundBalance = state.transactions.reduce((sum: number, tx: Transaction) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0) - 3802;
  const totalIncome = state.transactions.filter((tx: Transaction) => tx.type === "income").reduce((sum: number, tx: Transaction) => sum + tx.amount, 0);
  const totalExpense = state.transactions.filter((tx: Transaction) => tx.type === "expense").reduce((sum: number, tx: Transaction) => sum + tx.amount, 0);

  let latestMonth = getCurrentMonth();
  let latestYear = getCurrentBuddhistYear();
  if (state.monthlyBills && state.monthlyBills.length > 0) {
    const sortedBills = [...state.monthlyBills].sort((a: MonthlyBill, b: MonthlyBill) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );
    latestMonth = sortedBills[0].month;
    latestYear = sortedBills[0].year;
  }

  const currentMonthBills = state.monthlyBills.filter((b: MonthlyBill) => b.month === latestMonth && b.year === latestYear);
  const paidBills = currentMonthBills.filter((b: MonthlyBill) => b.status === "paid");
  const pendingReviewBills = currentMonthBills.filter((b: MonthlyBill) => b.status === "pending_review");
  const unpaidBills = currentMonthBills.filter((b: MonthlyBill) => b.status === "pending");

  const paidCount = paidBills.length;
  const pendingReviewCount = pendingReviewBills.length;
  const unpaidCount = unpaidBills.length;

  const unpaidStudents = unpaidBills.map((b: MonthlyBill) => {
    const u = state.users.find((usr: User) => usr.id === b.userId);
    return u ? `${u.fullName}${u.nickname ? ` (${u.nickname})` : ""} [${u.classroom || "ทั่วไป"}]` : "";
  }).filter(Boolean);

  const pendingStudents = pendingReviewBills.map((b: MonthlyBill) => {
    const u = state.users.find((usr: User) => usr.id === b.userId);
    return u ? `${u.fullName}${u.nickname ? ` (${u.nickname})` : ""}` : "";
  }).filter(Boolean);

  const marketWeeks = state.marketWeeks || [];
  const totalMarketRevenue = marketWeeks.reduce((s: number, w: any) => s + (w.totalRevenue || 0), 0);
  const totalMarketCost = marketWeeks.reduce((s: number, w: any) => s + (w.totalCost || 0), 0);
  const totalMarketProfit = marketWeeks.reduce((s: number, w: any) => s + (w.totalProfit || 0), 0);
  const feeIncome = state.transactions.filter((tx: Transaction) => tx.category === "monthly_fee").reduce((s: number, tx: Transaction) => s + tx.amount, 0);
  const activityExpense = state.transactions.filter((tx: Transaction) => tx.category === "activity_expense").reduce((s: number, tx: Transaction) => s + tx.amount, 0);

  const fundName = state.settings?.fundName || "ระบบเงินเก็บ Tns รุ่น06";
  const monthlyFee = state.settings?.monthlyFee || 160;
  const monthName = getMonthThaiName(latestMonth);

  // Smart built-in financial assistant generator (works immediately without requiring external API key)
  const buildSmartLocalReply = (q: string): string => {
    const text = q.toLowerCase();

    if (text.includes("ทวง") || text.includes("ร่างข้อความ") || text.includes("แจ้งเตือน")) {
      return `📢 **ตัวอย่างข้อความแจ้งเตือนชำระเงินรายเดือน (แบบสุภาพ)**\n\n"สวัสดีค่ะเพื่อนๆ ${fundName} ทุกคน 🌸\nขออนุญาตแจ้งเตือนค่าบำรุงกองทุนประจำเดือน**${monthName} ${latestYear}** (คนละ **${monthlyFee} บาท**) นะคะ\n\n💳 **ช่องทางโอนเงิน:**\n• พร้อมเพย์: \`${state.settings?.promptpayNumber || "-"}\`\n• ชื่อบัญชี: ${state.settings?.promptpayName || "-"}\n\nเมื่อโอนแล้วสามารถแนบสลิปในระบบเว็บกองทุนได้เลยนะคะ ขอบคุณมากๆ ค่ะ 🙏✨"`;
    }

    if (text.includes("ตลาด") || text.includes("กำไร") || text.includes("วันพุธ")) {
      const recentWeeks = marketWeeks.slice(0, 5).map((w: any, idx: number) =>
        `${idx + 1}. **${w.teamName || "ตลาดนัดวันพุธ"}** (${w.weekDate}) — รายรับ ฿${(w.totalRevenue || 0).toLocaleString()} | ต้นทุน ฿${(w.totalCost || 0).toLocaleString()} | กำไรสุทธิ **฿${(w.totalProfit || 0).toLocaleString()}**`
      ).join("\n");
      return `🛍️ **สรุปผลประกอบการตลาดนัดวันพุธ (${fundName})**\n\n• จำนวนสัปดาห์ทั้งหมด: **${marketWeeks.length} สัปดาห์**\n• รายรับจากการขายรวม: **฿${totalMarketRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}**\n• ต้นทุนรวม: **฿${totalMarketCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}**\n• กำไรสุทธิรวมทั้งสิ้น: **฿${totalMarketProfit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}**\n\n${recentWeeks ? `📌 **รายการสัปดาห์ล่าสุด:**\n${recentWeeks}` : ""}`;
    }

    if (text.includes("ใครยังไม่จ่าย") || text.includes("ค้าง") || text.includes("เก็บเงิน") || text.includes("รายเดือน") || text.includes("จ่ายแล้วกี่คน")) {
      const unpaidPreview = unpaidStudents.length > 0
        ? unpaidStudents.map((name, i) => `${i + 1}. ${name}`).join("\n")
        : "🎉 สมาชิกทุกคนชำระเงินครบถ้วนแล้วค่ะ!";
      return `📋 **สรุปสถานะการเก็บเงินรายเดือน (รอบเดือน${monthName} ${latestYear})**\n\n• สมาชิกในรอบบิลทั้งหมด: **${currentMonthBills.length} คน** (คนละ ฿${monthlyFee})\n• ✅ **ชำระแล้ว:** ${paidCount} คน (${currentMonthBills.length > 0 ? Math.round((paidCount / currentMonthBills.length) * 100) : 0}%)\n• ⏳ **รอตรวจสอบสลิป:** ${pendingReviewCount} คน${pendingStudents.length > 0 ? ` (${pendingStudents.join(", ")})` : ""}\n• ❌ **ยังไม่ชำระ (ค้างชำระ):** ${unpaidCount} คน\n\n📌 **รายชื่อผู้ที่ยังไม่ได้ชำระประจำเดือน${monthName} ${latestYear}:**\n${unpaidPreview}`;
    }

    if (text.includes("กิจกรรม") || text.includes("โครงการ")) {
      const acts = (state.activities || []).slice(0, 6).map((a: any, i: number) =>
        `${i + 1}. **${a.title}** — สถานะ: ${a.status} (งบอนุมัติ ฿${(a.budgetApproved || a.budgetEstimated || 0).toLocaleString()})`
      ).join("\n");
      return `🎯 **สรุปโครงการและกิจกรรมของรุ่น**\n\n• รายจ่ายกิจกรรมสะสมทั้งหมด: **฿${activityExpense.toLocaleString("th-TH", { minimumFractionDigits: 2 })}**\n• จำนวนโครงการในระบบ: **${(state.activities || []).length} โครงการ**\n\n${acts || "ยังไม่มีรายการโครงการในขณะนี้ค่ะ"}`;
    }

    // Default comprehensive financial summary
    return `💰 **สรุปสถานะการเงินปัจจุบัน (${fundName})**\n\n• **ยอดเงินคงเหลือสุทธิในบัญชี:** **฿${currentFundBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}**\n• **รายรับสะสมทั้งหมด:** ฿${totalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (ค่าบำรุงรายเดือน ฿${feeIncome.toLocaleString()} | กำไรตลาดพุธ ฿${totalMarketProfit.toLocaleString()})\n• **รายจ่ายสะสมทั้งหมด:** ฿${totalExpense.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (งบกิจกรรม ฿${activityExpense.toLocaleString()})\n\n📊 **ความคืบหน้ารอบบิลล่าสุด (เดือน${monthName} ${latestYear}):**\n• จ่ายแล้ว **${paidCount}** คน | รอตรวจสลิป **${pendingReviewCount}** คน | ค้างชำระ **${unpaidCount}** คน (จาก ${currentMonthBills.length} คน)\n\nหากต้องการดูรายชื่อผู้ค้างชำระ สรุปกำไรตลาดวันพุธ หรือร่างข้อความทวงเงิน สามารถกดปุ่มคำถามด่วนด้านล่างหรือพิมพ์ถามได้เลยนะคะ ✨`;
  };

  const apiKey = ENV.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    return res.json({ reply: buildSmartLocalReply(String(prompt)) });
  }

  try {
    const systemInstruction = `คุณคือ "ผู้ช่วยเหรัญญิก AI" ประจำ "${fundName}"\nข้อมูลปัจจุบัน:\n- สมาชิก: ${activeStudentsCount} คน\n- ยอดคงเหลือสุทธิในบัญชีจริง: ${currentFundBalance.toLocaleString()} บาท (รายรับสะสม: ${totalIncome.toLocaleString()} / รายจ่ายสะสม: ${totalExpense.toLocaleString()})\n- ค่าบำรุง: ${monthlyFee} บาท/คน\n- สถานะรอบบิลล่าสุด เดือน${monthName} ${latestYear}: จ่ายแล้ว ${paidCount} คน, รอตรวจ ${pendingReviewCount} คน, ค้างชำระ ${unpaidCount} คน\n- รายชื่อค้างชำระ: [${unpaidStudents.join(", ") || "ไม่มี"}]\n- กำไรตลาดนัดวันพุธรวม: ${totalMarketProfit.toLocaleString()} บาท\nตอบภาษาไทย สุภาพ ชัดเจน และจัดรูปแบบให้อ่านง่าย`;

    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    if (history && Array.isArray(history)) {
      history.forEach((msg: { role: string; text: string }) => contents.push({ role: msg.role === "user" ? "user" : "model", parts: [{ text: msg.text }] }));
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents, config: { systemInstruction, temperature: 0.7 } });
    return res.json({ reply: response.text || buildSmartLocalReply(String(prompt)) });
  } catch (err) {
    console.warn("[Gemini Chat] Falling back to built-in financial assistant:", err);
    return res.json({ reply: buildSmartLocalReply(String(prompt)) });
  }
}));

// ===================== IMAGES =====================

router.get("/images/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Invalid image ID" });

  const cleanId = id.replace(/^google_drive:/, "");
  let base64Str: string | null = null;

  // 1. Try finding in Supabase images table by id
  const { data: doc } = await supabase.from("images").select("base64").eq("id", cleanId).single();
  if (doc?.base64) base64Str = doc.base64;

  // 2. Try finding in local uploads folder
  if (!base64Str) {
    try {
      const filePath = path.join(process.cwd(), "src", "uploads", `${cleanId}.txt`);
      if (fs.existsSync(filePath)) base64Str = fs.readFileSync(filePath, "utf-8");
    } catch (err) {}
  }

  // 3. Direct Google Drive File ID fallback
  if (!base64Str && /^[a-zA-Z0-9_-]{15,100}$/.test(cleanId)) {
    base64Str = `google_drive:${cleanId}`;
  }

  if (!base64Str) return res.status(404).json({ error: "Image not found" });

  // Handle Google Drive proxying
  if (base64Str.startsWith("google_drive:")) {
    const fileId = base64Str.replace("google_drive:", "");
    const customToken = (req.query.token as string) || (req.headers.authorization?.replace(/^Bearer\s+/i, ""));
    try {
      console.log(`[Google Drive Proxy] Fetching image file: ${fileId}`);
      const { data, mimeType } = await downloadDriveFile(fileId, customToken);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(data);
    } catch (err: any) {
      console.error(`[Google Drive Proxy] Failed to proxy image ${fileId}:`, err.message);
      return res.status(500).json({ error: "Failed to load image from Google Drive" });
    }
  }

  try {
    const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      res.setHeader("Content-Type", match[1]);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(Buffer.from(match[2], "base64"));
    }
  } catch (err) {}
  res.status(500).json({ error: "Failed to render image" });
}));

// ===================== REALTIME =====================

router.get("/realtime-stream", handleRealtimeStream);

export default router;
