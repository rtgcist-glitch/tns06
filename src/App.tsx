/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";

// Types
import { User, Activity, AppState } from "./types";

// Services
import { safeParseJson, apiPost } from "./services/apiClient";
export { safeParseJson };

// Layout & Modals
import NavigationShell from "./components/layout/NavigationShell";
import PromptPayQrModal from "./components/layout/PromptPayQrModal";

// Modular Feature Components
import Dashboard from "./components/Dashboard";
import MonthlyBills from "./components/MonthlyBills";
import WednesdayMarket from "./components/WednesdayMarket";
import Activities from "./components/Activities";
import FinancialReports from "./components/FinancialReports";
import ProfilePanel from "./components/ProfilePanel";
import MemberList from "./components/MemberList";
import AdminPanel from "./components/AdminPanel";
import PetitionsPanel from "./components/PetitionsPanel";
import GeminiAssistant from "./components/GeminiAssistant";
import LoginView from "./components/LoginView";
import PublicPreview from "./components/PublicPreview";
import { useLoading } from "./components/LoadingOverlay";

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [showLoginForm, setShowLoginForm] = useState<boolean>(false);
  const [aiOpenTrigger, setAiOpenTrigger] = useState<number>(0);

  const { withLoading } = useLoading();

  // Refs to manage race conditions and debouncing on concurrent updates
  const fetchStateAbortControllerRef = React.useRef<AbortController | null>(null);
  const isCriticalFetchRunningRef = React.useRef<boolean>(false);
  const realtimeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSetTab = useCallback((tab: string) => {
    if (tab === "ai_chat") {
      setAiOpenTrigger((prev) => prev + 1);
      return;
    }
    setActiveTab(tab);
  }, []);

  // Fetch complete state with AbortController to handle in-flight requests cleanly.
  const fetchState = useCallback(async (isCritical: boolean = true) => {
    if (!isCritical && isCriticalFetchRunningRef.current) {
      return;
    }

    if (isCritical) {
      isCriticalFetchRunningRef.current = true;
      if (realtimeTimeoutRef.current) {
        clearTimeout(realtimeTimeoutRef.current);
        realtimeTimeoutRef.current = null;
      }
    }

    if (fetchStateAbortControllerRef.current) {
      fetchStateAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchStateAbortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/state?t=${Date.now()}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const errData = await safeParseJson(res);
        throw new Error(
          (errData.error as string) || "Failed to load database state from full-stack server"
        );
      }
      const data = (await safeParseJson(res)) as unknown as AppState & { error?: string };
      if (data.error) throw new Error(data.error);

      if (!controller.signal.aborted) {
        setState(data);
        setError(null);

        const savedUserStr = localStorage.getItem("currentUser");
        if (savedUserStr) {
          try {
            const savedUser = JSON.parse(savedUserStr);
            if (data.users) {
              const synced = data.users.find((u: User) => u.id === savedUser.id);
              if (synced) {
                setCurrentUser(synced);
                localStorage.setItem("currentUser", JSON.stringify(synced));
              } else {
                setCurrentUser(null);
                localStorage.removeItem("currentUser");
              }
            }
          } catch {
            setCurrentUser(null);
            localStorage.removeItem("currentUser");
          }
        } else {
          setCurrentUser(null);
        }
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      if (errorObj.name === "AbortError") {
        return;
      }
      console.error(errorObj);
      setError(errorObj.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
      if (isCritical) {
        setTimeout(() => {
          isCriticalFetchRunningRef.current = false;
        }, 500);
      }
    }
  }, []);

  // Debounced wrapper for non-critical realtime events
  const triggerRealtimeStateFetch = useCallback(() => {
    if (realtimeTimeoutRef.current) {
      clearTimeout(realtimeTimeoutRef.current);
    }
    realtimeTimeoutRef.current = setTimeout(() => {
      fetchState(false);
    }, 600);
  }, [fetchState]);

  useEffect(() => {
    fetchState(true);

    let isUnmounted = false;
    let supabaseChannel: RealtimeChannel | null = null;
    let eventSource: EventSource | null = null;

    // 1. Set up Supabase Realtime Broadcast Connection (without noisy wildcard postgres_changes)
    fetch("/api/supabase-config")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load config");
        return res.json();
      })
      .then((config) => {
        if (isUnmounted) return;
        const { supabaseUrl, supabaseKey } = config;
        if (!supabaseUrl || !supabaseKey) return;

        try {
          const clientSupabase = createClient(supabaseUrl, supabaseKey);
          supabaseChannel = clientSupabase
            .channel("app-updates")
            .on("broadcast", { event: "state_changed" }, () => {
              triggerRealtimeStateFetch();
            })
            .subscribe();
        } catch (err) {
          console.error("[Supabase Realtime] Initialization error:", err);
        }
      })
      .catch((err) => {
        console.warn("[Supabase Realtime] Failed to configure:", err);
      });

    // 2. Fallback EventSource SSE Connection
    try {
      eventSource = new EventSource("/api/realtime-stream");
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "state_changed") {
            triggerRealtimeStateFetch();
          }
        } catch (err) {
          console.error("[SSE Fallback] Message parse failed:", err);
        }
      };
    } catch (err) {
      console.error("[SSE Fallback] Setup failed:", err);
    }

    return () => {
      isUnmounted = true;
      if (realtimeTimeoutRef.current) {
        clearTimeout(realtimeTimeoutRef.current);
      }
      if (supabaseChannel) {
        try {
          supabaseChannel.unsubscribe();
        } catch (e) {
          console.error("Unsubscribe error:", e);
        }
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchState, triggerRealtimeStateFetch]);

  // Helper to run an authenticated mutation with loading overlay + state refresh
  const runAction = async <T = Record<string, unknown>>(
    url: string,
    body: Record<string, unknown>,
    loadingText: string,
    defaultError: string
  ): Promise<T> => {
    return withLoading(async () => {
      const data = await apiPost<T>(url, body, defaultError);
      await fetchState(true);
      return data;
    }, loadingText);
  };

  // Auth Actions
  const handleLogin = async (studentId: string, passwordStr: string) => {
    const data = await apiPost<{ user: User }>(
      "/api/auth/login",
      { studentId, password: passwordStr },
      "รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง"
    );
    setCurrentUser(data.user);
    localStorage.setItem("currentUser", JSON.stringify(data.user));
    setActiveTab("dashboard");
    return data.user;
  };

  const handleDirectLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem("currentUser", JSON.stringify(user));
    setActiveTab("dashboard");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("currentUser");
    setActiveTab("dashboard");
  };

  // System & Billing Actions
  const handleUpdateSettings = async (
    fundName: string,
    monthlyFee: number,
    promptpayNumber: string,
    promptpayName: string,
    promptpayQrUrl?: string,
    bankName?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/settings",
      { fundName, monthlyFee, promptpayNumber, promptpayName, promptpayQrUrl, bankName, userId: currentUser.id },
      "กำลังบันทึกการตั้งค่า...",
      "Settings update failed"
    );
  };

  const handleCreateMonthlyBills = async (month: number, year: number, dueDate: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/bills/create",
      { month, year, dueDate, userId: currentUser.id },
      "กำลังสร้างรอบบิลใหม่...",
      "Billing trigger failed"
    );
  };

  const handleDeleteMonthlyBills = async (month: number, year: number) => {
    if (!currentUser) return;
    return runAction(
      "/api/bills/delete-cycle",
      { month, year, userId: currentUser.id },
      "กำลังลบรอบบิล...",
      "ลบรอบบิลล้มเหลว"
    );
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/transactions/delete",
      { transactionId, userId: currentUser.id },
      "กำลังลบรายการ...",
      "ลบรายการล้มเหลว"
    );
  };

  const handleResetSystemData = async (keepUsers: boolean, keepSettings: boolean) => {
    if (!currentUser) return;
    return runAction(
      "/api/system/reset",
      { userId: currentUser.id, keepUsers, keepSettings },
      "กำลังรีเซ็ตระบบ...",
      "รีเซ็ตระบบล้มเหลว"
    );
  };

  // Payment Actions
  const handleSubmitSlip = async (
    billId: string,
    amount: number,
    slipUrl: string,
    note: string,
    targetUserId?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/payments/submit",
      { billId, userId: targetUserId || currentUser.id, amount, slipUrl, note },
      "กำลังส่งหลักฐานการชำระเงิน...",
      "เกิดข้อผิดพลาดในการส่งข้อมูลสลิป"
    );
  };

  const handleCancelSlip = async (billId: string, targetUserId?: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/payments/cancel",
      { billId, userId: targetUserId || currentUser.id },
      "กำลังยกเลิกคำขอชำระเงิน...",
      "ยกเลิกคำขอชำระเงินล้มเหลว"
    );
  };

  const handleApprovePayment = async (paymentId: string, treasurerId: string, note?: string) => {
    return runAction(
      "/api/payments/approve",
      { paymentId, treasurerId, note },
      "กำลังอนุมัติการชำระเงิน...",
      "Approve payment failed"
    );
  };

  const handleRejectPayment = async (paymentId: string, treasurerId: string, rejectReason: string) => {
    return runAction(
      "/api/payments/reject",
      { paymentId, treasurerId, rejectReason },
      "กำลังปฏิเสธการชำระเงิน...",
      "Reject payment failed"
    );
  };

  const handleRecordCashPayment = async (billId: string, userId: string, amount: number, note?: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/payments/record-cash",
      { billId, userId, amount, treasurerId: currentUser.id, note },
      "กำลังบันทึกการชำระเงินสด...",
      "Recording cash payment failed"
    );
  };

  const handleUploadSlipAdmin = async (
    billId: string,
    userId: string,
    base64Image: string,
    note?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/payments/upload-slip-admin",
      { billId, userId, base64Image, treasurerId: currentUser.id, note },
      "กำลังอัปโหลดรูปภาพสลิปขึ้น Google Drive...",
      "Uploading slip failed"
    );
  };

  // Market Actions
  const handleCreateMarketWeek = async (
    weekDate: string,
    note: string,
    teamName?: string,
    leaderId?: string,
    memberIds?: string[]
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/market/week/create",
      { weekDate, note, teamName, leaderId, memberIds, userId: currentUser.id },
      "กำลังสร้างสัปดาห์ตลาดใหม่...",
      "Market week creation failed"
    );
  };

  const handleUpdateWeekTeam = async (
    marketWeekId: string,
    teamName?: string,
    leaderId?: string,
    memberIds?: string[],
    note?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/market/week/update-team",
      { marketWeekId, teamName, leaderId, memberIds, note, userId: currentUser.id },
      "กำลังอัปเดตทีมตลาด...",
      "Update market week team failed"
    );
  };

  const handleAddItemToMarket = async (
    marketWeekId: string,
    itemName: string,
    type: "cost" | "revenue",
    amount: number,
    quantity: number,
    note?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/market/item/add",
      { marketWeekId, itemName, type, amount, quantity, note, userId: currentUser.id },
      "กำลังเพิ่มรายการ...",
      "Item add failed"
    );
  };

  const handleDeleteItemFromMarket = async (itemId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/market/item/delete",
      { itemId, userId: currentUser.id },
      "กำลังลบรายการ...",
      "Item delete failed"
    );
  };

  const handleCompleteMarketWeek = async (marketWeekId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/market/week/complete",
      { marketWeekId, userId: currentUser.id },
      "กำลังสรุปตลาดประจำสัปดาห์...",
      "Market complete failed"
    );
  };

  const handleApproveMarketWeek = async (marketWeekId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/market/week/approve",
      { marketWeekId, treasurerId: currentUser.id },
      "กำลังอนุมัติตลาด...",
      "Market approve failed"
    );
  };

  const handleDeleteMarketWeek = async (marketWeekId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/market/week/delete",
      { marketWeekId, userId: currentUser.id },
      "กำลังลบสัปดาห์ตลาด...",
      "Delete market week failed"
    );
  };

  const handleProposeMarketAdvance = async (marketWeekId: string, amount: number, reason: string) => {
    return runAction(
      "/api/market/week/advance/propose",
      { marketWeekId, amount, reason, requesterId: currentUser?.id },
      "กำลังส่งคำขอเบิกทุนล่วงหน้า...",
      "Failed to propose market advance capital"
    );
  };

  const handleApproveMarketAdvance = async (
    marketWeekId: string,
    action: "approve" | "reject",
    rejectReason?: string,
    receiptUrl?: string
  ) => {
    return runAction(
      "/api/market/week/advance/approve",
      { marketWeekId, treasurerId: currentUser?.id, action, rejectReason, receiptUrl },
      "กำลังพิจารณาคำขอเบิกทุน...",
      "Failed to review market advance capital"
    );
  };

  const handleProposeMarketAdditionalAdvance = async (
    marketWeekId: string,
    amount: number,
    reason: string
  ) => {
    return runAction(
      "/api/market/week/advance-additional/propose",
      { marketWeekId, amount, reason, requesterId: currentUser?.id },
      "กำลังส่งคำขอเบิกทุนเพิ่มเติม...",
      "Failed to propose additional market advance capital"
    );
  };

  const handleApproveMarketAdditionalAdvance = async (
    marketWeekId: string,
    action: "approve" | "reject",
    rejectReason?: string,
    receiptUrl?: string
  ) => {
    return runAction(
      "/api/market/week/advance-additional/approve",
      { marketWeekId, treasurerId: currentUser?.id, action, rejectReason, receiptUrl },
      "กำลังพิจารณาคำขอเบิกทุนเพิ่มเติม...",
      "Failed to review additional market advance capital"
    );
  };

  // Activity Actions
  const handleProposeActivity = async (
    title: string,
    description: string,
    eventDate: string,
    location: string,
    budgetEstimated: number,
    documentUrls?: string[]
  ): Promise<{ activity: Activity }> => {
    if (!currentUser) throw new Error("Not authenticated");
    return runAction<{ activity: Activity }>(
      "/api/activities/propose",
      {
        title,
        description,
        eventDate,
        location,
        budgetEstimated,
        documentUrls,
        userId: currentUser.id,
      },
      "กำลังส่งคำเสนอโครงการ...",
      "Propose activity failed"
    );
  };

  const handleApproveActivity = async (
    activityId: string,
    action: "approve" | "reject",
    rejectReason?: string,
    budgetApproved?: number
  ): Promise<{ activity: Activity }> => {
    if (!currentUser) throw new Error("Not authenticated");
    return runAction<{ activity: Activity }>(
      "/api/activities/approve",
      { activityId, treasurerId: currentUser.id, action, rejectReason, budgetApproved },
      "กำลังพิจารณาโครงการ...",
      "Activity action failed"
    );
  };

  const handleProposeBudgetExpansion = async (
    activityId: string,
    originalRequestId: string,
    amount: number,
    reason: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/activities/budget-expansion/propose",
      { activityId, originalRequestId, amount, reason, userId: currentUser.id },
      "กำลังส่งคำขอขยายงบ...",
      "Failed to propose budget expansion"
    );
  };

  const handleApproveBudgetExpansion = async (
    requestId: string,
    action: "approve" | "reject",
    rejectReason?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/activities/budget-expansion/approve",
      { requestId, treasurerId: currentUser.id, action, rejectReason },
      "กำลังพิจารณาการขยายงบ...",
      "Failed to approve budget expansion"
    );
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/activities/delete",
      { activityId, userId: currentUser.id },
      "กำลังลบโครงการ...",
      "Delete activity failed"
    );
  };

  const handleUpdateActivity = async (
    activityId: string,
    updatedData: Record<string, unknown>
  ): Promise<{ activity: Activity }> => {
    if (!currentUser) throw new Error("Not authenticated");
    return runAction<{ activity: Activity }>(
      "/api/activities/update",
      { activityId, userId: currentUser.id, ...updatedData },
      "กำลังอัปเดตโครงการ...",
      "Update activity failed"
    );
  };

  const handleProposeBudget = async (
    activityId: string,
    title: string,
    amount: number,
    reason: string,
    details?: string,
    documentUrls?: string[]
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/activities/budget/request",
      { activityId, title, amount, reason, details, documentUrls, userId: currentUser.id },
      "กำลังส่งคำขอเบิกงบ...",
      "Budget proposal failed"
    );
  };

  const handleApproveBudget = async (
    requestId: string,
    action: "approve" | "reject",
    rejectReason?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/activities/budget/approve",
      { requestId, treasurerId: currentUser.id, action, rejectReason },
      "กำลังพิจารณาคำขอเบิกงบ...",
      "Budget approval action failed"
    );
  };

  const handleProposeSettlement = async (
    activityId: string,
    actualExpense: number,
    refundAmount: number,
    refundSlipUrl?: string,
    expenseReceipts?: string[]
  ): Promise<{ activity: Activity }> => {
    if (!currentUser) throw new Error("Not authenticated");
    return runAction<{ activity: Activity }>(
      "/api/activities/settle/propose",
      { activityId, actualExpense, refundAmount, refundSlipUrl, expenseReceipts, userId: currentUser.id },
      "กำลังส่งคำขอสรุปโครงการ...",
      "Propose settlement failed"
    );
  };

  const handleApproveSettlement = async (
    activityId: string,
    action: "approve" | "reject",
    rejectReason?: string
  ): Promise<{ activity: Activity }> => {
    if (!currentUser) throw new Error("Not authenticated");
    return runAction<{ activity: Activity }>(
      "/api/activities/settle/approve",
      { activityId, treasurerId: currentUser.id, action, rejectReason },
      "กำลังพิจารณาการสรุป...",
      "Approve settlement failed"
    );
  };

  const handleProposeExternalIncome = async (
    activityId: string,
    amount: number,
    source: string,
    slipUrl?: string
  ): Promise<{ activity: Activity }> => {
    if (!currentUser) throw new Error("Not authenticated");
    return runAction<{ activity: Activity }>(
      "/api/activities/external-income/propose",
      { activityId, amount, source, slipUrl, userId: currentUser.id },
      "กำลังบันทึกเงินสนับสนุน...",
      "Failed to propose external income"
    );
  };

  const handleApproveExternalIncome = async (
    activityId: string,
    incomeId: string,
    action: "approve" | "reject",
    rejectReason?: string
  ): Promise<{ activity: Activity }> => {
    if (!currentUser) throw new Error("Not authenticated");
    return runAction<{ activity: Activity }>(
      "/api/activities/external-income/approve",
      { activityId, incomeId, treasurerId: currentUser.id, action, rejectReason },
      "กำลังพิจารณาเงินสนับสนุน...",
      "Failed to respond to external income"
    );
  };

  // Member & Profile Actions
  const handleUpdateMember = async (
    targetUserId: string,
    role?: string,
    position?: string,
    isActive?: boolean,
    fullName?: string,
    nickname?: string,
    email?: string,
    phone?: string,
    classroom?: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/members/update",
      {
        targetUserId,
        role,
        position,
        isActive,
        fullName,
        nickname,
        email,
        phone,
        classroom,
        userId: currentUser.id,
      },
      "กำลังอัปเดตข้อมูลสมาชิก...",
      "Member update failed"
    );
  };

  const handleChangePassword = async (oldPasswordStr: string, newPasswordStr: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/auth/change-password",
      { userId: currentUser.id, oldPassword: oldPasswordStr, newPassword: newPasswordStr },
      "กำลังเปลี่ยนรหัสผ่าน...",
      "ไม่สามารถเปลี่ยนรหัสผ่านได้"
    );
  };

  const handleResolveResetPassword = async (resetId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/treasurer/resolve-reset-password",
      { resetId, treasurerId: currentUser.id },
      "กำลังรีเซ็ตรหัสผ่าน...",
      "ไม่สามารถรีเซ็ตรหัสผ่านได้"
    );
  };

  const handleAddMember = async (
    studentId: string,
    fullName: string,
    nickname: string,
    email: string,
    phone: string,
    role: string,
    position: string,
    classroom: string
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/members/add",
      { studentId, fullName, nickname, email, phone, role, position, classroom, userId: currentUser.id },
      "กำลังเพิ่มสมาชิกใหม่...",
      "เกิดข้อผิดพลาดในการเพิ่มสมาชิก"
    );
  };

  const handleDeleteMember = async (targetUserId: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/members/delete",
      { targetUserId, userId: currentUser.id },
      "กำลังลบสมาชิก...",
      "เกิดข้อผิดพลาดในการลบสมาชิก"
    );
  };

  // Petitions & Notifications Actions
  const handleSubmitPetition = async (
    title: string,
    category: string,
    content: string,
    isAnonymous: boolean
  ) => {
    if (!currentUser) return;
    return runAction(
      "/api/petitions/submit",
      { title, category, content, isAnonymous, userId: currentUser.id },
      "กำลังส่งคำร้อง...",
      "ยื่นคำร้องไม่สำเร็จ"
    );
  };

  const handleRespondPetition = async (petitionId: string, status: string, response: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/petitions/respond",
      { petitionId, status, response, adminId: currentUser.id },
      "กำลังบันทึกคำชี้แจง...",
      "บันทึกคำชี้แจงไม่สำเร็จ"
    );
  };

  const handleSendReminder = async (targetUserId: string, message: string, title?: string) => {
    if (!currentUser) return;
    return runAction(
      "/api/notifications/remind",
      { userId: targetUserId, senderId: currentUser.id, message, title },
      "กำลังส่งแจ้งเตือน...",
      "ส่งแจ้งเตือนไม่สำเร็จ"
    );
  };

  const handleMarkNotificationsRead = async (notId?: string) => {
    if (!currentUser) return;
    await apiPost(
      "/api/notifications/read",
      { notId, userId: currentUser.id },
      "ไม่สามารถอัปเดตสถานะการแจ้งเตือนได้"
    );
    await fetchState(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <h2 className="text-sm font-bold text-slate-700 font-sans">
            กำลังเปิดการใช้งานระบบเงินเก็บTns รุ่น06...
          </h2>
          <p className="text-xs text-slate-400">
            นำเข้าข้อมูลสรุปทางการเงิน ทะเบียนรายชื่อ 72 สมาชิก และวิเคราะห์ AI
          </p>
        </div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-rose-100 rounded-3xl p-6 max-w-sm text-center shadow-xl space-y-4 text-xs font-sans">
          <h2 className="text-base font-bold text-rose-600">เกิดข้อผิดพลาดในการโหลดระบบ</h2>
          <p className="text-slate-500 leading-relaxed">
            {error || "ไม่สามารถติดต่อเซิร์ฟเวอร์หลักของระบบเงินเก็บTns รุ่น06 ได้"}
          </p>
          <button
            onClick={() => fetchState(true)}
            className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl"
          >
            ลองเชื่อมต่อใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  // Not logged in — show Public Preview (default) or Login Form
  if (!currentUser) {
    if (showLoginForm) {
      return (
        <LoginView
          users={state.users || []}
          onLogin={handleLogin}
          onDirectLogin={handleDirectLogin}
          onBackToPreview={() => setShowLoginForm(false)}
        />
      );
    }
    return <PublicPreview onGoToLogin={() => setShowLoginForm(true)} />;
  }

  return (
    <>
      <NavigationShell
        currentUser={currentUser}
        activeTab={activeTab === "ai_chat" ? "reports" : activeTab}
        setActiveTab={handleSetTab}
        settings={state.settings}
        monthlyBills={state.monthlyBills}
        petitions={state.petitions || []}
        onLogout={handleLogout}
        onOpenQrModal={() => setShowQrModal(true)}
      >
        {activeTab === "dashboard" && (
          <Dashboard
            currentUser={currentUser}
            users={state.users}
            transactions={state.transactions}
            announcements={state.announcements}
            monthlyBills={state.monthlyBills}
            settings={state.settings}
            setTab={handleSetTab}
            notifications={state.notifications}
            onMarkNotificationsRead={handleMarkNotificationsRead}
            onOpenQrModal={() => setShowQrModal(true)}
          />
        )}

        {activeTab === "monthly" && (
          <MonthlyBills
            currentUser={currentUser}
            users={state.users}
            monthlyBills={state.monthlyBills}
            payments={state.payments}
            settings={state.settings}
            onSubmitSlip={handleSubmitSlip}
            onCancelSlip={handleCancelSlip}
            onRecordCashPayment={handleRecordCashPayment}
            onDeleteMonthlyBills={handleDeleteMonthlyBills}
          />
        )}

        {activeTab === "market" && (
          <WednesdayMarket
            currentUser={currentUser}
            users={state.users}
            marketWeeks={state.marketWeeks}
            marketItems={state.marketItems}
            onCreateWeek={handleCreateMarketWeek}
            onAddItem={handleAddItemToMarket}
            onDeleteItem={handleDeleteItemFromMarket}
            onCompleteWeek={handleCompleteMarketWeek}
            onApproveWeek={handleApproveMarketWeek}
            onUpdateWeekTeam={handleUpdateWeekTeam}
            onDeleteWeek={handleDeleteMarketWeek}
            onProposeMarketAdvance={handleProposeMarketAdvance}
            onApproveMarketAdvance={handleApproveMarketAdvance}
            onProposeMarketAdditionalAdvance={handleProposeMarketAdditionalAdvance}
            onApproveMarketAdditionalAdvance={handleApproveMarketAdditionalAdvance}
          />
        )}

        {activeTab === "activities" && (
          <Activities
            currentUser={currentUser}
            users={state.users}
            activities={state.activities}
            budgetRequests={state.budgetRequests}
            settings={state.settings}
            onProposeActivity={handleProposeActivity}
            onApproveActivity={handleApproveActivity}
            onProposeBudget={handleProposeBudget}
            onApproveBudget={handleApproveBudget}
            onDeleteActivity={handleDeleteActivity}
            onProposeSettlement={handleProposeSettlement}
            onApproveSettlement={handleApproveSettlement}
            onProposeBudgetExpansion={handleProposeBudgetExpansion}
            onApproveBudgetExpansion={handleApproveBudgetExpansion}
            onProposeExternalIncome={handleProposeExternalIncome}
            onApproveExternalIncome={handleApproveExternalIncome}
            onUpdateActivity={handleUpdateActivity}
          />
        )}

        {(activeTab === "reports" || activeTab === "ai_chat") && (
          <FinancialReports
            transactions={state.transactions}
            users={state.users}
            setTab={handleSetTab}
            monthlyBills={state.monthlyBills}
            settings={state.settings}
          />
        )}

        {activeTab === "members" && (
          <MemberList
            currentUser={currentUser}
            users={state.users}
            monthlyBills={state.monthlyBills}
            onUpdateMember={handleUpdateMember}
            onAddMember={handleAddMember}
            onDeleteMember={handleDeleteMember}
          />
        )}

        {activeTab === "petitions" && (
          <PetitionsPanel
            currentUser={currentUser}
            users={state.users}
            petitions={state.petitions || []}
            onSubmitPetition={handleSubmitPetition}
            onRespondPetition={handleRespondPetition}
          />
        )}

        {activeTab === "profile" && (
          <ProfilePanel
            currentUser={currentUser}
            monthlyBills={state.monthlyBills}
            onUpdateMember={handleUpdateMember}
            onChangePassword={handleChangePassword}
          />
        )}

        {activeTab === "admin" && currentUser.role === "treasurer" && (
          <AdminPanel
            currentUser={currentUser}
            users={state.users}
            payments={state.payments}
            monthlyBills={state.monthlyBills}
            transactions={state.transactions}
            settings={state.settings}
            passwordResets={state.passwordResets || []}
            onApprovePayment={handleApprovePayment}
            onRejectPayment={handleRejectPayment}
            onRecordCashPayment={handleRecordCashPayment}
            onUploadSlipAdmin={handleUploadSlipAdmin}
            onCreateMonthlyBills={handleCreateMonthlyBills}
            onDeleteMonthlyBills={handleDeleteMonthlyBills}
            onDeleteTransaction={handleDeleteTransaction}
            onUpdateSettings={handleUpdateSettings}
            onSendReminder={handleSendReminder}
            onResolveResetPassword={handleResolveResetPassword}
            onResetSystemData={handleResetSystemData}
          />
        )}
      </NavigationShell>

      <PromptPayQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        settings={state.settings}
        onGoToMonthly={() => handleSetTab("monthly")}
      />

      <GeminiAssistant
        currentUser={currentUser}
        externalOpenTrigger={aiOpenTrigger}
      />
    </>
  );
}
