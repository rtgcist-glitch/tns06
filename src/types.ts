/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  TREASURER = "treasurer",
  COMMITTEE = "committee",
  LEADER = "leader",
  MEMBER = "member"
}

export interface User {
  id: string;
  studentId: string;
  fullName: string;
  nickname: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  position?: string;
  phone?: string;
  password?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  classroom?: string;
}

export interface MonthlyBill {
  id: string;
  userId: string;
  month: number; // 1-12
  year: number;  // พ.ศ. (เช่น 2569)
  amount: number;
  status: "paid" | "pending_review" | "pending";
  dueDate: string;
  paidAt?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  userId: string;
  billId: string;
  amount: number;
  slipUrl?: string;
  status: "approved" | "rejected" | "pending_review";
  reviewedBy?: string;
  reviewedAt?: string;
  rejectReason?: string;
  receiptNumber?: string;
  note?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: "income" | "expense";
  category: "monthly_fee" | "market_profit" | "activity_expense" | "other_income" | "other_expense";
  amount: number;
  description: string;
  referenceId?: string; // ID of payment, market, or budget request
  referenceType?: "payment" | "market" | "budget_request";
  receiptUrl?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  month: number;
  year: number;
  isClosed: boolean;
  createdAt: string;
}

export interface MarketWeek {
  id: string;
  weekDate: string; // YYYY-MM-DD
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  status: "planned" | "active" | "completed" | "approved";
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  teamName?: string;
  leaderId?: string;
  memberIds?: string[];
  advanceRequested?: number;
  advanceReason?: string;
  advanceStatus?: "none" | "pending" | "approved" | "rejected";
  advanceApprovedBy?: string;
  advanceApprovedAt?: string;
  advanceRejectReason?: string;
  advanceReceiptUrl?: string;
  additionalAdvanceRequested?: number;
  additionalAdvanceReason?: string;
  additionalAdvanceStatus?: "none" | "pending" | "approved" | "rejected";
  additionalAdvanceApprovedBy?: string;
  additionalAdvanceApprovedAt?: string;
  additionalAdvanceRejectReason?: string;
  additionalAdvanceReceiptUrl?: string;
}

