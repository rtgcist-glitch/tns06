/**
 * Market Service
 * Deduplicated market week total recalculation
 * (Previously duplicated in 2 locations in server.ts)
 */

import { supabase } from "../config/supabase";
import { roundToTwoDecimals } from "../utils/math";
import type { MarketItemRecord } from "../types/server";

export async function recalculateWeekTotals(marketWeekId: string): Promise<void> {
  const { data: weekItems } = await supabase.from("market_items").select("*").eq("market_week_id", marketWeekId);
  
  const items = (weekItems as MarketItemRecord[] || []);
  const costs = items
    .filter((i) => i.type === "cost")
    .reduce((sum, i) => roundToTwoDecimals(sum + (i.amount * i.quantity)), 0);
  const revenues = items
    .filter((i) => i.type === "revenue")
    .reduce((sum, i) => roundToTwoDecimals(sum + (i.amount * i.quantity)), 0);

  await supabase.from("market_weeks").update({
    total_cost: costs,
    total_revenue: revenues,
    total_profit: roundToTwoDecimals(revenues - costs)
  }).eq("id", marketWeekId);
}
