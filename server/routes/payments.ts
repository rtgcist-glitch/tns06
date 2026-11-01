/**
 * Payments Routes
 * /api/payments/submit, /api/payments/approve, /api/payments/reject, /api/payments/cancel, /api/payments/record-cash
 */

import { Router } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { convertKeysToCamel } from "../utils/camelCase";
import { roundToTwoDecimals } from "../utils/math";
import { getCurrentBuddhistYear, getCurrentMonth } from "../utils/thaiMonths";
import { generateId } from "../utils/idGenerator";
import { createNotification, createNotificationsBulk } from "../services/notificationService";
import { writeLog } from "../services/logService";
import { updateBillStatus } from "../services/billService";
import { extractAndSaveImage } from "../services/imageService";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// Cancel payment
router.post("/payments/cancel", asyncHandler(async (req, res) => {
  const { billId, userId } = req.body;
  if (!billId || !userId) return res.status(400).json({ error: "Missing required parameters" });

  const { data: payment } = await supabase.from("payments").select("*").eq("bill_id", billId).eq("user_id", userId).eq("status", "pending_review").limit(1).single();
  if (!payment) return res.status(404).json({ error: "ไม่พบหลักฐานการชำระเงินที่อยู่ระหว่างรอตรวจสอบ" });

  await supabase.from("payments").delete().eq("id", payment.id);
  await updateBillStatus(billId);
  await writeLog(userId, "cancel_payment_request", "payment", payment.id, { billId, amount: payment.amount });
  res.json({ success: true, message: "ยกเลิกคำขอชำระเงินเรียบร้อยแล้ว" });
}));

// Submit payment slip with Zod validation
router.post("/payments/submit", asyncHandler(async (req, res) => {
  const paymentSchema = z.object({
    billId: z.string().min(1, "กรุณาระบุรหัสบิลค่ะ"),
    userId: z.string().min(1, "กรุณาระบุรหัสผู้ใช้งานค่ะ"),
    amount: z.union([z.number(), z.string()]).transform((val) => Number(val)).refine((num) => !isNaN(num) && num > 0, {
      message: "จำนวนเงินโอนต้องเป็นตัวเลขที่มากกว่า 0 บาทค่ะ"
    }),
    slipUrl: z.string().optional(),
    note: z.string().max(250, "คำอธิบายมีความยาวเกินไป (สูงสุด 250 ตัวอักษร)").optional()
  });

  const parseResult = paymentSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0]?.message || "ข้อมูลส่งสลิปไม่ถูกต้องค่ะ";
    return res.status(400).json({ error: firstError });
  }

  const { billId, userId, amount, slipUrl, note } = parseResult.data;
  const numAmount = roundToTwoDecimals(amount);

  const { data: existingPending } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "pending_review");
  if (existingPending && existingPending.length > 0) return res.status(400).json({ error: "คุณมีรายการส่งสลิปสำหรับบิลนี้อยู่แล้วและกำลังรอการตรวจสอบจากเหรัญญิก" });

  const { data: existingApproved } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "approved");
  if (existingApproved && existingApproved.length > 0) return res.status(400).json({ error: "คุณได้ชำระเงินสำหรับบิลนี้และได้รับการอนุมัติเรียบร้อยแล้ว" });

  let processedSlipUrl = slipUrl || "";
  if (processedSlipUrl && !processedSlipUrl.startsWith("/api/images/") && processedSlipUrl.startsWith("data:image/")) {
    processedSlipUrl = await extractAndSaveImage(processedSlipUrl, "/api/payments/submit", { billId, userId });
  }

  const paymentId = generateId("pay");
  const newPayment = { id: paymentId, user_id: userId, bill_id: billId, amount: numAmount, slip_url: processedSlipUrl, status: "pending_review", note: note || "", created_at: new Date().toISOString() };
  await supabase.from("payments").insert(newPayment);
  await updateBillStatus(billId);

  const { data: treasurers } = await supabase.from("users").select("id, full_name").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีสลิปใหม่รอการตรวจสอบ", `คุณ ${user?.full_name || "สมาชิก"} ได้อัปโหลดสลิปสำหรับบิลเดือนนี้แล้ว กรุณาตรวจสอบและอนุมัติ`, "payment", paymentId, "payment");

  await writeLog(userId, "submit_payment_slip", "payment", paymentId, { billId, amount: numAmount });
  res.json({ success: true, payment: convertKeysToCamel(newPayment) });
}));

