/**
 * Market Routes
 * /api/market/* (week CRUD, items, advance, additional advance)
 */

import { Router } from "express";
import { supabase } from "../config/supabase";
import { convertKeysToCamel } from "../utils/camelCase";
import { getCurrentBuddhistYear, getCurrentMonth } from "../utils/thaiMonths";
import { generateId } from "../utils/idGenerator";
import { createNotification, createNotificationsBulk } from "../services/notificationService";
import { writeLog } from "../services/logService";
import { recalculateWeekTotals } from "../services/marketService";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// Market Week - Create
router.post("/market/week/create", asyncHandler(async (req, res) => {
  const { weekDate, note, teamName, leaderId, memberIds, userId } = req.body;
  if (!weekDate || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: proposer } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!proposer || (proposer.role !== "treasurer" && proposer.role !== "committee")) return res.status(403).json({ error: "ขออภัย เฉพาะเหรัญญิกหรือคณะกรรมการเท่านั้นที่มีสิทธิ์เพิ่มรอบตลาดได้" });

  const weekId = generateId("mkt");
  const newWeek = { id: weekId, week_date: weekDate, total_cost: 0, total_revenue: 0, total_profit: 0, status: "planned", note: note || "", team_name: teamName || "กลุ่มขายสินค้าทั่วไป", leader_id: leaderId || userId, member_ids: memberIds || [], created_by: userId, created_at: new Date().toISOString() };
  await supabase.from("market_weeks").insert(newWeek);
  await writeLog(userId, "create_market_week", "market_week", weekId, { weekDate, note, teamName });
  res.json({ success: true, marketWeek: convertKeysToCamel(newWeek) });
}));

