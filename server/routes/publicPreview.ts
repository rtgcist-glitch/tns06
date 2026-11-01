/**
 * Public Preview Routes
 * GET /api/public/preview — Public-facing summary data (no authentication required)
 * 
 * This endpoint provides safe, aggregated data for external viewers
 * (teachers, students, parents) without exposing personal information.
 */

import { Router } from "express";
import { supabase } from "../config/supabase";
import { convertKeysToCamel } from "../utils/camelCase";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

router.get("/public/preview", asyncHandler(async (req, res) => {
  // Fetch all required data in parallel
  const [
    { data: settingsArr },
    { count: memberCount },
    { data: transactions },
    { data: monthlyBills },
    { data: marketWeeks },
    { data: activities },
    { data: announcements },
  ] = await Promise.all([
    supabase.from("settings").select("*"),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("transactions").select("id, type, category, amount, month, year, created_at").order("created_at", { ascending: false }),
    supabase.from("monthly_bills").select("id, month, year, amount, status, due_date, created_at").order("created_at", { ascending: false }),
    supabase.from("market_weeks").select("id, week_date, total_cost, total_revenue, total_profit, status, team_name, created_at").order("created_at", { ascending: false }),
    supabase.from("activities").select("id, title, description, status, event_date, location, created_at, updated_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("announcements").select("id, title, content, priority, is_pinned, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  // --- Settings (safe fields only) ---
  const rawSettings = settingsArr && settingsArr.length > 0 ? settingsArr[0] : {};
  const safeSettings = {
    fundName: rawSettings.fund_name || "เงินเก็บTns รุ่น06",
    monthlyFee: rawSettings.monthly_fee || 150,
  };

  // --- Financial Summary (aggregated, no individual transactions) ---
  const txList = transactions || [];
  const totalIncome = txList.filter((tx: any) => tx.type === "income").reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);
  const totalExpense = txList.filter((tx: any) => tx.type === "expense").reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);
  const totalBalance = totalIncome - totalExpense - 3802;

  // Breakdown by category
  const feeIncome = txList.filter((tx: any) => tx.category === "monthly_fee").reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);
  const marketProfit = txList.filter((tx: any) => tx.category === "market_profit").reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);
  const activityExpense = txList.filter((tx: any) => tx.category === "activity_expense").reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);

  // --- Billing Summary (latest cycle) ---
  const bills = monthlyBills || [];
  let latestMonth = 0;
  let latestYear = 0;
  if (bills.length > 0) {
    const sorted = [...bills].sort((a: any, b: any) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
    latestMonth = sorted[0].month;
    latestYear = sorted[0].year;
  }

  const currentCycleBills = bills.filter((b: any) => b.month === latestMonth && b.year === latestYear);
  const billingSummary = {
    month: latestMonth,
    year: latestYear,
    totalMembers: currentCycleBills.length,
    paidCount: currentCycleBills.filter((b: any) => b.status === "paid").length,
    pendingReviewCount: currentCycleBills.filter((b: any) => b.status === "pending_review").length,
    unpaidCount: currentCycleBills.filter((b: any) => b.status === "pending").length,
    amountPerPerson: currentCycleBills.length > 0 ? currentCycleBills[0].amount : (rawSettings.monthly_fee || 150),
  };

  // --- Market Summary (aggregated) ---
  const weeks = marketWeeks || [];
  const completedWeeks = weeks.filter((w: any) => w.status === "completed" || w.status === "approved");
  const marketSummary = {
    totalWeeks: weeks.length,
    completedWeeks: completedWeeks.length,
    totalProfit: completedWeeks.reduce((sum: number, w: any) => sum + (w.total_profit || 0), 0),
    totalRevenue: completedWeeks.reduce((sum: number, w: any) => sum + (w.total_revenue || 0), 0),
    totalCost: completedWeeks.reduce((sum: number, w: any) => sum + (w.total_cost || 0), 0),
  };

  // --- Activities (safe fields only — no budget details) ---
  const safeActivities = (activities || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    description: a.description || "",
    status: a.status,
    eventDate: a.event_date || null,
    location: a.location || "",
    createdAt: a.created_at,
  }));

  // --- Announcements (pinned ones first) ---
  const safeAnnouncements = (announcements || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    priority: a.priority,
    isPinned: a.is_pinned,
    createdAt: a.created_at,
  }));

  // --- Billing history (aggregate per cycle, no personal data) ---
  const cycleMap = new Map<string, { month: number; year: number; total: number; paid: number }>();
  for (const b of bills) {
    const key = `${b.year}-${b.month}`;
    if (!cycleMap.has(key)) {
      cycleMap.set(key, { month: b.month, year: b.year, total: 0, paid: 0 });
    }
    const entry = cycleMap.get(key)!;
    entry.total++;
    if (b.status === "paid") entry.paid++;
  }
  const billingHistory = Array.from(cycleMap.values())
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    })
    .slice(0, 6); // Last 6 cycles

  res.json({
    settings: safeSettings,
    memberCount: memberCount || 0,
    financialSummary: {
      totalBalance,
      totalIncome,
      totalExpense,
      feeIncome,
      marketProfit,
      activityExpense,
    },
    billingSummary,
    billingHistory,
    marketSummary,
    activities: safeActivities,
    announcements: safeAnnouncements,
    generatedAt: new Date().toISOString(),
  });
}));

export default router;
