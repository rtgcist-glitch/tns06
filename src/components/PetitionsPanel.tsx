/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Inbox, 
  Send, 
  HelpCircle, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  MessageSquare, 
  User as UserIcon, 
  UserX,
  FileText,
  Plus,
  X,
  CornerDownRight,
  ShieldAlert,
  Sparkles,
  Check
} from "lucide-react";
import { User } from "../types";

export interface Petition {
  id: string;
  title: string;
  category: "extension" | "suggestion" | "system" | "other" | string;
  content: string;
  status: "pending" | "investigating" | "resolved" | "rejected" | string;
  isAnonymous: boolean;
  submittedBy: string;
  response?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

interface PetitionsPanelProps {
  currentUser: User;
  users: User[];
  petitions: Petition[];
  onSubmitPetition: (title: string, category: string, content: string, isAnonymous: boolean) => Promise<any>;
  onRespondPetition: (petitionId: string, status: string, response: string) => Promise<any>;
}

export default function PetitionsPanel({
  currentUser,
  users,
  petitions = [],
  onSubmitPetition,
  onRespondPetition
}: PetitionsPanelProps) {
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Submit Form States
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("extension");
  const [content, setContent] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Respond Form States
  const [respondingToId, setRespondingToId] = useState<string | null>(null);
  const [adminResponse, setAdminResponse] = useState<string>("");
  const [adminStatus, setAdminStatus] = useState<string>("resolved");
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [respondError, setRespondError] = useState<string | null>(null);

  const isTreasurer = currentUser.role === "treasurer";
  const isCommittee = currentUser.role === "committee";

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "extension": return "ขอผ่อนผันการชำระเงิน";
      case "suggestion": return "ข้อเสนอแนะกิจกรรม";
      case "system": return "แจ้งปัญหาการใช้งานระบบ";
      default: return "เรื่องอื่นๆ";
    }
  };

  const getCategoryBadgeClass = (cat: string) => {
    switch (cat) {
      case "extension": return "bg-amber-50 text-amber-700 border border-amber-200/70";
      case "suggestion": return "bg-emerald-50 text-emerald-700 border border-emerald-200/70";
      case "system": return "bg-indigo-50 text-indigo-700 border border-indigo-200/70";
      default: return "bg-slate-100 text-slate-700 border border-slate-200/70";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-bold text-xs px-3 py-1 rounded-full border border-emerald-200/70">
            <CheckCircle size={13} className="text-emerald-600" /> ดำเนินการแล้วเสร็จ
          </span>
        );
      case "investigating":
        return (
          <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 font-bold text-xs px-3 py-1 rounded-full border border-indigo-200/70">
            <Clock size={13} className="text-indigo-600" /> กำลังตรวจสอบ
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 font-bold text-xs px-3 py-1 rounded-full border border-rose-200/70">
            <AlertCircle size={13} className="text-rose-600" /> ปฏิเสธคำร้อง
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 font-bold text-xs px-3 py-1 rounded-full border border-slate-200/70">
            <HelpCircle size={13} className="text-slate-500" /> รอรับเรื่อง
          </span>
        );
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.fullName} (${user.nickname})` : "ไม่พบชื่อผู้ใช้";
  };

  const handleCreatePetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setSubmitError("กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องด้วยค่ะ");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await onSubmitPetition(title, category, content, isAnonymous);
      
      setTitle("");
      setCategory("extension");
      setContent("");
      setIsAnonymous(false);
      setShowSubmitModal(false);
      alert("ยื่นคำร้องหรือข้อเสนอแนะสำเร็จเรียบร้อยแล้วค่ะ");
    } catch (err: any) {
      setSubmitError(err.message || "เกิดข้อผิดพลาดในการยื่นคำร้อง");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRespondSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondingToId) return;
    if (!adminResponse.trim()) {
      setRespondError("กรุณากรอกรายละเอียดการตอบกลับด้วยค่ะ");
      return;
    }

    try {
      setIsResponding(true);
      setRespondError(null);
      await onRespondPetition(respondingToId, adminStatus, adminResponse);
      
      setRespondingToId(null);
      setAdminResponse("");
      setAdminStatus("resolved");
      alert("บันทึกการตอบกลับคำร้องเสร็จสิ้นเรียบร้อยแล้วค่ะ");
    } catch (err: any) {
      setRespondError(err.message || "เกิดข้อผิดพลาดในการบันทึกการตอบกลับ");
    } finally {
      setIsResponding(false);
    }
  };

  const filteredPetitions = petitions.filter(p => {
    const matchesCat = filterCategory === "all" || p.category === filterCategory;
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    return matchesCat && matchesStatus;
  });

  const renderStatusTimeline = (status: string) => {
    const step1Done = true;
    const step2Active = status === "investigating" || status === "resolved" || status === "rejected";
    const step3Resolved = status === "resolved";
    const step3Rejected = status === "rejected";

    return (
      <div className="flex items-center gap-2 sm:gap-3 pt-2 text-xs font-semibold">
        <div className={`flex items-center gap-1.5 ${step1Done ? "text-blue-700" : "text-slate-400"}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step1Done ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>1</span>
          <span>ยื่นคำร้อง</span>
        </div>
        <div className={`h-0.5 w-6 sm:w-10 rounded-full ${step2Active ? "bg-blue-600" : "bg-slate-200"}`} />
        <div className={`flex items-center gap-1.5 ${step2Active ? "text-indigo-700" : "text-slate-400"}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step2Active ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"}`}>2</span>
          <span>กำลังพิจารณา</span>
        </div>
        <div className={`h-0.5 w-6 sm:w-10 rounded-full ${step3Resolved ? "bg-emerald-500" : step3Rejected ? "bg-rose-500" : "bg-slate-200"}`} />
        <div className={`flex items-center gap-1.5 ${step3Resolved ? "text-emerald-700" : step3Rejected ? "text-rose-700" : "text-slate-400"}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
            step3Resolved ? "bg-emerald-600 text-white" : step3Rejected ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-500"
          }`}>3</span>
          <span>{step3Rejected ? "ปฏิเสธคำร้อง" : "แจ้งผลชี้แจง"}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Modern Header Action Board */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200/60 font-bold text-xs px-3 py-1 rounded-full">
            <Inbox size={14} /> ศูนย์รับฟังความคิดเห็นและคำร้องเรียน
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            ระบบคำร้อง & ข้อเสนอแนะส่วนกลาง
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            พื้นที่โปร่งใสสำหรับยื่นขอผ่อนผันค่าบำรุง เสนอแนะกิจกรรมรุ่น หรือแจ้งปัญหาการใช้งาน (รองรับการส่งแบบไม่ระบุตัวตน)
          </p>
        </div>
        <button
          onClick={() => {
            setSubmitError(null);
            setShowSubmitModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-600/15 shrink-0 cursor-pointer"
        >
          <Plus size={18} /> เขียนคำร้อง / ข้อเสนอแนะใหม่
        </button>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500 font-bold">กรองข้อมูล:</span>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-600 focus:bg-white"
        >
          <option value="all">ทุกหมวดหมู่คำร้อง</option>
          <option value="extension">ขอผ่อนผันการชำระเงิน</option>
          <option value="suggestion">ข้อเสนอแนะกิจกรรม</option>
          <option value="system">แจ้งปัญหาการใช้งาน</option>
          <option value="other">เรื่องอื่นๆ</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-600 focus:bg-white"
        >
          <option value="all">ทุกสถานะการดำเนินงาน</option>
          <option value="pending">รอรับเรื่อง</option>
          <option value="investigating">กำลังตรวจสอบ</option>
          <option value="resolved">ดำเนินการแล้วเสร็จ</option>
          <option value="rejected">ปฏิเสธคำร้อง</option>
        </select>
        
        <div className="text-xs sm:text-sm text-slate-500 ml-auto font-bold tabular-nums">
          พบทั้งหมด {filteredPetitions.length} รายการ
        </div>
      </div>

      {/* Main Petitions List Container */}
      <div className="space-y-4">
        {filteredPetitions.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-sm space-y-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
              <Inbox size={28} />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-slate-700">ยังไม่มีรายการคำร้องเรียน</h4>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                ไม่มีข้อมูลคำร้องเรียนหรือข้อเสนอแนะที่ตรงกับตัวกรองที่เลือกในขณะนี้
              </p>
            </div>
          </div>
        ) : (
          filteredPetitions.map((petition) => {
            const isOwner = petition.submittedBy === currentUser.id;
            return (
              <div 
                key={petition.id}
                className={`bg-white rounded-3xl p-5 sm:p-6 border transition-all shadow-2xs hover:shadow-sm ${
                  isOwner ? "border-blue-200/90" : "border-slate-200/80"
                } space-y-4`}
              >
                {/* Header Row of Item */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${getCategoryBadgeClass(petition.category)}`}>
                        {getCategoryLabel(petition.category)}
                      </span>
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        #{petition.id} · {new Date(petition.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 pt-0.5">{petition.title}</h3>
                  </div>
                  <div className="shrink-0">{getStatusBadge(petition.status)}</div>
                </div>

                {/* Status Timeline */}
                {renderStatusTimeline(petition.status)}

                {/* Content body */}
                <div className="space-y-2.5">
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50/70 p-4 rounded-2xl border border-slate-200/60">
                    {petition.content}
                  </p>
                  
                  {/* Author Meta */}
                  <div className="flex items-center gap-2 text-slate-500 text-xs px-1 font-semibold">
                    {petition.isAnonymous ? (
                      <>
                        <UserX size={14} className="text-slate-400" />
                        <span>ผู้ยื่นคำร้อง: สมาชิกไม่ประสงค์ออกนาม (ปกปิดตัวตน)</span>
                      </>
                    ) : (
                      <>
                        <UserIcon size={14} className="text-blue-600" />
                        <span>ผู้ยื่นคำร้อง: {getUserName(petition.submittedBy)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Staff Response Timeline Card */}
                {petition.response ? (
                  <div className="bg-emerald-50/50 rounded-2xl p-4 sm:p-5 border border-emerald-200/70 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs sm:text-sm">
                      <CornerDownRight size={16} className="text-emerald-600" />
                      <span>คำชี้แจงจากเหรัญญิก / คณะกรรมการกองทุน</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed pl-6 whitespace-pre-line font-medium">
                      {petition.response}
                    </p>
                    <div className="text-xs text-slate-500 pl-6 font-semibold tabular-nums">
                      ตอบกลับโดย: {getUserName(petition.resolvedBy || "")} ·{" "}
                      {petition.resolvedAt && new Date(petition.resolvedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ) : (
                  (isTreasurer || (isCommittee && !petition.isAnonymous)) && (
                    <div className="pt-2">
                      {respondingToId === petition.id ? (
                        <form onSubmit={handleRespondSubmit} className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-4">
                          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">บันทึกการพิจารณาและชี้แจงคำร้อง</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1.5">อัปเดตสถานะคำร้อง:</label>
                              <select
                                value={adminStatus}
                                onChange={(e) => setAdminStatus(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-600"
                              >
                                <option value="investigating">กำลังตรวจสอบ (Investigating)</option>
                                <option value="resolved">ดำเนินการแล้วเสร็จ (Resolved)</option>
                                <option value="rejected">ปฏิเสธคำร้องเรียน (Rejected)</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">คำชี้แจง / ผลการพิจารณา:</label>
                            <textarea
                              rows={3}
                              value={adminResponse}
                              onChange={(e) => setAdminResponse(e.target.value)}
                              placeholder="ระบุผลสรุปการตรวจสอบ การอนุมัติผ่อนผัน หรือข้อชี้แจงอย่างสุภาพ..."
                              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-blue-600 placeholder-slate-400 resize-none"
                            ></textarea>
                          </div>

                          {respondError && (
                            <p className="text-xs text-rose-600 font-bold">{respondError}</p>
                          )}

                          <div className="flex gap-2.5 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setRespondingToId(null);
                                setAdminResponse("");
                              }}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="submit"
                              disabled={isResponding}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-all shadow-xs"
                            >
                              {isResponding ? "กำลังบันทึก..." : "บันทึกผลการชี้แจง"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          onClick={() => {
                            setRespondingToId(petition.id);
                            setAdminResponse(petition.response || "");
                            setAdminStatus(petition.status === "pending" ? "resolved" : petition.status);
                            setRespondError(null);
                          }}
                          className="bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <MessageSquare size={15} /> ตอบกลับ / อัปเดตสถานะคำร้องนี้
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Submit Petition Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <FileText className="text-blue-600" size={20} /> เขียนคำร้องหรือข้อเสนอแนะใหม่
              </h3>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:bg-slate-100 hover:text-slate-700 p-1.5 rounded-xl transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePetition} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">หัวข้อคำร้อง / ข้อเสนอแนะ:</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ขอผ่อนผันชำระค่ากองทุนงวดนี้, เสนอเพิ่มอุปกรณ์กีฬา..."
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl px-3.5 py-3 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">เลือกหมวดหมู่:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl px-3.5 py-3 text-slate-900 font-semibold focus:outline-none focus:border-blue-600 focus:bg-white"
                >
                  <option value="extension">ขอผ่อนผันการชำระเงิน</option>
                  <option value="suggestion">ข้อเสนอแนะเกี่ยวกับกิจกรรม</option>
                  <option value="system">แจ้งปัญหาการใช้งานระบบ</option>
                  <option value="other">เรื่องอื่นๆ</option>
                </select>
              </div>

              {/* Prominent Anonymous Toggle Card */}
              <label
                className={`flex items-start gap-3.5 p-4 rounded-2xl border cursor-pointer transition-all ${
                  isAnonymous
                    ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/15"
                    : "bg-slate-50/70 border-slate-200 hover:bg-slate-100/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="space-y-0.5">
                  <span className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                    <UserX size={15} className="text-indigo-600" /> ส่งแบบไม่ระบุตัวตน (Anonymous Mode)
                  </span>
                  <span className="block text-xs text-slate-500 leading-relaxed">
                    ระบบจะซ่อนชื่อและรหัสนักศึกษาของคุณบนกระดานคำร้อง เพื่อความสบายใจในการเสนอความคิดเห็น
                  </span>
                </div>
              </label>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">รายละเอียดคำร้องหรือข้อเสนอแนะ:</label>
                <textarea
                  required
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="อธิบายเหตุผลหรือรายละเอียดให้ครบถ้วน เพื่อให้เหรัญญิกและคณะกรรมการพิจารณาได้อย่างรวดเร็ว..."
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl p-3.5 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white placeholder-slate-400 resize-none leading-relaxed"
                ></textarea>
              </div>

              {submitError && (
                <p className="text-xs text-rose-600 font-bold">{submitError}</p>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-2xl transition-all shadow-md shadow-blue-600/15 flex items-center justify-center gap-2"
                >
                  <Send size={16} /> {isSubmitting ? "กำลังส่งคำร้อง..." : "ส่งคำร้องเรียน"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
