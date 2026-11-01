/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  User as UserIcon, 
  Facebook, 
  Phone, 
  Award, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Save,
  CreditCard,
  History,
  KeyRound,
  ShieldCheck,
  GraduationCap,
  Edit3
} from "lucide-react";
import { User, MonthlyBill } from "../types";

interface ProfilePanelProps {
  currentUser: User;
  monthlyBills: MonthlyBill[];
  onUpdateMember: (
    targetUserId: string, 
    role?: string, 
    position?: string, 
    isActive?: boolean,
    fullName?: string,
    nickname?: string,
    email?: string,
    phone?: string,
    classroom?: string
  ) => Promise<any>;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<any>;
}

export default function ProfilePanel({
  currentUser,
  monthlyBills,
  onUpdateMember,
  onChangePassword
}: ProfilePanelProps) {
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [nickname, setNickname] = useState(currentUser.nickname);
  const [classroom, setClassroom] = useState(currentUser.classroom || "ห้อง 1");
  const [phone, setPhone] = useState(currentUser.phone || "");
  const [email, setEmail] = useState(currentUser.email || "");

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPwd, setIsChangingPwd] = useState(false);
  const [pwdSuccessMsg, setPwdSuccessMsg] = useState("");
  const [pwdErrorMsg, setPwdErrorMsg] = useState("");

  useEffect(() => {
    setFullName(currentUser.fullName);
    setNickname(currentUser.nickname);
    setClassroom(currentUser.classroom || "ห้อง 1");
    setPhone(currentUser.phone || "");
    setEmail(currentUser.email || "");
    setSuccessMsg("");
    setErrorMsg("");
  }, [currentUser]);

  // Calculate bill stats for the current user
  const userBills = monthlyBills.filter(b => b.userId === currentUser.id);
  const paidCount = userBills.filter(b => b.status === "paid").length;
  const pendingCount = userBills.filter(b => b.status === "pending_review").length;
  const unpaidCount = userBills.filter(b => b.status === "pending").length;
  const totalAmountOwed = userBills.reduce((acc, curr) => acc + (curr.status !== "paid" ? curr.amount : 0), 0);

  const getThaiMonthName = (monthNum: number) => {
    const months = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    return months[monthNum - 1] || "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !nickname.trim()) {
      setErrorMsg("กรุณากรอกชื่อจริงและชื่อเล่นด้วยค่ะ");
      return;
    }
    
    setIsSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      await onUpdateMember(
        currentUser.id,
        undefined,
        undefined,
        undefined,
        fullName,
        nickname,
        email,
        phone,
        classroom
      );
      setSuccessMsg("อัปเดตข้อมูลส่วนตัวของคุณเรียบร้อยแล้วค่ะ! 🎉");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdSuccessMsg("");
    setPwdErrorMsg("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPwdErrorMsg("กรุณากรอกข้อมูลให้ครบทุกช่องค่ะ");
      return;
    }

    if (newPassword.length < 6) {
      setPwdErrorMsg("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษรค่ะ");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdErrorMsg("รหัสผ่านใหม่และยืนยันรหัสผ่านใหม่ไม่ตรงกันค่ะ");
      return;
    }

    setIsChangingPwd(true);
    try {
      await onChangePassword(oldPassword, newPassword);
      setPwdSuccessMsg("เปลี่ยนรหัสผ่านสำเร็จแล้วค่ะ! 🔑");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwdErrorMsg(err.message || "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน");
    } finally {
      setIsChangingPwd(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Clean Modern Profile Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-600/20 flex items-center justify-center font-extrabold text-2xl shrink-0">
            {(currentUser.nickname || currentUser.fullName || "U").slice(0, 2)}
          </div>
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200/60 font-bold text-xs px-3 py-1 rounded-full">
              <UserIcon size={13} /> บัญชีผู้ใช้งานและประวัติการชำระเงิน
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {currentUser.fullName} <span className="text-slate-500 font-semibold">({currentUser.nickname})</span>
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap size={15} className="text-blue-600" /> {currentUser.classroom || "ไม่ระบุห้อง"}
              </span>
              <span>•</span>
              <span className="font-mono tabular-nums">รหัสประจำตัว: {currentUser.studentId}</span>
            </div>
          </div>
        </div>

        {/* Role & Status Badge Box */}
        <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/70 flex items-center gap-3.5 shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs text-blue-600">
            <Award size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">ระดับสิทธิ์ผู้ใช้งาน</p>
            <p className="text-sm font-extrabold text-slate-900 mt-0.5">
              {currentUser.role === "treasurer" 
                ? "🔴 เหรัญญิกกองทุน" 
                : currentUser.role === "committee" 
                  ? "⭐ คณะกรรมการรุ่น" 
                  : currentUser.role === "leader"
                    ? "🎓 หัวหน้าห้องเรียน"
                    : "👥 สมาชิกกองทุน"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentUser.position || "นักศึกษาชั้นปีที่ 3"}
            </p>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid: Forms & Payment Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Edit Profile & Change Password */}
        <div className="lg:col-span-7 space-y-6">
          {/* Edit Profile Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Edit3 size={18} className="text-blue-600" /> แก้ไขข้อมูลส่วนตัวและการติดต่อ
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                อัปเดตชื่อ เบอร์โทรศัพท์ และช่องทางติดต่อเพื่อให้เหรัญญิกประสานงานได้สะดวก
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs sm:text-sm">
              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-2xl flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-2xl flex items-center gap-2">
                  <AlertCircle size={18} className="text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700">ชื่อจริง - นามสกุล</label>
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-medium text-slate-900 transition-all"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700">ชื่อเล่น</label>
                  <input 
                    type="text" 
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-medium text-slate-900 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700">
                    ห้องเรียน {currentUser.role !== "treasurer" && "(เฉพาะเหรัญญิกแก้ไขได้)"}
                  </label>
                  {currentUser.role !== "treasurer" ? (
                    <div className="w-full p-3 bg-slate-100 border border-slate-200 text-slate-500 rounded-2xl font-bold cursor-not-allowed">
                      {classroom}
                    </div>
                  ) : (
                    <select 
                      value={classroom}
                      onChange={(e) => setClassroom(e.target.value)}
                      className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-bold text-slate-900 transition-all"
                    >
                      <option value="ห้อง 1">ห้อง 1</option>
                      <option value="ห้อง 2">ห้อง 2</option>
                    </select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700 flex items-center gap-1.5">
                    <Phone size={14} className="text-slate-500" /> เบอร์โทรศัพท์ติดต่อ
                  </label>
                  <input 
                    type="text" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="เช่น 0891234567"
                    className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-mono font-medium text-slate-900 tabular-nums transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 flex items-center gap-1.5">
                  <Facebook size={15} className="text-blue-600" /> ลิงก์ Facebook หรือช่องทางติดต่อหลัก
                </label>
                <input 
                  type="text" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="เช่น facebook.com/username หรือ ชื่อบัญชี Facebook"
                  className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-medium text-slate-900 transition-all"
                  required
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-2xl transition-all shadow-sm shadow-blue-600/15 flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                >
                  <Save size={16} />
                  {isSaving ? "กำลังบันทึกข้อมูล..." : "บันทึกข้อมูลส่วนตัว"}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <KeyRound size={18} className="text-slate-800" /> เปลี่ยนรหัสผ่านเข้าสู่ระบบ
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                แนะนำให้เปลี่ยนรหัสผ่านเริ่มต้น (123456) เป็นรหัสผ่านส่วนตัวเพื่อความปลอดภัยของบัญชี
              </p>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4 text-xs sm:text-sm">
              {pwdSuccessMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-2xl flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                  <span>{pwdSuccessMsg}</span>
                </div>
              )}

              {pwdErrorMsg && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-2xl flex items-center gap-2">
                  <AlertCircle size={18} className="text-rose-600 shrink-0" />
                  <span>{pwdErrorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">รหัสผ่านปัจจุบัน</label>
                <input 
                  type="password" 
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="ป้อนรหัสผ่านปัจจุบันของคุณ"
                  className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-mono font-medium text-slate-900 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700">รหัสผ่านใหม่</label>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-mono font-medium text-slate-900 transition-all"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700">ยืนยันรหัสผ่านใหม่</label>
                  <input 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="ป้อนรหัสผ่านใหม่อีกครั้ง"
                    className="w-full p-3 bg-slate-50/70 border border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none font-mono font-medium text-slate-900 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  disabled={isChangingPwd}
                  className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-3 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
                >
                  <ShieldCheck size={16} />
                  {isChangingPwd ? "กำลังเปลี่ยนรหัสผ่าน..." : "อัปเดตรหัสผ่านใหม่"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Personal Payment Summary & History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Statistics Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <CreditCard size={18} className="text-blue-600" /> สรุปสถานะการชำระเงินของฉัน
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl text-center space-y-1">
                <p className="text-xs text-slate-500 font-bold">รอบบิลทั้งหมด</p>
                <p className="text-xl font-extrabold font-mono text-slate-900 tabular-nums">
                  {userBills.length} <span className="text-xs font-semibold text-slate-500">งวด</span>
                </p>
              </div>

              <div className="p-4 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl text-center space-y-1">
                <p className="text-xs text-emerald-700 font-bold">ชำระเรียบร้อย</p>
                <p className="text-xl font-extrabold font-mono text-emerald-700 tabular-nums">
                  {paidCount} <span className="text-xs font-semibold text-emerald-600">งวด</span>
                </p>
              </div>

              <div className="p-4 bg-amber-50/70 border border-amber-200/60 rounded-2xl text-center space-y-1">
                <p className="text-xs text-amber-700 font-bold">รอตรวจสอบสลิป</p>
                <p className="text-xl font-extrabold font-mono text-amber-700 tabular-nums">
                  {pendingCount} <span className="text-xs font-semibold text-amber-600">งวด</span>
                </p>
              </div>

              <div className="p-4 bg-rose-50/70 border border-rose-200/60 rounded-2xl text-center space-y-1">
                <p className="text-xs text-rose-700 font-bold">ค้างชำระ</p>
                <p className="text-xl font-extrabold font-mono text-rose-700 tabular-nums">
                  {unpaidCount} <span className="text-xs font-semibold text-rose-600">งวด</span>
                </p>
              </div>
            </div>

            {totalAmountOwed > 0 ? (
              <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-2xl text-rose-800 flex items-center justify-between text-xs sm:text-sm font-bold">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-rose-600 shrink-0" />
                  <span>ยอดค้างชำระสุทธิ:</span>
                </div>
                <span className="font-mono text-base font-extrabold tabular-nums">
                  ฿{totalAmountOwed.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-emerald-800 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold">
                <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                <span>ไม่มียอดค้างชำระในขณะนี้ ขอบคุณที่ร่วมสมทบทุนตรงเวลาค่ะ!</span>
              </div>
            )}
          </div>

          {/* Personal Bill History List */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <History size={18} className="text-blue-600" /> ประวัติรอบบิลรายเดือนของฉัน
              </h3>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full tabular-nums">
                {userBills.length} รายการ
              </span>
            </div>

            {userBills.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs sm:text-sm bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                ไม่พบประวัติรอบบิลของคุณในขณะนี้
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {userBills.map((bill) => (
                  <div 
                    key={bill.id} 
                    className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-center justify-between transition-all ${
                      bill.status === "paid" 
                        ? "bg-emerald-50/30 border-emerald-200/70" 
                        : bill.status === "pending_review"
                          ? "bg-amber-50/40 border-amber-200/70"
                          : "bg-rose-50/30 border-rose-200/70"
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="font-bold text-slate-900">
                        เดือน{getThaiMonthName(bill.month)} {bill.year}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        กำหนดชำระ: <span className="font-mono">{new Date(bill.dueDate).toLocaleDateString("th-TH")}</span>
                      </p>
                    </div>

                    <div className="text-right space-y-1.5">
                      <p className="font-extrabold font-mono text-slate-900 tabular-nums">
                        ฿{bill.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </p>
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        bill.status === "paid" 
                          ? "bg-emerald-100/80 text-emerald-800" 
                          : bill.status === "pending_review"
                            ? "bg-amber-100/80 text-amber-800"
                            : "bg-rose-100/80 text-rose-800"
                      }`}>
                        {bill.status === "paid" && (
                          <>
                            <CheckCircle size={12} />
                            <span>ชำระแล้ว</span>
                          </>
                        )}
                        {bill.status === "pending_review" && (
                          <>
                            <Clock size={12} />
                            <span>รอตรวจสอบ</span>
                          </>
                        )}
                        {bill.status === "pending" && (
                          <>
                            <AlertCircle size={12} />
                            <span>ค้างชำระ</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
