/**
 * Bill Service
 * Bill status calculation and update helpers
 */

import { supabase } from "../config/supabase";
import { roundToTwoDecimals } from "../utils/math";

export async function updateBillStatus(billId: string) {
  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", billId).single();
  if (!bill) return;

  const { data: billPayments } = await supabase.from("payments").select("*").eq("bill_id", billId);
  const totalApproved = roundToTwoDecimals(
    (billPayments || [])
      .filter((p: { status: string }) => p.status === "approved")
      .reduce((sum: number, p: { amount: number }) => roundToTwoDecimals(sum + Number(p.amount || 0)), 0)
  );
  const hasPendingReview = (billPayments || []).some((p: { status: string }) => p.status === "pending_review");

  let newStatus = "pending";
  let paidAt: string | null = null;
  if (totalApproved >= bill.amount) {
    newStatus = "paid";
    paidAt = bill.paid_at || new Date().toISOString();
  } else if (hasPendingReview) {
    newStatus = "pending_review";
  }

  await supabase.from("monthly_bills").update({ status: newStatus, paid_at: paidAt }).eq("id", billId);
}
