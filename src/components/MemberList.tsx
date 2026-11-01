/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Phone, 
  Facebook, 
  Award, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  Plus, 
  Trash2, 
  X, 
  Sparkles,
  Shield,
  GraduationCap,
  KeyRound,
  Edit3
} from "lucide-react";
import { User, MonthlyBill } from "../types";

interface MemberListProps {
  currentUser: User;
  users: User[];
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
  ) => Promise<unknown>;
  onAddMember?: (studentId: string, fullName: string, nickname: string, email: string, phone: string, role: string, position: string, classroom: string) => Promise<unknown>;
  onDeleteMember?: (targetUserId: string) => Promise<unknown>;
}

export default function MemberList({
  currentUser,
  users,
  monthlyBills,
  onUpdateMember,
  onAddMember,
  onDeleteMember
}: MemberListProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [classroomFilter, setClassroomFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(currentUser);

  // States for updating member details (for treasurer edit panel)
  const [editRole, setEditRole] = useState<string>("");
  const [editPosition, setEditPosition] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // States for self editing
  const [isEditingSelf, setIsEditingSelf] = useState<boolean>(false);
  const [isEditingPeer, setIsEditingPeer] = useState<boolean>(false);
  const [selfFullName, setSelfFullName] = useState<string>("");
  const [selfNickname, setSelfNickname] = useState<string>("");
  const [selfEmail, setSelfEmail] = useState<string>("");
  const [selfPhone, setSelfPhone] = useState<string>("");
  const [selfClassroom, setSelfClassroom] = useState<string>("");
  const [selfSuccessMsg, setSelfSuccessMsg] = useState<string>("");
  const [selfErrorMsg, setSelfErrorMsg] = useState<string>("");

  useEffect(() => {
    if (selectedUser) {
      const fresh = users.find(u => u.id === selectedUser.id);
      if (fresh) setSelectedUser(fresh);
    }
  }, [users]);

  useEffect(() => {
    if (selectedUser) {
      setEditRole(selectedUser.role);
      setEditPosition(selectedUser.position || "");
      setSelfFullName(selectedUser.fullName || "");
      setSelfNickname(selectedUser.nickname || "");
      setSelfEmail(selectedUser.email || "");
      setSelfPhone(selectedUser.phone || "");
      setSelfClassroom(selectedUser.classroom || "ห้อง 1");
      setIsEditingSelf(false);
      setIsEditingPeer(false);
      setSelfSuccessMsg("");
      setSelfErrorMsg("");
    }
  }, [selectedUser]);

  // Add Member Modal States
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [newStudentId, setNewStudentId] = useState<string>("");
  const [newFullName, setNewFullName] = useState<string>("");
  const [newNickname, setNewNickname] = useState<string>("");
  const [newEmail, setNewEmail] = useState<string>("");
  const [newPhone, setNewPhone] = useState<string>("");
  const [newRole, setNewRole] = useState<string>("member");
  const [newPosition, setNewPosition] = useState<string>("นักศึกษาชั้นปีที่ 3");
  const [newClassroom, setNewClassroom] = useState<string>("ห้อง 1");
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Filter members
  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.studentId.includes(searchTerm) ||
                          u.nickname.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesClassroom = classroomFilter === "all" || u.classroom === classroomFilter;
    return matchesSearch && matchesRole && matchesClassroom;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "treasurer":
        return <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/70 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">🔴 เหรัญญิก</span>;
      case "leader":
        return <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">🎓 หัวหน้าห้อง</span>;
      case "committee":
        return <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">⭐ คณะกรรมการ</span>;
      case "member":
      default:
        return <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200/70 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">👥 สมาชิก</span>;
    }
  };

  const handleUpdateSelfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsUpdating(true);
    setSelfSuccessMsg("");
    setSelfErrorMsg("");
    try {
      await onUpdateMember(
        selectedUser.id, 
        undefined,
        undefined,
        undefined,
        selfFullName,
        selfNickname,
        selfEmail,
        selfPhone,
        selfClassroom
      );
      setSelfSuccessMsg("บันทึกข้อมูลส่วนตัวของคุณเรียบร้อยแล้ว! 🎉");
      setIsEditingSelf(false);
      const updated = users.find(u => u.id === selectedUser.id);
      if (updated) setSelectedUser(updated);
    } catch (err: any) {
      console.error(err);
      setSelfErrorMsg(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsUpdating(true);
    try {
      await onUpdateMember(selectedUser.id, editRole, editPosition, selectedUser.isActive);
      const updated = users.find(u => u.id === selectedUser.id);
      if (updated) setSelectedUser(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePeerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsUpdating(true);
    setSelfSuccessMsg("");
    setSelfErrorMsg("");
    try {
      await onUpdateMember(
        selectedUser.id, 
        undefined,
        undefined,
        undefined,
        selfFullName,
        selfNickname,
        selfEmail,
        selfPhone,
        undefined
      );
      setSelfSuccessMsg("บันทึกข้อมูลเพื่อนร่วมห้องเรียบร้อยแล้ว! 🎉");
      setIsEditingPeer(false);
      const updated = users.find(u => u.id === selectedUser.id);
      if (updated) setSelectedUser(updated);
    } catch (err: any) {
      console.error(err);
      setSelfErrorMsg(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentId || !newFullName || !onAddMember) return;
    setIsAdding(true);
    setErrorMessage("");
    try {
      const res = await onAddMember(
        newStudentId,
        newFullName,
        newNickname,
        newEmail,
        newPhone,
        newRole,
        newPosition,
        newClassroom
      ) as { success: boolean; user: User };
      setSelectedUser(res.user);
      setNewStudentId("");
      setNewFullName("");
      setNewNickname("");
      setNewEmail("");
      setNewPhone("");
      setNewRole("member");
      setNewPosition("นักศึกษาชั้นปีที่ 3");
      setNewClassroom("ห้อง 1");
      setShowAddModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || "เกิดข้อผิดพลาดในการลงทะเบียนสมาชิก");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteMemberClick = async () => {
    if (!selectedUser || !onDeleteMember) return;
    setShowDeleteConfirm(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Directory Left Column */}
      <div className="lg:col-span-8 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-5">
        {/* Header & Add Member CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Users size={22} className="text-blue-600" /> ทำเนียบรายชื่อสมาชิกกองทุน
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              รายชื่อนักศึกษาในระบบกองทุนรุ่น พร้อมสถานะการชำระค่าบำรุงรายเดือน
            </p>
          </div>
          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full shrink-0 tabular-nums">
              แสดง {filteredUsers.length} / {users.length} คน
            </span>
            {(currentUser.role === "treasurer" || currentUser.role === "leader") && onAddMember && (
              <button 
                onClick={() => {
                  setErrorMessage("");
                  setNewStudentId("");
                  setNewFullName("");
                  setNewNickname("");
                  setNewEmail("");
                  setNewPhone("");
                  if (currentUser.role === "leader") {
                    setNewClassroom(currentUser.classroom || "ห้อง 1");
                    setNewRole("member");
                  } else {
                    setNewClassroom("ห้อง 1");
                    setNewRole("member");
                  }
                  setShowAddModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-2xl text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm shadow-blue-600/15 cursor-pointer"
              >
                <Plus size={16} /> เพิ่มสมาชิกใหม่
              </button>
            )}
          </div>
        </div>

        {/* Redesigned Search & Filter Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อจริง, ชื่อเล่น หรือรหัสนักศึกษา..." 
              className="w-full text-xs sm:text-sm p-3 pl-10 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 bg-slate-50/60 focus:bg-white text-slate-800"
            />
          </div>

          {/* Classroom Filter Pills */}
          {(currentUser.role === "treasurer" || currentUser.role === "leader" || currentUser.role === "committee") && (
            <div className="flex bg-slate-100 p-1 rounded-2xl shrink-0">
              {[
                { value: "all", label: "ทุกห้อง" },
                { value: "ห้อง 1", label: "ห้อง 1" },
                { value: "ห้อง 2", label: "ห้อง 2" }
              ].map((room) => (
                <button
                  key={room.value}
                  type="button"
                  onClick={() => setClassroomFilter(room.value)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    classroomFilter === room.value
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {room.label}
                </button>
              ))}
            </div>
          )}

          {/* Role Filter Select */}
          <div className="shrink-0">
            <select 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full md:w-auto text-xs sm:text-sm p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 bg-white text-slate-700 font-bold"
            >
              <option value="all">บทบาททั้งหมด</option>
              <option value="treasurer">เหรัญญิก</option>
              <option value="leader">หัวหน้าห้อง</option>
              <option value="committee">คณะกรรมการ</option>
              <option value="member">สมาชิกทั่วไป</option>
            </select>
          </div>
        </div>

        {/* Directory Grid List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
          {filteredUsers.length === 0 ? (
            <div className="sm:col-span-2 text-center py-16 text-slate-400 text-sm bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              ไม่พบรายชื่อสมาชิกที่ตรงกับการค้นหา
            </div>
          ) : (
            filteredUsers.map((user) => {
              const userBills = monthlyBills.filter(b => b.userId === user.id);
              const paidBills = userBills.filter(b => b.status === "paid");
              const unpaidBills = userBills.filter(b => b.status !== "paid");
              const hasBills = userBills.length > 0;
              const hasUnpaid = unpaidBills.length > 0;
              const isSelected = selectedUser?.id === user.id;

              return (
                <div 
                  key={user.id}
                  onClick={() => {
                    setSelectedUser(user);
                    setEditRole(user.role);
                    setEditPosition(user.position || "");
                  }}
                  className={`p-4 rounded-2xl cursor-pointer border transition-all flex items-center justify-between gap-3 ${
                    isSelected 
                      ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/15 shadow-xs" 
                      : "border-slate-200/70 hover:border-slate-300 hover:bg-slate-50/60 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Clean Avatar */}
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-xs shrink-0 border ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-slate-100 text-slate-700 border-slate-200/80"
                    }`}>
                      {(user.nickname || user.fullName || "?").slice(0, 2)}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 truncate">
                          {user.fullName} {user.nickname ? `(${user.nickname})` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getRoleBadge(user.role)}
                        {user.classroom && (
                          <span className="text-xs font-semibold text-indigo-700 bg-indigo-50/80 border border-indigo-200/60 px-2 py-0.5 rounded-full shrink-0">
                            {user.classroom}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        รหัส: {user.studentId}
                      </p>
                    </div>
                  </div>

                  {/* Payment Progress Pill */}
                  <div className="shrink-0 text-right">
                    {!hasBills ? (
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-slate-400" /> ไม่มีบิล
                      </span>
                    ) : !hasUnpaid ? (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-full inline-flex items-center gap-1 tabular-nums">
                        <CheckCircle2 size={13} className="text-emerald-600" /> ครบ {paidBills.length}/{userBills.length}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/70 px-2.5 py-1 rounded-full inline-flex items-center gap-1 tabular-nums">
                        <Clock size={13} className="text-rose-600" /> ค้าง {unpaidBills.length} งวด
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Directory Detail & Edit Side Card */}
      <div className="lg:col-span-4 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-5">
        {selectedUser ? (
          <div className="space-y-5">
            {/* Profile Header */}
            <div className="flex flex-col items-center text-center space-y-2.5 pb-5 border-b border-slate-100 relative">
              {currentUser.role === "treasurer" && currentUser.id !== selectedUser.id && onDeleteMember && (
                <button 
                  onClick={handleDeleteMemberClick}
                  className="absolute top-0 right-0 p-2 rounded-xl border border-rose-200/80 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all cursor-pointer"
                  title="ลบสมาชิกรายนี้"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <div className="w-18 h-18 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-600/15 flex items-center justify-center font-extrabold text-xl">
                {selectedUser.nickname || selectedUser.fullName.slice(0, 2)}
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-900 text-base">{selectedUser.fullName}</h3>
                <p className="text-xs text-slate-500 font-medium">{selectedUser.position || "นักศึกษาชั้นปีที่ 3"}</p>
                <div className="pt-1 flex justify-center gap-2">
                  {getRoleBadge(selectedUser.role)}
                  {selectedUser.classroom && (
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2.5 py-0.5 rounded-full">
                      {selectedUser.classroom}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Info details or Edit Form */}
            {isEditingSelf ? (
              <form onSubmit={handleUpdateSelfSubmit} className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 text-xs sm:text-sm space-y-3.5">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Edit3 size={15} className="text-blue-600" /> แก้ไขข้อมูลส่วนตัวของคุณ
                </h4>
                
                {selfErrorMsg && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs">
                    {selfErrorMsg}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">ชื่อจริง - นามสกุล</label>
                  <input 
                    type="text" 
                    value={selfFullName}
                    onChange={(e) => setSelfFullName(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">ชื่อเล่น</label>
                  <input 
                    type="text" 
                    value={selfNickname}
                    onChange={(e) => setSelfNickname(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">
                    ห้องเรียน {currentUser.role !== "treasurer" && currentUser.role !== "committee" && "(เฉพาะเหรัญญิก/กรรมการแก้ไขได้)"}
                  </label>
                  <select 
                    value={selfClassroom}
                    onChange={(e) => setSelfClassroom(e.target.value)}
                    disabled={currentUser.role !== "treasurer" && currentUser.role !== "committee"}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="ห้อง 1">ห้อง 1</option>
                    <option value="ห้อง 2">ห้อง 2</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">เบอร์โทรศัพท์</label>
                  <input 
                    type="text" 
                    value={selfPhone}
                    onChange={(e) => setSelfPhone(e.target.value)}
                    placeholder="เช่น 0891234567"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-mono text-slate-800 tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">ลิงก์ Facebook หรือช่องทางติดต่อ</label>
                  <input 
                    type="text" 
                    value={selfEmail}
                    onChange={(e) => setSelfEmail(e.target.value)}
                    required
                    placeholder="เช่น facebook.com/username"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsEditingSelf(false)}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl py-2.5 transition-all text-xs"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit"
                    disabled={isUpdating}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-2.5 transition-all text-xs"
                  >
                    {isUpdating ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                  </button>
                </div>
              </form>
            ) : isEditingPeer ? (
              <form onSubmit={handleUpdatePeerSubmit} className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 text-xs sm:text-sm space-y-3.5">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Edit3 size={15} className="text-blue-600" /> แก้ไขข้อมูลของเพื่อน
                </h4>
                
                {selfErrorMsg && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs">
                    {selfErrorMsg}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">ชื่อจริง - นามสกุล</label>
                  <input 
                    type="text" 
                    value={selfFullName}
                    onChange={(e) => setSelfFullName(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">ชื่อเล่น</label>
                  <input 
                    type="text" 
                    value={selfNickname}
                    onChange={(e) => setSelfNickname(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">เบอร์โทรศัพท์</label>
                  <input 
                    type="text" 
                    value={selfPhone}
                    onChange={(e) => setSelfPhone(e.target.value)}
                    placeholder="เช่น 0891234567"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-mono text-slate-800 tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">ลิงก์ Facebook หรือช่องทางติดต่อ</label>
                  <input 
                    type="text" 
                    value={selfEmail}
                    onChange={(e) => setSelfEmail(e.target.value)}
                    required
                    placeholder="เช่น facebook.com/username"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsEditingPeer(false)}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl py-2.5 transition-all text-xs"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit"
                    disabled={isUpdating}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-2.5 transition-all text-xs"
                  >
                    {isUpdating ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200/60 space-y-3 text-xs sm:text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-500">
                      <Award size={15} className="text-blue-600" /> รหัสนักศึกษา
                    </span>
                    <strong className="text-slate-900 font-mono tabular-nums">{selectedUser.studentId}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-500">
                      <GraduationCap size={15} className="text-blue-600" /> ห้องเรียน
                    </span>
                    <strong className="text-slate-900">{selectedUser.classroom || "ไม่ระบุ"}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-500">
                      <Phone size={15} className="text-blue-600" /> เบอร์โทรศัพท์
                    </span>
                    <strong className="text-slate-900 font-mono tabular-nums">{selectedUser.phone || "ไม่ระบุ"}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-slate-500 shrink-0">
                      <Facebook size={15} className="text-blue-600" /> ติดต่อ
                    </span>
                    <strong className="text-slate-900 truncate text-right">{selectedUser.email || "ไม่ระบุ"}</strong>
                  </div>
                </div>

                {currentUser.role === "treasurer" && (
                  <div className="p-3.5 bg-rose-50/70 border border-rose-200/70 rounded-2xl space-y-1.5">
                    <div className="text-xs text-rose-700 font-bold flex items-center gap-1.5">
                      <KeyRound size={14} /> ข้อมูลรหัสผ่าน (เฉพาะเหรัญญิก)
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">รหัสผ่านปัจจุบัน:</span>
                      <strong className="font-mono text-rose-700 font-extrabold bg-white border border-rose-200 px-2.5 py-0.5 rounded-lg">
                        {selectedUser.password && !selectedUser.password.startsWith("$2") && !selectedUser.password.startsWith("scrypt:")
                          ? selectedUser.password
                          : "•••••• (เข้ารหัสปลอดภัย)"}
                      </strong>
                    </div>
                  </div>
                )}

                {selfSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-xl text-xs text-center">
                    {selfSuccessMsg}
                  </div>
                )}

                {currentUser.id === selectedUser.id && (
                  <button 
                    onClick={() => {
                      setIsEditingSelf(true);
                      setSelfSuccessMsg("");
                      setSelfErrorMsg("");
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-2xl py-3 transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Edit3 size={15} /> แก้ไขข้อมูลส่วนตัวของคุณ
                  </button>
                )}

                {currentUser.id !== selectedUser.id && (currentUser.role === "treasurer" || (currentUser.role === "leader" && selectedUser.classroom === currentUser.classroom)) && (
                  <button 
                    onClick={() => {
                      setIsEditingPeer(true);
                      setSelfSuccessMsg("");
                      setSelfErrorMsg("");
                    }}
                    className="w-full bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-bold rounded-2xl py-3 transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Edit3 size={15} /> แก้ไขข้อมูลสมาชิกคนนี้
                  </button>
                )}
              </>
            )}

            {/* Admin Management Panel (Treasurer only) */}
            {currentUser.role === "treasurer" && currentUser.id !== selectedUser.id && (
              <form onSubmit={handleUpdateUserSubmit} className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 text-xs sm:text-sm space-y-3.5">
                <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Shield size={15} className="text-blue-600" /> จัดการสิทธิ์และตำแหน่ง
                </h4>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">บทบาทในระบบ</label>
                  <select 
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 font-semibold text-slate-800"
                  >
                    <option value="member">สมาชิกทั่วไป (member)</option>
                    <option value="leader">หัวหน้าห้อง (leader)</option>
                    <option value="committee">คณะกรรมการห้อง (committee)</option>
                    <option value="treasurer">เหรัญญิกรุ่น (treasurer)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600 font-bold">ตำแหน่งบริหาร / หน้าที่</label>
                  <input 
                    type="text" 
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    placeholder="เช่น รองหัวหน้าห้อง, เลขานุการ, ฝ่ายกีฬา" 
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 text-slate-800"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isUpdating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-2.5 transition-all text-xs sm:text-sm shadow-sm shadow-blue-600/15 cursor-pointer"
                >
                  {isUpdating ? "กำลังบันทึกสิทธิ์..." : "ยืนยันการตั้งค่าสิทธิ์"}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-sm">
            คลิกเลือกรายชื่อสมาชิกทางด้านซ้ายเพื่อดูรายละเอียด
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles size={18} className="text-blue-600" /> เพิ่มสมาชิกใหม่เข้าระบบกองทุน
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-xl">
                <X size={18} />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl font-bold">
                ⚠️ {errorMessage}
              </div>
            )}

            <form onSubmit={handleAddMemberSubmit} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">รหัสนักศึกษา (ใช้สำหรับเข้าสู่ระบบ)</label>
                <input 
                  type="text" 
                  value={newStudentId}
                  onChange={(e) => setNewStudentId(e.target.value)}
                  placeholder="เช่น 169214210073"
                  className="w-full p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 font-mono tabular-nums"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">ชื่อ - นามสกุลจริง</label>
                <input 
                  type="text" 
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="เช่น สมพร พูลอนันต์"
                  className="w-full p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">ชื่อเล่น</label>
                  <input 
                    type="text" 
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    placeholder="เช่น กอล์ฟ"
                    className="w-full p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">เบอร์โทรศัพท์</label>
                  <input 
                    type="text" 
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="0812345678"
                    className="w-full p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">ลิงก์ Facebook หรือช่องทางติดต่อ</label>
                <input 
                  type="text" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="เช่น facebook.com/username"
                  className="w-full p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">ห้องเรียน</label>
                  <select 
                    value={newClassroom}
                    onChange={(e) => setNewClassroom(e.target.value)}
                    disabled={currentUser.role === "leader"}
                    className="w-full p-3 border border-slate-200 rounded-2xl focus:outline-none bg-white font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="ห้อง 1">ห้อง 1</option>
                    <option value="ห้อง 2">ห้อง 2</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">บทบาท</label>
                  <select 
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    disabled={currentUser.role === "leader"}
                    className="w-full p-3 border border-slate-200 rounded-2xl focus:outline-none bg-white font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="member">สมาชิกทั่วไป</option>
                    <option value="leader">หัวหน้าห้อง</option>
                    <option value="committee">คณะกรรมการ</option>
                    <option value="treasurer">เหรัญญิก</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-2xl"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={isAdding}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-2xl shadow-sm shadow-blue-600/15"
                >
                  {isAdding ? "กำลังบันทึก..." : "เพิ่มสมาชิกใหม่"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Member Confirmation Modal */}
      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-200/60">
              <Trash2 size={26} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-extrabold text-slate-900">ยืนยันการลบสมาชิก?</h4>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                คุณแน่ใจหรือไม่ที่จะลบคุณ "{selectedUser.fullName}" ออกจากทะเบียนนักศึกษา? ข้อมูลที่เกี่ยวข้องจะถูกลบและไม่สามารถกู้คืนได้
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={async () => {
                  const targetUser = selectedUser;
                  setShowDeleteConfirm(false);
                  setSelectedUser(null);
                  try {
                    await onDeleteMember!(targetUser.id);
                  } catch (err: any) {
                    alert(err.message || "เกิดข้อผิดพลาดในการลบสมาชิก");
                  }
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-2xl text-xs sm:text-sm transition-all"
              >
                ยืนยันการลบ
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs sm:text-sm transition-all"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
