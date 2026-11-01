import React, { useState } from "react";
import {
  AlertCircle,
  KeyRound,
  User as UserIcon,
  RefreshCw,
  ChevronLeft,
  CheckCircle2,
  Mail,
  Sparkles,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { User } from "../types";
import { safeParseJson } from "../services/apiClient";

interface LoginViewProps {
  users: User[];
  onLogin: (studentId: string, passwordStr: string) => Promise<User>;
  onDirectLogin?: (user: User) => void;
  onBackToPreview?: () => void;
}

export default function LoginView({
  onLogin,
  onDirectLogin,
  onBackToPreview,
}: LoginViewProps) {
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Email login tab states
  const [activeTab, setActiveTab] = useState<"password" | "email">("password");
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  // Forgot password flow states
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotStudentId, setForgotStudentId] = useState("");
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState<string | null>(null);
  const [forgotErrorMsg, setForgotErrorMsg] = useState<string | null>(null);
  const [isSendingForgot, setIsSendingForgot] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !password) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await onLogin(studentId.trim(), password);
    } catch (err: any) {
      setError(err.message || "รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) {
      setEmailError("กรุณากรอกอีเมลหรือช่องทางติดต่อของท่าน");
      return;
    }

    setEmailError(null);
    setIsEmailLoading(true);
    try {
      const res = await fetch("/api/auth/email-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      const data = await safeParseJson(res);
      if (data.error) {
        throw new Error(String(data.error));
      }
      if (!res.ok) {
        throw new Error(String(data.error || "ไม่สามารถเข้าสู่ระบบด้วยอีเมลนี้ได้"));
      }
      if (onDirectLogin) {
        onDirectLogin(data.user as User);
      }
    } catch (err: any) {
      setEmailError(err.message || "เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วยอีเมล");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotSuccessMsg(null);
    setForgotErrorMsg(null);

    if (!forgotStudentId) {
      setForgotErrorMsg("กรุณาระบุเลข 3 ตัวท้ายของรหัสนักศึกษา หรือรหัสเต็ม 12 หลัก");
      return;
    }

    setIsSendingForgot(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: forgotStudentId.trim() }),
      });
      const data = await safeParseJson(res);
      if (data.error) {
        throw new Error(String(data.error));
      }
      if (!res.ok) {
        throw new Error(String(data.error || "ไม่สามารถทำรายการได้"));
      }
      setForgotSuccessMsg(
        String(data.message || "ส่งคำขอรีเซ็ตรหัสผ่านไปยังเหรัญญิกเรียบร้อยแล้ว!")
      );
      setForgotStudentId("");
    } catch (err: any) {
      setForgotErrorMsg(err.message || "เกิดข้อผิดพลาด กรุณาตรวจสอบรหัสนักศึกษาอีกครั้ง");
    } finally {
      setIsSendingForgot(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] relative flex flex-col justify-center items-center p-4 sm:p-6 font-sans overflow-hidden">
      {/* Subtle Ambient Radial Glows */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[360px] bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-sky-400/10 rounded-full blur-3xl" />

      {/* Top Back to Public Portal Bar */}
      {onBackToPreview && (
        <div className="w-full max-w-md mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToPreview}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 bg-white/90 hover:bg-white px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-2xs transition-all cursor-pointer"
          >
            <ChevronLeft size={15} />
            <span>กลับหน้าสรุปข้อมูลกองทุน (สาธารณะ)</span>
          </button>

          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <ShieldCheck size={14} className="text-emerald-600" /> TNS06 Portal
          </span>
        </div>
      )}

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 md:p-9 border border-slate-200/80 shadow-xl shadow-slate-900/5 space-y-6 animate-fade-in">
        {!isForgotMode ? (
          <>
            {/* Brand Header */}
            <div className="text-center space-y-2.5">
              <div className="mx-auto w-16 h-16 rounded-2xl p-1.5 bg-white border border-slate-200/90 shadow-md shadow-blue-950/5 flex items-center justify-center overflow-hidden">
                <img
                  src="/logo.svg"
                  alt="TNS Logo"
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  เข้าสู่ระบบสมาชิกกองทุน
                </h1>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  ระบบบริหารสวัสดิการและการเงินโปร่งใส TNS06
                </p>
              </div>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="grid grid-cols-2 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("password");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "password"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <KeyRound size={14} className={activeTab === "password" ? "text-blue-600" : ""} />
                <span>รหัสนักศึกษา</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("email");
                  setEmailError(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "email"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Mail size={14} className={activeTab === "email" ? "text-blue-600" : ""} />
                <span>อีเมล / ช่องทางติดต่อ</span>
              </button>
            </div>

            {activeTab === "password" ? (
              <>
                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 animate-fade-in">
                    <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                    <div>
                      <span className="font-bold block text-rose-900">เข้าสู่ระบบไม่สำเร็จ</span>
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* Student ID Input */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <UserIcon size={14} className="text-slate-400" />
                        รหัสนักศึกษา
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        3 ตัวท้าย หรือ 12 หลัก
                      </span>
                    </label>
                    <input
                      type="text"
                      maxLength={12}
                      placeholder="กรอกเลข 3 ตัวท้าย เช่น 001 หรือรหัสเต็ม"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 transition-all"
                      required
                    />
                  </div>

                  {/* Password Input with Show/Hide toggle */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <KeyRound size={14} className="text-slate-400" />
                        <span>รหัสผ่าน</span>
                        <span className="text-[10px] text-blue-700 font-bold bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded-md">
                          ค่าเริ่มต้น 123456
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotMode(true);
                          setForgotSuccessMsg(null);
                          setForgotErrorMsg(null);
                          setForgotStudentId("");
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700 font-bold hover:underline transition-all cursor-pointer"
                      >
                        ลืมรหัสผ่าน?
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="กรอกรหัสผ่านของคุณ"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-xl bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                        tabIndex={-1}
                        title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-blue-600/20 text-xs sm:text-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-60 cursor-pointer"
                  >
                    <span>{isLoading ? "กำลังตรวจสอบข้อมูล..." : "เข้าสู่ระบบ"}</span>
                    {!isLoading && <ArrowRight size={16} />}
                  </button>
                </form>
              </>
            ) : (
              <>
                {emailError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 animate-fade-in">
                    <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                    <div>
                      <span className="font-bold block text-rose-900">เข้าสู่ระบบไม่ได้</span>
                      <span>{emailError}</span>
                    </div>
                  </div>
                )}

                <form onSubmit={handleEmailFormSubmit} className="space-y-4">
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200/70 rounded-2xl text-xs text-slate-700 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-blue-800">
                      <Sparkles size={14} className="text-blue-600 shrink-0" />
                      <span>เข้าสู่ระบบด้วยอีเมลที่ผูกไว้กับโปรไฟล์</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      ระบุอีเมลมหาวิทยาลัย (@rmutsvmail.com) หรือช่องทางติดต่อที่ท่านบันทึกไว้ในระบบเพื่อเข้าใช้งานได้ทันที
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Mail size={14} className="text-slate-400" />
                      <span>อีเมลมหาวิทยาลัย หรือช่องทางติดต่อ</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น user@rmutsvmail.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 transition-all"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isEmailLoading}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 text-xs sm:text-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-60 cursor-pointer"
                  >
                    <span>{isEmailLoading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบด้วยอีเมล"}</span>
                    {!isEmailLoading && <ArrowRight size={16} />}
                  </button>
                </form>
              </>
            )}

            {/* Footer Info */}
            <div className="pt-4 border-t border-slate-100 text-center space-y-2">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                หากเข้าสู่ระบบครั้งแรก ให้ใช้รหัสผ่านมาตรฐาน{" "}
                <span className="font-mono font-bold text-slate-600">123456</span>{" "}
                และสามารถเปลี่ยนรหัสผ่านใหม่ได้ในหน้าข้อมูลส่วนตัว
              </p>
            </div>
          </>
        ) : (
          /* Forgot Password Mode */
          <div className="space-y-5 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 bg-amber-50 border border-amber-200/80 rounded-2xl text-amber-600 flex items-center justify-center">
                <RefreshCw size={24} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  แจ้งขอรีเซ็ตรหัสผ่าน
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  ส่งคำขอให้เหรัญญิกรีเซ็ตรหัสผ่านกลับเป็นค่าเริ่มต้น (123456)
                </p>
              </div>
            </div>

            {forgotSuccessMsg && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-start gap-2.5">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <span className="font-bold block text-emerald-900">ส่งคำขอเรียบร้อยแล้ว</span>
                  <span>{forgotSuccessMsg}</span>
                </div>
              </div>
            )}

            {forgotErrorMsg && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <span className="font-bold block text-rose-900">ทำรายการไม่สำเร็จ</span>
                  <span>{forgotErrorMsg}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <UserIcon size={14} className="text-slate-400" />
                  <span>รหัสนักศึกษาของคุณ</span>
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="กรอกเลข 3 ตัวท้าย (เช่น 002) หรือรหัสเต็ม 12 หลัก"
                  value={forgotStudentId}
                  onChange={(e) => setForgotStudentId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus:bg-white font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 transition-all"
                  required
                />
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={isSendingForgot}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-amber-500/15 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSendingForgot ? "กำลังส่งคำขอ..." : "ส่งคำขอรีเซ็ตรหัสผ่าน"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsForgotMode(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ChevronLeft size={15} />
                  <span>กลับไปหน้าเข้าสู่ระบบ</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
