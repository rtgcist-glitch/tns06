/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PublicPreview — Public-facing read-only financial transparency portal
 */

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  ShoppingBag,
  Award,
  FileText,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  LogIn,
  ChevronRight,
  Sparkles,
  Calendar,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  BarChart3,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

interface PreviewData {
  settings: {
    fundName: string;
    monthlyFee: number;
  };
  memberCount: number;
  financialSummary: {
    totalBalance: number;
    totalIncome: number;
    totalExpense: number;
    feeIncome: number;
    marketProfit: number;
    activityExpense: number;
  };
  billingSummary: {
    month: number;
    year: number;
    totalMembers: number;
    paidCount: number;
    pendingReviewCount: number;
    unpaidCount: number;
    amountPerPerson: number;
  };
  billingHistory: Array<{
    month: number;
    year: number;
    total: number;
    paid: number;
  }>;
  marketSummary: {
    totalWeeks: number;
    completedWeeks: number;
    totalProfit: number;
    totalRevenue: number;
    totalCost: number;
  };
  activities: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    eventDate: string | null;
    location: string;
    createdAt: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    content: string;
    priority: string;
    isPinned: boolean;
    createdAt: string;
  }>;
  generatedAt: string;
}

const THAI_MONTHS = [
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

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function getThaiMonth(m: number) {
  return THAI_MONTHS[m - 1] || "";
}
function getThaiMonthShort(m: number) {
  return THAI_MONTHS_SHORT[m - 1] || "";
}

function getStatusLabel(status: string): {
  label: string;
  color: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case "proposed":
      return {
        label: "เสนอโครงการ",
        color: "text-blue-700 bg-blue-50 border-blue-200",
        icon: <FileText size={12} />,
      };
    case "approved":
      return {
        label: "อนุมัติแล้ว",
        color: "text-emerald-700 bg-emerald-50 border-emerald-200",
        icon: <CheckCircle size={12} />,
      };
    case "in_progress":
      return {
        label: "กำลังดำเนินการ",
        color: "text-amber-700 bg-amber-50 border-amber-200",
        icon: <Clock size={12} />,
      };
    case "completed":
      return {
        label: "เสร็จสิ้น",
        color: "text-emerald-800 bg-emerald-100/80 border-emerald-300",
        icon: <CheckCircle size={12} />,
      };
    case "rejected":
      return {
        label: "ไม่อนุมัติ",
        color: "text-rose-700 bg-rose-50 border-rose-200",
        icon: <XCircle size={12} />,
      };
    case "pending_settlement":
      return {
        label: "รอสรุปงบ",
        color: "text-purple-700 bg-purple-50 border-purple-200",
        icon: <AlertCircle size={12} />,
      };
    default:
      return {
        label: status,
        color: "text-slate-600 bg-slate-100 border-slate-200",
        icon: <FileText size={12} />,
      };
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString("th-TH");
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

interface PublicPreviewProps {
  onGoToLogin: () => void;
}

export default function PublicPreview({ onGoToLogin }: PublicPreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/preview?t=${Date.now()}`);
      if (!res.ok) throw new Error("ไม่สามารถโหลดข้อมูลได้");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPreview();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 font-sans">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-2xl bg-blue-600/15 animate-ping" />
            <div className="relative w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-lg">
              <Wallet size={26} className="text-blue-600 animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-extrabold text-slate-800">
              กำลังโหลดพอร์ทัลความโปร่งใสทางการเงิน...
            </h2>
            <p className="text-xs text-slate-500">ดึงข้อมูลสรุปกองทุนแบบเรียลไทม์</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-xl border border-slate-200/80 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto">
            <AlertCircle size={26} className="text-rose-500" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900">ไม่สามารถโหลดข้อมูลได้</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{error || "กรุณาลองใหม่อีกครั้ง"}</p>
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => fetchPreview()}
              className="flex-1 bg-blue-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={14} /> ลองใหม่
            </button>
            <button
              type="button"
              onClick={onGoToLogin}
              className="flex-1 bg-slate-100 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5"
            >
              <LogIn size={14} /> เข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    settings,
    memberCount,
    financialSummary,
    billingSummary,
    billingHistory,
    marketSummary,
    activities,
    announcements,
  } = data;

  const payPercentage =
    billingSummary.totalMembers > 0
      ? Math.round((billingSummary.paidCount / billingSummary.totalMembers) * 100)
      : 0;

  const pendingPercentage =
    billingSummary.totalMembers > 0
      ? Math.round((billingSummary.pendingReviewCount / billingSummary.totalMembers) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans relative overflow-x-hidden">
      {/* Subtle Ambient Top Glow */}
      <div className="pointer-events-none absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-blue-50/80 via-indigo-50/30 to-transparent -z-10" />

      {/* ═══════════════════════ Sticky Glass Header ═══════════════════════ */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-slate-200/80 px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-200/90 shadow-xs shrink-0 flex items-center justify-center p-1">
              <img
                src="/logo.svg"
                alt="TNS Logo"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-none truncate">
                  {settings.fundName}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ข้อมูลโปร่งใสแบบเรียลไทม์
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                พอร์ทัลตรวจสอบสถานะการเงินสาธารณะ (สำหรับสมาชิก อาจารย์ และผู้ปกครอง)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchPreview(true)}
              disabled={isRefreshing}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-600 transition-all cursor-pointer"
              title="รีเฟรชข้อมูลล่าสุด"
            >
              <RefreshCw size={15} className={isRefreshing ? "animate-spin text-blue-600" : ""} />
            </button>
            <button
              type="button"
              onClick={onGoToLogin}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-[13px] px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 cursor-pointer"
            >
              <LogIn size={15} />
              <span>เข้าสู่ระบบสมาชิก</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 pb-24">
        {/* ═══════════════════════ Hero & Main Treasury Bento ═══════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Hero Card */}
          <div className="lg:col-span-7 relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl overflow-hidden flex flex-col justify-between border border-slate-800">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-4">
              <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/15 text-sky-200 font-bold text-xs px-3 py-1 rounded-full">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>ระบบบัญชีดิจิทัลตรวจสอบได้ 100%</span>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-widest text-slate-300 font-bold">
                  ยอดเงินคงเหลือสุทธิในกองทุน (Net Treasury Balance)
                </p>
                <div className="text-3xl sm:text-5xl font-extrabold tracking-tight font-display tabular-nums text-white">
                  ฿{formatNumber(financialSummary.totalBalance)}
                </div>
              </div>

              <p className="text-slate-300 text-xs sm:text-sm max-w-xl leading-relaxed">
                สรุปภาพรวมรายรับ-รายจ่ายของ{" "}
                <span className="text-white font-semibold">{settings.fundName}</span>{" "}
                อัปเดตอัตโนมัติจากฐานข้อมูลกลาง เพื่อความโปร่งใสของสมาชิกทุกคนในรุ่น
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-3 gap-3 pt-6 mt-6 border-t border-white/10">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <p className="text-[11px] text-slate-300 font-medium">สมาชิกทั้งหมด</p>
                <p className="text-base sm:text-xl font-extrabold font-display tabular-nums mt-0.5">
                  {memberCount} <span className="text-xs font-normal text-slate-300">คน</span>
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <p className="text-[11px] text-slate-300 font-medium">อัตราเงินรายเดือน</p>
                <p className="text-base sm:text-xl font-extrabold font-display tabular-nums mt-0.5 text-sky-300">
                  ฿{formatNumber(settings.monthlyFee)}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <p className="text-[11px] text-slate-300 font-medium">อัตราชำระเดือนนี้</p>
                <p className="text-base sm:text-xl font-extrabold font-display tabular-nums mt-0.5 text-emerald-400">
                  {payPercentage}%
                </p>
              </div>
            </div>
          </div>

          {/* Right Income & Expense Breakdown Cards */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {/* Total Income Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                    <ArrowUpRight size={13} /> รายรับสะสมทั้งหมด
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tabular-nums mt-2">
                    ฿{formatNumber(financialSummary.totalIncome)}
                  </h3>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <TrendingUp size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-2.5">
                  <span className="text-slate-500 block text-[11px]">ค่าบำรุงรายเดือน</span>
                  <span className="font-bold text-slate-800 font-display tabular-nums">
                    ฿{formatNumber(financialSummary.feeIncome)}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-2.5">
                  <span className="text-slate-500 block text-[11px]">กำไรตลาดนัดวันพุธ</span>
                  <span className="font-bold text-emerald-600 font-display tabular-nums">
                    ฿{formatNumber(financialSummary.marketProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Expense Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/60 px-2.5 py-0.5 rounded-full">
                    <ArrowDownRight size={13} /> รายจ่ายสะสมทั้งหมด
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tabular-nums mt-2">
                    ฿{formatNumber(financialSummary.totalExpense)}
                  </h3>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <BarChart3 size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50 rounded-xl p-2.5">
                <span className="text-slate-500">เบิกจ่ายโครงการและกิจกรรมรุ่น</span>
                <span className="font-bold text-rose-600 font-display tabular-nums">
                  ฿{formatNumber(financialSummary.activityExpense)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════ Pinned Announcements ═══════════════════════ */}
        {announcements.some((a) => a.isPinned || a.priority === "urgent") && (
          <section className="space-y-3">
            {announcements
              .filter((a) => a.isPinned || a.priority === "urgent")
              .map((ann) => (
                <div
                  key={ann.id}
                  className={`rounded-2xl p-4 sm:p-5 border shadow-2xs ${
                    ann.priority === "urgent"
                      ? "bg-rose-50/70 border-rose-200/80"
                      : "bg-blue-50/70 border-blue-200/80"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        ann.priority === "urgent"
                          ? "bg-rose-600 text-white"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      <Megaphone size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <h4 className="text-sm font-extrabold text-slate-900">{ann.title}</h4>
                        {ann.priority === "urgent" && (
                          <span className="text-[10px] bg-rose-600 text-white font-bold px-2 py-0.5 rounded-full">
                            ประกาศสำคัญ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{ann.content}</p>
                      <p className="text-[11px] text-slate-400 mt-1.5 font-semibold">
                        ประกาศเมื่อ {formatDate(ann.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </section>
        )}

        {/* ═══════════════════════ Monthly Billing Progress ═══════════════════════ */}
        {billingSummary.totalMembers > 0 && (
          <section className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-6 sm:p-7 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                      ความคืบหน้าการชำระเงินรายเดือน
                    </h3>
                    <p className="text-xs text-slate-500">
                      รอบบิลเดือน {getThaiMonth(billingSummary.month)} {billingSummary.year} • คนละ{" "}
                      ฿{formatNumber(billingSummary.amountPerPerson || settings.monthlyFee)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-2xl font-extrabold text-blue-600 font-display tabular-nums">
                    {payPercentage}%
                  </span>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                    ชำระสำเร็จแล้ว
                  </span>
                </div>
              </div>

              {/* Multi-segment progress bar */}
              <div className="space-y-2">
                <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden flex p-0.5 gap-0.5">
                  {payPercentage > 0 && (
                    <div
                      className="h-full bg-emerald-500 rounded-l-full transition-all duration-700"
                      style={{ width: `${payPercentage}%` }}
                      title={`ชำระแล้ว ${billingSummary.paidCount} คน`}
                    />
                  )}
                  {pendingPercentage > 0 && (
                    <div
                      className="h-full bg-amber-400 transition-all duration-700"
                      style={{ width: `${pendingPercentage}%` }}
                      title={`รอตรวจสอบ ${billingSummary.pendingReviewCount} คน`}
                    />
                  )}
                </div>
              </div>

              {/* 3 Stat Cards */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div className="rounded-2xl bg-emerald-50/60 border border-emerald-200/60 p-4 text-center">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 mb-1.5">
                    <CheckCircle size={16} />
                  </div>
                  <p className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-display tabular-nums">
                    {billingSummary.paidCount}
                  </p>
                  <p className="text-xs font-bold text-emerald-800/80">ชำระแล้ว (คน)</p>
                </div>

                <div className="rounded-2xl bg-amber-50/60 border border-amber-200/60 p-4 text-center">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-amber-100 text-amber-700 mb-1.5">
                    <Clock size={16} />
                  </div>
                  <p className="text-xl sm:text-2xl font-extrabold text-amber-700 font-display tabular-nums">
                    {billingSummary.pendingReviewCount}
                  </p>
                  <p className="text-xs font-bold text-amber-800/80">รอตรวจสอบ</p>
                </div>

                <div className="rounded-2xl bg-rose-50/60 border border-rose-200/60 p-4 text-center">
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-rose-100 text-rose-700 mb-1.5">
                    <AlertCircle size={16} />
                  </div>
                  <p className="text-xl sm:text-2xl font-extrabold text-rose-700 font-display tabular-nums">
                    {billingSummary.unpaidCount}
                  </p>
                  <p className="text-xs font-bold text-rose-800/80">ค้างชำระ</p>
                </div>
              </div>

              {/* Billing History Mini Chart */}
              {billingHistory.length > 1 && (
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 mb-3">
                    สถิติการชำระเงินย้อนหลังรายเดือน
                  </p>
                  <div className="flex items-end gap-2.5 h-24 pt-2">
                    {[...billingHistory].reverse().map((cycle, i) => {
                      const pct = cycle.total > 0 ? Math.round((cycle.paid / cycle.total) * 100) : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                            {pct}%
                          </span>
                          <div className="w-full bg-slate-100 rounded-t-lg relative overflow-hidden h-14">
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-600 to-indigo-500 rounded-t-lg transition-all duration-700"
                              style={{ height: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-600 font-bold">
                            {getThaiMonthShort(cycle.month)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ═══════════════════════ Market & Activities Grid ═══════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Wednesday Market Summary */}
          {marketSummary.totalWeeks > 0 && (
            <section className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                    <ShoppingBag size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">สรุปตลาดนัดวันพุธ</h3>
                    <p className="text-xs text-slate-500">
                      ดำเนินการแล้ว {marketSummary.completedWeeks} จาก {marketSummary.totalWeeks} สัปดาห์
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 border border-emerald-200/70 rounded-2xl p-4">
                  <p className="text-xs font-bold text-emerald-700">กำไรสุทธิเข้ากองทุน</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 font-display tabular-nums mt-1">
                    ฿{formatNumber(marketSummary.totalProfit)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5">
                  <p className="text-xs text-slate-500 font-medium">ยอดขายรวม</p>
                  <p className="text-base font-extrabold text-slate-800 font-display tabular-nums mt-0.5">
                    ฿{formatNumber(marketSummary.totalRevenue)}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5">
                  <p className="text-xs text-slate-500 font-medium">ต้นทุนรวม</p>
                  <p className="text-base font-extrabold text-slate-700 font-display tabular-nums mt-0.5">
                    ฿{formatNumber(marketSummary.totalCost)}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Activities List */}
          {activities.length > 0 && (
            <section
              className={`${
                marketSummary.totalWeeks > 0 ? "lg:col-span-7" : "lg:col-span-12"
              } bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-4`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                    <Award size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">โครงการและกิจกรรมรุ่น</h3>
                    <p className="text-xs text-slate-500">รายการกิจกรรมที่เสนอและดำเนินการ</p>
                  </div>
                </div>
                <span className="text-xs bg-purple-50 text-purple-700 font-bold px-3 py-1 rounded-full border border-purple-200/70 tabular-nums">
                  {activities.length} โครงการ
                </span>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {activities.map((act) => {
                  const statusInfo = getStatusLabel(act.status);
                  return (
                    <div
                      key={act.id}
                      className="rounded-2xl border border-slate-200/70 bg-slate-50/50 hover:bg-slate-50 p-4 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <h4 className="text-sm font-bold text-slate-900">{act.title}</h4>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${statusInfo.color}`}
                            >
                              {statusInfo.icon} {statusInfo.label}
                            </span>
                          </div>
                          {act.description && (
                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                              {act.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500 font-medium">
                            {act.eventDate && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar size={12} className="text-slate-400" />{" "}
                                {formatDate(act.eventDate)}
                              </span>
                            )}
                            {act.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={12} className="text-slate-400" /> {act.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* ═══════════════════════ General Announcements ═══════════════════════ */}
        {announcements.filter((a) => !a.isPinned && a.priority !== "urgent").length > 0 && (
          <section className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <Bell size={18} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">ข่าวสารและประกาศทั่วไป</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {announcements
                .filter((a) => !a.isPinned && a.priority !== "urgent")
                .map((ann) => (
                  <div
                    key={ann.id}
                    className="rounded-2xl border border-slate-200/70 bg-slate-50/40 p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{ann.title}</h4>
                      <span className="text-[11px] text-slate-400 font-medium shrink-0">
                        {formatDate(ann.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                      {ann.content}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ═══════════════════════ Member Login CTA Banner ═══════════════════════ */}
        <section className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-lg flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-200">
              <Sparkles size={14} /> สำหรับสมาชิกในรุ่น
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              ต้องการแจ้งชำระเงินรายเดือน หรือยื่นคำร้อง?
            </h3>
            <p className="text-xs sm:text-sm text-blue-100 max-w-xl">
              เข้าสู่ระบบด้วยเลข 3 ตัวท้ายของรหัสนักศึกษา หรืออีเมลมหาวิทยาลัย เพื่อจัดการข้อมูลของคุณได้ทันที
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToLogin}
            className="bg-white text-blue-700 hover:bg-blue-50 font-extrabold text-xs sm:text-sm px-6 py-3.5 rounded-2xl transition-all shadow-md flex items-center gap-2 shrink-0 active:scale-95 cursor-pointer"
          >
            <LogIn size={16} />
            <span>เข้าสู่ระบบสมาชิก</span>
            <ChevronRight size={15} />
          </button>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 space-y-1 pt-2">
          <p className="font-bold text-slate-500">พอร์ทัลความโปร่งใสสาธารณะ — {settings.fundName}</p>
          <p>แสดงเฉพาะข้อมูลสรุปภาพรวมเพื่อความโปร่งใส โดยไม่เปิดเผยข้อมูลส่วนบุคคลของสมาชิก</p>
          <p className="text-[11px] text-slate-400">
            ข้อมูลล่าสุด ณ {new Date(data.generatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
          </p>
        </footer>
      </div>
    </div>
  );
}