// Record cash payment with Zod validation
router.post("/payments/record-cash", asyncHandler(async (req, res) => {
  const cashRecordSchema = z.object({
    billId: z.string().min(1, "กรุณาระบุรหัสบิลค่ะ"),
    userId: z.string().min(1, "กรุณาระบุรหัสผู้ใช้งานค้างชำระค่ะ"),
    amount: z.union([z.number(), z.string()]).transform((val) => Number(val)).refine((num) => !isNaN(num) && num > 0, {
      message: "จำนวนเงินสดต้องเป็นตัวเลขที่มากกว่า 0 บาทค่ะ"
    }),
    treasurerId: z.string().min(1, "กรุณาระบุรหัสผู้บันทึกค่ะ"),
    note: z.string().max(250, "คำอธิบายมีความยาวเกินไป (สูงสุด 250 ตัวอักษร)").optional()
  });

  const parseResult = cashRecordSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0]?.message || "ข้อมูลบันทึกเงินสดไม่ถูกต้องค่ะ";
    return res.status(400).json({ error: firstError });
  }

  const { billId, userId, amount, treasurerId, note } = parseResult.data;
  const numAmount = roundToTwoDecimals(amount);

  // 1. Verify recorder identity & role
  const { data: recorder } = await supabase.from("users").select("*").eq("id", treasurerId).single();
  if (!recorder) {
    return res.status(403).json({ error: "ไม่พบข้อมูลผู้บันทึกในระบบ" });
  }

  if (recorder.role !== "treasurer" && recorder.role !== "leader") {
    return res.status(403).json({ error: "ไม่มีสิทธิ์ดำเนินการ (เฉพาะเหรัญญิกและหัวหน้าห้องเท่านั้นที่สามารถบันทึกเงินสดได้)" });
  }

  // 2. Prevent duplicate pending or approved payments for this bill
  const { data: existingApproved } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "approved");
  if (existingApproved && existingApproved.length > 0) {
    return res.status(400).json({ error: "สมาชิกท่านนี้ได้ชำระบิลนี้และได้รับการอนุมัติเรียบร้อยแล้ว" });
  }

  const { data: existingPending } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "pending_review");
  if (existingPending && existingPending.length > 0) {
    return res.status(400).json({ error: "สมาชิกท่านนี้มีรายการชำระเงินที่อยู่ระหว่างรอการตรวจสอบอยู่แล้ว" });
  }

  // 3. Self-cash recording policy: Leaders cannot auto-approve, and Treasurers recording for themselves must enter review state to prevent fraud
  const isLeader = recorder.role === "leader";
  const isSelfRecording = treasurerId === userId;

  const paymentId = generateId("pay");
  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", billId).single();
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();

  if (isLeader || isSelfRecording) {
    const noteText = isSelfRecording 
      ? (note || "แจ้งชำระด้วยเงินสด (ส่งเรื่องรอตรวจสอบ)")
      : (note || "แจ้งชำระด้วยเงินสด (บันทึกโดยหัวหน้าห้อง)");

    const newPayment = { 
      id: paymentId, 
      user_id: userId, 
      bill_id: billId, 
      amount: numAmount, 
      slip_url: "cash", 
      status: "pending_review", 
      note: noteText, 
      created_at: new Date().toISOString() 
    };
    await supabase.from("payments").insert(newPayment);
    await updateBillStatus(billId);

    const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
    const targetTreasurerIds = (treasurers || []).map((t: { id: string }) => t.id).filter((id: string) => id !== treasurerId);
    await createNotificationsBulk(targetTreasurerIds, "มีรายการชำระเงินสดรอการอนุมัติ 💵", `ผู้บันทึกคุณ ${recorder.full_name} ได้แจ้งรายการรับเงินสดจำนวน ${numAmount} บาท ของคุณ ${user?.full_name || "สมาชิก"}`, "payment", paymentId, "payment");
    await createNotification(userId, "ส่งยอดชำระเงินสดแล้ว 💵", `การรับเงินสดจำนวน ${numAmount} บาท ถูกบันทึกเข้าระบบแล้ว (รอการตรวจสอบ)`, "payment", paymentId, "payment");
    await writeLog(treasurerId, "record_cash_pending", "payment", paymentId, { studentId: user?.student_id, amount: numAmount });
    return res.json({ success: true, payment: convertKeysToCamel(newPayment) });
  }

  // Treasurer recording for another user -> auto approve
  const monthStr = bill ? String(bill.month).padStart(2, "0") : "00";
  const yearStr = bill ? bill.year : String(getCurrentBuddhistYear());
  const suffix = user ? user.student_id.substring(4) : "0000";
  const receiptNumber = `REC-${yearStr}-${monthStr}-${suffix}`;

  const newPayment = { 
    id: paymentId, 
    user_id: userId, 
    bill_id: billId, 
    amount: numAmount, 
    slip_url: "cash", 
    status: "approved", 
    note: note || "ชำระด้วยเงินสด (เหรัญญิกรับเงินและบันทึกอนุมัติด้วยตนเอง)", 
    created_at: new Date().toISOString(), 
    reviewed_by: treasurerId, 
    reviewed_at: new Date().toISOString(), 
    receipt_number: receiptNumber 
  };
  await supabase.from("payments").insert(newPayment);
  await updateBillStatus(billId);

  const txId = generateId("tx");
  await supabase.from("transactions").insert({ 
    id: txId, 
    type: "income", 
    category: "monthly_fee", 
    amount: numAmount, 
    description: `ค่าบำรุงกองทุนรายเดือน (เงินสด) (${bill ? `${bill.month}/${bill.year}` : ""}) - ${user?.full_name || "นักศึกษา"}`, 
    reference_id: paymentId, 
    reference_type: "payment", 
    created_by: treasurerId, 
    approved_by: treasurerId, 
    approved_at: new Date().toISOString(), 
    month: bill ? bill.month : getCurrentMonth(), 
    year: bill ? bill.year : getCurrentBuddhistYear(), 
    is_closed: false, 
    created_at: new Date().toISOString() 
  });

  await createNotification(userId, "ชำระเงินสดเสร็จสิ้นแล้ว 🎉", `เหรัญญิกได้บันทึกการรับเงินสดจำนวน ${numAmount} บาท เลขใบเสร็จคือ ${receiptNumber}`, "payment", paymentId, "payment");
  await writeLog(treasurerId, "record_cash_payment", "payment", paymentId, { studentId: user?.student_id, amount: numAmount });
  res.json({ success: true, payment: convertKeysToCamel(newPayment) });
}));

