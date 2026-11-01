/**
 * Bills Routes
 * /api/bills/create, /api/bills/delete-cycle
 */

import { Router } from "express";
import { supabase } from "../config/supabase";
import { createNotificationsBulk } from "../services/notificationService";
import { writeLog } from "../services/logService";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// Create Monthly Bills
router.post("/bills/create", asyncHandler(async (req, res) => {
  const { month, year, dueDate, userId } = req.body;
  if (!month || !year || !dueDate || !userId) return res.status(400).json({ error: "Missing required parameters" });

  const { data: activeStudents } = await supabase.from("users").select("*").eq("is_active", true);
  const { data: existingBills } = await supabase.from("monthly_bills").select("user_id").eq("month", Number(month)).eq("year", Number(year));
  const { data: settingsArr } = await supabase.from("settings").select("monthly_fee").eq("id", "main").single();
  const monthlyFee = settingsArr?.monthly_fee || 150;

  const existingUserIds = new Set((existingBills || []).map((b: { user_id: string }) => b.user_id));
  const newBills: Array<{
    id: string; user_id: string; month: number; year: number;
    amount: number; status: string; due_date: string; created_at: string;
  }> = [];

  for (const student of (activeStudents || [])) {
    if (!existingUserIds.has(student.id)) {
      const billId = `bill_${student.student_id}_${month}_${year}`;
      newBills.push({
        id: billId, user_id: student.id, month: Number(month), year: Number(year),
        amount: monthlyFee, status: "pending", due_date: dueDate, created_at: new Date().toISOString()
      });
    }
  }

  if (newBills.length > 0) {
    await supabase.from("monthly_bills").insert(newBills);
    const targetUserIds = newBills.map((b) => b.user_id);
    await createNotificationsBulk(
      targetUserIds,
      "แจ้งเตือนบิลค่าบำรุงกองทุนใหม่",
      `บิลค่าบำรุงกองทุนเดือน ${month}/${year} จำนวน ${monthlyFee} บาท ครบกำหนดชำระในวันที่ ${dueDate}`,
      "bill",
      `${month}/${year}`,
      "bill"
    );
    await writeLog(userId, "create_monthly_bills", "monthly_bills", `${month}/${year}`, { count: newBills.length });
  }

  res.json({ success: true, createdCount: newBills.length });
}));

// Delete bills cycle
router.post("/bills/delete-cycle", asyncHandler(async (req, res) => {
  const { month, year, userId } = req.body;
  if (!month || !year || !userId) return res.status(400).json({ error: "Missing required parameters" });

  const { data: billsToDelete } = await supabase.from("monthly_bills").select("id").eq("month", Number(month)).eq("year", Number(year));
  if (!billsToDelete || billsToDelete.length === 0) return res.status(404).json({ error: "ไม่พบบิลของเดือนและปีที่ระบุในระบบ" });

  const billIds = billsToDelete.map((b: { id: string }) => b.id);
  const { data: cyclePayments } = await supabase.from("payments").select("id").in("bill_id", billIds);
  const paymentIds = (cyclePayments || []).map((p: { id: string }) => p.id);
  if (paymentIds.length > 0) {
    await supabase.from("transactions").delete().eq("reference_type", "payment").in("reference_id", paymentIds);
  }
  await supabase.from("payments").delete().in("bill_id", billIds);
  await supabase.from("monthly_bills").delete().eq("month", Number(month)).eq("year", Number(year));

  await writeLog(userId, "delete_monthly_bills", "monthly_bills", `${month}/${year}`, { count: billsToDelete.length });
  res.json({ success: true, deletedCount: billsToDelete.length });
}));

export default router;
