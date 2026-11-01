/**
 * Activities Routes
 * /api/activities/* (propose, approve, update, delete, budget, settlement, external-income)
 */

import { Router } from "express";
import { supabase } from "../config/supabase";
import { convertKeysToCamel } from "../utils/camelCase";
import { getCurrentBuddhistYear, getCurrentMonth } from "../utils/thaiMonths";
import { generateId } from "../utils/idGenerator";
import { createNotification, createNotificationsBulk } from "../services/notificationService";
import { writeLog } from "../services/logService";
import { asyncHandler } from "../middleware/errorHandler";
import type { ExternalIncome } from "../types/server";

const router = Router();

// Helper: Check if user has committee/admin permissions
function isCommitteeRole(user: any): boolean {
  const pos = (user.position || "").toLowerCase();
  return user.role === "treasurer" || user.role === "committee" || pos.includes("ประธาน") || pos.includes("รอง") || pos.includes("เลข") || pos.includes("เลขา") || pos.includes("เหรัญญิก");
}

// Activities - Propose
router.post("/activities/propose", asyncHandler(async (req, res) => {
  const { title, description, eventDate, location, budgetEstimated, documentUrls, userId } = req.body;
  if (!title || !userId) return res.status(400).json({ error: "Missing title or userId" });
  const numBudget = Number(budgetEstimated || 0);
  if (isNaN(numBudget) || numBudget < 0) return res.status(400).json({ error: "งบประมาณประมาณการต้องเป็นตัวเลขที่ไม่ติดลบค่ะ" });

  const { data: proposer } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!proposer) return res.status(404).json({ error: "User not found" });
  if (!isCommitteeRole(proposer)) return res.status(403).json({ error: "ขออภัย เฉพาะเหรัญญิก คณะกรรมการ หรือผู้มีตำแหน่งบริหารเท่านั้นที่เสนอกิจกรรมได้" });

  const activityId = generateId("act");
  const newActivity = { id: activityId, title, description: description || "", proposed_by: userId, status: "proposed", event_date: eventDate || null, location: location || "", budget_estimated: numBudget, document_urls: documentUrls || [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await supabase.from("activities").insert(newActivity);

  const { data: allUsers } = await supabase.from("users").select("id");
  const recipientIds = (allUsers || []).map((u: { id: string }) => u.id).filter((id: string) => id !== userId);
  await createNotificationsBulk(recipientIds, "มีการเสนอโครงการกิจกรรมใหม่ ✨", `คุณ ${proposer.full_name} ได้เสนอโครงการ: "${title}"`, "activity", activityId, "activity");
  await writeLog(userId, "propose_activity", "activity", activityId, { title });
  res.json({ success: true, activity: convertKeysToCamel(newActivity) });
}));

// Activities - Delete
router.post("/activities/delete", asyncHandler(async (req, res) => {
  const { activityId, userId } = req.body;
  if (!activityId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "User not found" });

  const isComm = isCommitteeRole(user);
  if (act.status === "completed" && !isComm) return res.status(403).json({ error: "โครงการเสร็จสิ้นแล้ว เฉพาะเหรัญญิกหรือกรรมการห้องเท่านั้นที่สามารถลบได้" });
  if (!(isComm || act.proposed_by === userId)) return res.status(403).json({ error: "ไม่มีสิทธิ์ลบโครงการนี้" });

  const { data: bReqs } = await supabase.from("budget_requests").select("id").eq("activity_id", activityId);
  const bReqIds = (bReqs || []).map((r: { id: string }) => r.id);
  if (bReqIds.length > 0) await supabase.from("transactions").delete().eq("reference_type", "budget_request").in("reference_id", bReqIds);

  const extIncomes = act.external_incomes || [];
  const extIncomeIds = extIncomes.map((i: any) => i.id);
  if (extIncomeIds.length > 0) await supabase.from("transactions").delete().eq("reference_type", "activity").in("reference_id", extIncomeIds);

  await supabase.from("transactions").delete().eq("reference_type", "payment").eq("reference_id", activityId);
  await supabase.from("budget_requests").delete().eq("activity_id", activityId);
  await supabase.from("activities").delete().eq("id", activityId);
  await writeLog(userId, "delete_activity", "activity", activityId, { title: act.title });
  res.json({ success: true });
}));