// Approve payment
router.post("/payments/approve", asyncHandler(async (req, res) => {
  const { paymentId, treasurerId, note } = req.body;
  if (!paymentId || !treasurerId) return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วนค่ะ" });

  const { data: actingUser } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!actingUser || actingUser.role !== "treasurer") {
    return res.status(403).json({ error: "ไม่มีสิทธิ์ดำเนินการ (เฉพาะเหรัญญิกเท่านั้น)" });
  }

  const { data: payment } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  if (!payment) return res.status(404).json({ error: "ไม่พบรายการชำระเงินนี้" });
  if (payment.status === "approved") return res.json({ success: true, payment: convertKeysToCamel(payment) });

  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", payment.bill_id).single();
  const { data: user } = await supabase.from("users").select("*").eq("id", payment.user_id).single();

  const monthStr = bill ? String(bill.month).padStart(2, "0") : "00";
  const yearStr = bill ? bill.year : String(getCurrentBuddhistYear());
  const suffix = user ? user.student_id.substring(4) : "0000";
  const receiptNumber = `REC-${yearStr}-${monthStr}-${suffix}`;

  await supabase.from("payments").update({ status: "approved", reviewed_by: treasurerId, reviewed_at: new Date().toISOString(), note: note || payment.note, receipt_number: receiptNumber }).eq("id", paymentId);
  if (bill) await updateBillStatus(bill.id);

  const txId = generateId("tx");
  await supabase.from("transactions").insert({ id: txId, type: "income", category: "monthly_fee", amount: payment.amount, description: `ค่าบำรุงกองทุนรายเดือน (${bill ? `${bill.month}/${bill.year}` : ""}) - ${user?.full_name || "นักศึกษา"}`, reference_id: payment.id, reference_type: "payment", created_by: treasurerId, approved_by: treasurerId, approved_at: new Date().toISOString(), month: bill ? bill.month : getCurrentMonth(), year: bill ? bill.year : getCurrentBuddhistYear(), is_closed: false, created_at: new Date().toISOString() });

  await createNotification(payment.user_id, "ชำระเงินกองทุนอนุมัติสำเร็จแล้ว 🎉", `เหรัญญิกตรวจสอบการชำระเงินเดือนนี้แล้ว ยอดเงิน ${payment.amount} บาท เลขใบเสร็จคือ ${receiptNumber}`, "payment", payment.id, "payment");
  await writeLog(treasurerId, "approve_payment", "payment", paymentId, { studentId: user?.student_id, amount: payment.amount });

  const { data: updated } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  res.json({ success: true, payment: convertKeysToCamel(updated) });
}));

