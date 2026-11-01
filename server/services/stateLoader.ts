/**
 * State Loader Service
 * Loads full application state from Supabase for frontend consumption
 */

import { supabase } from "../config/supabase";
import { convertKeysToCamel } from "../utils/camelCase";
import { User, MonthlyBill, Payment, Transaction, MarketWeek, Activity, AppState, SystemSettings } from "../../src/types";

export async function loadFullState(): Promise<AppState> {
  const [
    { data: users },
    { data: settingsArr },
    { data: monthlyBills },
    { data: payments },
    { data: transactions },
    { data: marketWeeks },
    { data: marketItems },
    { data: marketTeams },
    { data: activities },
    { data: budgetRequests },
    { data: announcements },
    { data: notifications },
    { data: logs },
    { data: petitions },
    { data: passwordResets },
  ] = await Promise.all([
    supabase.from("users").select("*").order("student_id"),
    supabase.from("settings").select("*"),
    supabase.from("monthly_bills").select("*").order("created_at", { ascending: false }),
    supabase.from("payments").select("*").order("created_at", { ascending: false }),
    supabase.from("transactions").select("*").order("created_at", { ascending: false }),
    supabase.from("market_weeks").select("*").order("created_at", { ascending: false }),
    supabase.from("market_items").select("*"),
    supabase.from("market_teams").select("*"),
    supabase.from("activities").select("*").order("created_at", { ascending: false }),
    supabase.from("budget_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }),
    supabase.from("logs").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("petitions").select("*").order("created_at", { ascending: false }),
    supabase.from("password_resets").select("*").order("requested_at", { ascending: false }),
  ]);

  const settings = (settingsArr && settingsArr.length > 0 
    ? convertKeysToCamel(settingsArr[0])
    : { fundName: "เงินเก็บTns รุ่น06", monthlyFee: 150, promptpayNumber: "", promptpayName: "", promptpayQrUrl: "", bankName: "พร้อมเพย์" }) as unknown as SystemSettings & { id?: unknown };

  // Remove the singleton ID from settings
  if (settings.id) delete settings.id;

  const safeUsers = (users || []).map(({ password, ...rest }: any) => rest);

  return {
    users: convertKeysToCamel(safeUsers) as User[],
    settings: settings as SystemSettings,
    monthlyBills: convertKeysToCamel(monthlyBills || []) as MonthlyBill[],
    payments: convertKeysToCamel(payments || []) as Payment[],
    transactions: convertKeysToCamel(transactions || []) as Transaction[],
    marketWeeks: convertKeysToCamel(marketWeeks || []) as MarketWeek[],
    marketItems: convertKeysToCamel(marketItems || []) as any[],
    marketTeams: convertKeysToCamel(marketTeams || []) as any[],
    activities: convertKeysToCamel(activities || []) as Activity[],
    budgetRequests: convertKeysToCamel(budgetRequests || []) as any[],
    announcements: convertKeysToCamel(announcements || []) as any[],
    notifications: convertKeysToCamel(notifications || []) as any[],
    logs: convertKeysToCamel(logs || []) as any[],
    petitions: convertKeysToCamel(petitions || []) as any[],
    passwordResets: convertKeysToCamel(passwordResets || []) as any[],
  };
}
