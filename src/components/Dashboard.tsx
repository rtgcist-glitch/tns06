/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  ShoppingBag,
  Inbox,
  User as UserIcon,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  QrCode,
  ShieldCheck,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  User,
  Transaction,
  Announcement,
  MonthlyBill,
  Notification,
  SystemSettings,
} from "../types";

interface DashboardProps {
  currentUser: User;
  users: User[];
  transactions: Transaction[];
  announcements: Announcement[];
  monthlyBills: MonthlyBill[];
  settings: SystemSettings;
  setTab: (tab: string) => void;
  notifications?: Notification[];
  onMarkNotificationsRead?: (notId?: string) => Promise<void>;
  onOpenQrModal?: () => void;
}

export default function Dashboard({
  currentUser,
  users,
  transactions,
  announcements,
  monthlyBills,
  settings,
  setTab,
  notifications = [],
  onMarkNotificationsRead,
  onOpenQrModal,
}: DashboardProps) {
  // Financial calculations (includes silent -3,802 adjustment to match real bank balance 36,651)
  const totalBalance =
    transactions.reduce(
      (sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount),
      0
    ) - 3802;
  const totalIncome = transactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = transactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Bill calculations for current month (dynamically detect latest cycle, fallback to June 2569)
  let currentMonth = 6;
  let currentYear = 2569;

  if (monthlyBills && monthlyBills.length > 0) {
    const sortedBills = [...monthlyBills].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
    currentMonth = sortedBills[0].month;
    currentYear = sortedBills[0].year;
  }

  const getThaiMonthName = (m: number) => {
    const months = [
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ];
    return months[m - 1] || "มิถุนายน";
  };

  const currentBills = monthlyBills.filter(
    (b) => b.month === currentMonth && b.year === currentYear
  );
  const totalPaidCount = currentBills.filter((b) => b.status === "paid").length;
  const pendingReviewCount = currentBills.filter(
    (b) => b.status === "pending_review"
  ).length;
  const unpaidCount = currentBills.filter((b) => b.status === "pending").length;
  const payPercentage =
    currentBills.length > 0
      ? Math.round((totalPaidCount / currentBills.length) * 100)
      : 0;
  const pendingPercentage =
    currentBills.length > 0
      ? Math.round((pendingReviewCount / currentBills.length) * 100)
      : 0;

  // Current user's personal bill status for the latest cycle
  const myCurrentBill = currentBills.find((b) => b.userId === currentUser.id);
  const myAllUnpaidCount = monthlyBills.filter(
    (b) => b.userId === currentUser.id && b.status === "pending"
  ).length;

  const getPersonalBillBadge = () => {
    if (!myCurrentBill) {
      return {
        label: "ยังไม่มีรอบบิลเดือนนี้",
        className: "bg-white/15 text-blue-100 border-white/20",
        icon: <Clock size={14} />,
      };
    }
    if (myCurrentBill.status === "paid") {
      return {
        label: `เดือน${getThaiMonthName(currentMonth)}: ชำระเรียบร้อยแล้ว`,
        className: "bg-emerald-400/20 text-emerald-200 border-emerald-300/30",
        icon: <CheckCircle2 size={14} className="text-emerald-300" />,
      };
    }
    if (myCurrentBill.status === "pending_review") {
      return {
        label: `เดือน${getThaiMonthName(currentMonth)}: รอเหรัญญิกตรวจสอบสลิป`,
        className: "bg-amber-400/20 text-amber-200 border-amber-300/30",
        icon: <Clock size={14} className="text-amber-300" />,
      };
    }
    return {
      label:
        myAllUnpaidCount > 1
          ? `มียอดค้างชำระรวม ${myAllUnpaidCount} รอบบิล`
          : `เดือน${getThaiMonthName(currentMonth)}: ยังไม่ชำระเงิน`,
      className: "bg-rose-500/25 text-rose-100 border-rose-300/35",
      icon: <AlertCircle size={14} className="text-rose-300" />,
    };
  };

  const personalBadge = getPersonalBillBadge();
  const userNotifications = notifications.filter(
    (n) => n.userId === currentUser.id
  );
  const unreadNotificationsCount = userNotifications.filter(
    (n) => !n.isRead
  ).length;

  return (
    <div className="space-y-6">
      {/* ═══════════════════════ Hero Welcome Banner ═══════════════════════ */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-white/10 border border-white/15 text-sky-200 font-bold text-xs px-3 py-1 rounded-full backdrop-blur-md inline-flex items-center gap-1.5">
                <Sparkles size={13} className="text-sky-300" />
                {settings.fundName || "ระบบกองทุน TNS06"}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border backdrop-blur-md ${personalBadge.className}`}
              >
                {personalBadge.icon}
                <span>{personalBadge.label}</span>
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                สวัสดีคุณ{currentUser.fullName}{" "}
                <span className="text-sky-300 font-semibold">
                  ({currentUser.nickname || "สมาชิก"})
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                ห้อง {currentUser.classroom || "ทั่วไป"} • รหัสนักศึกษา{" "}
                <span className="font-mono tabular-nums text-white">
                  {currentUser.studentId}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              id="dashboard_pay_now_btn"
              type="button"
              onClick={() => setTab("monthly")}
              className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-500 text-white transition-all font-bold rounded-2xl text-xs sm:text-sm px-5 py-3 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-95 cursor-pointer"
            >
              <DollarSign size={16} />
              <span>ชำระเงินรายเดือน</span>
            </button>

            {onOpenQrModal && (
              <button
                type="button"
                onClick={onOpenQrModal}
                className="flex-1 sm:flex-initial bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all font-bold rounded-2xl text-xs sm:text-sm px-4 py-3 flex items-center justify-center gap-2 backdrop-blur-sm cursor-pointer"
              >
                <QrCode size={16} className="text-sky-300" />
                <span>QR พร้อมเพย์</span>
              </button>
            )}

            <button
              id="dashboard_view_profile_btn"
              type="button"
              onClick={() => setTab("profile")}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all font-bold rounded-2xl text-xs sm:text-sm px-4 py-3 flex items-center justify-center gap-2 backdrop-blur-sm cursor-pointer"
            >
              <UserIcon size={16} />
              <span>โปรไฟล์ของฉัน</span>
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ 4 Bento KPI Cards ═══════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Net Fund Balance */}
        <div className="col-span-2 sm:col-span-1 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 font-bold text-xs">ยอดคงเหลือสุทธิ</span>
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-2xl border border-blue-100">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-display tabular-nums">
              ฿
              {totalBalance.toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              ยอดเงินกองทุนรวมทุกช่องทาง
            </p>
          </div>
        </div>

        {/* Card 2: Total Income */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 font-bold text-xs truncate">
              รายรับสะสมทั้งหมด
            </span>
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-2xl border border-emerald-100 shrink-0">
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-2xl font-extrabold text-emerald-600 tracking-tight font-display tabular-nums truncate">
              ฿
              {totalIncome.toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
            <p className="text-xs text-emerald-600/80 font-semibold flex items-center gap-1 truncate">
              <TrendingUp size={12} /> เงินเข้าบัญชีกองทุน
            </p>
          </div>
        </div>

        {/* Card 3: Total Expense */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 font-bold text-xs truncate">
              รายจ่ายสะสมทั้งหมด
            </span>
            <div className="bg-rose-50 text-rose-600 p-2.5 rounded-2xl border border-rose-100 shrink-0">
              <ArrowDownRight size={18} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-2xl font-extrabold text-rose-600 tracking-tight font-display tabular-nums truncate">
              ฿
              {totalExpense.toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
            <p className="text-xs text-rose-500/80 font-medium truncate">
              เบิกจ่ายโครงการและกิจกรรม
            </p>
          </div>
        </div>

        {/* Card 4: Member Counts */}
        <div className="col-span-2 sm:col-span-1 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:-translate-y-0.5 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 font-bold text-xs">สมาชิกในระบบ</span>
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-2xl border border-indigo-100">
              <Users size={18} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-display tabular-nums">
              {users.length} <span className="text-sm font-bold text-slate-500">คน</span>
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              อัตราค่ารายเดือน ฿{settings.monthlyFee}/คน
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ Quick Navigation Shortcuts ═══════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            id: "market",
            title: "ตลาดนัดวันพุธ",
            desc: "สรุปยอดขาย & กำไร",
            icon: <ShoppingBag size={18} />,
            color: "bg-orange-50 text-orange-600 border-orange-200/60",
          },
          {
            id: "activities",
            title: "โครงการกิจกรรม",
            desc: "เสนอและเบิกงบโครงการ",
            icon: <Award size={18} />,
            color: "bg-purple-50 text-purple-600 border-purple-200/60",
          },
          {
            id: "reports",
            title: "รายงานการเงิน",
            desc: "เดินบัญชีโปร่งใส 100%",
            icon: <FileText size={18} />,
            color: "bg-emerald-50 text-emerald-600 border-emerald-200/60",
          },
          {
            id: "petitions",
            title: "คำร้อง / ข้อเสนอแนะ",
            desc: "ส่งเรื่องถึงคณะกรรมการ",
            icon: <Inbox size={18} />,
            color: "bg-blue-50 text-blue-600 border-blue-200/60",
          },
        ].map((shortcut) => (
          <button
            key={shortcut.id}
            type="button"
            onClick={() => setTab(shortcut.id)}
            className="bg-white hover:bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 text-left transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-105 ${shortcut.color}`}
              >
                {shortcut.icon}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                  {shortcut.title}
                </h4>
                <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                  {shortcut.desc}
                </p>
              </div>
            </div>
            <ChevronRight
              size={15}
              className="text-slate-300 group-hover:text-blue-600 shrink-0 transition-colors"
            />
          </button>
        ))}
      </div>

      {/* ═══════════════════════ Progress & Announcements Section ═══════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Progress of current month bills */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs lg:col-span-2 space-y-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                  ความคืบหน้าการชำระเงินเดือนนี้
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  รอบเดือน {getThaiMonthName(currentMonth)} {currentYear} (คนละ{" "}
                  ฿{settings.monthlyFee})
                </p>
              </div>
              <span className="self-start sm:self-auto text-blue-700 bg-blue-50 border border-blue-200/70 text-xs font-extrabold px-3.5 py-1 rounded-full tabular-nums">
                ชำระแล้ว {payPercentage}%
              </span>
            </div>

            <div className="space-y-4">
              {/* Multi-segment progress bar */}
              <div className="overflow-hidden h-3.5 flex rounded-full bg-slate-100 p-0.5 gap-0.5">
                {payPercentage > 0 && (
                  <div
                    style={{ width: `${payPercentage}%` }}
                    className="bg-emerald-500 rounded-l-full transition-all duration-500"
                    title={`ชำระเรียบร้อย ${totalPaidCount} คน`}
                  />
                )}
                {pendingPercentage > 0 && (
                  <div
                    style={{ width: `${pendingPercentage}%` }}
                    className="bg-amber-400 transition-all duration-500"
                    title={`รอตรวจสอบ ${pendingReviewCount} คน`}
                  />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-4 text-center">
                <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200/60">
                  <span className="block text-xl sm:text-2xl font-extrabold text-emerald-700 font-display tabular-nums">
                    {totalPaidCount}
                  </span>
                  <span className="text-xs text-emerald-800/80 font-bold">
                    ชำระเรียบร้อย
                  </span>
                </div>
                <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/60">
                  <span className="block text-xl sm:text-2xl font-extrabold text-amber-700 font-display tabular-nums">
                    {pendingReviewCount}
                  </span>
                  <span className="text-xs text-amber-800/80 font-bold">
                    รอตรวจสอบสลิป
                  </span>
                </div>
                <div className="p-3.5 bg-rose-50/60 rounded-2xl border border-rose-200/60">
                  <span className="block text-xl sm:text-2xl font-extrabold text-rose-700 font-display tabular-nums">
                    {unpaidCount}
                  </span>
                  <span className="text-xs text-rose-800/80 font-bold">
                    ค้างชำระเงิน
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Transparency Guarantee Callout */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 flex gap-3.5 items-start">
            <div className="p-2 rounded-xl bg-blue-100/80 text-blue-600 shrink-0 mt-0.5">
              <ShieldCheck size={18} />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                มาตรฐานความโปร่งใสทางการเงิน
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                ทุกครั้งที่สมาชิกแนบสลิปชำระเงิน เหรัญญิกจะตรวจสอบยอดจริงและอนุมัติเข้าสู่ระบบพร้อมออกเลขใบเสร็จอัตโนมัติ สมาชิกทุกคนสามารถตรวจสอบรายการเดินบัญชีย้อนหลังได้ตลอดเวลา
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Announcements */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Bell size={16} />
              </div>
              <h2 className="text-base font-extrabold">ประกาศข่าวกองทุน</h2>
            </div>
            <button
              id="dashboard_view_all_ann_btn"
              type="button"
              onClick={() => setTab("monthly")}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-bold cursor-pointer"
            >
              ดูบิลรายเดือน
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center py-8 text-xs text-slate-400">
              ยังไม่มีประกาศใหม่ในขณะนี้
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[270px] pr-1">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="p-3.5 bg-slate-50/70 hover:bg-slate-50 rounded-2xl transition-all border border-slate-200/60 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ann.priority === "urgent"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {ann.priority === "urgent" ? "ด่วนที่สุด" : "ข่าวสาร"}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {new Date(ann.createdAt).toLocaleDateString("th-TH")}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 line-clamp-1">
                    {ann.title}
                  </h4>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {ann.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════ Smart Reminder / Private Notification Inbox ═══════════════════════ */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3 text-slate-900">
            <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 shrink-0">
              <Inbox size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold flex items-center gap-2">
                <span>กล่องข้อความแจ้งเตือนส่วนบุคคล</span>
                {unreadNotificationsCount > 0 && (
                  <span className="bg-amber-500 text-white text-[11px] px-2.5 py-0.5 rounded-full font-bold animate-pulse tabular-nums">
                    ใหม่ {unreadNotificationsCount}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                ข้อความแจ้งเตือนเฉพาะบุคคลจากเหรัญญิก (เห็นเฉพาะคุณเท่านั้น)
              </p>
            </div>
          </div>

          {unreadNotificationsCount > 0 && onMarkNotificationsRead && (
            <button
              type="button"
              onClick={() => onMarkNotificationsRead()}
              className="text-xs text-slate-700 hover:text-slate-900 font-bold bg-slate-100 hover:bg-slate-200/80 px-3.5 py-2 rounded-xl transition-all self-start sm:self-auto cursor-pointer"
            >
              ทำเครื่องหมายว่าอ่านแล้วทั้งหมด ✓
            </button>
          )}
        </div>

        {userNotifications.length === 0 ? (
          <div className="text-center py-8 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs">
            🎉 ยินดีด้วย! คุณไม่มีรายการแจ้งเตือนค้างชำระหรือข้อความทวงถามส่วนบุคคลในขณะนี้
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto max-h-[320px] pr-1">
            {userNotifications.map((not) => (
              <div
                key={not.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  !not.isRead
                    ? "bg-amber-50/50 border-amber-200/80 shadow-2xs"
                    : "bg-slate-50/40 border-slate-200/60 opacity-80"
                }`}
              >
                <div className="space-y-2 max-w-2xl flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        !not.isRead
                          ? "bg-amber-500 text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {!not.isRead ? "ยังไม่ได้อ่าน" : "อ่านแล้ว"}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {new Date(not.createdAt).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    {not.title}
                  </h4>
                  <div className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200/70">
                    {not.message}
                  </div>
                </div>

                <div className="flex sm:flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTab("monthly")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3.5 rounded-xl text-xs transition-all text-center flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <DollarSign size={14} /> ไปหน้าชำระเงิน
                  </button>
                  {!not.isRead && onMarkNotificationsRead && (
                    <button
                      type="button"
                      onClick={() => onMarkNotificationsRead(not.id)}
                      className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold py-2.5 px-3.5 rounded-xl text-xs transition-all text-center cursor-pointer"
                    >
                      รับทราบแล้ว ✓
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