export interface MarketItem {
  id: string;
  marketWeekId: string;
  itemName: string;
  type: "cost" | "revenue";
  amount: number;
  quantity: number;
  receiptUrl?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface MarketTeam {
  id: string;
  marketWeekId: string;
  userId: string;
  role: "leader" | "seller" | "buyer";
  createdAt: string;
}

export interface Activity {
  id: string;
  title: string;
  description?: string;
  proposedBy: string;
  status: "proposed" | "approved" | "in_progress" | "pending_settlement" | "completed" | "rejected";
  eventDate?: string;
  location?: string;
  budgetEstimated?: number;
  budgetApproved?: number;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  documentUrls?: string[];
  actualExpense?: number;
  refundAmount?: number;
  refundSlipUrl?: string;
  expenseReceipts?: string[];
  settledBy?: string;
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
  budgetExpansionRequested?: number;
  budgetExpansionReason?: string;
  budgetExpansionStatus?: "none" | "pending" | "approved" | "rejected";
  budgetExpansionApprovedBy?: string;
  budgetExpansionApprovedAt?: string;
  budgetExpansionRejectReason?: string;
  externalIncomes?: ExternalIncome[];
}

export interface ExternalIncome {
  id: string;
  activityId: string;
  amount: number;
  source: string;
  slipUrl?: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  createdAt: string;
}

export interface BudgetRequest {
  id: string;
  activityId?: string;
  title: string;
  amount: number;
  reason: string;
  details?: string;
  documentUrls?: string[];
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  isExpansion?: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: "urgent" | "normal";
  isPinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "payment" | "bill" | "market" | "activity" | "announcement" | "system";
  referenceId?: string;
  referenceType?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Log {
  id: string;
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: unknown;
  createdAt: string;
}

// Global configurations
export interface SystemSettings {
  fundName: string;
  monthlyFee: number;
  promptpayNumber: string;
  promptpayName: string;
  promptpayQrUrl?: string;
  bankName?: string;
}

export interface BillStatusInfo {
  label: string;
  badgeClass: string;
  subText: string;
  canPay: boolean;
  statusType: "not_due" | "grace_period" | "overdue" | "paid" | "pending_review";
}

export function getDetailedBillStatus(bill: MonthlyBill, payments: Payment[]): BillStatusInfo {
  if (bill.status === "paid") {
    return {
      label: "ชำระเงินสำเร็จแล้ว",
      badgeClass: "text-emerald-600 bg-emerald-50 border border-emerald-200",
      subText: "ได้รับการตรวจสอบและเปิดใบเสร็จเรียบร้อยแล้วค่ะ",
      canPay: false,
      statusType: "paid"
    };
  }

  const billPayments = payments.filter(p => p.billId === bill.id);
  const totalApproved = billPayments
    .filter(p => p.status === "approved")
    .reduce((sum, p) => sum + p.amount, 0);

  const hasPendingReview = billPayments.some(p => p.status === "pending_review");

  if (totalApproved >= bill.amount) {
    return {
      label: "ชำระเงินสำเร็จแล้ว",
      badgeClass: "text-emerald-600 bg-emerald-50 border border-emerald-200",
      subText: "ได้รับการตรวจสอบและเปิดใบเสร็จเรียบร้อยแล้วค่ะ",
      canPay: false,
      statusType: "paid"
    };
  }

  if (hasPendingReview) {
    return {
      label: `รอตรวจสอบสลิป (ชำระแล้ว ฿${totalApproved})`,
      badgeClass: "text-amber-600 bg-amber-50 border border-amber-200 animate-pulse",
      subText: "รอเหรัญญิกตรวจสอบสลิปหลักฐานการชำระเงินเพิ่มเติมค่ะ",
      canPay: false,
      statusType: "pending_review"
    };
  }

  // Calculate days difference relative to current date and due date
  const currentDate = new Date();
  const dueDate = new Date(bill.dueDate);
  
  // Set times to midnight to calculate accurate day differences
  currentDate.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  
  const diffTime = currentDate.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    // Before or on due date
    return {
      label: totalApproved > 0 ? `ชำระแล้วบางส่วน (฿${totalApproved}/${bill.amount})` : "รอการชำระเงิน",
      badgeClass: "text-blue-600 bg-blue-50 border border-blue-200",
      subText: `กรุณาชำระเงินภายในวันที่ ${new Date(bill.dueDate).toLocaleDateString("th-TH")}`,
      canPay: true,
      statusType: "not_due"
    };
  } else if (diffDays <= 10) {
    // Within 10 days grace period after due date
    const daysLeft = 10 - diffDays;
    return {
      label: "ค้างชำระแต่ยังชำระได้",
      badgeClass: "text-amber-700 bg-amber-50 border border-amber-300 font-bold animate-pulse",
      subText: `อยู่ในช่วงผ่อนผัน 10 วันหลังกำหนดส่ง (เหลือเวลาอีก ${daysLeft} วัน) ชำระเท่าไหร่ก็ได้ค่ะ`,
      canPay: true,
      statusType: "grace_period"
    };
  } else {
    // More than 10 days past due date and unpaid
    return {
      label: "ค้างชำระ (เลยกำหนดส่งเกิน 10 วัน) ❌",
      badgeClass: "text-rose-600 bg-rose-50 border border-rose-200 font-extrabold",
      subText: "เกินกำหนดช่วงเวลาผ่อนผัน 10 วันแล้วค่ะ รบกวนชำระยอดค้างสะสมโดยด่วนที่สุดนะคะ",
      canPay: true,
      statusType: "overdue"
    };
  }
}

export interface Petition {
  id: string;
  title: string;
  category: string;
  content: string;
  status: "pending" | "resolved" | "rejected";
  isAnonymous: boolean;
  submittedBy: string;
  response?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface PasswordReset {
  id: string;
  studentId: string;
  fullName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  resolvedAt?: string;
  classroom?: string;
}

export interface AppState {
  users: User[];
  settings: SystemSettings;
  monthlyBills: MonthlyBill[];
  payments: Payment[];
  transactions: Transaction[];
  marketWeeks: MarketWeek[];
  marketItems: MarketItem[];
  marketTeams: MarketTeam[];
  activities: Activity[];
  budgetRequests: BudgetRequest[];
  announcements: Announcement[];
  notifications: Notification[];
  logs: Log[];
  petitions: Petition[];
  passwordResets: PasswordReset[];
}