// Activities - Update
router.post("/activities/update", asyncHandler(async (req, res) => {
  const { activityId, userId, title, description, eventDate, location, budgetEstimated, budgetApproved, actualExpense, refundAmount, expenseReceipts, status } = req.body;
  if (!activityId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!(isCommitteeRole(user) || act.proposed_by === userId)) return res.status(403).json({ error: "ไม่มีสิทธิ์แก้ไขโครงการนี้" });

  const updateData: any = { updated_at: new Date().toISOString() };
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (eventDate !== undefined) updateData.event_date = eventDate || null;
  if (location !== undefined) updateData.location = location;
  if (budgetEstimated !== undefined) updateData.budget_estimated = Number(budgetEstimated || 0);
  if (budgetApproved !== undefined) updateData.budget_approved = Number(budgetApproved || 0);
  if (actualExpense !== undefined) updateData.actual_expense = Number(actualExpense || 0);
  if (refundAmount !== undefined) updateData.refund_amount = Number(refundAmount || 0);
  if (expenseReceipts !== undefined) updateData.expense_receipts = expenseReceipts;
  if (status !== undefined) updateData.status = status;

  const { data: updatedAct, error } = await supabase.from("activities").update(updateData).eq("id", activityId).select("*").single();
  if (error) return res.status(500).json({ error: error.message });

  await writeLog(userId, "update_activity", "activity", activityId, { title: updatedAct.title });
  res.json({ success: true, activity: convertKeysToCamel(updatedAct) });
}));

