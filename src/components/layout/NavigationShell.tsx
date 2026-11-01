/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  Award,
  ShoppingBag,
  FileText,
  Lock,
  ChevronRight,
  LogOut,
  Inbox,
  QrCode,
  X,
  Menu,
  User as UserIcon,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { User, MonthlyBill, SystemSettings, Petition } from "../../types";

interface NavigationShellProps {
  currentUser: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  settings: SystemSettings;
  monthlyBills: MonthlyBill[];
  petitions?: Petition[];
  onLogout: () => void;
  onOpenQrModal: () => void;
  children: React.ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  badge?: number;
  dotAlert?: boolean;
  group: "main" | "community" | "admin";
}

export default function NavigationShell({
  currentUser,
  activeTab,
  setActiveTab,
  settings,
  monthlyBills,
  petitions = [],
  onLogout,
  onOpenQrModal,
  children,
}: NavigationShellProps) {
  const [showMobileMore, setShowMobileMore] = useState<boolean>(false);

  const isStaff =
    currentUser.role === "treasurer" ||
    currentUser.role === "leader" ||
    currentUser.role === "committee";

  const pendingPetitionsCount = isStaff
    ? petitions.filter((p) => p.status === "pending").length
    : 0;

  const hasUnpaidBills = monthlyBills?.some(
    (b) => b.userId === currentUser.id && b.status === "pending"
  );

  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: "ภาพรวมกองทุน",
      shortLabel: "ภาพรวม",
      icon: <TrendingUp size={18} />,
      group: "main",
    },
    {
      id: "monthly",
      label: "ชำระเงินรายเดือน",
      shortLabel: "ชำระเงิน",
      icon: <DollarSign size={18} />,
      dotAlert: hasUnpaidBills,
      group: "main",
    },
    {
      id: "market",
      label: "สรุปตลาดวันพุธ",
      shortLabel: "ตลาดพุธ",
      icon: <ShoppingBag size={18} />,
      group: "main",
    },
    {
      id: "activities",
      label: "โครงการกิจกรรม",
      shortLabel: "โครงการ",
      icon: <Award size={18} />,
      group: "main",
    },
    {
      id: "reports",
      label: "การเงินโปร่งใส",
      shortLabel: "รายงานการเงิน",
      icon: <FileText size={18} />,
      group: "community",
    },
    {
      id: "members",
      label: "รายชื่อสมาชิก",
      shortLabel: "สมาชิก",
      icon: <Users size={18} />,
      group: "community",
    },
    {
      id: "petitions",
      label: "ยื่นคำร้อง / ข้อเสนอแนะ",
      shortLabel: "คำร้อง/เสนอแนะ",
      icon: <Inbox size={18} />,
      badge: pendingPetitionsCount > 0 ? pendingPetitionsCount : undefined,
      group: "community",
    },
    {
      id: "profile",
      label: "ข้อมูลส่วนตัว",
      shortLabel: "โปรไฟล์",
      icon: <UserIcon size={18} />,
      group: "admin",
    },
  ];

  if (currentUser.role === "treasurer") {
    navItems.push({
      id: "admin",
      label: "จัดการระบบ (เหรัญญิก)",
      shortLabel: "จัดการระบบ",
      icon: <Lock size={18} />,
      group: "admin",
    });
  }

  const activeNavObj = navItems.find((item) => item.id === activeTab) || navItems[0];

  const getRoleBadge = (role: User["role"]) => {
    switch (role) {
      case "treasurer":
        return {
          label: "เหรัญญิก",
          className: "bg-rose-50 text-rose-700 border-rose-200/80",
        };
      case "leader":
        return {
          label: "หัวหน้าห้อง",
          className: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
        };
      case "committee":
        return {
          label: "กรรมการ",
          className: "bg-amber-50 text-amber-700 border-amber-200/80",
        };
      default:
        return {
          label: "สมาชิก",
          className: "bg-slate-100 text-slate-600 border-slate-200/80",
        };
    }
  };

  const roleBadge = getRoleBadge(currentUser.role);

  const renderSidebarGroup = (title: string, groupKey: NavItem["group"]) => {
    const items = navItems.filter((i) => i.group === groupKey);
    if (items.length === 0) return null;

    return (
      <div className="space-y-1">
        <div className="px-3.5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </div>
        {items.map((item) => {
          const isActive = activeTab === item.id;
          const isAdminItem = item.id === "admin";
          return (
            <button
              id={`sidebar_tab_${item.id}`}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 group ${
                isActive
                  ? isAdminItem
                    ? "bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20"
                  : isAdminItem
                  ? "text-rose-600 hover:bg-rose-50/80"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                    isActive
                      ? "text-white"
                      : isAdminItem
                      ? "text-rose-500"
                      : "text-slate-400 group-hover:text-blue-600"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {item.dotAlert && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 ring-4 ring-rose-500/15 animate-pulse" />
                )}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[11px] font-bold h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center tabular-nums ${
                      isActive
                        ? "bg-white text-blue-600"
                        : "bg-rose-500 text-white shadow-xs"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900">
      {/* Sticky Glassmorphic Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-slate-200/80 px-4 py-2.5 sm:px-6 sm:py-3 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Brand & Active Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className="flex items-center gap-2.5 text-left group focus:outline-none"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-white border border-slate-200/90 shadow-xs shrink-0 flex items-center justify-center p-1 group-hover:border-blue-300 transition-all">
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
                    {settings?.fundName || "ระบบกองทุน TNS06"}
                  </h1>
                  <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                    <ShieldCheck size={11} /> Smart Student Treasury
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                  ระบบบริหารกองทุนและสวัสดิการห้องเรียนโปร่งใส
                </p>
              </div>
            </button>

            {/* Active Tab Pill on Desktop */}
            <div className="hidden xl:flex items-center gap-2 pl-3 ml-1 border-l border-slate-200 text-xs font-semibold text-slate-600">
              <span className="text-slate-400">หน้าปัจจุบัน:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold">
                {activeNavObj.label}
              </span>
            </div>
          </div>

          {/* Right Controls: Quick QR, Profile Pill & Logout */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Quick PromptPay QR Button */}
            <button
              type="button"
              onClick={onOpenQrModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-[#003D6B] hover:bg-[#002d52] text-white text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
              title="ดู QR พร้อมเพย์กองทุน"
            >
              <QrCode size={15} className="text-sky-300 shrink-0" />
              <span className="hidden sm:inline">QR พร้อมเพย์</span>
            </button>

            {/* Interactive User Profile Pill */}
            <div className="flex items-center bg-slate-100/80 hover:bg-slate-100 border border-slate-200/80 rounded-2xl p-1 pl-2.5 sm:pl-3 gap-2 transition-all">
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className="flex items-center gap-2 text-left group focus:outline-none"
                title="คลิกเพื่อดูข้อมูลส่วนตัว"
              >
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="font-bold text-slate-800 text-xs sm:text-[13px] group-hover:text-blue-600 transition-colors">
                      {currentUser.nickname || currentUser.fullName.split(" ")[0]}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100/90 text-blue-700 font-bold rounded-md">
                      {currentUser.classroom || "ทั่วไป"}
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center justify-end gap-1 mt-0.5">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${roleBadge.className}`}
                    >
                      {roleBadge.label}
                    </span>
                  </div>
                </div>
              </button>

              <div className="w-px h-6 bg-slate-200/90" />

              <button
                type="button"
                onClick={onLogout}
                className="flex items-center justify-center p-1.5 sm:p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                title="ออกจากระบบ"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full flex flex-col md:flex-row px-4 sm:px-6 pt-4 sm:pt-6 gap-6 pb-28 md:pb-10">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col gap-4">
          <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-3 sticky top-20">
            {renderSidebarGroup("เมนูหลัก", "main")}
            <div className="h-px bg-slate-100 mx-2" />
            {renderSidebarGroup("ความโปร่งใส & สมาชิก", "community")}
            <div className="h-px bg-slate-100 mx-2" />
            {renderSidebarGroup("การจัดการ & บัญชี", "admin")}

            {/* PromptPay Quick Card inside Sidebar */}
            <div className="pt-2">
              <div
                onClick={onOpenQrModal}
                className="bg-gradient-to-br from-[#003D6B] via-[#002f54] to-[#00223E] text-white rounded-2xl p-4 space-y-2.5 text-xs cursor-pointer hover:shadow-lg hover:shadow-blue-950/20 transition-all relative overflow-hidden group border border-sky-400/20"
              >
                <div className="absolute -right-3 -bottom-3 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
                  <QrCode size={96} />
                </div>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 font-bold uppercase text-[10px] tracking-wider text-sky-200">
                    <Sparkles size={11} /> บัญชีกองทุน
                  </span>
                  <span className="text-[10px] font-bold bg-sky-400/20 text-sky-100 border border-sky-300/25 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <QrCode size={10} /> สแกนจ่าย
                  </span>
                </div>
                <div className="space-y-1 relative z-10">
                  <p className="text-xs font-semibold text-white/95 line-clamp-1">
                    {settings?.promptpayName || "บัญชีกลางกองทุน"}
                  </p>
                  <p className="font-mono text-xs font-bold tracking-wide bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg inline-block tabular-nums text-sky-100">
                    {settings?.promptpayNumber || "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Panel */}
        <main className="flex-1 min-w-0 animate-fade-in">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 flex justify-around items-center h-16 px-2 md:hidden z-30 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] pb-safe">
        {[
          { id: "dashboard", label: "ภาพรวม", icon: <TrendingUp size={20} /> },
          {
            id: "monthly",
            label: "ชำระเงิน",
            icon: <DollarSign size={20} />,
            alert: hasUnpaidBills,
          },
          { id: "market", label: "ตลาดพุธ", icon: <ShoppingBag size={20} /> },
          { id: "activities", label: "โครงการ", icon: <Award size={20} /> },
        ].map((tab) => {
          const isActive = activeTab === tab.id && !showMobileMore;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setShowMobileMore(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all relative ${
                isActive ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-6 h-0.5 bg-blue-600 rounded-b-full" />
              )}
              <div
                className={`p-1 rounded-xl transition-colors ${
                  isActive ? "bg-blue-50 text-blue-600" : ""
                }`}
              >
                {tab.icon}
              </div>
              <span className="text-[11px] leading-none">{tab.label}</span>
              {tab.alert && (
                <span className="absolute top-2 right-[26%] w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setShowMobileMore(!showMobileMore)}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all relative ${
            showMobileMore ||
            ["reports", "members", "petitions", "profile", "admin"].includes(activeTab)
              ? "text-blue-600 font-bold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {(showMobileMore ||
            ["reports", "members", "petitions", "profile", "admin"].includes(activeTab)) && (
            <span className="absolute top-0 inset-x-6 h-0.5 bg-blue-600 rounded-b-full" />
          )}
          <div
            className={`p-1 rounded-xl transition-colors ${
              showMobileMore ||
              ["reports", "members", "petitions", "profile", "admin"].includes(activeTab)
                ? "bg-blue-50 text-blue-600"
                : ""
            }`}
          >
            <Menu size={20} />
          </div>
          <span className="text-[11px] leading-none">เมนูเพิ่มเติม</span>
          {pendingPetitionsCount > 0 && (
            <span className="absolute top-2 right-[24%] w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white animate-pulse" />
          )}
        </button>
      </nav>

      {/* Mobile More Menu Bottom Sheet */}
      {showMobileMore && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 md:hidden flex items-end justify-center"
          onClick={() => setShowMobileMore(false)}
        >
          <div
            className="bg-white w-full rounded-t-3xl p-5 pb-8 border-t border-slate-200/80 shadow-2xl space-y-4 relative max-w-md animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto"
              onClick={() => setShowMobileMore(false)}
            />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">เมนูระบบทั้งหมด</h3>
                <p className="text-xs text-slate-500">เลือกหน้าที่ต้องการเข้าใช้งาน</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileMore(false)}
                className="bg-slate-100 text-slate-500 hover:text-slate-800 transition-all p-2 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("reports");
                  setShowMobileMore(false);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-2xl text-xs font-bold border transition-all text-left ${
                  activeTab === "reports"
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-slate-50/80 border-slate-200/60 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    activeTab === "reports"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-blue-600 shadow-2xs"
                  }`}
                >
                  <FileText size={18} />
                </div>
                <span>การเงินโปร่งใส</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("members");
                  setShowMobileMore(false);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-2xl text-xs font-bold border transition-all text-left ${
                  activeTab === "members"
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-slate-50/80 border-slate-200/60 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    activeTab === "members"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-indigo-600 shadow-2xs"
                  }`}
                >
                  <Users size={18} />
                </div>
                <span>รายชื่อสมาชิก</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("petitions");
                  setShowMobileMore(false);
                }}
                className={`flex items-center justify-between gap-2 p-3.5 rounded-2xl text-xs font-bold border transition-all text-left ${
                  activeTab === "petitions"
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-slate-50/80 border-slate-200/60 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      activeTab === "petitions"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-amber-600 shadow-2xs"
                    }`}
                  >
                    <Inbox size={18} />
                  </div>
                  <span className="truncate">คำร้อง/เสนอแนะ</span>
                </div>
                {pendingPetitionsCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center shrink-0">
                    {pendingPetitionsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("profile");
                  setShowMobileMore(false);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-2xl text-xs font-bold border transition-all text-left ${
                  activeTab === "profile"
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-slate-50/80 border-slate-200/60 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    activeTab === "profile"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-emerald-600 shadow-2xs"
                  }`}
                >
                  <UserIcon size={18} />
                </div>
                <span>ข้อมูลส่วนตัว</span>
              </button>

              {currentUser.role === "treasurer" && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("admin");
                    setShowMobileMore(false);
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl text-xs font-bold border transition-all text-left col-span-2 ${
                    activeTab === "admin"
                      ? "bg-rose-50 border-rose-200 text-rose-700"
                      : "bg-rose-50/40 border-rose-200/60 text-rose-700 hover:bg-rose-50"
                  }`}
                >
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      activeTab === "admin"
                        ? "bg-rose-600 text-white"
                        : "bg-white text-rose-600 shadow-2xs"
                    }`}
                  >
                    <Lock size={18} />
                  </div>
                  <span>จัดการระบบ (สำหรับเหรัญญิก)</span>
                </button>
              )}
            </div>

            {/* Quick PromptPay display in Mobile menu */}
            {settings && (
              <div
                onClick={() => {
                  setShowMobileMore(false);
                  onOpenQrModal();
                }}
                className="bg-gradient-to-r from-[#003D6B] to-[#002545] text-white rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-white/15 p-2.5 rounded-xl shrink-0">
                    <QrCode size={20} className="text-sky-200" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white">QR พร้อมเพย์กองทุน</h4>
                    <p className="text-[11px] text-sky-200 truncate font-mono tabular-nums">
                      {settings.promptpayName} • {settings.promptpayNumber}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-sky-200 shrink-0" />
              </div>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setShowMobileMore(false);
                }}
                className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-3 rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5 border border-rose-200/70"
              >
                <LogOut size={15} /> ออกจากระบบ
              </button>
              <button
                type="button"
                onClick={() => setShowMobileMore(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all text-center"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