// Reject payment
router.post("/payments/reject", asyncHandler(async (req, res) => {
  const { paymentId, treasurerId, rejectReason } = req.body;
  if (!paymentId || !treasurerId || !rejectReason) return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วนค่ะ" });

  const { data: actingUser } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!actingUser || actingUser.role !== "treasurer") {
    return res.status(403).json({ error: "ไม่มีสิทธิ์ดำเนินการ (เฉพาะเหรัญญิกเท่านั้น)" });
  }

  const { data: payment } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  if (!payment) return res.status(404).json({ error: "ไม่พบรายการชำระเงินนี้" });

  await supabase.from("payments").update({ status: "rejected", reviewed_by: treasurerId, reviewed_at: new Date().toISOString(), reject_reason: rejectReason }).eq("id", paymentId);

  const { data: bill } = await supabase.from("monthly_bills").select("id").eq("id", payment.bill_id).single();
  if (bill) await updateBillStatus(bill.id);

  await createNotification(payment.user_id, "❌ คำขอชำระเงินกองทุนถูกปฏิเสธ", `รายการชำระเงินของคุณถูกเหรัญญิกปฏิเสธด้วยเหตุผล: "${rejectReason}"`, "payment", payment.id, "payment");
  const { data: user } = await supabase.from("users").select("student_id").eq("id", payment.user_id).single();
  await writeLog(treasurerId, "reject_payment", "payment", paymentId, { studentId: user?.student_id, reason: rejectReason });

  const { data: updated } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  res.json({ success: true, payment: convertKeysToCamel(updated) });
}));