// Activities - Approve
router.post("/activities/approve", asyncHandler(async (req, res) => {
  const { activityId, treasurerId, action, rejectReason, budgetApproved } = req.body;
  if (!activityId || !treasurerId || !action) return res.status(400).json({ error: "Missing parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });

  if (action === "approve") {
    if (act.status === "approved" || act.status === "in_progress" || act.status === "completed") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    await supabase.from("activities").update({ status: "approved", budget_approved: Number(budgetApproved || act.budget_estimated), approved_by: treasurerId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", activityId);
    await createNotification(act.proposed_by, "โครงการกิจกรรมได้รับการอนุมัติแล้ว 💚", `โครงการ "${act.title}" ได้อนุมัติ ยอดงบประมาณคือ ${Number(budgetApproved || act.budget_estimated)} บาท`, "activity", activityId, "activity");
  } else {
    if (act.status === "rejected") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    await supabase.from("activities").update({ status: "rejected", reject_reason: rejectReason, updated_at: new Date().toISOString() }).eq("id", activityId);
    await createNotification(act.proposed_by, "❌ โครงการกิจกรรมไม่ได้รับการอนุมัติ", `โครงการ "${act.title}" ไม่ได้อนุมัติ: "${rejectReason}"`, "activity", activityId, "activity");
  }
  await writeLog(treasurerId, `${action}_activity`, "activity", activityId, { title: act.title, reason: rejectReason });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));

// Budget request
router.post("/activities/budget/request", asyncHandler(async (req, res) => {
  const { activityId, title, amount, reason, details, documentUrls, userId } = req.body;
  if (!title || !amount || !userId) return res.status(400).json({ error: "Missing parameters" });
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "จำนวนเงินที่ขอเบิกต้องเป็นตัวเลขที่มากกว่า 0 บาท" });

  const reqId = generateId("bud");
  const newReq = { id: reqId, activity_id: activityId || null, title, amount: numAmount, reason: reason || "", details: details || "", document_urls: documentUrls || [], status: "pending", requested_by: userId, created_at: new Date().toISOString() };
  await supabase.from("budget_requests").insert(newReq);

  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีคำขอเบิกงบประมาณโครงการใหม่", `คุณ ${user?.full_name} ยื่นคำขอเบิกงบ: "${title}" จำนวน ${numAmount} บาท`, "activity", reqId, "budget_request");
  await writeLog(userId, "request_budget", "budget_request", reqId, { title, amount: numAmount });
  res.json({ success: true, budgetRequest: convertKeysToCamel(newReq) });
}));

// Budget approve
router.post("/activities/budget/approve", asyncHandler(async (req, res) => {
  const { requestId, treasurerId, action, rejectReason } = req.body;
  if (!requestId || !treasurerId || !action) return res.status(400).json({ error: "Missing parameters" });
  const { data: budgetReq } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  if (!budgetReq) return res.status(404).json({ error: "Budget request not found" });

  if (action === "approve") {
    if (budgetReq.status === "approved") {
      return res.json({ success: true, budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "approved", approved_by: treasurerId, approved_at: new Date().toISOString() }).eq("id", requestId);
    await supabase.from("transactions").insert({ id: generateId("tx"), type: "expense", category: "activity_expense", amount: budgetReq.amount, description: `จ่ายงบประมาณโครงการ: ${budgetReq.title}`, reference_id: budgetReq.id, reference_type: "budget_request", created_by: treasurerId, approved_by: treasurerId, approved_at: new Date().toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: new Date().toISOString() });
    if (budgetReq.activity_id) await supabase.from("activities").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", budgetReq.activity_id);
    await createNotification(budgetReq.requested_by, "คำขอเบิกงบประมาณอนุมัติแล้ว 💸", `คำขอเบิกงบ "${budgetReq.title}" ยอดเงิน ${budgetReq.amount} บาท โอนจ่ายเรียบร้อย`, "activity", requestId, "budget_request");
  } else {
    if (budgetReq.status === "rejected") {
      return res.json({ success: true, budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "rejected", reject_reason: rejectReason }).eq("id", requestId);
    await createNotification(budgetReq.requested_by, "❌ คำขอเบิกงบไม่ได้รับการอนุมัติ", `คำขอเบิกงบ "${budgetReq.title}" ถูกปฏิเสธ: "${rejectReason}"`, "activity", requestId, "budget_request");
  }
  await writeLog(treasurerId, `${action}_budget_request`, "budget_request", requestId, { title: budgetReq.title, amount: budgetReq.amount });
  const { data: updated } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  res.json({ success: true, budgetRequest: convertKeysToCamel(updated) });
}));

// Budget expansion propose
router.post("/activities/budget-expansion/propose", asyncHandler(async (req, res) => {
  const { activityId, originalRequestId, amount, reason, userId } = req.body;
  if (!activityId || !originalRequestId || !amount || !userId) return res.status(400).json({ error: "Missing required parameters" });
  await supabase.from("activities").update({ budget_expansion_requested: Number(amount), budget_expansion_reason: reason || "", budget_expansion_status: "pending", budget_expansion_reject_reason: "" }).eq("id", activityId);
  const { data: originalReq } = await supabase.from("budget_requests").select("title").eq("id", originalRequestId).single();
  const reqId = generateId("exp");
  const newReq = { id: reqId, activity_id: activityId, title: `ขยายงบประมาณเพิ่มเติม (${originalReq?.title || "งบย่อย"})`, amount: Number(amount), reason: reason || "", status: "pending", requested_by: userId, is_expansion: true, created_at: new Date().toISOString() };
  await supabase.from("budget_requests").insert(newReq);
  const { data: act } = await supabase.from("activities").select("title").eq("id", activityId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีคำเสนอขอขยายงบประมาณโครงการ 📈", `โครงการ "${act?.title}" ยื่นขอขยายงบเพิ่มเติม ${amount} บาท โดยคุณ ${user?.full_name}`, "activity", reqId, "budget_request");
  await writeLog(userId, "propose_budget_expansion", "activity", activityId, { amount: Number(amount) });
  const { data: updatedAct } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updatedAct), budgetRequest: convertKeysToCamel(newReq) });
}));

// Budget expansion approve
router.post("/activities/budget-expansion/approve", asyncHandler(async (req, res) => {
  const { requestId, treasurerId, action, rejectReason } = req.body;
  if (!requestId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: budgetReq } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  if (!budgetReq) return res.status(404).json({ error: "Budget request not found" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", budgetReq.activity_id).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });

  if (action === "approve") {
    if (budgetReq.status === "approved") {
      return res.json({ success: true, activity: convertKeysToCamel(act), budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "approved", approved_by: treasurerId, approved_at: new Date().toISOString() }).eq("id", requestId);
    const newBudget = (act.budget_approved || act.budget_estimated || 0) + budgetReq.amount;
    await supabase.from("activities").update({ budget_approved: newBudget, budget_expansion_status: "approved", budget_expansion_approved_by: treasurerId, budget_expansion_approved_at: new Date().toISOString(), budget_expansion_reject_reason: "" }).eq("id", budgetReq.activity_id);
    await supabase.from("transactions").insert({ id: generateId("tx"), type: "expense", category: "activity_expense", amount: budgetReq.amount, description: `จ่ายเงินขยายงบประมาณโครงการ: ${budgetReq.title}`, reference_id: budgetReq.id, reference_type: "budget_request", created_by: treasurerId, approved_by: treasurerId, approved_at: new Date().toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: new Date().toISOString() });
    await createNotification(act.proposed_by, "คำขอขยายงบประมาณได้รับการอนุมัติแล้ว! 🎉", `โครงการ "${act.title}" ได้รับเพิ่มงบอีก ${budgetReq.amount} บาท`, "activity", budgetReq.activity_id, "activity");
  } else {
    if (budgetReq.status === "rejected") {
      return res.json({ success: true, activity: convertKeysToCamel(act), budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "rejected", reject_reason: rejectReason || "" }).eq("id", requestId);
    await supabase.from("activities").update({ budget_expansion_status: "rejected", budget_expansion_reject_reason: rejectReason || "" }).eq("id", budgetReq.activity_id);
    await createNotification(act.proposed_by, "คำขอขยายงบประมาณถูกปฏิเสธ ❌", `โครงการ "${act.title}" ถูกปฏิเสธเพิ่มงบ: "${rejectReason}"`, "activity", budgetReq.activity_id, "activity");
  }
  await writeLog(treasurerId, `respond_budget_expansion_${action}`, "activity", budgetReq.activity_id, { amount: budgetReq.amount });
  const { data: updatedAct } = await supabase.from("activities").select("*").eq("id", budgetReq.activity_id).single();
  const { data: updatedReq } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  res.json({ success: true, activity: convertKeysToCamel(updatedAct), budgetRequest: convertKeysToCamel(updatedReq) });
}));

// External income propose
router.post("/activities/external-income/propose", asyncHandler(async (req, res) => {
  const { activityId, amount, source, slipUrl, userId } = req.body;
  if (!activityId || !amount || !source || !userId) return res.status(400).json({ error: "Missing required parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const incId = generateId("inc");
  const externalIncomes = act.external_incomes || [];
  externalIncomes.unshift({ id: incId, activityId, amount: Number(amount), source, slipUrl: slipUrl || "", status: "pending", requestedBy: userId, createdAt: new Date().toISOString() });
  await supabase.from("activities").update({ external_incomes: externalIncomes }).eq("id", activityId);
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีรายการเงินสนับสนุนกิจกรรมใหม่ 📥", `คุณ ${user?.full_name} แจ้งยอดเงินสนับสนุน ${amount} บาท จาก "${source}"`, "activity", incId, "external_income");
  await writeLog(userId, "propose_external_income", "activity", activityId, { amount: Number(amount), source });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));

// External income approve
router.post("/activities/external-income/approve", asyncHandler(async (req, res) => {
  const { activityId, incomeId, treasurerId, action, rejectReason } = req.body;
  if (!activityId || !incomeId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const externalIncomes = (act.external_incomes || []) as ExternalIncome[];
  const incIndex = externalIncomes.findIndex((i) => i.id === incomeId);
  if (incIndex === -1) return res.status(404).json({ error: "Income record not found" });
  const income = externalIncomes[incIndex];
  if (action === "approve") {
    if (income.status === "approved") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    income.status = "approved"; income.approvedBy = treasurerId; income.approvedAt = new Date().toISOString();
    await createNotification(income.requestedBy, "ยอดเงินสนับสนุนโครงการได้รับการยืนยันแล้ว! 🎉", `เงินสนับสนุนจำนวน ${income.amount} บาท จาก "${income.source}" ได้รับการยืนยันแล้ว`, "activity", activityId, "activity");
  } else {
    if (income.status === "rejected") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    income.status = "rejected"; income.rejectReason = rejectReason || "";
    await createNotification(income.requestedBy, "ยอดเงินสนับสนุนถูกปฏิเสธ ❌", `รายการแจ้งเงินสนับสนุนจาก "${income.source}" จำนวน ${income.amount} บาท ถูกปฏิเสธ`, "activity", activityId, "activity");
  }
  externalIncomes[incIndex] = income;
  await supabase.from("activities").update({ external_incomes: externalIncomes }).eq("id", activityId);
  await writeLog(treasurerId, `respond_external_income_${action}`, "activity", activityId, { amount: income.amount });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));

// Settlement propose
router.post("/activities/settle/propose", asyncHandler(async (req, res) => {
  const { activityId, actualExpense, refundAmount, refundSlipUrl, expenseReceipts, userId } = req.body;
  if (!activityId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: act } = await supabase.from("activities").select("status").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  if (act.status !== "in_progress" && act.status !== "pending_settlement") return res.status(400).json({ error: "โครงการต้องอยู่ในสถานะกำลังดำเนินงานเพื่อยื่นปิดงาน" });
  await supabase.from("activities").update({ status: "pending_settlement", actual_expense: Number(actualExpense || 0), refund_amount: Number(refundAmount || 0), refund_slip_url: refundSlipUrl || "", expense_receipts: expenseReceipts || [], updated_at: new Date().toISOString() }).eq("id", activityId);
  const { data: updatedAct } = await supabase.from("activities").select("title").eq("id", activityId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: proposer } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีโครงการกิจกรรมยื่นปิดงานและทอนเงิน 📝", `คุณ ${proposer?.full_name} ยื่นสรุปโครงการ "${updatedAct?.title}"`, "activity", activityId, "activity");
  await writeLog(userId, "propose_settlement", "activity", activityId, { title: updatedAct?.title, actualExpense, refundAmount });
  const { data: finalAct } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(finalAct) });
}));

// Settlement approve
router.post("/activities/settle/approve", asyncHandler(async (req, res) => {
  const { activityId, treasurerId, action, rejectReason } = req.body;
  if (!activityId || !treasurerId || !action) return res.status(400).json({ error: "Missing parameters" });
  const { data: actingUser } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!actingUser || actingUser.role !== "treasurer") return res.status(403).json({ error: "ไม่มีสิทธิ์ดำเนินการ (เฉพาะเหรัญญิกเท่านั้น)" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  if (action === "approve" && act.status === "completed") {
    return res.json({ success: true, activity: convertKeysToCamel(act) });
  }
  if (act.status !== "pending_settlement") return res.status(400).json({ error: "โครงการไม่ได้อยู่ในขั้นตอนรออนุมัติปิดงาน" });

  if (action === "approve") {
    await supabase.from("activities").update({ status: "completed", settled_by: treasurerId, settled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", activityId);
    if (act.refund_amount && act.refund_amount > 0) {
      await supabase.from("transactions").insert({ id: generateId("tx_refund"), type: "income", category: "other_income", amount: act.refund_amount, description: `เงินทอน/สนับสนุนคงเหลือจากโครงการ: ${act.title} (นำเข้าบัญชีส่วนกลางทั้งหมด)`, reference_id: act.id, reference_type: "payment", created_by: treasurerId, approved_by: treasurerId, approved_at: new Date().toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: new Date().toISOString() });
    }
    await createNotification(act.proposed_by, "อนุมัติปิดโครงการเสร็จสิ้นแล้ว 🎉", `โครงการ "${act.title}" ได้อนุมัติปิดยอดบัญชีเรียบร้อยแล้ว`, "activity", activityId, "activity");
  } else {
    await supabase.from("activities").update({ status: "in_progress", reject_reason: rejectReason || "ข้อมูลไม่ถูกต้อง", updated_at: new Date().toISOString() }).eq("id", activityId);
    await createNotification(act.proposed_by, "❌ คำขอปิดโครงการถูกปฏิเสธ", `คำขอปิดโครงการ "${act.title}" ไม่ผ่าน: "${rejectReason || "ข้อมูลไม่ถูกต้อง"}"`, "activity", activityId, "activity");
  }
  await writeLog(treasurerId, `${action}_settlement`, "activity", activityId, { title: act.title, action, reason: rejectReason });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));

export default router;
