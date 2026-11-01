/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  UploadCloud, 
  FileText, 
  Download, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  QrCode,
  DollarSign,
  Check,
  Copy,
  ChevronDown,
  Search,
  Wallet,
  CreditCard,
  Banknote,
  Receipt,
  ShieldCheck,
  Users,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { User, MonthlyBill, Payment, getDetailedBillStatus } from "../types";
import { compressImage } from "../utils/imageCompressor";

interface MonthlyBillsProps {
  currentUser: User;
  monthlyBills: MonthlyBill[];
  payments: Payment[];
  settings: any;
  users?: User[];
  onSubmitSlip: (billId: string, amount: number, slipUrl: string, note: string, targetUserId?: string) => Promise<any>;
  onCancelSlip: (billId: string, targetUserId?: string) => Promise<any>;
  onRecordCashPayment?: (billId: string, userId: string, amount: number, note?: string) => Promise<any>;
  onDeleteMonthlyBills?: (month: number, year: number) => Promise<any>;
}

export default function MonthlyBills({
  currentUser,
  monthlyBills,
  payments,
  settings,
  users = [],
  onSubmitSlip,
  onCancelSlip,
  onRecordCashPayment,
  onDeleteMonthlyBills
}: MonthlyBillsProps) {
  const [targetUserId, setTargetUserId] = useState<string>(currentUser.id);
  const [billClassroomFilter, setBillClassroomFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSelectorOpen, setIsSelectorOpen] = useState<boolean>(false);

  // Classmate selection for leader or treasurer
  const canSelectClassmate = currentUser.role === "leader" || currentUser.role === "treasurer";
  const classmateUsers = currentUser.role === "leader"
    ? users.filter(u => u.classroom === currentUser.classroom)
    : (billClassroomFilter === "all" ? users : users.filter(u => u.classroom === billClassroomFilter));

  const filteredClassmates = classmateUsers.filter(u => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      u.fullName.toLowerCase().includes(term) ||
      (u.nickname && u.nickname.toLowerCase().includes(term)) ||
      u.studentId.toLowerCase().includes(term)
    );
  });

  const activeUser = users.find(u => u.id === targetUserId) || currentUser;

  // Filter bills for the logged in or selected user
  const myBills = monthlyBills.filter(b => b.userId === targetUserId);
  const myPayments = payments.filter(p => p.userId === targetUserId);

  // Summary counts for header
  const paidBillsCount = myBills.filter(b => b.status === "paid").length;
  const pendingBillsCount = myBills.filter(b => b.status === "pending_review").length;
  const unpaidBillsCount = myBills.filter(b => b.status !== "paid" && b.status !== "pending_review").length;

  const [selectedBill, setSelectedBill] = useState<MonthlyBill | null>(null);

  useEffect(() => {
    const userBills = monthlyBills.filter(b => b.userId === targetUserId);
    setSelectedBill(userBills.find(b => b.status !== "paid") || userBills[0] || null);
    setPaymentMethod("transfer");
  }, [targetUserId, monthlyBills]);

  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipUrl, setSlipUrl] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer");

  const pendingPayment = selectedBill ? myPayments.find(p => p.billId === selectedBill.id && p.status === "pending_review") : null;
  const isCashPending = pendingPayment?.slipUrl === "cash";
  const displaySlipUrl = pendingPayment?.slipUrl && pendingPayment.slipUrl !== "cash" ? pendingPayment.slipUrl : slipUrl;

  const getThaiMonthName = (month: number) => {
    const months = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    return months[month - 1] || "";
  };

  const getApprovedAmt = (billId: string) => {
    return payments
      .filter(p => p.billId === billId && p.status === "approved")
      .reduce((sum, p) => sum + p.amount, 0);
  };

  useEffect(() => {
    if (selectedBill) {
      const approvedAmt = getApprovedAmt(selectedBill.id);
      const remaining = selectedBill.amount - approvedAmt;
      setCustomAmount(remaining > 0 ? remaining : 0);
    }
  }, [selectedBill, payments]);

  const getPromptPayQR = (amount: number) => {
    if (settings.promptpayQrUrl) {
      return settings.promptpayQrUrl;
    }
    const ppNum = (settings.promptpayNumber || "").replace(/[^0-9]/g, "");
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=002d62&data=PromptPay:${ppNum}?amount=${amount}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSlipFile(file);
      const compressed = await compressImage(file, 800, 0.6);
      setSlipUrl(compressed);
    }
  };

  const selectMockSlip = (index: number) => {
    const mockSlips = [
      "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?q=80&w=300",
      "https://images.unsplash.com/photo-1563013544-824ae1d704d3?q=80&w=300"
    ];
    setSlipUrl(mockSlips[index]);
    setSlipFile(new File([], `mock_slip_${index + 1}.png`));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;

    const finalSlipUrl = paymentMethod === "cash" ? "cash" : slipUrl;
    if (!finalSlipUrl) return;

    setIsUploading(true);
    try {
      if (paymentMethod === "cash" && onRecordCashPayment && canSelectClassmate && targetUserId !== currentUser.id) {
        await onRecordCashPayment(
          selectedBill.id,
          targetUserId,
          customAmount || (selectedBill.amount - getApprovedAmt(selectedBill.id)),
          note || (currentUser.role === "leader" ? "แจ้งชำระด้วยเงินสด (บันทึกโดยหัวหน้าห้อง)" : "ชำระด้วยเงินสด (เหรัญญิกบันทึกด้วยตนเอง)")
        );
      } else {
        await onSubmitSlip(
          selectedBill.id, 
          customAmount || (selectedBill.amount - getApprovedAmt(selectedBill.id)), 
          finalSlipUrl, 
          note || (paymentMethod === "cash" ? "แจ้งชำระด้วยเงินสดแก่เหรัญญิก" : ""),
          targetUserId
        );
      }
      setUploadSuccess(true);
      setSlipFile(null);
      setSlipUrl("");
      setNote("");
    } catch (error: any) {
      console.error("Submit payment failed", error);
      alert(error?.message || "เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelClick = async () => {
    if (!selectedBill) return;
    if (!window.confirm("⚠️ ยืนยันการยกเลิก?\n\nคุณต้องการยกเลิกคำขอชำระเงินและลบหลักฐานที่ส่งนี้ใช่หรือไม่? เพื่อให้คุณสามารถเลือกวิธีชำระเงินหรือส่งหลักฐานใหม่ได้อีกครั้ง")) {
      return;
    }
    
    setIsCancelling(true);
    try {
      await onCancelSlip(selectedBill.id, targetUserId);
      setUploadSuccess(false);
      setSlipUrl("");
      setSlipFile(null);
      setNote("");
      alert("ยกเลิกคำขอชำระเงินเรียบร้อยแล้วค่ะ คุณสามารถเลือกชำระเงินใหม่ได้เลย");
    } catch (err: any) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการยกเลิก: " + (err.message || String(err)));
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (bill: MonthlyBill) => {
    const statusInfo = getDetailedBillStatus(bill, payments);
    if (statusInfo.statusType === "paid") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
          <CheckCircle2 size={14} className="text-emerald-600" />
          ชำระแล้ว
        </span>
      );
    }
    if (statusInfo.statusType === "pending_review") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/70">
          <Clock size={14} className="text-amber-600" />
          รอตรวจสอบ
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/70">
        {statusInfo.statusType === "overdue" ? <XCircle size={14} className="text-rose-600" /> : <AlertCircle size={14} className="text-rose-600" />}
        {statusInfo.label || "ค้างชำระ"}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header & Member Payment Summary */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
              <Wallet size={14} /> ระบบตรวจสอบยอดและชำระเงินกองทุน
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              บิลค่าบำรุงของ {activeUser.id === currentUser.id ? "ตัวฉันเอง" : activeUser.fullName}{" "}
              <span className="text-slate-500 font-semibold text-base">
                ({activeUser.nickname || activeUser.studentId})
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              {currentUser.role === "leader" 
                ? `สิทธิ์หัวหน้าห้อง (${currentUser.classroom}) — สามารถสลับรายชื่อเพื่อแจ้งโอนหรือรับชำระเงินสดแทนเพื่อนในห้องได้`
                : currentUser.role === "treasurer"
                ? "สิทธิ์เหรัญญิก — สามารถสลับดูบิลและบันทึกการชำระเงินของสมาชิกทุกคนในรุ่นได้"
                : "เลือกรอบบิลรายเดือนทางด้านซ้าย เพื่อสแกน QR พร้อมเพย์และอัปโหลดสลิปหลักฐานการโอนเงิน"}
            </p>
          </div>

          {/* Payment Status Summary Pills */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
            <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl px-3.5 py-2.5 text-center">
              <span className="text-xs font-bold text-emerald-700 block">ชำระแล้ว</span>
              <span className="text-lg sm:text-xl font-extrabold text-emerald-800 tabular-nums mt-0.5 block">
                {paidBillsCount} <span className="text-xs font-semibold text-emerald-600">งวด</span>
              </span>
            </div>
            <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl px-3.5 py-2.5 text-center">
              <span className="text-xs font-bold text-amber-700 block">รอตรวจสอบ</span>
              <span className="text-lg sm:text-xl font-extrabold text-amber-800 tabular-nums mt-0.5 block">
                {pendingBillsCount} <span className="text-xs font-semibold text-amber-600">งวด</span>
              </span>
            </div>
            <div className="bg-rose-50/70 border border-rose-200/60 rounded-2xl px-3.5 py-2.5 text-center">
              <span className="text-xs font-bold text-rose-700 block">ค้างชำระ</span>
              <span className="text-lg sm:text-xl font-extrabold text-rose-800 tabular-nums mt-0.5 block">
                {unpaidBillsCount} <span className="text-xs font-semibold text-rose-600">งวด</span>
              </span>
            </div>
          </div>
        </div>

        {/* Sleek Classmate Switcher Bar for Leader / Treasurer */}
        {canSelectClassmate && (
          <div className="bg-slate-50/90 border-t border-slate-200/70 px-5 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <Users size={16} className="text-blue-600 shrink-0" />
              <span>โหมดจัดการบิลแทนเพื่อนร่วมรุ่น:</span>
              {activeUser.id !== currentUser.id && (
                <button
                  type="button"
                  onClick={() => setTargetUserId(currentUser.id)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 underline ml-1"
                >
                  กลับไปที่บิลของฉัน
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
              {currentUser.role === "treasurer" && (
                <div className="flex bg-white p-1 rounded-xl border border-slate-200/80 shadow-2xs">
                  {[
                    { value: "all", label: "ทุกห้อง" },
                    { value: "ห้อง 1", label: "ห้อง 1" },
                    { value: "ห้อง 2", label: "ห้อง 2" }
                  ].map((room) => (
                    <button
                      key={room.value}
                      type="button"
                      onClick={() => {
                        setBillClassroomFilter(room.value);
                        setTargetUserId(currentUser.id);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        billClassroomFilter === room.value
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      {room.label}
                    </button>
                  ))}
                </div>
              )}

              {classmateUsers.length > 0 && (
                <div className="relative shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                    className="w-full sm:w-auto min-w-[260px] md:min-w-[300px] px-3.5 py-2 border border-slate-200 rounded-xl font-bold text-xs bg-white text-slate-800 hover:border-blue-400 focus:outline-none flex items-center justify-between gap-2.5 shadow-2xs transition-all text-left"
                  >
                    <span className="truncate flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      {activeUser.id === currentUser.id 
                        ? `ตัวฉันเอง (${activeUser.fullName})` 
                        : `[${activeUser.classroom || "ไม่ระบุ"}] ${activeUser.fullName} (${activeUser.nickname || "-"})`}
                    </span>
                    <ChevronDown size={15} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isSelectorOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isSelectorOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setIsSelectorOpen(false)}
                      />
                      <div className="absolute right-0 left-0 sm:left-auto sm:w-88 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 overflow-hidden flex flex-col max-h-[380px]">
                        <div className="p-3 border-b border-slate-100 bg-slate-50/70 sticky top-0 z-21">
                          <div className="relative">
                            <Search className="absolute left-3 top-3 text-slate-400" size={14} />
                            <input
                              type="text"
                              autoFocus
                              placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัสนักศึกษา..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full py-2 pl-9 pr-12 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500 placeholder-slate-400 bg-white text-slate-800"
                              onClick={(e) => e.stopPropagation()}
                            />
                            {searchTerm && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSearchTerm("");
                                }}
                                className="absolute right-3 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
                              >
                                ล้าง
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="overflow-y-auto max-h-[300px] py-1 divide-y divide-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetUserId(currentUser.id);
                              setSearchTerm("");
                              setIsSelectorOpen(false);
                            }}
                            className={`w-full text-left px-4 py-3 text-xs transition-all flex items-center justify-between ${
                              targetUserId === currentUser.id 
                                ? "bg-blue-50/80 text-blue-700 font-bold" 
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <span className="truncate">👤 ตัวฉันเอง ({currentUser.fullName})</span>
                            {targetUserId === currentUser.id && <Check size={15} className="text-blue-600 shrink-0" />}
                          </button>

                          {filteredClassmates.filter(u => u.id !== currentUser.id).map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setTargetUserId(u.id);
                                setSearchTerm("");
                                setIsSelectorOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 transition-all flex flex-col gap-0.5 ${
                                targetUserId === u.id 
                                  ? "bg-blue-50/80 text-blue-700 font-bold" 
                                  : "hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold truncate">
                                  {u.fullName} {u.nickname ? `(${u.nickname})` : ""}
                                </span>
                                {targetUserId === u.id && <Check size={15} className="text-blue-600 shrink-0" />}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-sans font-semibold">
                                  {u.classroom || "ไม่ระบุห้อง"}
                                </span>
                                <span>รหัส: {u.studentId}</span>
                              </div>
                            </button>
                          ))}

                          {filteredClassmates.filter(u => u.id !== currentUser.id).length === 0 && (
                            <div className="p-5 text-center text-xs text-slate-400">
                              ไม่พบรายชื่อเพื่อนที่ตรงกับ "{searchTerm}"
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Bill Cycles */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">รอบบิลรายเดือน</h3>
              <p className="text-xs text-slate-500 mt-0.5">เลือกรอบเดือนเพื่อดูรายละเอียดหรือชำระเงิน</p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full tabular-nums">
              {myBills.length} งวด
            </span>
          </div>

          <div className="flex lg:flex-col gap-2.5 overflow-x-auto lg:overflow-y-auto lg:max-h-[600px] pb-2 lg:pb-0 snap-x">
            {myBills.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm w-full bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                ยังไม่มีบิลเรียกเก็บเงินในระบบ
              </div>
            ) : (
              myBills.map((bill) => {
                const isSelected = selectedBill?.id === bill.id;
                const approvedAmt = getApprovedAmt(bill.id);
                const progressPct = bill.status === "paid"
                  ? 100
                  : bill.amount > 0
                  ? Math.min(100, Math.round((approvedAmt / bill.amount) * 100))
                  : 0;

                return (
                  <div
                    key={bill.id}
                    onClick={() => {
                      setSelectedBill(bill);
                      setUploadSuccess(false);
                      setSlipUrl("");
                      setSlipFile(null);
                    }}
                    className={`p-4 rounded-2xl cursor-pointer border transition-all min-w-[250px] lg:min-w-0 snap-start shrink-0 space-y-3 ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/15 shadow-xs"
                        : "border-slate-200/70 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">
                          เดือน{getThaiMonthName(bill.month)} {bill.year}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          ครบกำหนด {new Date(bill.dueDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                        </p>
                      </div>
                      {getStatusBadge(bill)}
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-xs font-semibold text-slate-500">ยอดเรียกเก็บ</span>
                      <span className="text-base font-extrabold text-slate-900 tabular-nums font-mono">
                        ฿{bill.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Mini progress bar for partial or full payments */}
                    {(approvedAmt > 0 || bill.status === "paid") && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-emerald-700">ชำระแล้ว</span>
                          <span className="text-emerald-700 font-mono tabular-nums">
                            ฿{(bill.status === "paid" ? bill.amount : approvedAmt).toLocaleString()} / ฿{bill.amount.toLocaleString()} ({progressPct}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Payment & Slip Upload Workspace */}
        <div className="lg:col-span-8 space-y-6">
          {selectedBill ? (
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/80 shadow-sm space-y-6">
              {/* Selected Bill Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-5 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                      รายละเอียดงวดชำระ
                    </span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      #{selectedBill.id.slice(0, 8)}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 pt-1">
                    รอบเดือน {getThaiMonthName(selectedBill.month)} {selectedBill.year}{" "}
                    <span className="text-blue-600 font-mono tabular-nums">
                      (฿{selectedBill.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })})
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    {getDetailedBillStatus(selectedBill, payments).subText}
                  </p>
                </div>
                <div className="self-start sm:self-center">{getStatusBadge(selectedBill)}</div>
              </div>

              {/* State 1: Paid -> Digital Receipt Display */}
              {selectedBill.status === "paid" ? (
                <div className="bg-gradient-to-b from-emerald-50/60 to-white rounded-3xl p-6 sm:p-8 border border-emerald-200/70 flex flex-col items-center justify-center text-center space-y-5">
                  <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-md shadow-emerald-600/20">
                    <CheckCircle2 size={36} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg sm:text-xl font-extrabold text-emerald-950">ชำระเงินครบถ้วนเรียบร้อยแล้ว</h3>
                    <p className="text-xs sm:text-sm text-emerald-700">
                      เหรัญญิกกองทุนได้ตรวจสอบและอนุมัติใบเสร็จรับเงินดิจิทัลเรียบร้อยแล้ว
                    </p>
                  </div>

                  {/* Digital Receipt Card */}
                  {myPayments.find(p => p.billId === selectedBill.id && p.status === "approved") && (
                    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-sm w-full max-w-md text-left space-y-4">
                      <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3.5">
                        <div className="flex items-center gap-2">
                          <Receipt size={18} className="text-emerald-600" />
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Digital Receipt</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg tabular-nums">
                          {myPayments.find(p => p.billId === selectedBill.id && p.status === "approved")?.receiptNumber || "APPROVED"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-2.5 text-xs sm:text-sm">
                        <span className="text-slate-500">ชื่อสมาชิก:</span>
                        <span className="text-slate-900 font-bold text-right">{activeUser.fullName}</span>

                        <span className="text-slate-500">รหัสประจำตัว:</span>
                        <span className="text-slate-800 font-mono tabular-nums text-right">{activeUser.studentId}</span>

                        <span className="text-slate-500">ห้องเรียน:</span>
                        <span className="text-slate-800 font-semibold text-right">{activeUser.classroom || "-"}</span>

                        <span className="text-slate-500">ยอดชำระสุทธิ:</span>
                        <span className="text-emerald-700 font-extrabold font-mono tabular-nums text-right">
                          ฿{selectedBill.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </span>

                        <span className="text-slate-500">วันที่อนุมัติ:</span>
                        <span className="text-slate-800 tabular-nums text-right">
                          {new Date(myPayments.find(p => p.billId === selectedBill.id && p.status === "approved")?.reviewedAt || "").toLocaleDateString("th-TH", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedBill.status === "pending_review" || uploadSuccess ? (
                /* State 2: Pending Review */
                <div className="bg-amber-50/50 rounded-3xl p-6 sm:p-8 border border-amber-200/80 flex flex-col items-center justify-center text-center space-y-5">
                  <div className="bg-amber-500 text-white p-4 rounded-2xl shadow-md shadow-amber-500/20 animate-pulse">
                    <Clock size={36} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg sm:text-xl font-extrabold text-amber-950">
                      {isCashPending ? "ส่งรายการชำระเงินสดเรียบร้อยแล้ว" : "ส่งสลิปโอนเงินเรียบร้อยแล้ว"}
                    </h3>
                    <p className="text-xs sm:text-sm text-amber-800 max-w-md leading-relaxed">
                      {isCashPending 
                        ? "อยู่ระหว่างรอเหรัญญิกตรวจสอบและกดยืนยันรับเงินสดเข้าระบบกองทุน" 
                        : "อยู่ระหว่างรอเหรัญญิกตรวจสอบความถูกต้องของสลิปและยอดโอนเงิน"}
                    </p>
                  </div>

                  {pendingPayment && (
                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200/70 text-xs sm:text-sm text-left w-full max-w-sm space-y-2.5 shadow-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>ช่องทางการชำระ:</span>
                        <span className="font-bold text-slate-800">{isCashPending ? "💵 ชำระด้วยเงินสด" : "🏦 โอนผ่าน QR พร้อมเพย์"}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>จำนวนเงินที่แจ้งชำระ:</span>
                        <span className="font-mono font-extrabold text-slate-900 tabular-nums">
                          ฿{pendingPayment.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {pendingPayment.note && (
                        <div className="border-t border-slate-100 pt-2 text-xs text-slate-600">
                          <span className="font-bold">หมายเหตุ:</span> {pendingPayment.note}
                        </div>
                      )}
                    </div>
                  )}

                  {displaySlipUrl && displaySlipUrl !== "cash" && (
                    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-xs max-w-xs bg-white p-2">
                      <img src={displaySlipUrl} alt="Submitted Slip" className="max-h-56 object-contain rounded-xl mx-auto" referrerPolicy="no-referrer" />
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={handleCancelClick}
                    className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold py-2.5 px-5 rounded-xl text-xs sm:text-sm transition-all active:scale-95 flex items-center gap-2 shadow-2xs"
                  >
                    <RefreshCw size={15} className={isCancelling ? "animate-spin" : ""} />
                    {isCancelling ? "กำลังยกเลิกรายการ..." : "ยกเลิกคำขอนี้ / ส่งหลักฐานใหม่"}
                  </button>
                </div>
              ) : (
                /* State 3: Unpaid -> Segmented Toggle + PromptPay QR + Slip Uploader */
                <div className="space-y-6">
                  {/* Segmented Toggle: Transfer vs Cash */}
                  <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod("transfer");
                        setSlipUrl("");
                        setSlipFile(null);
                      }}
                      className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                        paymentMethod === "transfer"
                          ? "bg-white text-blue-700 shadow-sm border border-slate-200/60"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <QrCode size={16} />
                      โอนเงินผ่าน QR พร้อมเพย์
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod("cash");
                        setSlipUrl("");
                        setSlipFile(null);
                      }}
                      className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                        paymentMethod === "cash"
                          ? "bg-white text-emerald-700 shadow-sm border border-slate-200/60"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Banknote size={16} />
                      ชำระด้วยเงินสด
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    {/* Left Panel: Authentic PromptPay QR Card or Cash Instructions */}
                    {paymentMethod === "cash" ? (
                      <div className="bg-gradient-to-br from-emerald-50/90 to-teal-50/40 rounded-3xl p-6 border border-emerald-200/80 space-y-4">
                        <div className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3.5 py-1 rounded-full font-bold text-xs">
                          <Banknote size={14} /> ชำระด้วยเงินสด
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-base">
                          ชำระเงินสดกับหัวหน้าห้องหรือเหรัญญิก
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                          เตรียมเงินสดจำนวน{" "}
                          <strong className="text-emerald-700 font-mono font-extrabold tabular-nums">
                            ฿{(customAmount || (selectedBill.amount - getApprovedAmt(selectedBill.id))).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </strong>{" "}
                          ชำระแก่เหรัญญิกหรือหัวหน้าห้อง พร้อมกดส่งคำขอทางด้านขวาเพื่อบันทึกสถานะ
                        </p>
                        <div className="bg-white p-4 rounded-2xl border border-emerald-200/60 text-xs text-slate-600 space-y-2">
                          <p className="font-bold text-slate-800">📌 ขั้นตอนการชำระด้วยเงินสด:</p>
                          <p>1. ระบุยอดเงินสดที่ต้องการจ่ายในช่องด้านขวา</p>
                          <p>2. ระบุหมายเหตุ เช่น จ่ายที่ใคร หรือเวลาใด</p>
                          <p>3. กดปุ่มยืนยันแจ้งชำระเงินสดเพื่อให้เหรัญญิกอนุมัติ</p>
                        </div>
                      </div>
                    ) : (
                      /* Authentic PromptPay QR Card */
                      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
                        {/* Thai PromptPay Dark Navy Banner */}
                        <div className="bg-[#002d62] text-white px-5 py-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <QrCode size={18} className="text-sky-300" />
                            <span className="font-extrabold text-sm tracking-wide">THAI QR PAYMENT</span>
                          </div>
                          <span className="text-xs font-bold bg-white/15 px-2.5 py-0.5 rounded-full">
                            {settings.bankName || "PromptPay"}
                          </span>
                        </div>

                        <div className="p-5 flex flex-col items-center text-center space-y-4 bg-slate-50/40">
                          {((!settings.bankName || settings.bankName.includes("พร้อมเพย์") || settings.bankName.toLowerCase().includes("prompt")) || settings.promptpayQrUrl) ? (
                            <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200/80">
                              <img 
                                src={getPromptPayQR(customAmount || (selectedBill.amount - getApprovedAmt(selectedBill.id)))} 
                                alt="PromptPay QR Code" 
                                className="w-44 h-44 object-contain mx-auto"
                              />
                            </div>
                          ) : (
                            <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-5 rounded-2xl w-full text-left space-y-3 shadow-sm relative overflow-hidden">
                              <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4 pointer-events-none">
                                <DollarSign size={110} />
                              </div>
                              <div>
                                <p className="text-xs text-blue-200 uppercase font-bold">ธนาคารรับโอน</p>
                                <p className="font-bold text-base mt-0.5">{settings.bankName}</p>
                              </div>
                              <div>
                                <p className="text-xs text-blue-200 uppercase font-bold">ชื่อบัญชี</p>
                                <p className="font-semibold text-sm truncate">{settings.promptpayName}</p>
                              </div>
                            </div>
                          )}

                          <div className="w-full space-y-2.5">
                            <div>
                              <p className="text-xs text-slate-500 font-semibold">ชื่อบัญชีรับโอน</p>
                              <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">{settings.promptpayName}</h4>
                            </div>

                            {/* One-click Copy PromptPay Number */}
                            <div className="flex items-center justify-between gap-2 bg-white border border-slate-200/90 p-2.5 pl-3.5 rounded-2xl w-full shadow-2xs">
                              <div className="text-left min-w-0 flex-1">
                                <p className="text-xs text-slate-500 font-semibold">เลขบัญชี / พร้อมเพย์</p>
                                <p className="text-sm font-mono font-extrabold text-slate-900 truncate tabular-nums">
                                  {settings.promptpayNumber}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(settings.promptpayNumber);
                                  setCopiedText(true);
                                  setTimeout(() => setCopiedText(false), 2000);
                                }}
                                className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold shrink-0 ${
                                  copiedText 
                                    ? "bg-emerald-600 text-white shadow-xs" 
                                    : "bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 active:scale-95"
                                }`}
                                title="คัดลอกเลขบัญชี"
                              >
                                {copiedText ? (
                                  <>
                                    <Check size={14} />
                                    <span>คัดลอกแล้ว</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={14} />
                                    <span>คัดลอก</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {getApprovedAmt(selectedBill.id) > 0 && (
                              <div className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200/60 px-3 py-2 rounded-xl tabular-nums">
                                ชำระแล้วบางส่วน: ฿{getApprovedAmt(selectedBill.id).toLocaleString()} / ฿{selectedBill.amount.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Right Panel: Form & Slip Upload Zone */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <label className="font-bold text-slate-700">ยอดเงินที่ชำระในครั้งนี้ (บาท)</label>
                          <span className="text-slate-500 font-semibold tabular-nums">
                            คงค้าง:{" "}
                            <span className="font-mono font-extrabold text-rose-600">
                              ฿{(selectedBill.amount - getApprovedAmt(selectedBill.id)).toLocaleString()}
                            </span>
                          </span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-4 top-3.5 text-slate-400 text-sm font-bold font-mono">฿</span>
                          <input
                            type="number"
                            min={1}
                            max={selectedBill.amount - getApprovedAmt(selectedBill.id)}
                            placeholder={`ระบุยอดเงิน เช่น ${selectedBill.amount - getApprovedAmt(selectedBill.id)}`}
                            value={customAmount || ""}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const maxLimit = selectedBill.amount - getApprovedAmt(selectedBill.id);
                              if (val > maxLimit) {
                                setCustomAmount(maxLimit);
                              } else {
                                setCustomAmount(val);
                              }
                            }}
                            className="w-full text-sm p-3.5 pl-9 border border-slate-200 rounded-2xl focus:border-blue-600 focus:ring-3 focus:ring-blue-500/10 focus:outline-none font-mono font-extrabold text-slate-900 bg-white tabular-nums"
                            required
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          รองรับการแบ่งจ่ายบางส่วน ระบบจะคำนวณยอดคงเหลือให้อัตโนมัติ
                        </p>
                      </div>

                      {paymentMethod === "transfer" && (
                        <>
                          {slipUrl ? (
                            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 shadow-2xs">
                              <img src={slipUrl} alt="Slip Upload Preview" className="w-full h-48 object-contain rounded-xl bg-white" />
                              <button 
                                type="button"
                                onClick={() => {
                                  setSlipUrl("");
                                  setSlipFile(null);
                                }}
                                className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl px-3 py-1.5 transition-all text-xs font-bold shadow-sm"
                              >
                                เปลี่ยนรูปสลิป
                              </button>
                            </div>
                          ) : (
                            <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 transition-all text-center flex flex-col items-center justify-center bg-slate-50/70 hover:bg-blue-50/30 cursor-pointer relative group">
                              <input 
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                required
                              />
                              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                                <UploadCloud className="text-blue-600" size={24} />
                              </div>
                              <p className="text-xs sm:text-sm font-bold text-slate-800">
                                แตะเพื่อเลือกรูปสลิป หรือลากไฟล์มาวางที่นี่
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                รองรับไฟล์ JPG, PNG ระบบย่อขนาดภาพให้อัตโนมัติ
                              </p>
                            </div>
                          )}

                          {!slipUrl && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-slate-500">ตัวเลือกสลิปจำลอง (สำหรับทดสอบระบบ):</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button 
                                  type="button"
                                  onClick={() => selectMockSlip(0)}
                                  className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-3 py-2 rounded-xl transition-all"
                                >
                                  ใช้สลิปจำลอง 1
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => selectMockSlip(1)}
                                  className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-3 py-2 rounded-xl transition-all"
                                >
                                  ใช้สลิปจำลอง 2
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          {paymentMethod === "cash" ? "บันทึกการรับเงินสด (เช่น จ่ายตอนพักเที่ยง)" : "บันทึกเพิ่มเติมถึงเหรัญญิก (ถ้ามี)"}
                        </label>
                        <input 
                          type="text" 
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder={paymentMethod === "cash" ? "ระบุรายละเอียดการชำระเงินสด..." : "เช่น โอนจากบัญชีคุณแม่ เวลา 14:30 น."}
                          className="w-full text-xs sm:text-sm p-3.5 border border-slate-200 rounded-2xl focus:border-blue-600 focus:outline-none bg-white text-slate-800"
                        />
                      </div>

                      <button 
                        type="submit"
                        disabled={isUploading || (paymentMethod === "transfer" && !slipUrl)}
                        className={`w-full font-bold rounded-2xl text-xs sm:text-sm py-3.5 px-5 text-white transition-all flex items-center justify-center gap-2 shadow-md ${
                          isUploading || (paymentMethod === "transfer" && !slipUrl)
                            ? "bg-slate-300 cursor-not-allowed shadow-none"
                            : paymentMethod === "cash"
                            ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/15"
                            : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/15"
                        }`}
                      >
                        <ShieldCheck size={18} />
                        {isUploading 
                          ? "กำลังบันทึกข้อมูล..." 
                          : paymentMethod === "cash"
                            ? "ยืนยันการแจ้งชำระด้วยเงินสด"
                            : "ส่งสลิปให้เหรัญญิกตรวจสอบ"
                        }
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/80 shadow-sm text-center text-slate-400 text-sm">
              กรุณาเลือกรอบบิลทางด้านซ้ายเพื่อดูรายละเอียดการชำระเงิน
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