// Market Week - Update Team
router.post("/market/week/update-team", asyncHandler(async (req, res) => {
  const { marketWeekId, teamName, leaderId, memberIds, note, userId } = req.body;
  if (!marketWeekId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "ไม่พบรอบตลาดนี้" });

  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");

  if (!isAdmin && !isLeader) return res.status(403).json({ error: "ไม่มีสิทธิ์ปรับปรุงข้อมูลทีม เฉพาะหัวหน้าทีมหรือคณะกรรมการเท่านั้น" });

  const updates: Record<string, unknown> = {};
  if (teamName !== undefined) updates.team_name = teamName;
  if (leaderId !== undefined) updates.leader_id = leaderId;
  if (memberIds !== undefined) updates.member_ids = memberIds;
  if (note !== undefined) updates.note = note;

  await supabase.from("market_weeks").update(updates).eq("id", marketWeekId);
  await writeLog(userId, "update_market_team", "market_week", marketWeekId, { teamName });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market Item - Add
router.post("/market/item/add", asyncHandler(async (req, res) => {
  const { marketWeekId, itemName, type, amount, quantity, note, userId } = req.body;
  if (!marketWeekId || !itemName || !type || !amount || !userId) return res.status(400).json({ error: "Missing parameters" });

  const numAmount = Number(amount);
  const numQuantity = Number(quantity || 1);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "ราคาต่อหน่วยต้องเป็นตัวเลขที่มากกว่า 0 บาท" });
  if (isNaN(numQuantity) || numQuantity <= 0) return res.status(400).json({ error: "จำนวนสินค้าต้องเป็นตัวเลขที่มากกว่า 0 ชิ้น" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "ไม่พบรอบตลาดนี้" });

  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isMember = week.member_ids && week.member_ids.includes(userId);
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");
  if (!isAdmin && !isLeader && !isMember) return res.status(403).json({ error: "ไม่มีสิทธิ์เพิ่มรายการ เฉพาะสมาชิกทีมหรือกรรมการเท่านั้น" });

  const itemId = generateId("mkt_item");
  const newItem = { id: itemId, market_week_id: marketWeekId, item_name: itemName, type, amount: numAmount, quantity: numQuantity, note: note || "", created_by: userId, created_at: new Date().toISOString() };
  await supabase.from("market_items").insert(newItem);

  // Recalculate week totals (deduplicated via service)
  await recalculateWeekTotals(marketWeekId);

  const { data: currentWeek } = await supabase.from("market_weeks").select("status").eq("id", marketWeekId).single();
  if (currentWeek?.status === "planned") {
    await supabase.from("market_weeks").update({ status: "active" }).eq("id", marketWeekId);
  }

  await writeLog(userId, "add_market_item", "market_item", itemId, { itemName, type, amount });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, item: convertKeysToCamel(newItem), marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market Item - Delete
router.post("/market/item/delete", asyncHandler(async (req, res) => {
  const { itemId, userId } = req.body;
  if (!itemId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const { data: item } = await supabase.from("market_items").select("*").eq("id", itemId).single();
  if (!item) return res.status(404).json({ error: "ไม่พบรายการสินค้า" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", item.market_week_id).single();
  if (!week) return res.status(404).json({ error: "ไม่พบรอบตลาด" });

  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isMember = week.member_ids && week.member_ids.includes(userId);
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");
  if (!isAdmin && !isLeader && !isMember) return res.status(403).json({ error: "ไม่มีสิทธิ์ลบรายการ เฉพาะสมาชิกทีมหรือกรรมการเท่านั้น" });

  await supabase.from("market_items").delete().eq("id", itemId);
  await recalculateWeekTotals(item.market_week_id);

  await writeLog(userId, "delete_market_item", "market_item", itemId, { itemName: item.item_name });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", item.market_week_id).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market Week - Complete
router.post("/market/week/complete", asyncHandler(async (req, res) => {
  const { marketWeekId, userId } = req.body;
  if (!marketWeekId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "ไม่พบรอบตลาดนี้" });

  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");
  if (!isAdmin && !isLeader) return res.status(403).json({ error: "ไม่มีสิทธิ์สรุปยอดตลาด เฉพาะหัวหน้าทีมหรือกรรมการเท่านั้น" });

  await supabase.from("market_weeks").update({ status: "completed" }).eq("id", marketWeekId);
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();

  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีรายการสรุปยอดตลาดวันพุธรอตรวจสอบ", `คุณ ${user?.full_name || "หัวหน้าทีม"} ได้สรุปยอดกำไรตลาดวันพุธรอบวันที่ ${updatedWeek?.week_date}`, "market", marketWeekId, "market");
  await writeLog(userId, "complete_market_week", "market_week", marketWeekId, { profit: updatedWeek?.total_profit });
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market Week - Approve (creates transactions)
router.post("/market/week/approve", asyncHandler(async (req, res) => {
  const { marketWeekId, treasurerId } = req.body;
  if (!marketWeekId || !treasurerId) return res.status(400).json({ error: "Missing parameters" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });
  if (week.status === "approved") {
    return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
  }

  await supabase.from("market_weeks").update({ status: "approved", approved_by: treasurerId, approved_at: new Date().toISOString() }).eq("id", marketWeekId);

  const weekDateObj = week.week_date ? new Date(week.week_date) : new Date();
  const weekMonth = !isNaN(weekDateObj.getTime()) ? weekDateObj.getMonth() + 1 : getCurrentMonth();
  const weekBuddhistYear = !isNaN(weekDateObj.getTime()) ? weekDateObj.getFullYear() + 543 : getCurrentBuddhistYear();
  const txBase = { reference_id: week.id, reference_type: "market", created_by: treasurerId, approved_by: treasurerId, approved_at: new Date().toISOString(), month: weekMonth, year: weekBuddhistYear, is_closed: false, created_at: new Date().toISOString() };

  const carryMatch = week.note?.match(/\[CARRY_FORWARD_REMAINING:([\d.]+)\]/);
  const carryForwardRemaining = carryMatch ? Number(carryMatch[1]) : 0;
  const totalAdvancePaid = Number(week.advance_requested || 0) + (week.additional_advance_status === "approved" ? Number(week.additional_advance_requested || 0) : 0);

  const parseAdvanceReason = (rawReason: string) => {
    if (!rawReason) return { reason: "", carryForwardAmount: 0 };
    if (rawReason.startsWith("CARRY_FORWARD_AMOUNT:")) {
      const parts = rawReason.split(" | REASON:");
      const carryForwardAmt = Number(parts[0].replace("CARRY_FORWARD_AMOUNT:", "")) || 0;
      const reasonStr = parts[1] || "";
      return { reason: reasonStr, carryForwardAmount: carryForwardAmt };
    }
    return { reason: rawReason, carryForwardAmount: 0 };
  };
  const { carryForwardAmount } = parseAdvanceReason(week.advance_reason || "");

  const isCapitalOnlyCarry = week.note?.includes("[CARRY_FORWARD_CAPITAL_ONLY:true]");

  if (carryForwardRemaining > 0 && !isCapitalOnlyCarry) {
    // Carrying forward — no central treasury transactions
  } else {
    if (week.total_profit > 0) {
      const { error: txErr } = await supabase.from("transactions").insert({ ...txBase, id: generateId("tx_profit"), type: "income", category: "market_profit", amount: week.total_profit, description: `กำไรส่งคืนกองทุนห้องเรียนตลาดวันพุธ: ${week.team_name || "กลุ่มจำหน่ายสินค้า"} (${week.week_date})` });
      if (txErr) {
        console.error("Error inserting profit transaction:", txErr);
        throw new Error("ล้มเหลวในการบันทึกยอดกำไรสัปดาห์ตลาดเข้าสู่ฐานข้อมูล: " + txErr.message);
      }
    }
    if (!isCapitalOnlyCarry) {
      const returnedAmount = Math.max(0, totalAdvancePaid + (week.total_profit < 0 ? week.total_profit : 0));
      if (week.advance_status === "approved" && returnedAmount > 0) {
        const { error: advErr } = await supabase.from("transactions").insert({ ...txBase, id: generateId("tx_adv_ret"), type: "income", category: "other_income", amount: returnedAmount, description: `รับคืนเงินทุนล่วงหน้าตลาดวันพุธ: ${week.team_name || "กลุ่มจำหน่ายสินค้า"} (${week.week_date})` });
        if (advErr) {
          console.error("Error inserting advance return transaction:", advErr);
          throw new Error("ล้มเหลวในการบันทึกยอดคืนเงินทุนล่วงหน้าเข้าสู่ฐานข้อมูล: " + advErr.message);
        }
      }
      if (carryForwardAmount > 0) {
        const { error: carryErr } = await supabase.from("transactions").insert({ ...txBase, id: generateId("tx_carry_ret"), type: "income", category: "other_income", amount: carryForwardAmount, description: `รับคืนเงินทุนและกำไรสะสมที่ยกยอดมาจากรอบก่อนหน้า: ${week.team_name || "กลุ่มจำหน่ายสินค้า"} (ตลาดรอบ ${week.week_date})` });
        if (carryErr) {
          console.error("Error inserting carry return transaction:", carryErr);
          throw new Error("ล้มเหลวในการบันทึกยอดคืนเงินทุนสะสมยกยอดเข้าสู่ฐานข้อมูล: " + carryErr.message);
        }
      }
    }
  }

  const { data: allUsers } = await supabase.from("users").select("id");
  const allUserIds = (allUsers || []).map((u: { id: string }) => u.id);
  await createNotificationsBulk(allUserIds, "อัปเดตสรุปยอดตลาดวันพุธ 🛒", `ยอดเงินกำไรตลาดวันพุธรอบ ${week.week_date} จำนวน ${week.total_profit} บาท ได้รับการสมทบทุนแล้วค่ะ`, "market", marketWeekId, "market");
  await writeLog(treasurerId, "approve_market_week", "market_week", marketWeekId, { profit: week.total_profit });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market advance propose
router.post("/market/week/advance/propose", asyncHandler(async (req, res) => {
  const { marketWeekId, amount, reason, requesterId } = req.body;
  if (!marketWeekId || !amount || !requesterId) return res.status(400).json({ error: "Missing required parameters" });
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "จำนวนเงินทุนล่วงหน้าต้องเป็นตัวเลขที่มากกว่า 0 บาท" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "ไม่พบรอบตลาดนี้" });
  const { data: requester } = await supabase.from("users").select("role").eq("id", requesterId).single();
  const isLeader = week.leader_id === requesterId;
  const isAdmin = requester && (requester.role === "treasurer" || requester.role === "committee");
  if (!isAdmin && !isLeader) return res.status(403).json({ error: "ไม่มีสิทธิ์เสนอขอทุนล่วงหน้า เฉพาะหัวหน้าทีมหรือคณะกรรมการเท่านั้น" });

  await supabase.from("market_weeks").update({ advance_requested: numAmount, advance_reason: reason || "", advance_status: "pending", advance_reject_reason: "" }).eq("id", marketWeekId);
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีคำขอเบิกเงินทุนล่วงหน้าตลาด 💰", `ทีม ${updatedWeek?.team_name || "ทั่วไป"} ขอเบิกทุนล่วงหน้าจำนวน ${numAmount} บาท`, "market", marketWeekId, "market");
  await writeLog(requesterId, "propose_market_advance", "market_week", marketWeekId, { amount: numAmount });
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market advance additional propose
router.post("/market/week/advance-additional/propose", asyncHandler(async (req, res) => {
  const { marketWeekId, amount, reason, requesterId } = req.body;
  if (!marketWeekId || !amount || !requesterId) return res.status(400).json({ error: "Missing required parameters" });
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "จำนวนเงินทุนเพิ่มเติมต้องเป็นตัวเลขที่มากกว่า 0 บาท" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "ไม่พบรอบตลาดนี้" });
  const { data: requester } = await supabase.from("users").select("role").eq("id", requesterId).single();
  const isLeader = week.leader_id === requesterId;
  const isAdmin = requester && (requester.role === "treasurer" || requester.role === "committee");
  if (!isAdmin && !isLeader) return res.status(403).json({ error: "ไม่มีสิทธิ์เสนอขอทุนเพิ่มเติม เฉพาะหัวหน้าทีมหรือคณะกรรมการเท่านั้น" });

  await supabase.from("market_weeks").update({ additional_advance_requested: numAmount, additional_advance_reason: reason || "", additional_advance_status: "pending", additional_advance_reject_reason: "" }).eq("id", marketWeekId);
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const treasurerIds = (treasurers || []).map((t: { id: string }) => t.id);
  await createNotificationsBulk(treasurerIds, "มีคำขอเบิกเงินทุนล่วงหน้าเพิ่มเติมตลาด 💰", `ทีม ${updatedWeek?.team_name || "ทั่วไป"} ขอเบิกทุนเพิ่มเติมจำนวน ${numAmount} บาท`, "market", marketWeekId, "market");
  await writeLog(requesterId, "propose_market_additional_advance", "market_week", marketWeekId, { amount: numAmount });
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market advance additional approve/reject
router.post("/market/week/advance-additional/approve", asyncHandler(async (req, res) => {
  const { marketWeekId, treasurerId, action, rejectReason, receiptUrl } = req.body;
  if (!marketWeekId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });

  if (action === "approve") {
    if (week.additional_advance_status === "approved") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    if (!receiptUrl) return res.status(400).json({ error: "Missing payment transfer slip" });
    await supabase.from("market_weeks").update({ additional_advance_status: "approved", additional_advance_receipt_url: receiptUrl, additional_advance_approved_by: treasurerId, additional_advance_approved_at: new Date().toISOString(), additional_advance_reject_reason: "" }).eq("id", marketWeekId);
    if (week.additional_advance_requested > 0) {
      const { error: addAdvErr } = await supabase.from("transactions").insert({ id: generateId("tx_adv_add"), type: "expense", category: "other_expense", amount: week.additional_advance_requested, description: `จ่ายเงินทุนล่วงหน้าเพิ่มเติมตลาดวันพุธ: ${week.team_name} (${week.week_date})`, reference_id: week.id, reference_type: "market", created_by: treasurerId, approved_by: treasurerId, approved_at: new Date().toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: new Date().toISOString() });
      if (addAdvErr) {
        console.error("Error inserting additional advance transaction:", addAdvErr);
        throw new Error("ล้มเหลวในการบันทึกรายจ่ายทุนล่วงหน้าเพิ่มเติม: " + addAdvErr.message);
      }
    }
    const notifyTarget = week.leader_id || week.created_by;
    await createNotification(notifyTarget, "คำขอทุนล่วงหน้าเพิ่มเติมอนุมัติและโอนเงินแล้ว 💰", `คำขอเบิกทุนเพิ่มเติมจำนวน ${week.additional_advance_requested} บาท ได้รับการโอนจ่ายเรียบร้อยแล้ว`, "market", marketWeekId, "market");
  } else {
    if (week.additional_advance_status === "rejected") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    await supabase.from("market_weeks").update({ additional_advance_status: "rejected", additional_advance_reject_reason: rejectReason || "" }).eq("id", marketWeekId);
    const notifyTarget = week.leader_id || week.created_by;
    await createNotification(notifyTarget, "คำขอทุนล่วงหน้าเพิ่มเติมตลาดถูกปฏิเสธ ⚠️", `คำขอเบิกทุนเพิ่มเติมจำนวน ${week.additional_advance_requested} บาท ถูกปฏิเสธ: ${rejectReason || "ไม่มีเหตุผลระบุ"}`, "market", marketWeekId, "market");
  }
  await writeLog(treasurerId, "respond_market_additional_advance", "market_week", marketWeekId, { action, amount: week.additional_advance_requested });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market advance approve/reject
router.post("/market/week/advance/approve", asyncHandler(async (req, res) => {
  const { marketWeekId, treasurerId, action, rejectReason, receiptUrl } = req.body;
  if (!marketWeekId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });

  if (action === "approve") {
    if (week.advance_status === "approved") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    if (!receiptUrl && week.advance_requested > 0) return res.status(400).json({ error: "Missing payment transfer slip" });
    await supabase.from("market_weeks").update({ advance_status: "approved", advance_receipt_url: receiptUrl || "", advance_approved_by: treasurerId, advance_approved_at: new Date().toISOString(), advance_reject_reason: "" }).eq("id", marketWeekId);
    if (week.advance_requested > 0) {
      const weekDateObj = week.week_date ? new Date(week.week_date) : new Date();
      const weekMonth = !isNaN(weekDateObj.getTime()) ? weekDateObj.getMonth() + 1 : getCurrentMonth();
      const weekBuddhistYear = !isNaN(weekDateObj.getTime()) ? weekDateObj.getFullYear() + 543 : getCurrentBuddhistYear();
      const { error: advTxErr } = await supabase.from("transactions").insert({ id: generateId("tx_adv"), type: "expense", category: "other_expense", amount: week.advance_requested, description: `จ่ายเงินทุนล่วงหน้าตลาดวันพุธ: ${week.team_name} (${week.week_date})`, reference_id: week.id, reference_type: "market", created_by: treasurerId, approved_by: treasurerId, approved_at: new Date().toISOString(), month: weekMonth, year: weekBuddhistYear, is_closed: false, created_at: new Date().toISOString() });
      if (advTxErr) {
        console.error("Error inserting advance transaction:", advTxErr);
        throw new Error("ล้มเหลวในการบันทึกรายจ่ายเงินทุนล่วงหน้า: " + advTxErr.message);
      }
    }
    if (week.leader_id) await createNotification(week.leader_id, "อนุมัติโอนเงินทุนล่วงหน้าแล้ว 💰", `คำขอเบิกทุนล่วงหน้าตลาดจำนวน ${week.advance_requested} บาท ได้รับการอนุมัติแล้วค่ะ`, "market", marketWeekId, "market");
    await writeLog(treasurerId, "approve_market_advance", "market_week", marketWeekId, { amount: week.advance_requested });
  } else {
    if (week.advance_status === "rejected") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    await supabase.from("market_weeks").update({ advance_status: "rejected", advance_reject_reason: rejectReason || "ปฏิเสธโดยเหรัญญิก" }).eq("id", marketWeekId);
    if (week.leader_id) await createNotification(week.leader_id, "คำขอเบิกทุนล่วงหน้าถูกปฏิเสธ ⚠️", `คำขอเบิกทุนล่วงหน้าตลาดของทีมถูกปฏิเสธเนื่องจาก: ${rejectReason || "ปฏิเสธโดยเหรัญญิก"}`, "market", marketWeekId, "market");
    await writeLog(treasurerId, "reject_market_advance", "market_week", marketWeekId, { reason: rejectReason });
  }
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));

// Market Week - Delete
router.post("/market/week/delete", asyncHandler(async (req, res) => {
  const { marketWeekId, userId } = req.body;
  if (!marketWeekId || !userId) return res.status(400).json({ error: "Missing parameters" });

  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "User not found" });

  const isCreator = week.created_by === userId || week.leader_id === userId;
  const isTreasurer = user.role === "treasurer";
  if (!(isTreasurer || (isCreator && week.status !== "approved"))) return res.status(403).json({ error: "ขออภัย คุณไม่มีสิทธิ์ลบรอบตลาดนี้" });

  await supabase.from("transactions").delete().eq("reference_type", "market").eq("reference_id", marketWeekId);
  await supabase.from("market_items").delete().eq("market_week_id", marketWeekId);
  await supabase.from("market_weeks").delete().eq("id", marketWeekId);
  await writeLog(userId, "delete_market_week", "market_week", marketWeekId, { weekDate: week.week_date, teamName: week.team_name });
  res.json({ success: true });
}));

export default router;