// Admin/Treasurer/Committee upload slip later with Google Drive integration
router.post("/payments/upload-slip-admin", asyncHandler(async (req, res) => {
  const { billId, userId, base64Image, treasurerId, note } = req.body;
  if (!billId || !userId || !base64Image || !treasurerId) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วนค่ะ (billId, userId, base64Image, treasurerId)" });
  }

  // Verify role (Restricted to treasurer/admin)
  const { data: requester } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!requester || requester.role !== "treasurer") {
    return res.status(403).json({ error: "ไม่มีสิทธิ์ดำเนินการ (เฉพาะเหรัญญิกหลักเท่านั้น)" });
  }

  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", billId).single();
  if (!bill) return res.status(404).json({ error: "ไม่พบรอบบิลนี้ในระบบค่ะ" });

  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "ไม่พบข้อมูลสมาชิกในระบบค่ะ" });

  // 1. Upload/extract slip image to Google Drive or local storage fallback (skip if already extracted by middleware)
  const slipUrl = base64Image.startsWith("/api/images/")
    ? base64Image
    : await extractAndSaveImage(base64Image, "/api/payments/submit", { billId, userId });

  // 2. Check if there is an existing payment record
  const { data: existingPayments } = await supabase.from("payments").select("*").eq("bill_id", billId).eq("user_id", userId);
  
  const monthStr = String(bill.month).padStart(2, "0");
  const yearStr = bill.year;
  const suffix = user.student_id.substring(4);
  const receiptNumber = `REC-${yearStr}-${monthStr}-${suffix}`;

  let paymentId = generateId("pay");
  let paymentAmount = bill.amount;

  if (existingPayments && existingPayments.length > 0) {
    const existing = existingPayments[0];
    paymentId = existing.id;
    paymentAmount = existing.amount;

    // Update existing payment
    await supabase.from("payments").update({
      slip_url: slipUrl,
      status: "approved",
      reviewed_by: treasurerId,
      reviewed_at: new Date().toISOString(),
      note: note || `เหรัญญิกแนบสลิปย้อนหลัง (เดิม: ${existing.note || "ไม่มี"})`,
      receipt_number: receiptNumber
    }).eq("id", paymentId);

    // If it wasn't approved, insert a transaction
    if (existing.status !== "approved") {
      const { data: existingTx } = await supabase.from("transactions").select("id").eq("reference_id", paymentId).eq("reference_type", "payment");
      if (!existingTx || existingTx.length === 0) {
        const txId = generateId("tx");
        await supabase.from("transactions").insert({
          id: txId,
          type: "income",
          category: "monthly_fee",
          amount: Number(paymentAmount),
          description: `ค่าบำรุงกองทุนรายเดือน (${bill.month}/${bill.year}) - ${user.full_name}`,
          reference_id: paymentId,
          reference_type: "payment",
          created_by: treasurerId,
          approved_by: treasurerId,
          approved_at: new Date().toISOString(),
          month: bill.month,
          year: bill.year,
          is_closed: false,
          created_at: new Date().toISOString()
        });
      }
    }
  } else {
    // Create new approved payment
    const newPayment = {
      id: paymentId,
      user_id: userId,
      bill_id: billId,
      amount: paymentAmount,
      slip_url: slipUrl,
      status: "approved",
      note: note || "เหรัญญิกแนบสลิปย้อนหลัง",
      created_at: new Date().toISOString(),
      reviewed_by: treasurerId,
      reviewed_at: new Date().toISOString(),
      receipt_number: receiptNumber
    };
    await supabase.from("payments").insert(newPayment);

    // Insert transaction
    const txId = generateId("tx");
    await supabase.from("transactions").insert({
      id: txId,
      type: "income",
      category: "monthly_fee",
      amount: Number(paymentAmount),
      description: `ค่าบำรุงกองทุนรายเดือน (${bill.month}/${bill.year}) - ${user.full_name}`,
      reference_id: paymentId,
      reference_type: "payment",
      created_by: treasurerId,
      approved_by: treasurerId,
      approved_at: new Date().toISOString(),
      month: bill.month,
      year: bill.year,
      is_closed: false,
      created_at: new Date().toISOString()
    });
  }

  await updateBillStatus(billId);

  await createNotification(userId, "แนบหลักฐานสลิปย้อนหลังเสร็จสิ้นแล้ว 🎉", `เหรัญญิกได้ทำการอัปโหลดหลักฐานสลิปย้อนหลังให้คุณ ยอดเงิน ${paymentAmount} บาท ใบเสร็จเลขที่ ${receiptNumber}`, "payment", paymentId, "payment");
  await writeLog(treasurerId, "upload_slip_admin", "payment", paymentId, { studentId: user.student_id, amount: paymentAmount });

  const { data: updatedPayment } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  res.json({ success: true, payment: convertKeysToCamel(updatedPayment) });
}));

export default router;
