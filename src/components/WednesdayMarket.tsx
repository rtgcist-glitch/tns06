/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Trash2, 
  ShoppingBag, 
  TrendingUp, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  HelpCircle,
  FileText,
  Users,
  User as UserIcon,
  Award,
  Edit2,
  X,
  Image as ImageIcon,
  Paperclip,
  Check
} from "lucide-react";
import { User, MarketWeek, MarketItem } from "../types";
import { compressImage } from "../utils/imageCompressor";
import { getDirectDriveImageUrl } from "./Activities";

interface WednesdayMarketProps {
  currentUser: User;
  users: User[];
  marketWeeks: MarketWeek[];
  marketItems: MarketItem[];
  onCreateWeek: (weekDate: string, note: string, teamName?: string, leaderId?: string, memberIds?: string[]) => Promise<any>;
  onAddItem: (marketWeekId: string, itemName: string, type: "cost" | "revenue", amount: number, quantity: number, note?: string) => Promise<any>;
  onDeleteItem: (itemId: string) => Promise<any>;
  onCompleteWeek: (marketWeekId: string) => Promise<any>;
  onApproveWeek: (marketWeekId: string) => Promise<any>;
  onUpdateWeekTeam?: (marketWeekId: string, teamName?: string, leaderId?: string, memberIds?: string[], note?: string) => Promise<any>;
  onDeleteWeek: (marketWeekId: string) => Promise<any>;
  onProposeMarketAdvance?: (marketWeekId: string, amount: number, reason: string) => Promise<any>;
  onApproveMarketAdvance?: (marketWeekId: string, action: "approve" | "reject", rejectReason?: string, receiptUrl?: string) => Promise<any>;
  onProposeMarketAdditionalAdvance?: (marketWeekId: string, amount: number, reason: string) => Promise<any>;
  onApproveMarketAdditionalAdvance?: (marketWeekId: string, action: "approve" | "reject", rejectReason?: string, receiptUrl?: string) => Promise<any>;
}

export default function WednesdayMarket({
  currentUser,
  users,
  marketWeeks,
  marketItems,
  onCreateWeek,
  onAddItem,
  onDeleteItem,
  onCompleteWeek,
  onApproveWeek,
  onUpdateWeekTeam,
  onDeleteWeek,
  onProposeMarketAdvance,
  onApproveMarketAdvance,
  onProposeMarketAdditionalAdvance,
  onApproveMarketAdditionalAdvance
}: WednesdayMarketProps) {
  const [activeTab, setActiveTab] = useState<"accounting" | "schedule" | "leaderboard">("accounting");
  const [selectedWeek, setSelectedWeek] = useState<MarketWeek | null>(marketWeeks[0] || null);

  React.useEffect(() => {
    if (selectedWeek) {
      const updated = marketWeeks.find(w => w.id === selectedWeek.id);
      if (updated) {
        setSelectedWeek(updated);
      } else if (marketWeeks.length > 0) {
        setSelectedWeek(marketWeeks[0]);
      }
    } else if (marketWeeks.length > 0) {
      setSelectedWeek(marketWeeks[0]);
    }
  }, [marketWeeks]);
  const [showAddWeekModal, setShowAddWeekModal] = useState<boolean>(false);
  const [showEditTeamModal, setShowEditTeamModal] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewOriginalUrl, setPreviewOriginalUrl] = useState<string | null>(null);

  const parseWeekNote = (rawNote: string | undefined) => {
    if (!rawNote) return { note: "", carryForwardRemaining: 0, carryForwardCapitalOnly: false };
    const carryForwardCapitalOnly = rawNote.includes("[CARRY_FORWARD_CAPITAL_ONLY:true]");
    const cleanedCapitalOnly = rawNote.replace("[CARRY_FORWARD_CAPITAL_ONLY:true]", "").trim();
    
    const carryMatch = cleanedCapitalOnly.match(/\[CARRY_FORWARD_REMAINING:([\d.]+)\]/);
    if (carryMatch) {
      const carryForwardRemaining = Number(carryMatch[1]) || 0;
      const note = cleanedCapitalOnly.replace(/\[CARRY_FORWARD_REMAINING:[\d.]+\]/, "").trim();
      return { note, carryForwardRemaining, carryForwardCapitalOnly };
    }
    return { note: cleanedCapitalOnly, carryForwardRemaining: 0, carryForwardCapitalOnly };
  };

  const makeWeekNote = (note: string, carryForwardRemaining: number, carryForwardCapitalOnly: boolean) => {
    let cleanedNote = (note || "")
      .replace(/\[CARRY_FORWARD_REMAINING:[\d.]+\]/, "")
      .replace("[CARRY_FORWARD_CAPITAL_ONLY:true]", "")
      .trim();
    if (carryForwardRemaining > 0) {
      cleanedNote = `${cleanedNote} [CARRY_FORWARD_REMAINING:${carryForwardRemaining}]`;
    }
    if (carryForwardCapitalOnly) {
      cleanedNote = `${cleanedNote} [CARRY_FORWARD_CAPITAL_ONLY:true]`;
    }
    return cleanedNote;
  };

  const parseAdvanceReason = (rawReason: string | undefined) => {
    if (!rawReason) return { reason: "", carryForwardAmount: 0 };
    if (rawReason.startsWith("CARRY_FORWARD_AMOUNT:")) {
      const parts = rawReason.split(" | REASON:");
      const carryForwardAmount = Number(parts[0].replace("CARRY_FORWARD_AMOUNT:", "")) || 0;
      const reason = parts[1] || "";
      return { reason, carryForwardAmount };
    }
    return { reason: rawReason, carryForwardAmount: 0 };
  };

  const makeAdvanceReason = (reason: string, carryForwardAmount: number) => {
    if (carryForwardAmount > 0) {
      return `CARRY_FORWARD_AMOUNT:${carryForwardAmount} | REASON:${reason}`;
    }
    return reason;
  };

  const getAvailableCarryOvers = () => {
    return marketWeeks.filter(w => {
      const { carryForwardRemaining } = parseWeekNote(w.note);
      return carryForwardRemaining > 0 && w.id !== selectedWeek?.id;
    });
  };

  const handlePreviewImage = (url: string) => {
    if (!url) return;
    const directUrl = getDirectDriveImageUrl(url);
    setPreviewImage(directUrl);
    if (url.includes("drive.google.com") || url.includes("docs.google.com")) {
      setPreviewOriginalUrl(url);
    } else {
      setPreviewOriginalUrl(null);
    }
  };

  const renderAttachmentThumbnail = (url: string, fallbackText: string = "ไฟล์แนบ") => {
    if (!url) return null;
    const directUrl = getDirectDriveImageUrl(url);
    return (
      <div className="w-full h-full relative group flex items-center justify-center bg-slate-100 overflow-hidden">
        <img 
          src={directUrl} 
          alt={fallbackText} 
          className="object-cover w-full h-full group-hover:scale-105 transition-transform" 
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div className="hidden absolute inset-0 bg-blue-50 text-blue-600 flex-col items-center justify-center p-1 text-center font-bold">
          <span className="text-sm">📄</span>
          <span className="text-[11px] truncate max-w-full block leading-tight font-sans font-medium">{fallbackText}</span>
        </div>
      </div>
    );
  };

  const [weekToDelete, setWeekToDelete] = useState<string | null>(null);

  const handleDeleteWeekClick = (weekId: string) => {
    setWeekToDelete(weekId);
  };

  // Only Treasurer or Committee can register a Wednesday Market week!
  const canManageMarket = currentUser.role === "treasurer" || currentUser.role === "committee";

  // Add Week Form States
  const [newWeekDate, setNewWeekDate] = useState<string>("");
  const [newWeekNote, setNewWeekNote] = useState<string>("");
  const [newTeamName, setNewTeamName] = useState<string>("");
  const [newLeaderId, setNewLeaderId] = useState<string>(currentUser.id);
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);

  // Edit Team Form States
  const [editTeamName, setEditTeamName] = useState<string>("");
  const [editLeaderId, setEditLeaderId] = useState<string>("");
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [editNote, setEditNote] = useState<string>("");

  // Add Item States
  const [itemName, setItemName] = useState<string>("");
  const [itemType, setItemType] = useState<"cost" | "revenue">("cost");
  const [itemAmount, setItemAmount] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemNote, setItemNote] = useState<string>("");
  const [itemSlipUrl, setItemSlipUrl] = useState<string>("");
  const [isAddingItem, setIsAddingItem] = useState<boolean>(false);

  const [itemLink, setItemLink] = useState<string>("");
  const [itemLinkName, setItemLinkName] = useState<string>("");

  const handleAddItemLink = () => {
    if (!itemLink) return;
    const url = itemLink.trim();
    setItemSlipUrl(url);
    setItemLink("");
    setItemLinkName("");
  };

  const [isCreatingWeek, setIsCreatingWeek] = useState<boolean>(false);
  const [isUpdatingTeam, setIsUpdatingTeam] = useState<boolean>(false);
  const [isApprovingWeek, setIsApprovingWeek] = useState<boolean>(false);
  const [isCompletingWeek, setIsCompletingWeek] = useState<boolean>(false);
  const [isDeletingWeek, setIsDeletingWeek] = useState<boolean>(false);

  const [showAdvanceModal, setShowAdvanceModal] = useState<boolean>(false);
  const [advanceAmount, setAdvanceAmount] = useState<string>("");
  const [advanceReason, setAdvanceReason] = useState<string>("");
  const [carryForwardAmountInput, setCarryForwardAmountInput] = useState<string>("0");
  const [isSubmittingAdvance, setIsSubmittingAdvance] = useState<boolean>(false);
  const [showAdvanceRejectInput, setShowAdvanceRejectInput] = useState<boolean>(false);
  const [advanceRejectReason, setAdvanceRejectReason] = useState<string>("");
  const [advanceSlipUrl, setAdvanceSlipUrl] = useState<string>("");
  const [advanceLink, setAdvanceLink] = useState<string>("");

  const handleAddAdvanceLink = (url: string) => {
    setAdvanceSlipUrl(url.trim());
    setAdvanceLink(url.trim());
  };

  const [showAdditionalAdvanceModal, setShowAdditionalAdvanceModal] = useState<boolean>(false);
  const [additionalAdvanceAmount, setAdditionalAdvanceAmount] = useState<string>("");
  const [additionalAdvanceReason, setAdditionalAdvanceReason] = useState<string>("");
  const [isSubmittingAdditionalAdvance, setIsSubmittingAdditionalAdvance] = useState<boolean>(false);
  const [showAdditionalAdvanceRejectInput, setShowAdditionalAdvanceRejectInput] = useState<boolean>(false);
  const [additionalAdvanceRejectReason, setAdditionalAdvanceRejectReason] = useState<string>("");
  const [additionalAdvanceSlipUrl, setAdditionalAdvanceSlipUrl] = useState<string>("");
  const [additionalAdvanceLink, setAdditionalAdvanceLink] = useState<string>("");

  const handleAddAdditionalAdvanceLink = (url: string) => {
    setAdditionalAdvanceSlipUrl(url.trim());
    setAdditionalAdvanceLink(url.trim());
  };

  const totalMarketCost = marketWeeks.reduce((sum, w) => sum + w.totalCost, 0);
  const totalMarketRevenue = marketWeeks.reduce((sum, w) => sum + w.totalRevenue, 0);
  const totalMarketProfit = marketWeeks.filter(w => w.status === "approved").reduce((sum, w) => sum + w.totalProfit, 0);
  const pendingMarketProfit = marketWeeks.filter(w => w.status !== "approved").reduce((sum, w) => sum + w.totalProfit, 0);

  const advParsed = selectedWeek ? parseAdvanceReason(selectedWeek.advanceReason) : { reason: "", carryForwardAmount: 0 };
  const carryAmt = advParsed.carryForwardAmount;
  const initialAmt = selectedWeek ? (selectedWeek.advanceRequested || 0) + carryAmt : 0;
  const additionalAmt = (selectedWeek && selectedWeek.additionalAdvanceStatus === "approved") ? (selectedWeek.additionalAdvanceRequested || 0) : 0;
  const totalCapital = initialAmt + additionalAmt;
  const remainingCash = selectedWeek ? selectedWeek.totalProfit + totalCapital : 0;

  const selectedWeekItems = selectedWeek ? marketItems.filter(item => item.marketWeekId === selectedWeek.id) : [];
  const selectedCosts = selectedWeekItems.filter(item => item.type === "cost");
  const selectedRevenues = selectedWeekItems.filter(item => item.type === "revenue");

  // Allow editing if status is planned/active AND user is treasurer, committee, or the team leader/member of this week
  const isWeekLeader = selectedWeek && currentUser.id === selectedWeek.leaderId;
  const isWeekMember = selectedWeek && selectedWeek.memberIds && selectedWeek.memberIds.includes(currentUser.id);
  const canEdit = selectedWeek && 
                  (selectedWeek.status === "planned" || selectedWeek.status === "active") && 
                  (currentUser.role === "treasurer" || 
                   currentUser.role === "committee" ||
                   isWeekLeader ||
                   isWeekMember);

  // Filter users that can be selected (excluding treasurer/committee if you want, but better keep all)
  const availableMembers = users.filter(u => u.isActive);

  const [newWeekSearchQuery, setNewWeekSearchQuery] = useState<string>("");
  const [editTeamSearchQuery, setEditTeamSearchQuery] = useState<string>("");

  const filteredNewWeekMembers = availableMembers.filter(u => 
    u.fullName.toLowerCase().includes(newWeekSearchQuery.toLowerCase()) || 
    (u.nickname || "").toLowerCase().includes(newWeekSearchQuery.toLowerCase()) ||
    u.studentId.includes(newWeekSearchQuery)
  );

  const filteredEditTeamMembers = availableMembers.filter(u => 
    u.fullName.toLowerCase().includes(editTeamSearchQuery.toLowerCase()) || 
    (u.nickname || "").toLowerCase().includes(editTeamSearchQuery.toLowerCase()) ||
    u.studentId.includes(editTeamSearchQuery)
  );

  const handleCreateWeekSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeekDate || isCreatingWeek) return;
    setIsCreatingWeek(true);
    setShowAddWeekModal(false);
    try {
      const res = await onCreateWeek(
        newWeekDate, 
        newWeekNote, 
        newTeamName || "กลุ่มจำหน่ายสินค้า", 
        newLeaderId, 
        newMemberIds
      );
      setSelectedWeek(res.marketWeek);
      setNewWeekDate("");
      setNewWeekNote("");
      setNewTeamName("");
      setNewLeaderId(currentUser.id);
      setNewMemberIds([]);
      setNewWeekSearchQuery("");
    } catch (err) {
      console.error(err);
      setShowAddWeekModal(true);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลงทะเบียนรอบตลาด");
    } finally {
      setIsCreatingWeek(false);
    }
  };

  const handleUpdateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWeek || !onUpdateWeekTeam || isUpdatingTeam) return;
    setIsUpdatingTeam(true);
    setShowEditTeamModal(false);
    try {
      const res = await onUpdateWeekTeam(
        selectedWeek.id,
        editTeamName,
        editLeaderId,
        editMemberIds,
        editNote
      );
      setSelectedWeek(res.marketWeek);
      setEditTeamSearchQuery("");
    } catch (err) {
      console.error(err);
      setShowEditTeamModal(true);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอัปเดตข้อมูลทีม");
    } finally {
      setIsUpdatingTeam(false);
    }
  };

  const openEditTeamModal = () => {
    if (!selectedWeek) return;
    setEditTeamName(selectedWeek.teamName || "กลุ่มจำหน่ายสินค้า");
    setEditLeaderId(selectedWeek.leaderId || selectedWeek.createdBy);
    setEditMemberIds(selectedWeek.memberIds || []);
    setEditNote(selectedWeek.note || "");
    setShowEditTeamModal(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const compressed = await compressImage(file, 800, 0.6);
      setItemSlipUrl(compressed);
    }
  };

  const handleAddItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWeek || !itemName || !itemAmount) return;
    setIsAddingItem(true);
    try {
      // We pass the base64 slip in the note or use standard onAddItem
      // Since server-side onAddItem does not have receiptUrl parameter explicitly in the original signature, 
      // let's pass a JSON or string in note to represent receiptUrl, or let the server keep it!
      // Let's check: actually MarketItem in server.ts has:
      // const newItem = { id, marketWeekId, itemName, type, amount, quantity, note, createdBy, createdAt }
      // To support receipt slip, let's embed the slipUrl inside the item's note as a JSON string or prefix:
      const notePayload = itemSlipUrl ? `SLIP_URL:${itemSlipUrl}|NOTE:${itemNote}` : itemNote;

      const res = await onAddItem(
        selectedWeek.id,
        itemName,
        itemType,
        Number(itemAmount),
        itemQuantity,
        notePayload
      );
      // Update local state for immediate feedback
      setSelectedWeek(res.marketWeek);
      setItemName("");
      setItemAmount("");
      setItemQuantity(1);
      setItemNote("");
      setItemSlipUrl("");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเพิ่มรายการ");
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleDeleteItemClick = async (itemId: string) => {
    try {
      const res = await onDeleteItem(itemId);
      setSelectedWeek(res.marketWeek);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลบรายการ");
    }
  };

  const handleUpdateRolloverMode = async (mode: "return_all" | "keep_capital" | "carry_all") => {
    if (!selectedWeek || !onUpdateWeekTeam) return;
    
    let amtToCarry = 0;
    let isCapOnly = false;
    
    if (mode === "keep_capital") {
      amtToCarry = totalCapital;
      isCapOnly = true;
    } else if (mode === "carry_all") {
      amtToCarry = remainingCash;
      isCapOnly = false;
    }
    
    const parsedNote = parseWeekNote(selectedWeek.note);
    const newNote = makeWeekNote(parsedNote.note, amtToCarry, isCapOnly);
    
    try {
      const res = await onUpdateWeekTeam(
        selectedWeek.id, 
        selectedWeek.teamName, 
        selectedWeek.leaderId, 
        selectedWeek.memberIds, 
        newNote
      );
      setSelectedWeek(res.marketWeek);
    } catch (err) {
      alert("ไม่สามารถบันทึกรูปแบบการยกยอดเงินได้: " + err);
    }
  };

  const handleAdvanceSlipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file, 800, 0.6);
      setAdvanceSlipUrl(compressed);
    }
  };

  const handleProposeAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWeek || !onProposeMarketAdvance || isSubmittingAdvance || !advanceAmount) return;
    setIsSubmittingAdvance(true);
    setShowAdvanceModal(false);
    try {
      const fullReason = makeAdvanceReason(advanceReason, Number(carryForwardAmountInput) || 0);
      const res = await onProposeMarketAdvance(selectedWeek.id, Number(advanceAmount), fullReason);
      setSelectedWeek(res.marketWeek);
      setAdvanceAmount("");
      setAdvanceReason("");
      setCarryForwardAmountInput("0");
    } catch (err) {
      console.error(err);
      setShowAdvanceModal(true);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเสนอขอทุน");
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  const handleApproveAdvance = async () => {
    if (!selectedWeek || !onApproveMarketAdvance || isSubmittingAdvance) return;
    if (!advanceSlipUrl) {
      alert("กรุณาเลือกหรืออัปโหลดสลิปการโอนเงินด้วยค่ะ");
      return;
    }
    setIsSubmittingAdvance(true);
    try {
      const res = await onApproveMarketAdvance(selectedWeek.id, "approve", undefined, advanceSlipUrl);
      setSelectedWeek(res.marketWeek);
      setAdvanceSlipUrl("");
      setShowAdvanceRejectInput(false);
      setAdvanceRejectReason("");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอนุมัติเงินทุน");
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  const handleRejectAdvance = async () => {
    if (!selectedWeek || !onApproveMarketAdvance || isSubmittingAdvance) return;
    if (!showAdvanceRejectInput) {
      setShowAdvanceRejectInput(true);
      return;
    }
    if (!advanceRejectReason) {
      alert("กรุณาระบุเหตุผลในการปฏิเสธการโอนเงินทุน");
      return;
    }
    setIsSubmittingAdvance(true);
    try {
      const res = await onApproveMarketAdvance(selectedWeek.id, "reject", advanceRejectReason);
      setSelectedWeek(res.marketWeek);
      setShowAdvanceRejectInput(false);
      setAdvanceRejectReason("");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการปฏิเสธคำขอ");
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  const handleAdditionalAdvanceSlipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file, 800, 0.6);
      setAdditionalAdvanceSlipUrl(compressed);
    }
  };

  const handleProposeAdditionalAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWeek || !onProposeMarketAdditionalAdvance || isSubmittingAdditionalAdvance || !additionalAdvanceAmount) return;
    setIsSubmittingAdditionalAdvance(true);
    setShowAdditionalAdvanceModal(false);
    try {
      const res = await onProposeMarketAdditionalAdvance(selectedWeek.id, Number(additionalAdvanceAmount), additionalAdvanceReason);
      setSelectedWeek(res.marketWeek);
      setAdditionalAdvanceAmount("");
      setAdditionalAdvanceReason("");
    } catch (err) {
      console.error(err);
      setShowAdditionalAdvanceModal(true);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเสนอขอทุนเพิ่มเติม");
    } finally {
      setIsSubmittingAdditionalAdvance(false);
    }
  };

  const handleApproveAdditionalAdvance = async () => {
    if (!selectedWeek || !onApproveMarketAdditionalAdvance || isSubmittingAdditionalAdvance) return;
    if (!additionalAdvanceSlipUrl) {
      alert("กรุณาเลือกหรืออัปโหลดสลิปการโอนเงินทุนเพิ่มเติมด้วยค่ะ");
      return;
    }
    setIsSubmittingAdditionalAdvance(true);
    try {
      const res = await onApproveMarketAdditionalAdvance(selectedWeek.id, "approve", undefined, additionalAdvanceSlipUrl);
      setSelectedWeek(res.marketWeek);
      setAdditionalAdvanceSlipUrl("");
      setShowAdditionalAdvanceRejectInput(false);
      setAdditionalAdvanceRejectReason("");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอนุมัติเงินทุนเพิ่มเติม");
    } finally {
      setIsSubmittingAdditionalAdvance(false);
    }
  };

  const handleRejectAdditionalAdvance = async () => {
    if (!selectedWeek || !onApproveMarketAdditionalAdvance || isSubmittingAdditionalAdvance) return;
    if (!showAdditionalAdvanceRejectInput) {
      setShowAdditionalAdvanceRejectInput(true);
      return;
    }
    if (!additionalAdvanceRejectReason) {
      alert("กรุณาระบุเหตุผลในการปฏิเสธการโอนเงินทุนเพิ่มเติม");
      return;
    }
    setIsSubmittingAdditionalAdvance(true);
    try {
      const res = await onApproveMarketAdditionalAdvance(selectedWeek.id, "reject", additionalAdvanceRejectReason);
      setSelectedWeek(res.marketWeek);
      setShowAdditionalAdvanceRejectInput(false);
      setAdditionalAdvanceRejectReason("");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการปฏิเสธคำขอทุนเพิ่มเติม");
    } finally {
      setIsSubmittingAdditionalAdvance(false);
    }
  };

  const handleCompleteWeekClick = async () => {
    if (!selectedWeek || isCompletingWeek) return;
    setIsCompletingWeek(true);
    try {
      const res = await onCompleteWeek(selectedWeek.id);
      setSelectedWeek(res.marketWeek);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสรุปยอดรอบตลาด");
    } finally {
      setIsCompletingWeek(false);
    }
  };

  const handleApproveWeekClick = async () => {
    if (!selectedWeek || isApprovingWeek) return;
    setIsApprovingWeek(true);
    try {
      const res = await onApproveWeek(selectedWeek.id);
      setSelectedWeek(res.marketWeek);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอนุมัติรอบตลาด");
    } finally {
      setIsApprovingWeek(false);
    }
  };

  const getWeekStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1"><CheckCircle2 size={12} /> อนุมัติสมทบทุนเรียบร้อย</span>;
      case "completed":
        return <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse"><Clock size={12} /> รอเหรัญญิกตรวจสอบ</span>;
      case "active":
        return <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full flex items-center gap-1"><Clock size={12} /> กำลังลงรายการ</span>;
      case "planned":
      default:
        return <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full flex items-center gap-1"><HelpCircle size={12} /> เตรียมวางแผน</span>;
    }
  };

  // Process item notes to separate text and slips
  const parseItemNote = (rawNote: string | undefined) => {
    if (!rawNote) return { note: "", slipUrl: "" };
    if (rawNote.startsWith("SLIP_URL:")) {
      const parts = rawNote.split("|NOTE:");
      const slipUrl = parts[0].replace("SLIP_URL:", "");
      const note = parts[1] || "";
      return { note, slipUrl };
    }
    return { note: rawNote, slipUrl: "" };
  };

  const handleExportCSV = () => {
    if (!selectedWeek) return;
    const weekFormattedDate = new Date(selectedWeek.weekDate).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
    const headers = [
      "ประเภทรายการ",
      "ชื่อสินค้า/รายการ",
      "ราคาต่อหน่วย (บาท)",
      "จำนวน",
      "ยอดรวม (บาท)",
      "ผู้บันทึก",
      "วันที่บันทึก",
      "หมายเหตุ/หลักฐาน"
    ];

    const rows: string[][] = [];

    rows.push([`"รายงานบัญชีตลาดนัดวันพุธประจำรอบวันที่: ${weekFormattedDate}"`]);
    rows.push([`"ชื่อร้านค้า/กลุ่มทีม: ${(selectedWeek.teamName || "กลุ่มทั่วไป").replace(/"/g, '""')}"`]);
    rows.push([`"ยอดขายสุทธิสะสม (รายรับ): ฿${selectedWeek.totalRevenue.toLocaleString()}"`]);
    rows.push([`"ต้นทุนใช้จ่ายสะสม (รายจ่าย): ฿${selectedWeek.totalCost.toLocaleString()}"`]);
    rows.push([`"กำไรสุทธิส่งเข้ากองทุน: ฿${selectedWeek.totalProfit.toLocaleString()}"`]);
    rows.push([]); 

    rows.push(headers.map(h => `"${h}"`));

    selectedWeekItems.forEach(item => {
      const parsed = parseItemNote(item.note);
      const typeStr = item.type === "cost" ? "ต้นทุน (รายจ่าย)" : "ยอดขาย (รายรับ)";
      const itemTotal = item.amount * item.quantity;
      const creatorStr = users.find(u => u.id === item.createdBy)?.fullName || "ระบบ";
      const dateStr = new Date(item.createdAt).toLocaleDateString("th-TH");
      const noteStr = (parsed.note || "").replace(/"/g, '""');

      rows.push([
        `"${typeStr}"`,
        `"${item.itemName.replace(/"/g, '""')}"`,
        item.amount.toFixed(2),
        item.quantity.toString(),
        itemTotal.toFixed(2),
        `"${creatorStr}"`,
        `"${dateStr}"`,
        `"${noteStr}"`
      ]);
    });

    const csvContent = rows.map(e => e.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `บัญชีตลาดวันพุธ_${selectedWeek.weekDate}_${selectedWeek.teamName || "กลุ่มทั่วไป"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!selectedWeek) return;
    const weekFormattedDate = new Date(selectedWeek.weekDate).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("กรุณาเปิดสิทธิ์ป๊อปอัพเพื่อพิมพ์ไฟล์ PDF");
      return;
    }

    const renderPdfItem = (url: string) => {
      if (!url) return "";
      const directUrl = getDirectDriveImageUrl(url);
      const absUrl = directUrl.startsWith('/') ? `${window.location.origin}${directUrl}` : directUrl;
      const originalDriveLink = (url.includes("drive.google.com") || url.includes("docs.google.com")) ? url : null;

      return `
        <div style="text-align: center; margin-top: 6px;">
          <img src="${absUrl}" referrerpolicy="no-referrer" style="max-height: 160px; max-width: 140px; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,0.08);" />
          ${originalDriveLink ? `
            <a href="${originalDriveLink}" target="_blank" style="font-size: 8px; color: #2563eb; font-weight: 600; text-decoration: underline; display: block; margin-top: 3px;">
              🔗 เปิดใน Google Drive
            </a>
          ` : ""}
        </div>
      `;
    };

    const renderPdfThumbnail = (url: string, size = 36) => {
      if (!url) return "";
      const directUrl = getDirectDriveImageUrl(url);
      const absUrl = directUrl.startsWith('/') ? `${window.location.origin}${directUrl}` : directUrl;
      return `<img src="${absUrl}" referrerpolicy="no-referrer" style="width: ${size}px; height: ${size}px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1; vertical-align: middle;" />`;
    };

    const costsHtml = selectedCosts.length === 0 
      ? `<tr><td colspan="4" style="text-align:center; padding: 10px; color:#888; font-style:italic;">ไม่มีรายการรายจ่ายในขณะนี้</td></tr>`
      : selectedCosts.map(item => {
          const parsed = parseItemNote(item.note);
          return `
            <tr>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:left; vertical-align: middle;">
                <div style="font-weight: 600; color: #0f172a;">${item.itemName}</div>
                ${parsed.note ? `<div style="font-size: 9px; color:#64748b; margin-top: 1px;">หมายเหตุ: ${parsed.note}</div>` : ""}
                ${parsed.slipUrl ? `
                  <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                    ${renderPdfThumbnail(parsed.slipUrl, 32)}
                    <span style="font-size: 8px; color: #64748b;">แนบใบเสร็จ</span>
                  </div>
                ` : ""}
              </td>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:right; font-family: 'Inter'; font-weight: 500; vertical-align: middle;">฿${item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:center; font-family: 'Inter'; vertical-align: middle;">${item.quantity}</td>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:right; font-family: 'Inter'; font-weight: 600; vertical-align: middle;">฿${(item.amount * item.quantity).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            </tr>
          `;
        }).join("");

    const revenuesHtml = selectedRevenues.length === 0
      ? `<tr><td colspan="4" style="text-align:center; padding: 10px; color:#888; font-style:italic;">ไม่มีรายการรายรับในขณะนี้</td></tr>`
      : selectedRevenues.map(item => {
          const parsed = parseItemNote(item.note);
          return `
            <tr>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:left; vertical-align: middle;">
                <div style="font-weight: 600; color: #0f172a;">${item.itemName}</div>
                ${parsed.note ? `<div style="font-size: 9px; color:#64748b; margin-top: 1px;">หมายเหตุ: ${parsed.note}</div>` : ""}
                ${parsed.slipUrl ? `
                  <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                    ${renderPdfThumbnail(parsed.slipUrl, 32)}
                    <span style="font-size: 8px; color: #64748b;">แนบสลิป</span>
                  </div>
                ` : ""}
              </td>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:right; font-family: 'Inter'; font-weight: 500; vertical-align: middle;">฿${item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:center; font-family: 'Inter'; vertical-align: middle;">${item.quantity}</td>
              <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align:right; font-family: 'Inter'; font-weight: 600; vertical-align: middle;">฿${(item.amount * item.quantity).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            </tr>
          `;
        }).join("");

    // Initial Advance Capital details & slip
    const hasAdvance = selectedWeek.advanceStatus === "approved" || (selectedWeek.advanceRequested && selectedWeek.advanceRequested > 0);
    const hasAdditional = selectedWeek.additionalAdvanceStatus === "approved" || (selectedWeek.additionalAdvanceRequested && selectedWeek.additionalAdvanceRequested > 0);

    let advanceHtml = "";
    if (hasAdvance || hasAdditional) {
      advanceHtml = `
        <div class="table-title">💵 ข้อมูลเงินทุนสำรองล่วงหน้า (Advance Capital)</div>
        <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 0 -12px 15px -12px; page-break-inside: avoid;">
          <tr>
            ${hasAdvance ? `
              <td style="width: ${hasAdditional ? '50%' : '100%'}; vertical-align: top; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #fafafa; box-sizing: border-box;">
                <h4 style="margin: 0 0 6px 0; color: #1e3a8a; font-size: 11px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">💵 ทุนสำรองล่วงหน้าหลัก (Initial Advance)</h4>
                <div style="font-size: 10px; line-height: 1.5; color: #334155;">
                   <div style="margin-bottom: 3px;"><strong>จำนวนเงิน:</strong> <span style="font-family: 'Inter'; font-weight: 600;">฿${(selectedWeek.advanceRequested || 0).toLocaleString()}</span></div>
                  <div style="margin-bottom: 3px;"><strong>ผู้อนุมัติ:</strong> ${selectedWeek.advanceApprovedBy ? (users.find(u => u.id === selectedWeek.advanceApprovedBy)?.fullName || selectedWeek.advanceApprovedBy) : "-"}</div>
                  <div style="margin-bottom: 3px;"><strong>วันที่โอน:</strong> ${selectedWeek.advanceApprovedAt ? new Date(selectedWeek.advanceApprovedAt).toLocaleString("th-TH") : "-"}</div>
                </div>
                ${selectedWeek.advanceReceiptUrl ? `
                  <div style="margin-top: 8px; text-align: center;">
                    <span style="font-size: 8px; color: #64748b; display: block; margin-bottom: 4px; font-weight: 500;">หลักฐานการโอนทุนหลัก</span>
                    ${renderPdfItem(selectedWeek.advanceReceiptUrl)}
                  </div>
                ` : ""}
              </td>
            ` : ""}
            
            ${hasAdditional ? `
              <td style="width: ${hasAdvance ? '50%' : '100%'}; vertical-align: top; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #fafafa; box-sizing: border-box;">
                <h4 style="margin: 0 0 6px 0; color: #7e22ce; font-size: 11px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">💜 ทุนสำรองล่วงหน้าเพิ่มเติม (Additional Advance)</h4>
                <div style="font-size: 10px; line-height: 1.5; color: #334155;">
                  <div style="margin-bottom: 3px;"><strong>จำนวนเงิน:</strong> <span style="font-family: 'Inter'; font-weight: 600;">฿${(selectedWeek.additionalAdvanceRequested || 0).toLocaleString()}</span></div>
                  <div style="margin-bottom: 3px;"><strong>เหตุผลที่ขอ:</strong> ${selectedWeek.additionalAdvanceReason || "-"}</div>
                  <div style="margin-bottom: 3px;"><strong>ผู้อนุมัติ:</strong> ${selectedWeek.additionalAdvanceApprovedBy ? (users.find(u => u.id === selectedWeek.additionalAdvanceApprovedBy)?.fullName || selectedWeek.additionalAdvanceApprovedBy) : "-"}</div>
                  <div style="margin-bottom: 3px;"><strong>วันที่โอน:</strong> ${selectedWeek.additionalAdvanceApprovedAt ? new Date(selectedWeek.additionalAdvanceApprovedAt).toLocaleString("th-TH") : "-"}</div>
                </div>
                ${selectedWeek.additionalAdvanceReceiptUrl ? `
                  <div style="margin-top: 8px; text-align: center;">
                    <span style="font-size: 8px; color: #64748b; display: block; margin-bottom: 4px; font-weight: 500;">หลักฐานการโอนทุนเพิ่มเติม</span>
                    ${renderPdfItem(selectedWeek.additionalAdvanceReceiptUrl)}
                  </div>
                ` : ""}
              </td>
            ` : ""}
          </tr>
        </table>
      `;
    }

    printWindow.document.write(`
      <html>
        <head>
          <base href="${window.location.origin}/">
          <meta name="referrer" content="no-referrer">
          <title>รายงานบัญชีตลาดวันพุธ - ${selectedWeek.teamName || "กลุ่มทั่วไป"}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
          <style>
            body { 
              font-family: 'Sarabun', 'Inter', "Tahoma", sans-serif; 
              font-size: 12px; 
              color: #1e293b; 
              margin: 0; 
              padding: 0; 
              line-height: 1.5; 
              background-color: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @page {
              size: A4;
              margin: 20mm 20mm 20mm 20mm;
            }
            .header { 
              text-align: center; 
              margin-bottom: 24px; 
              border-bottom: 3px double #cbd5e1; 
              padding-bottom: 14px; 
            }
            .title { 
              font-size: 20px; 
              font-weight: 700; 
              color: #0f172a; 
              margin-bottom: 4px; 
              letter-spacing: -0.5px; 
            }
            .subtitle { 
              font-size: 11.5px; 
              color: #64748b; 
              font-weight: 500; 
            }
            
            .meta-table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px; 
              background: #f8fafc; 
              border: 1px solid #e2e8f0; 
              border-radius: 12px; 
            }
            .meta-table td { 
              padding: 10px 14px; 
              border: none; 
              font-size: 12px; 
              color: #334155; 
              line-height: 1.5; 
            }
            .meta-table td strong { 
              color: #0f172a; 
              font-weight: 600;
            }
            
            .status-badge { 
              display: inline-block; 
              padding: 2px 8px; 
              border-radius: 9999px; 
              font-weight: 600; 
              font-size: 10.5px; 
            }
            .status-approved { 
              background: #dcfce7; 
              color: #15803d; 
            }
            .status-pending { 
              background: #fef9c3; 
              color: #a16207; 
            }
 
            .summary-table { 
              width: 100%; 
              border-collapse: separate; 
              border-spacing: 14px 0; 
              margin: 0 -14px 24px -14px; 
              page-break-inside: avoid;
            }
            .summary-cell { 
              padding: 16px; 
              border-radius: 12px; 
              text-align: center; 
              border: 1px solid #e2e8f0; 
              width: 33.33%;
              box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }
            .cost-cell { 
              border-top: 4px solid #ef4444;
              background: #fdf2f2; 
            }
            .revenue-cell { 
              border-top: 4px solid #10b981;
              background: #f0fdf4; 
            }
            .profit-cell { 
              border-top: 4px solid #3b82f6;
              background: #f8fafc; 
            }
            .summary-label { 
              font-size: 11px; 
              font-weight: 700; 
              color: #64748b; 
              text-transform: uppercase; 
              letter-spacing: 0.5px; 
              margin-bottom: 6px; 
            }
            .summary-value { 
              font-size: 18px; 
              font-weight: 700; 
              font-family: 'Inter', sans-serif; 
            }
            .text-danger { color: #b91c1c; }
            .text-success { color: #047857; }
            .text-primary { color: #1e40af; }
 
            .table-title { 
              font-size: 13.5px; 
              font-weight: 700; 
              margin-top: 24px; 
              margin-bottom: 10px; 
              color: #0f172a; 
              border-bottom: 2px solid #3b82f6; 
              padding-bottom: 6px; 
              display: flex; 
              align-items: center; 
              gap: 8px; 
              page-break-after: avoid;
            }
            
            table.data-table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 24px; 
            }
            table.data-table th { 
              background: #f1f5f9; 
              padding: 10px 12px; 
              text-align: left; 
              border-bottom: 2px solid #cbd5e1; 
              font-weight: 700; 
              color: #334155; 
              font-size: 12px; 
            }
            table.data-table td { 
              padding: 8px 12px; 
              border-bottom: 1px solid #e2e8f0; 
              font-size: 12px; 
              color: #334155; 
              vertical-align: middle; 
            }
            
            .footer-note { 
              text-align: center; 
              color: #94a3b8; 
              font-size: 11px; 
              margin-top: 40px; 
              border-top: 1px dashed #cbd5e1; 
              padding-top: 15px; 
              page-break-inside: avoid;
            }
 
            @media print {
              body { margin: 10mm 10mm; }
              tr { page-break-inside: avoid; }
              .table-title { page-break-after: avoid; }
              .footer-note { page-break-inside: avoid; }
              table { page-break-inside: auto; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">รายงานสรุปบัญชีตลาดนัดวันพุธ (Wednesday Market)</div>
            <div class="subtitle">ระบบสารสนเทศเพื่อความโปร่งใสกองทุนห้องเรียน</div>
          </div>
          
          <table class="meta-table">
            <tr>
              <td style="width: 50%;"><strong>ชื่อร้านค้า/กลุ่มทีม:</strong> ${selectedWeek.teamName || "กลุ่มจำหน่ายสินค้าทั่วไป"}</td>
              <td style="width: 50%;"><strong>รอบสัปดาห์วันที่:</strong> ${weekFormattedDate}</td>
            </tr>
            <tr>
              <td style="width: 50%;"><strong>หัวหน้าทีมผู้รับผิดชอบ:</strong> ${users.find(u => u.id === selectedWeek.leaderId)?.fullName || "ไม่ระบุ"}</td>
              <td style="width: 50%;">
                <strong>สถานะ:</strong> 
                <span class="status-badge ${selectedWeek.status === "approved" ? "status-approved" : "status-pending"}">
                  ${selectedWeek.status === "approved" ? "ตรวจสอบและอนุมัติแล้ว" : "รอดำเนินการอนุมัติ"}
                </span>
              </td>
            </tr>
          </table>

          <table class="summary-table">
            <tr>
              <td class="summary-cell cost-cell">
                <div class="summary-label">ต้นทุนวัตถุดิบ (รายจ่าย)</div>
                <div class="summary-value text-danger">฿${selectedWeek.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              </td>
              <td class="summary-cell revenue-cell">
                <div class="summary-label">ยอดขายสินค้า (รายรับ)</div>
                <div class="summary-value text-success">฿${selectedWeek.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              </td>
              <td class="summary-cell profit-cell">
                <div class="summary-label">กำไรสุทธิโอนเข้าส่วนกลาง</div>
                <div class="summary-value text-primary">฿${selectedWeek.totalProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              </td>
            </tr>
          </table>

          ${advanceHtml}

          <div class="table-title">🔴 บันทึกรายจ่าย / ต้นทุนการซื้อของ</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50%; text-align:left;">ชื่อรายการสินค้า</th>
                <th style="width: 20%; text-align:right;">ราคาต่อหน่วย</th>
                <th style="width: 10%; text-align:center;">จำนวน</th>
                <th style="width: 20%; text-align:right;">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              ${costsHtml}
            </tbody>
          </table>

          <div class="table-title">🟢 บันทึกรายรับ / ยอดจำหน่ายสินค้า</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50%; text-align:left;">ชื่อรายการสินค้า</th>
                <th style="width: 20%; text-align:right;">ราคาต่อหน่วย</th>
                <th style="width: 10%; text-align:center;">จำนวน</th>
                <th style="width: 20%; text-align:right;">ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              ${revenuesHtml}
            </tbody>
          </table>

          <div class="footer-note">
            พิมพ์สรุปรายงานบัญชีทางอิเล็กทรอนิกส์จากระบบ ณ วันที่ ${new Date().toLocaleDateString("th-TH")} เวลา ${new Date().toLocaleTimeString("th-TH")} น.
          </div>

          <script>
            (function() {
              var printed = false;
              function triggerPrint() {
                if (printed) return;
                printed = true;
                setTimeout(function() {
                  window.print();
                  setTimeout(function() { window.close(); }, 800);
                }, 500);
              }

              function checkAndPrint() {
                var imgs = Array.from(document.getElementsByTagName('img'));
                if (imgs.length === 0) {
                  triggerPrint();
                  return;
                }

                var totalImgs = imgs.length;
                var loadedImgs = 0;

                function onImgDone() {
                  loadedImgs++;
                  if (loadedImgs >= totalImgs) {
                    triggerPrint();
                  }
                }

                var safetyTimeout = setTimeout(triggerPrint, 4000);

                imgs.forEach(function(img) {
                  if (img.complete && img.naturalWidth !== 0) {
                    onImgDone();
                  } else {
                    img.addEventListener('load', onImgDone);
                    img.addEventListener('error', onImgDone);
                  }
                });
              }

              if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(checkAndPrint, 100);
              } else {
                window.addEventListener('load', checkAndPrint);
                document.addEventListener('DOMContentLoaded', checkAndPrint);
              }
            })();
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Member toggle helpers for creation/edition checkbox lists
  const toggleMemberSelection = (id: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(id)) {
      setter(list.filter(m => m !== id));
    } else {
      setter([...list, id]);
    }
  };

  // Leaders leaderboard calculation
  const approvedWeeks = marketWeeks.filter(w => w.status === "approved" || w.status === "completed");
  const leaderboardWeeks = [...approvedWeeks].sort((a, b) => b.totalProfit - a.totalProfit);
  const maxProfit = leaderboardWeeks[0]?.totalProfit || 1;

  return (
    <div className="space-y-6">
      {/* Market Overview Header & Top KPI Summary Cards */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <ShoppingBag size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  ตลาดนัดวันพุธ (Wednesday Market)
                </h1>
                <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 px-2.5 py-0.5 rounded-full tabular-nums">
                  {marketWeeks.length} สัปดาห์
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                บริหารจัดการทุนหมุนเวียน ลงบัญชีรายรับ-รายจ่าย และจัดอันดับผลงานทีมขายสินค้าเพื่อสมทบกองทุนรุ่น
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canManageMarket && (
              <button 
                type="button"
                onClick={() => {
                  setNewLeaderId(currentUser.id);
                  setNewMemberIds([]);
                  setShowAddWeekModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/15 transition-all cursor-pointer active:scale-95"
              >
                <Plus size={15} /> ลงทะเบียนรอบตลาดใหม่
              </button>
            )}
          </div>
        </div>

        {/* 3 Main KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
          {/* KPI 1: กำไรสุทธิรวม */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white border border-blue-200/80 flex flex-col justify-between gap-2 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                <TrendingUp size={15} className="text-blue-600" /> กำไรสุทธิรวม (อนุมัติแล้ว)
              </span>
              {pendingMarketProfit !== 0 && (
                <span className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 rounded-full tabular-nums">
                  รอตรวจ ฿{pendingMarketProfit.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <span className="text-xl sm:text-2xl font-extrabold text-blue-700 font-mono tabular-nums tracking-tight">
                ฿{totalMarketProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-semibold text-blue-600/80">สมทบเข้ากองทุนกลาง</span>
            </div>
          </div>

          {/* KPI 2: รายรับรวม */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex flex-col justify-between gap-2 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <ArrowUpRight size={15} className="text-emerald-600" /> รายรับรวม (ยอดขายสะสม)
              </span>
              <span className="text-[11px] font-bold bg-emerald-100/70 text-emerald-800 px-2 py-0.5 rounded-full">
                Gross Revenue
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <span className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono tabular-nums tracking-tight">
                ฿{totalMarketRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700/80">ยอดขายหน้าร้านรวม</span>
            </div>
          </div>

          {/* KPI 3: ต้นทุนรวม */}
          <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200/80 flex flex-col justify-between gap-2 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <ShoppingBag size={15} className="text-rose-600" /> ต้นทุนรวม (รายจ่ายสะสม)
              </span>
              <span className="text-[11px] font-bold bg-rose-100/70 text-rose-800 px-2 py-0.5 rounded-full">
                Total Cost
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <span className="text-xl sm:text-2xl font-extrabold text-rose-600 font-mono tabular-nums tracking-tight">
                ฿{totalMarketCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-semibold text-rose-600/80">ค่าวัตถุดิบและอุปกรณ์</span>
            </div>
          </div>
        </div>

        {/* Segmented Tab Bar */}
        <div className="flex overflow-x-auto gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 no-scrollbar">
          <button 
            type="button"
            onClick={() => setActiveTab("accounting")}
            className={`flex-1 sm:flex-initial px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === "accounting" 
                ? "bg-white text-blue-600 shadow-xs border border-slate-200/60" 
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <FileText size={15} className={activeTab === "accounting" ? "text-blue-600" : "text-slate-400"} />
            <span>สัปดาห์ตลาดนัด</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`flex-1 sm:flex-initial px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === "schedule" 
                ? "bg-white text-indigo-600 shadow-xs border border-slate-200/60" 
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Users size={15} className={activeTab === "schedule" ? "text-indigo-600" : "text-slate-400"} />
            <span>จัดทีมขาย & ตารางเวร</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={`flex-1 sm:flex-initial px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === "leaderboard" 
                ? "bg-white text-amber-600 shadow-xs border border-slate-200/60" 
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Award size={15} className="text-amber-500" />
            <span>อันดับกำไรสูงสุด</span>
          </button>
        </div>
      </div>

      {activeTab === "accounting" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* List of weeks */}
          <div className="md:col-span-1 space-y-4">
            {/* สรุปการเงินตลาดสะสมรวม (Cumulative Market Summary) */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                📊 สรุปยอดเงินตลาดทั้งหมด
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">ยอดขายรวม (รายรับ):</span>
                  <strong className="text-emerald-600 font-mono font-bold tabular-nums">฿{totalMarketRevenue.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">ต้นทุนรวม (รายจ่าย):</span>
                  <strong className="text-rose-600 font-mono font-bold tabular-nums">฿{totalMarketCost.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="font-semibold text-slate-700">กำไรสะสมโอนแล้ว:</span>
                  <strong className="text-blue-600 font-mono font-bold tabular-nums">฿{totalMarketProfit.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">กำไรรอตรวจสอบ:</span>
                  <strong className="text-amber-600 font-mono font-bold tabular-nums">฿{pendingMarketProfit.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">รอบสัปดาห์ตลาดนัด</h3>
                {canManageMarket && (
                  <button 
                    onClick={() => {
                      setNewLeaderId(currentUser.id);
                      setNewMemberIds([]);
                      setShowAddWeekModal(true);
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Plus size={13} /> เพิ่มรอบ
                  </button>
                )}
              </div>
              
              <div className="flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto pb-2 md:pb-0 snap-x scrollbar-none">
                {marketWeeks.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs w-full">ไม่มีสัปดาห์ที่ลงทะเบียน</div>
                ) : (
                  marketWeeks.map((week) => (
                    <div 
                      key={week.id}
                      onClick={() => setSelectedWeek(week)}
                      className={`p-3.5 rounded-2xl cursor-pointer transition-all border text-xs min-w-[180px] md:min-w-0 snap-start shrink-0 ${
                        selectedWeek?.id === week.id 
                          ? "border-blue-500 bg-blue-50/50 font-bold shadow-2xs ring-2 ring-blue-500/10" 
                          : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/70 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-slate-800">
                          {new Date(week.weekDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          week.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" :
                          week.status === "completed" ? "bg-blue-50 text-blue-700 border-blue-200/80" : "bg-amber-50 text-amber-700 border-amber-200/80"
                        }`}>
                          {week.status === "approved" ? "อนุมัติแล้ว" : week.status === "completed" ? "รอตรวจ" : "ลงรายการ"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2.5 text-[11px] text-slate-500 gap-2">
                        <span className="truncate font-medium">{week.teamName || "กลุ่มทั่วไป"}</span>
                        <span className="font-mono font-bold text-blue-600 tabular-nums shrink-0">
                          {week.status === "approved" ? "฿" + week.totalProfit.toLocaleString() : "฿" + week.totalProfit.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Week details sheet */}
          <div className="md:col-span-3 space-y-6">
            {selectedWeek ? (
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-6">
                
                {/* Week & Team Header info */}
                <div className="border-b border-slate-200/80 pb-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        ร้านค้าและทีมจำหน่ายสินค้าประจำสัปดาห์
                      </span>
                      <h2 className="text-lg font-bold text-slate-800 mt-2 flex items-center gap-2">
                        <span>{selectedWeek.teamName || "กลุ่มจำหน่ายสินค้าทั่วไป"}</span>
                        {(currentUser.role === "treasurer" || currentUser.role === "committee") && (
                          <button 
                            onClick={openEditTeamModal}
                            className="text-slate-400 hover:text-blue-600 p-1.5 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all cursor-pointer"
                            title="แก้ไขข้อมูลทีม"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        {(currentUser.role === "treasurer" || (selectedWeek.createdBy === currentUser.id && selectedWeek.status !== "approved")) && (
                          <button 
                            onClick={() => handleDeleteWeekClick(selectedWeek.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-xl hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all cursor-pointer"
                            title="ลบรอบตลาดนี้"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        รอบบัญชีจำหน่ายสินค้าประจำวันพุธที่ {new Date(selectedWeek.weekDate).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-wrap items-center gap-2">
                      <button 
                        onClick={handleExportCSV}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs px-3.5 py-2 flex items-center gap-1.5 transition-all border border-emerald-200/80 cursor-pointer shadow-2xs"
                        title="ดาวน์โหลดเป็นไฟล์ Excel (CSV)"
                      >
                        📥 Excel
                      </button>
                      <button 
                        onClick={handleExportPDF}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs px-3.5 py-2 flex items-center gap-1.5 transition-all border border-blue-200/80 cursor-pointer shadow-2xs"
                        title="ดาวน์โหลดเป็นไฟล์ PDF หรือ พิมพ์รายงาน"
                      >
                        📄 PDF / พิมพ์
                      </button>
                      {getWeekStatusBadge(selectedWeek.status)}
                    </div>
                  </div>

                  {/* Team Members List details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600">
                    <div className="flex items-start gap-3">
                      <div className="bg-rose-50 text-rose-600 p-2 rounded-xl border border-rose-200/80 mt-0.5 shrink-0">
                        <UserIcon size={15} />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase">หัวหน้าทีมผู้กรอกเงิน</span>
                        <p className="font-bold text-slate-800 mt-0.5">
                          {users.find(u => u.id === selectedWeek.leaderId)?.fullName || "ไม่ได้ระบุ"}
                          <span className="text-[11px] text-slate-500 font-normal ml-1">
                            ({users.find(u => u.id === selectedWeek.leaderId)?.nickname || "ไม่มี"})
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl border border-indigo-200/80 mt-0.5 shrink-0">
                        <Users size={15} />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase">รายชื่อสมาชิกทีมทั้งหมด</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(!selectedWeek.memberIds || selectedWeek.memberIds.length === 0) ? (
                            <span className="text-slate-400 italic text-xs">ไม่มีเพื่อนในทีม</span>
                          ) : (
                            selectedWeek.memberIds.map(memberId => {
                              const found = users.find(u => u.id === memberId);
                              return (
                                <span 
                                  key={memberId}
                                  className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-lg"
                                >
                                  {found ? `${found.fullName} (${found.nickname})` : "ไม่พบสมาชิก"}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedWeek.note && (
                      <div className="md:col-span-2 border-t border-slate-200/80 pt-3 mt-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">หมายเหตุร้านค้า: </span>
                        <span className="text-slate-700 font-medium">{parseWeekNote(selectedWeek.note).note || selectedWeek.note}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Guide alert banner for Capital Rollovers / Loss carrying */}
                <div className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-200/80 rounded-3xl p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="bg-purple-100 text-purple-700 p-2 rounded-2xl text-base shrink-0">
                      💡
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-800 text-sm">คู่มือ: วิธีจัดการทุนยกยอดเมื่อขายขาดทุน 💰</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        หากสัปดาห์แรกหรือรอบการขายใด ๆ ที่ผ่านมา<strong>ขาดทุน</strong> และคุณต้องการยกเงินทุนที่เหลืออยู่ทั้งหมดไปเป็นทุนหมุนเวียนในการขายรอบถัดไปโดยไม่ต้องโอนคืนเหรัญญิก สามารถทำตามขั้นตอนง่าย ๆ ดังนี้ค่ะ:
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:pl-11 text-xs text-slate-600">
                    <div className="bg-white/90 p-3.5 rounded-2xl border border-purple-200/60 space-y-1 shadow-2xs">
                      <span className="font-bold text-purple-700 block">ขั้นตอนที่ 1: ติ๊ก "ขอยกยอดเงินทุน"</span>
                      <p className="leading-relaxed text-[11px]">
                        ในสัปดาห์ที่ขายเสร็จ (ก่อนส่งสรุปยอด) ให้เลื่อนลงไปด้านล่างสุด แล้วติ๊กเครื่องหมายถูกที่ช่อง <strong>"🔄 ขอยกยอดเงินทุนคงเหลือ..."</strong> เพื่อให้ระบบทราบว่าเงินสดที่เหลือทั้งหมดในมือจะถูกนำไปลงทุนรอบต่อไปโดยตรง (ไม่ต้องโอนคืนส่วนกลาง)
                      </p>
                    </div>
                    <div className="bg-white/90 p-3.5 rounded-2xl border border-blue-200/60 space-y-1 shadow-2xs">
                      <span className="font-bold text-blue-700 block">ขั้นตอนที่ 2: กดดึงยอดในรอบใหม่</span>
                      <p className="leading-relaxed text-[11px]">
                        เมื่อตั้งรอบตลาดใหม่ ในขณะที่กรอก <strong>"ขอเบิกเงินทุนล่วงหน้า"</strong> ระบบจะขึ้นปุ่มสีขาวตรวจพบยอดค้างให้กด <strong>"ดึงเงินทุนยกมาจากรอบก่อนหน้า"</strong> อัตโนมัติ ยอดนั้นจะมาเป็นทุนเริ่มต้นของรอบใหม่ทันทีโดยที่คุณไม่ต้องโอนเพิ่มค่ะ!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Advance Capital Request Panel */}
                <div className="bg-slate-50/90 border border-slate-200/80 rounded-3xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 text-blue-700 p-2.5 rounded-2xl text-lg shrink-0">
                        💰
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">เงินทุนสำรองล่วงหน้าตลาด (Advance Capital)</h4>
                        <p className="text-[11px] text-slate-500">การขอเบิกเงินทุนกลางล่วงหน้าก่อนออกเดินทางไปซื้อวัตถุดิบจัดเตรียมร้าน</p>
                      </div>
                    </div>
                    <div>
                      {/* Propose Button */}
                      {(!selectedWeek.advanceStatus || selectedWeek.advanceStatus === "none" || selectedWeek.advanceStatus === "rejected") && 
                       (selectedWeek.status === "planned" || selectedWeek.status === "active") && 
                       (currentUser.role === "treasurer" || currentUser.role === "committee" || currentUser.id === selectedWeek.leaderId) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAdvanceAmount("");
                            setAdvanceReason("");
                            setShowAdvanceModal(true);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/10 transition-all cursor-pointer"
                        >
                          💸 ส่งคำขอเบิกทุนล่วงหน้า
                        </button>
                      )}

                      {selectedWeek.advanceStatus === "pending" && (
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                          ⏳ รออนุมัติโอนเงินทุน
                        </span>
                      )}

                      {selectedWeek.advanceStatus === "approved" && (() => {
                        const advParsed = parseAdvanceReason(selectedWeek.advanceReason);
                        const totalCap = (selectedWeek.advanceRequested || 0) + advParsed.carryForwardAmount;
                        return (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5 tabular-nums">
                            ✅ ได้รับทุนแล้ว ฿{totalCap.toLocaleString()} {advParsed.carryForwardAmount > 0 && `(ยกมา ฿${advParsed.carryForwardAmount.toLocaleString()})`}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Pending Request & Treasurer Review Form */}
                  {selectedWeek.advanceStatus === "pending" && (
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3.5">
                      {(() => {
                        const advParsed = parseAdvanceReason(selectedWeek.advanceReason);
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold block uppercase">ทุนใหม่ที่ขอโอน:</span>
                              <strong className="text-blue-600 text-sm font-bold font-mono tabular-nums">฿{(selectedWeek.advanceRequested || 0).toLocaleString()}</strong>
                            </div>
                            {advParsed.carryForwardAmount > 0 && (
                              <div>
                                <span className="text-[11px] text-purple-600 font-bold block uppercase">ทุนยกมาจากรอบก่อนหน้า:</span>
                                <strong className="text-purple-700 text-sm font-bold font-mono tabular-nums">฿{advParsed.carryForwardAmount.toLocaleString()}</strong>
                              </div>
                            )}
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold block uppercase">เหตุผลความจำเป็น:</span>
                              <p className="text-slate-700 font-medium mt-0.5">{advParsed.reason || "ไม่มีระบุเหตุผล"}</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Treasurer Review Panel */}
                      {currentUser.role === "treasurer" ? (
                        <div className="border-t border-slate-100 pt-3.5 space-y-3">
                          <label className="block text-xs font-bold text-slate-700">
                            กล่องสลิปโอนเงิน (เหรัญญิกกรุณาอัปโหลดรูปภาพสลิปหลักฐานโอนเงินทุน):
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2.5 rounded-xl text-xs cursor-pointer border border-slate-200/80 transition-all">
                              <ImageIcon size={14} />
                              <input 
                                type="file" 
                                accept="image/*" 
                                onChange={handleAdvanceSlipFileChange} 
                                className="hidden" 
                              />
                              {advanceSlipUrl ? (advanceSlipUrl.startsWith("http") ? "เปลี่ยนลิงก์แนบ" : "เปลี่ยนรูปภาพสลิป") : "เลือกแนบรูปภาพสลิป"}
                            </label>
                            {advanceSlipUrl && (
                              <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-200/80">
                                <span className="truncate max-w-[140px]">{advanceSlipUrl.startsWith("http") ? "ลิงก์ออนไลน์" : "แนบสลิปแล้ว"}</span>
                                <button type="button" onClick={() => setAdvanceSlipUrl("")} className="text-rose-500 hover:text-rose-700 ml-1">
                                  <X size={13} />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2 text-xs">
                            <span className="block text-[11px] font-bold text-slate-500 uppercase">หรือ แนบลิงก์ Google Drive / ลิงก์แนบภายนอก:</span>
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                placeholder="วางลิงก์ https://drive.google.com/..."
                                value={advanceLink}
                                onChange={(e) => handleAddAdvanceLink(e.target.value)}
                                className="w-full p-2.5 border border-slate-200/80 rounded-xl text-xs bg-white focus:outline-none"
                              />
                            </div>
                          </div>

                          {showAdvanceRejectInput && (
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-500 uppercase">เหตุผลการปฏิเสธคำขอ:</label>
                              <input 
                                type="text"
                                value={advanceRejectReason}
                                onChange={(e) => setAdvanceRejectReason(e.target.value)}
                                placeholder="ระบุเหตุผล เช่น ยอดสูงเกินไป, งบสัปดาห์นี้ไม่พอ..."
                                className="w-full p-2.5 border border-slate-200/80 rounded-xl focus:outline-none text-xs"
                              />
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleApproveAdvance}
                              disabled={isSubmittingAdvance}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                            >
                              {isSubmittingAdvance ? "กำลังบันทึก..." : "อนุมัติและโอนทุน"}
                            </button>
                            <button
                              type="button"
                              onClick={handleRejectAdvance}
                              disabled={isSubmittingAdvance}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              {showAdvanceRejectInput ? "ยืนยันปฏิเสธ" : "ปฏิเสธคำขอ"}
                            </button>
                            {showAdvanceRejectInput && (
                              <button
                                type="button"
                                onClick={() => { setShowAdvanceRejectInput(false); setAdvanceRejectReason(""); }}
                                className="text-slate-500 hover:text-slate-700 text-xs font-medium ml-1"
                              >
                                ยกเลิก
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="border-t border-slate-100 pt-3 text-xs text-slate-500 italic">
                          คำขอของทีมคุณส่งถึงเหรัญญิกแล้วค่ะ กรุณารอรับโอนเงินและแนบสลิปจากหน้ากองกลาง
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rejected request message */}
                  {selectedWeek.advanceStatus === "rejected" && (
                    <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 text-xs text-rose-700 space-y-1">
                      <strong className="block font-bold">⚠️ คำขอเบิกเงินทุนล่วงหน้าถูกปฏิเสธ:</strong>
                      <p className="font-medium text-xs text-rose-600">เหตุผล: {selectedWeek.advanceRejectReason || "ไม่มีเหตุผลระบุ"}</p>
                      <p className="text-[11px] text-slate-500 mt-1.5">คุณสามารถกดปุ่ม "ส่งคำขอเบิกทุนล่วงหน้า" ด้านบนเพื่อแก้ไขจำนวนและขอเบิกใหม่อีกครั้งได้ค่ะ</p>
                    </div>
                  )}

                  {/* Approved capital & Slip Display */}
                  {selectedWeek.advanceStatus === "approved" && (
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs">
                      {(() => {
                        const advParsed = parseAdvanceReason(selectedWeek.advanceReason);
                        return (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <span className="text-[11px] text-slate-500 font-bold uppercase block">เงินทุนสำรองของสัปดาห์นี้:</span>
                              <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
                                <span className="font-bold text-slate-800 text-sm font-mono tabular-nums">
                                  ทุนรวม: ฿{((selectedWeek.advanceRequested || 0) + advParsed.carryForwardAmount).toLocaleString()}
                                </span>
                                {advParsed.carryForwardAmount > 0 && (
                                  <span className="text-purple-700 font-semibold text-[11px] bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200/80 tabular-nums">
                                    (ยกมาจากรอบก่อน ฿{advParsed.carryForwardAmount.toLocaleString()})
                                  </span>
                                )}
                                {selectedWeek.advanceRequested > 0 && (
                                  <span className="text-blue-700 font-semibold text-[11px] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/80 tabular-nums">
                                    (เบิกเพิ่มใหม่ ฿{(selectedWeek.advanceRequested || 0).toLocaleString()})
                                  </span>
                                )}
                              </div>
                            </div>
                            {selectedWeek.advanceReceiptUrl && (
                              <button
                                type="button"
                                onClick={() => handlePreviewImage(selectedWeek.advanceReceiptUrl!)}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 font-bold rounded-xl text-xs px-3 py-1.5 flex items-center gap-1.5 transition-all cursor-pointer w-fit"
                              >
                                🖼️ ดูหลักฐานการโอนทุน
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      <div className="text-[11px] text-slate-500">
                        อนุมัติและโอนเงินโดย {users.find(u => u.id === selectedWeek.advanceApprovedBy)?.fullName || "เหรัญญิก"} เมื่อ {selectedWeek.advanceApprovedAt ? new Date(selectedWeek.advanceApprovedAt).toLocaleString("th-TH") : ""}
                      </div>

                      {/* --- ADDITIONAL ADVANCE SECTION --- */}
                      <div className="mt-3.5 border-t border-slate-200/80 pt-3.5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                            <span>💜 ทุนสำรองล่วงหน้าเพิ่มเติม (Additional Advance)</span>
                          </h5>
                          
                          {/* Propose Button for Additional Advance */}
                          {(!selectedWeek.additionalAdvanceStatus || selectedWeek.additionalAdvanceStatus === "none" || selectedWeek.additionalAdvanceStatus === "rejected") && 
                           (selectedWeek.status === "planned" || selectedWeek.status === "active") && 
                           (currentUser.role === "treasurer" || currentUser.role === "committee" || currentUser.id === selectedWeek.leaderId) && (
                            <button
                              type="button"
                              onClick={() => {
                                setAdditionalAdvanceAmount("");
                                setAdditionalAdvanceReason("");
                                setShowAdditionalAdvanceModal(true);
                              }}
                              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-md shadow-purple-500/10 transition-all cursor-pointer"
                            >
                              💸 ขอเบิกทุนเพิ่มเติม
                            </button>
                          )}
                        </div>

                        {/* Display Pending Additional Request for Members */}
                        {selectedWeek.additionalAdvanceStatus === "pending" && (
                          <div className="bg-purple-50 border border-purple-200/80 rounded-2xl p-3.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-purple-800 flex items-center gap-1 tabular-nums">
                                ⏳ รออนุมัติโอนทุนเพิ่มเติม: ฿{(selectedWeek.additionalAdvanceRequested || 0).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">
                              <strong>เหตุผล:</strong> {selectedWeek.additionalAdvanceReason || "-"}
                            </p>

                            {/* Treasurer Approval Form for Additional Request */}
                            {currentUser.role === "treasurer" && (
                              <div className="border-t border-purple-200/60 pt-2.5 space-y-2.5">
                                <label className="block text-xs font-bold text-slate-700">
                                  อัปโหลดรูปภาพสลิปโอนเงินทุนเพิ่มเติม:
                                </label>
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold px-3 py-2 rounded-xl text-xs cursor-pointer border border-slate-200/80 transition-all">
                                    <ImageIcon size={13} />
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onload = async () => {
                                            const compressed = await compressImage(reader.result as string, 800, 0.6);
                                            setAdditionalAdvanceSlipUrl(compressed);
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }} 
                                      className="hidden" 
                                    />
                                    {additionalAdvanceSlipUrl ? "เปลี่ยนรูปภาพสลิป" : "เลือกรูปภาพสลิป"}
                                  </label>
                                  {additionalAdvanceSlipUrl && (
                                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-xl border border-emerald-200/80 text-xs font-bold">
                                      <span>แนบสลิปแล้ว</span>
                                      <button type="button" onClick={() => setAdditionalAdvanceSlipUrl("")} className="text-rose-500 hover:text-rose-700 ml-1">
                                        <X size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {showAdditionalAdvanceRejectInput && (
                                  <div className="space-y-1">
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase">เหตุผลการปฏิเสธ:</label>
                                    <input 
                                      type="text"
                                      value={additionalAdvanceRejectReason}
                                      onChange={(e) => setAdditionalAdvanceRejectReason(e.target.value)}
                                      placeholder="ระบุเหตุผล เช่น งบจำกัด..."
                                      className="w-full p-2.5 border border-slate-200/80 rounded-xl focus:outline-none text-xs"
                                    />
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={handleApproveAdditionalAdvance}
                                    disabled={isSubmittingAdditionalAdvance}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                                  >
                                    อนุมัติและโอนทุนเพิ่ม
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleRejectAdditionalAdvance}
                                    disabled={isSubmittingAdditionalAdvance}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    {showAdditionalAdvanceRejectInput ? "ยืนยันปฏิเสธ" : "ปฏิเสธคำขอ"}
                                  </button>
                                  {showAdditionalAdvanceRejectInput && (
                                    <button
                                      type="button"
                                      onClick={() => { setShowAdditionalAdvanceRejectInput(false); setAdditionalAdvanceRejectReason(""); }}
                                      className="text-slate-500 hover:text-slate-700 text-xs font-medium"
                                    >
                                      ยกเลิก
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {currentUser.role !== "treasurer" && (
                              <p className="text-[11px] text-slate-500 italic">คำขอกำลังรอเหรัญญิกตรวจสอบและโอนเงินค่ะ</p>
                            )}
                          </div>
                        )}

                        {/* Rejected Additional Request Message */}
                        {selectedWeek.additionalAdvanceStatus === "rejected" && (
                          <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-3.5 text-xs text-rose-700 space-y-1">
                            <strong className="block font-bold">⚠️ คำขอทุนเพิ่มเติมถูกปฏิเสธ:</strong>
                            <p className="font-medium text-[11px] text-rose-600">เหตุผล: {selectedWeek.additionalAdvanceRejectReason || "ไม่มีเหตุผลระบุ"}</p>
                          </div>
                        )}

                        {/* Approved Additional Advance Details */}
                        {selectedWeek.additionalAdvanceStatus === "approved" && (
                          <div className="bg-purple-50 border border-purple-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="text-[11px] text-purple-700 font-bold uppercase block">อนุมัติทุนเพิ่มเติมเรียบร้อย:</span>
                                <strong className="text-purple-900 text-sm font-mono tabular-nums">
                                  ฿{(selectedWeek.additionalAdvanceRequested || 0).toLocaleString()}
                                </strong>
                              </div>
                              {selectedWeek.additionalAdvanceReceiptUrl && (
                                <button
                                  type="button"
                                  onClick={() => handlePreviewImage(selectedWeek.additionalAdvanceReceiptUrl!)}
                                  className="bg-white hover:bg-purple-100/50 text-purple-700 border border-purple-200/80 font-bold rounded-xl text-[11px] px-2.5 py-1.5 flex items-center gap-1 transition-all cursor-pointer w-fit"
                                >
                                  🖼️ ดูสลิปโอนทุนเพิ่ม
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              อนุมัติเมื่อ {selectedWeek.additionalAdvanceApprovedAt ? new Date(selectedWeek.additionalAdvanceApprovedAt).toLocaleString("th-TH") : ""}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Financial display for the week */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-rose-50/40 border border-rose-200/70 rounded-2xl">
                    <span className="text-[11px] font-bold text-rose-700 uppercase">ต้นทุนใช้จ่ายสะสม (รายจ่าย)</span>
                    <h4 className="text-lg sm:text-xl font-bold text-rose-600 font-mono tabular-nums mt-1">฿{selectedWeek.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h4>
                  </div>
                  <div className="p-4 bg-emerald-50/40 border border-emerald-200/70 rounded-2xl">
                    <span className="text-[11px] font-bold text-emerald-700 uppercase">ยอดขายสุทธิสะสม (รายรับ)</span>
                    <h4 className="text-lg sm:text-xl font-bold text-emerald-600 font-mono tabular-nums mt-1">฿{selectedWeek.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h4>
                  </div>
                  <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-2xl">
                    <span className="text-[11px] font-bold text-blue-700 uppercase">กำไรสุทธิโอนเข้ากองทุน</span>
                    <h4 className="text-lg sm:text-xl font-bold text-blue-700 font-mono tabular-nums mt-1">฿{selectedWeek.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h4>
                  </div>
                </div>

                {/* Itemized Lists with Attachment displays */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* Costs side */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-rose-700 text-xs flex items-center gap-1.5 pb-2 border-b border-rose-200/80 uppercase tracking-wide">
                      🔴 บันทึกเงินใช้จ่าย / ต้นทุนของ (หัวหน้ากรอก)
                    </h4>
                    <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                      {selectedCosts.length === 0 ? (
                        <p className="text-center py-10 text-slate-400 text-xs italic bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">ไม่มีรายการรายจ่ายในขณะนี้</p>
                      ) : (
                        selectedCosts.map((item) => {
                          const parsed = parseItemNote(item.note);
                          return (
                            <div key={item.id} className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs hover:bg-white transition-all">
                              <div className="space-y-1 min-w-0">
                                <p className="font-bold text-slate-800 truncate">{item.itemName}</p>
                                <p className="text-[11px] text-slate-500 tabular-nums">จำนวน: {item.quantity} x ฿{item.amount.toLocaleString()}</p>
                                {parsed.note && <p className="text-[11px] text-slate-600 bg-white border border-slate-200/80 px-2 py-0.5 rounded-lg italic w-fit">{parsed.note}</p>}
                                {parsed.slipUrl && (
                                  <button 
                                    onClick={() => handlePreviewImage(parsed.slipUrl)}
                                    className="text-[11px] text-rose-700 hover:text-rose-800 font-semibold flex items-center gap-1 bg-rose-50 border border-rose-200/80 px-2 py-1 rounded-lg mt-1.5 cursor-pointer"
                                  >
                                    <Paperclip size={11} /> เปิดดูหลักฐาน/บิลใช้จ่าย
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-bold text-rose-600 font-mono tabular-nums text-sm">฿{(item.amount * item.quantity).toLocaleString()}</span>
                                {canEdit && (
                                  <button onClick={() => handleDeleteItemClick(item.id)} className="text-rose-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200/80 cursor-pointer">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Revenues side */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-emerald-700 text-xs flex items-center gap-1.5 pb-2 border-b border-emerald-200/80 uppercase tracking-wide">
                      🟢 ยอดขายที่ได้รับจากการค้าขาย (หัวหน้ากรอก)
                    </h4>
                    <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                      {selectedRevenues.length === 0 ? (
                        <p className="text-center py-10 text-slate-400 text-xs italic bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">ไม่มีรายการยอดขายเข้ามา</p>
                      ) : (
                        selectedRevenues.map((item) => {
                          const parsed = parseItemNote(item.note);
                          return (
                            <div key={item.id} className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs hover:bg-white transition-all">
                              <div className="space-y-1 min-w-0">
                                <p className="font-bold text-slate-800 truncate">{item.itemName}</p>
                                <p className="text-[11px] text-slate-500 tabular-nums">จำนวน: {item.quantity} x ฿{item.amount.toLocaleString()}</p>
                                {parsed.note && <p className="text-[11px] text-slate-600 bg-white border border-slate-200/80 px-2 py-0.5 rounded-lg italic w-fit">{parsed.note}</p>}
                                {parsed.slipUrl && (
                                  <button 
                                    onClick={() => handlePreviewImage(parsed.slipUrl)}
                                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-lg mt-1.5 cursor-pointer"
                                  >
                                    <Paperclip size={11} /> สลิปยอดรับเงินที่แนบ
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-bold text-emerald-600 font-mono tabular-nums text-sm">฿{(item.amount * item.quantity).toLocaleString()}</span>
                                {canEdit && (
                                  <button onClick={() => handleDeleteItemClick(item.id)} className="text-rose-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200/80 cursor-pointer">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Add item form (Conditional based on role and week state) */}
                {canEdit && (
                  <form onSubmit={handleAddItemSubmit} className="bg-slate-50/90 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-4 text-xs">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                      <Plus size={16} className="text-blue-600" /> บันทึกและแนบหลักฐานเงิน (สิทธิ์หัวหน้า/กรรมการ)
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="block text-[11px] font-bold text-slate-600">ชื่อรายการ</label>
                        <input 
                          type="text" 
                          value={itemName}
                          onChange={(e) => setItemName(e.target.value)}
                          placeholder="เช่น ค่าขนมปัง, ซอสเห็ดหมูแดง, ยอดขายลูกชิ้นทอด" 
                          className="w-full p-2.5 bg-white border border-slate-200/80 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                          required
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-600">ประเภทรายการ</label>
                        <select 
                          value={itemType}
                          onChange={(e) => setItemType(e.target.value as "cost" | "revenue")}
                          className="w-full p-2.5 bg-white border border-slate-200/80 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-medium"
                        >
                          <option value="cost">รายจ่าย (ต้นทุนวัตถุดิบ)</option>
                          <option value="revenue">รายรับ (ยอดขายหน้าร้าน)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-600">ยอดเงินรวม (บาท)</label>
                        <input 
                          type="number" 
                          value={itemAmount}
                          onChange={(e) => setItemAmount(e.target.value)}
                          placeholder="บาท" 
                          className="w-full p-2.5 bg-white border border-slate-200/80 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-mono font-bold text-slate-800 tabular-nums"
                          required
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <label className="block text-[11px] font-bold text-slate-600">หมายเหตุสั้นๆ</label>
                        <input 
                          type="text" 
                          value={itemNote}
                          onChange={(e) => setItemNote(e.target.value)}
                          placeholder="ระบุเพิ่มเติม เช่น ซื้อจากตลาดนัดหน้าโรงเรียน" 
                          className="w-full p-2.5 bg-white border border-slate-200/80 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-600">แนบสลิป/บิลใบเสร็จใช้เงิน (สลิปหรือหลักฐาน)</label>
                        <div className="flex flex-wrap gap-2 items-center">
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleFileChange}
                            id="market_item_file"
                            className="hidden"
                          />
                          <label 
                            htmlFor="market_item_file"
                            className="cursor-pointer bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
                          >
                            <ImageIcon size={14} className="text-slate-400" /> 
                            {itemSlipUrl ? "เปลี่ยนรูปสลิปแล้ว" : "เลือกแนบรูปภาพ"}
                          </label>
                          {itemSlipUrl && (
                            <div className="flex items-center gap-1.5 bg-slate-200/60 px-2.5 py-1.5 rounded-xl">
                              <span className="text-[11px] text-slate-600 font-mono truncate max-w-[140px]">
                                {itemSlipUrl.startsWith("http") ? "ลิงก์ออนไลน์" : "สลิปวัตถุดิบ.jpg"}
                              </span>
                              <button type="button" onClick={() => setItemSlipUrl("")} className="text-rose-500 hover:text-rose-700"><X size={13} /></button>
                            </div>
                          )}
                        </div>

                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 space-y-2 mt-2">
                          <span className="block text-[11px] font-bold text-slate-500 uppercase">หรือ แนบลิงก์ Google Drive / ลิงก์แนบภายนอก:</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input 
                              type="text" 
                              placeholder="ชื่อลิงก์ เช่น บิลวัตถุดิบ"
                              value={itemLinkName}
                              onChange={(e) => setItemLinkName(e.target.value)}
                              className="p-2 border border-slate-200/80 rounded-xl text-xs bg-slate-50 focus:outline-none"
                            />
                            <input 
                              type="text" 
                              placeholder="วางลิงก์ https://drive.google.com/..."
                              value={itemLink}
                              onChange={(e) => setItemLink(e.target.value)}
                              className="p-2 border border-slate-200/80 rounded-xl text-xs bg-slate-50 focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleAddItemLink}
                            disabled={!itemLink}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 px-3 rounded-xl text-xs transition-all cursor-pointer"
                          >
                            ➕ แนบลิงก์นี้แทนสลิป
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button 
                        type="submit"
                        disabled={isAddingItem || !itemName || !itemAmount}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs px-4 py-2.5 flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                      >
                        💾 {isAddingItem ? "กำลังบันทึก..." : "บันทึกลงเซิร์ฟเวอร์ทันที"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Actions based on states and roles */}
                <div className="flex flex-wrap gap-2.5 pt-4 border-t border-slate-200/80 w-full">
                  {selectedWeek.advanceStatus === "approved" && (selectedWeek.status === "active" || selectedWeek.status === "completed" || selectedWeek.status === "approved") && (() => {
                    const advParsed = parseAdvanceReason(selectedWeek.advanceReason);
                    const carryAmt = advParsed.carryForwardAmount;
                    const initialAmt = (selectedWeek.advanceRequested || 0) + carryAmt;
                    const additionalAmt = selectedWeek.additionalAdvanceStatus === "approved" ? (selectedWeek.additionalAdvanceRequested || 0) : 0;
                    const totalCapital = initialAmt + additionalAmt;
                    const remainingCash = selectedWeek.totalProfit + totalCapital;

                    const weekNoteParsed = parseWeekNote(selectedWeek.note);
                    const isCarryingForward = weekNoteParsed.carryForwardRemaining > 0;

                    const isLeader = currentUser.id === selectedWeek.leaderId;
                    const canManageMarket = currentUser.role === "treasurer" || currentUser.role === "committee";

                    return (
                      <div className="w-full bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 sm:p-5 text-xs space-y-2 mb-2">
                        <strong className="text-blue-900 font-bold block text-sm">💵 การตรวจสอบและจัดการยอดเงินทุนคืนกองทุน:</strong>
                        <p className="text-slate-600 leading-relaxed tabular-nums">
                          ทีมของคุณมีทุนเริ่มสัปดาห์นี้รวม <strong className="text-blue-700">฿{initialAmt.toLocaleString()}</strong> 
                          {carryAmt > 0 && <span className="text-purple-700 font-semibold"> (ยกยอดมา ฿{carryAmt.toLocaleString()} + โอนเงินใหม่ ฿{(selectedWeek.advanceRequested || 0).toLocaleString()})</span>}
                          {selectedWeek.additionalAdvanceStatus === "approved" && (
                            <>
                              {" "}และทุนเพิ่มเติม <strong className="text-purple-700">฿{additionalAmt.toLocaleString()}</strong>
                            </>
                          )}
                          {" "}มีรายจ่ายจริง <strong className="text-rose-600">฿{selectedWeek.totalCost.toLocaleString()}</strong> 
                          และยอดจำหน่ายสินค้า <strong className="text-emerald-600">฿{selectedWeek.totalRevenue.toLocaleString()}</strong>
                        </p>

                        <div className="pt-2.5 border-t border-blue-200/60 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="space-y-0.5 tabular-nums">
                            <span>กำไรสุทธิสัปดาห์นี้: <strong className={selectedWeek.totalProfit >= 0 ? "text-emerald-700 font-bold text-sm font-mono" : "text-rose-700 font-bold text-sm font-mono"}>฿{selectedWeek.totalProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></span>
                          </div>
                          <div className="flex flex-col sm:items-end text-left sm:text-right">
                            <span className="text-xs font-bold text-blue-900 bg-white border border-blue-200/80 px-3.5 py-2 rounded-xl shadow-2xs font-mono tabular-nums">
                              💰 ยอดเงินสดคงเหลือในมือทีม: ฿{remainingCash.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </span>
                          </div>
                        </div>

                        {selectedWeek.status === "active" && (isLeader || canManageMarket) && remainingCash > 0 && (
                          <div className="mt-3.5 bg-white border border-purple-200/80 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
                            <strong className="text-purple-900 font-bold block text-xs uppercase tracking-wider">🔄 การจัดการเงินสดคงเหลือเพื่อยกยอด/คืนทุน</strong>
                            
                            <div className="space-y-3">
                              {/* Option 1: Return All */}
                              <label className="flex items-start gap-2.5 cursor-pointer">
                                <input 
                                  type="radio"
                                  name="rollover_mode"
                                  checked={!isCarryingForward}
                                  onChange={() => handleUpdateRolloverMode("return_all")}
                                  className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer h-4 w-4"
                                />
                                <div>
                                  <span className="font-bold text-slate-800 text-xs">📤 ส่งคืนกองกลางทั้งหมด (ทั้งเงินทุนสะสมและกำไร)</span>
                                  <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">สมาชิกจะโอนเงินสดคงเหลือในมือทั้งหมด ฿{remainingCash.toLocaleString()} คืนกองกลางห้องเรียน และแนบสลิปโอนคืน</p>
                                </div>
                              </label>

                              {/* Option 2: Keep Capital, Return Profit */}
                              <label className={`flex items-start gap-2.5 cursor-pointer ${selectedWeek.totalProfit <= 0 || totalCapital <= 0 ? "opacity-50 pointer-events-none" : ""}`}>
                                <input 
                                  type="radio"
                                  name="rollover_mode"
                                  disabled={selectedWeek.totalProfit <= 0 || totalCapital <= 0}
                                  checked={isCarryingForward && weekNoteParsed.carryForwardCapitalOnly}
                                  onChange={() => handleUpdateRolloverMode("keep_capital")}
                                  className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer h-4 w-4"
                                />
                                <div>
                                  <span className="font-bold text-purple-800 text-xs">🔄 โอนเฉพาะกำไรสุทธิ และเก็บเงินทุนสะสมไว้หมุนต่อ (Keep Capital)</span>
                                  <p className="text-[11px] text-purple-600 mt-0.5 tabular-nums">
                                    สมาชิกจะโอนกำไรสะสม ฿{selectedWeek.totalProfit.toLocaleString()} คืนกองกลางห้อง ส่วนเงินทุนสำรองล่วงหน้ารวม ฿{totalCapital.toLocaleString()} จะเก็บไว้ขายของต่อในรอบถัดไปทันทีโดยตรง
                                  </p>
                                </div>
                              </label>

                              {/* Option 3: Carry Forward All */}
                              <label className="flex items-start gap-2.5 cursor-pointer">
                                <input 
                                  type="radio"
                                  name="rollover_mode"
                                  checked={isCarryingForward && !weekNoteParsed.carryForwardCapitalOnly}
                                  onChange={() => handleUpdateRolloverMode("carry_all")}
                                  className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer h-4 w-4"
                                />
                                <div>
                                  <span className="font-bold text-indigo-800 text-xs">🔄 ขอยกยอดเงินสดคงเหลือทั้งหมดเป็นทุนรอบถัดไป (Carry Forward All)</span>
                                  <p className="text-[11px] text-indigo-600 mt-0.5 tabular-nums">สมาชิกจะเก็บเงินสดทั้งหมด ฿{remainingCash.toLocaleString()} ในมือ (รวมทุนและกำไร/ยอดเหลือจากการขาดทุน) ไปใช้เป็นทุนสัปดาห์หน้าทั้งหมดโดยไม่มีการโอนคืน</p>
                                </div>
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-blue-200/60 mt-1.5">
                          {isCarryingForward ? (
                            weekNoteParsed.carryForwardCapitalOnly ? (
                              <div className="bg-purple-100 border border-purple-200/80 text-purple-900 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 tabular-nums">
                                <span>🔄 สถานะ: สมาชิกขอยกยอดเงินทุนสะสม ฿{totalCapital.toLocaleString()} หมุนต่อในรอบหน้า และจะโอนเฉพาะยอดกำไรสุทธิ ฿{selectedWeek.totalProfit.toLocaleString()} คืนกองกลางห้อง</span>
                              </div>
                            ) : (
                              <div className="bg-purple-100 border border-purple-200/80 text-purple-900 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 tabular-nums">
                                <span>🔄 สถานะ: สมาชิกยืนยันขอยกยอดเงินคงเหลือทั้งหมด ฿{remainingCash.toLocaleString()} ไปหมุนต่อยอดในรอบถัดไปแล้ว (ยอดเงินคืนกองกลางในระบบจะปรับเป็น ฿0)</span>
                              </div>
                            )
                          ) : (
                            <div className="bg-amber-50 border border-amber-200/80 text-amber-900 p-3.5 rounded-xl text-xs font-medium flex items-center gap-1.5 tabular-nums">
                              <span>📤 สถานะ: ต้องแสดงหลักฐานสลิปการโอนเงินคงเหลือ ฿{remainingCash.toLocaleString()} คืนกองทุนกลางของห้องเรียนเมื่อทำการสรุปยอด</span>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                          *สูตรคำนวณ: เงินสดคงเหลือ = กำไรสุทธิ ฿{selectedWeek.totalProfit.toLocaleString()} + เงินทุนล่วงหน้ารวม ฿{totalCapital.toLocaleString()} (หรือเท่ากับ ยอดขายรวม ฿{selectedWeek.totalRevenue.toLocaleString()} + ทุนคงเหลือหลังจ่าย ฿{(totalCapital - selectedWeek.totalCost).toLocaleString()})
                        </p>
                      </div>
                    );
                  })()}

                  {selectedWeek.status === "active" && 
                   (currentUser.role === "treasurer" || currentUser.role === "committee" || currentUser.id === selectedWeek.leaderId) && (
                    <button 
                      onClick={handleCompleteWeekClick}
                      disabled={isCompletingWeek}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs px-4 py-2.5 transition-all shadow-md cursor-pointer"
                    >
                      {isCompletingWeek ? "กำลังสรุปและส่งตรวจ..." : "สรุปยอดทั้งหมดส่งเหรัญญิกตรวจสอบความถูกต้อง"}
                    </button>
                  )}

                  {selectedWeek.status === "completed" && currentUser.role === "treasurer" && (
                    <button 
                      onClick={handleApproveWeekClick}
                      disabled={isApprovingWeek}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs px-4 py-2.5 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={15} /> {isApprovingWeek ? "กำลังอนุมัติ..." : "ตรวจสอบความถูกต้องเรียบร้อย และ อนุมัติสมทบยอดกำไรเข้าส่วนกลาง"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200/80 text-xs">
                ไม่มีข้อมูลรอบตลาดสัปดาห์ปัจจุบัน
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "schedule" ? (
        /* Schedule & Team Roster Tab */
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Users size={18} className="text-indigo-600" /> จัดทีมขาย & ตารางเวรตลาดนัดวันพุธ
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ตรวจสอบตารางเวรประจำสัปดาห์ รายชื่อหัวหน้าทีม สมาชิกผู้รับผิดชอบ และสถานะทุนหมุนเวียน
              </p>
            </div>
            {canManageMarket && (
              <button 
                type="button"
                onClick={() => {
                  setNewLeaderId(currentUser.id);
                  setNewMemberIds([]);
                  setShowAddWeekModal(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer w-fit"
              >
                <Plus size={14} /> เพิ่มตารางเวร / รอบตลาดใหม่
              </button>
            )}
          </div>

          {marketWeeks.length === 0 ? (
            <div className="text-center py-14 text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-2xl">
              ยังไม่มีการลงทะเบียนตารางเวรทีมขายตลาดนัดวันพุธ
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {marketWeeks.map((week, idx) => {
                const leader = users.find(u => u.id === week.leaderId);
                const parsedNote = parseWeekNote(week.note);
                return (
                  <div
                    key={week.id}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 hover:bg-white border border-slate-200/80 hover:border-indigo-300 transition-all shadow-2xs flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full">
                            สัปดาห์ที่ {marketWeeks.length - idx} • พุธ {new Date(week.weekDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-slate-800">
                            {week.teamName || "กลุ่มจำหน่ายสินค้าทั่วไป"}
                          </h3>
                        </div>
                        {getWeekStatusBadge(week.status)}
                      </div>

                      {parsedNote.note && (
                        <p className="text-xs text-slate-600 bg-white border border-slate-200/60 px-3 py-2 rounded-xl">
                          📝 {parsedNote.note}
                        </p>
                      )}

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-slate-700">
                          <span className="font-bold text-slate-500 text-[11px] uppercase w-20 shrink-0">หัวหน้าทีม:</span>
                          <span className="font-bold text-slate-900">
                            {leader ? `${leader.fullName} (${leader.nickname})` : "ไม่ระบุ"}
                          </span>
                        </div>
                        <div className="flex items-start gap-2 text-slate-700">
                          <span className="font-bold text-slate-500 text-[11px] uppercase w-20 shrink-0 mt-0.5">สมาชิก ({week.memberIds?.length || 0}):</span>
                          <div className="flex flex-wrap gap-1.5">
                            {(!week.memberIds || week.memberIds.length === 0) ? (
                              <span className="text-slate-400 italic text-xs">ไม่มีสมาชิกเพิ่มเติม</span>
                            ) : (
                              week.memberIds.map(mid => {
                                const m = users.find(u => u.id === mid);
                                return (
                                  <span key={mid} className="text-[11px] font-medium bg-white border border-slate-200/80 text-slate-700 px-2 py-0.5 rounded-lg">
                                    {m ? `${m.fullName} (${m.nickname})` : "สมาชิก"}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        <span className="text-slate-500">รายรับ: <strong className="text-emerald-600">฿{week.totalRevenue.toLocaleString()}</strong></span>
                        <span className="text-slate-500">กำไร: <strong className="text-blue-600">฿{week.totalProfit.toLocaleString()}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWeek(week);
                          setActiveTab("accounting");
                        }}
                        className="bg-white hover:bg-blue-50 text-blue-600 border border-blue-200/80 font-bold px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer shrink-0"
                      >
                        เปิดดูบัญชีสัปดาห์นี้ →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Leaderboard Tab section */
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Award size={18} className="text-amber-500" /> ทำเนียบจัดอันดับฝีมือทีมจำหน่ายสินค้า (Leaderboard)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">จัดอันดับกลุ่มทีมตลาดวันพุธที่ทำกำไรสะสมสูงสุดที่ตรวจสอบและอนุมัติเข้าระบบแล้ว</p>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3.5 py-1.5 rounded-full border border-amber-200/80 w-fit tabular-nums">
              รวมทั้งหมด {leaderboardWeeks.length} รอบตลาด
            </span>
          </div>

          <div className="space-y-4">
            {leaderboardWeeks.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-2xl">
                ยังไม่มีข้อมูลทีมตลาดวันพุธที่ได้รับอนุมัติผลกำไรในระบบ 🏆
              </div>
            ) : (
              <div className="space-y-3.5">
                {leaderboardWeeks.map((week, index) => {
                  const percent = (week.totalProfit / maxProfit) * 100;
                  const leaderUser = users.find(u => u.id === week.leaderId);
                  
                  // Rank badges
                  const getRankBadge = (idx: number) => {
                    switch (idx) {
                      case 0:
                        return <span className="text-2xl" title="อันดับ 1 ชนะเลิศ">🥇</span>;
                      case 1:
                        return <span className="text-2xl" title="อันดับ 2 รองชนะเลิศอันดับ 1">🥈</span>;
                      case 2:
                        return <span className="text-2xl" title="อันดับ 3 รองชนะเลิศอันดับ 2">🥉</span>;
                      default:
                        return <span className="font-mono font-bold text-slate-500 text-sm bg-slate-100 border border-slate-200/80 w-8 h-8 rounded-full flex items-center justify-center tabular-nums">#{idx + 1}</span>;
                    }
                  };

                  return (
                    <div 
                      key={week.id}
                      className="p-4 sm:p-5 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-blue-300 hover:bg-white transition-all text-xs"
                    >
                      {/* Left Block: Medal, Team Name, Date & Leader */}
                      <div className="flex items-center gap-3.5">
                        <div className="shrink-0">{getRankBadge(index)}</div>
                        <div className="space-y-1">
                          <h3 className="font-bold text-slate-800 text-sm flex flex-wrap items-center gap-1.5">
                            <span>{week.teamName || "ทีมทั่วไป"}</span>
                            <span className="text-[11px] font-normal text-slate-500">
                              (พุธที่ {new Date(week.weekDate).toLocaleDateString("th-TH")})
                            </span>
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1"><UserIcon size={12} /> หัวหน้าทีม: <strong className="text-slate-700">{leaderUser?.fullName || "ไม่ระบุ"} ({leaderUser?.nickname || "ไม่มี"})</strong></span>
                            <span>•</span>
                            <span className="tabular-nums">สมาชิกทีม: <strong className="text-slate-700">{week.memberIds?.length || 0} คน</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Middle Block: Profit Visual Bar */}
                      <div className="flex-1 max-w-xs space-y-1.5">
                        <div className="flex justify-between text-[11px] text-slate-500 font-semibold uppercase tabular-nums">
                          <span>สัดส่วนผลงานกำไร</span>
                          <span>{percent.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-slate-200/70 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              index === 0 ? "bg-amber-400" : index === 1 ? "bg-slate-400" : index === 2 ? "bg-amber-600" : "bg-blue-500"
                            }`}
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Right Block: Revenues & Profits */}
                      <div className="flex items-center justify-between md:justify-end gap-5 text-right font-sans shrink-0">
                        <div>
                          <p className="text-[11px] text-slate-500 uppercase">ยอดรวมรายจ่าย/รายรับ</p>
                          <p className="font-medium text-slate-700 font-mono tabular-nums mt-0.5">
                            ฿{week.totalCost.toLocaleString()} / ฿{week.totalRevenue.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-white border border-emerald-200/80 rounded-2xl px-4 py-2.5 shadow-2xs">
                          <p className="text-[11px] font-bold text-emerald-700 uppercase">ยอดกำไรสุทธิ</p>
                          <p className="font-bold text-emerald-600 text-sm font-mono tabular-nums">฿{week.totalProfit.toLocaleString()}</p>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Request Advance Capital Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200/80 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200/80">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <span>💰 ขอเบิกเงินทุนล่วงหน้าตลาด</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setShowAdvanceModal(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleProposeAdvanceSubmit} className="space-y-4 text-xs">
              {(() => {
                const availableWeeks = getAvailableCarryOvers();
                if (availableWeeks.length > 0) {
                  return (
                    <div className="bg-purple-50 border border-purple-200/80 rounded-2xl p-4 space-y-2">
                      <strong className="text-purple-800 font-bold block text-xs mb-1">🔄 ดึงยอดทุนหมุนเวียนคงเหลือจากรอบก่อนหน้า:</strong>
                      <p className="text-purple-700 text-[11px] leading-relaxed">
                        ระบบตรวจพบสัปดาห์ก่อนหน้าที่มีเงินทุนคงเหลือและขอ 'ยกยอดสะสมเพื่อต่อยอด' คุณสามารถคลิกเลือกเพื่อดึงยอดมาใช้ได้ค่ะ:
                      </p>
                      <div className="space-y-1.5 max-h-28 overflow-y-auto pt-1">
                        {availableWeeks.map(w => {
                          const { carryForwardRemaining } = parseWeekNote(w.note);
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => {
                                setCarryForwardAmountInput(carryForwardRemaining.toString());
                                setAdvanceReason(`ดึงเงินทุนยกมาจากตลาดรอบวันที่ ${w.weekDate} จำนวน ฿${carryForwardRemaining.toLocaleString()}`);
                              }}
                              className="w-full text-left bg-white border border-purple-200/80 hover:bg-purple-100 hover:border-purple-300 p-2.5 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 transition-all cursor-pointer shadow-2xs tabular-nums"
                            >
                              <span>📅 รอบวันที่ {w.weekDate}</span>
                              <strong className="text-purple-700 font-mono">฿{carryForwardRemaining.toLocaleString()} ➕</strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-purple-700 text-[11px]">เงินทุนยกมาจากรอบก่อน (บาท)</label>
                  <input 
                    type="number"
                    min="0"
                    placeholder="0"
                    value={carryForwardAmountInput}
                    onChange={(e) => setCarryForwardAmountInput(e.target.value)}
                    className="w-full p-3 border border-purple-200/80 rounded-xl focus:outline-none text-sm font-semibold text-purple-700 bg-purple-50/50 font-mono tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-blue-700 text-[11px]">เบิกโอนเพิ่มใหม่ (บาท)</label>
                  <input 
                    type="number"
                    required
                    min="0"
                    placeholder="ยอดที่ต้องการเบิกเพิ่ม"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    className="w-full p-3 border border-blue-200/80 rounded-xl focus:outline-none text-sm font-semibold text-blue-700 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex justify-between items-center tabular-nums">
                <span>💰 รวมเงินทุนเริ่มต้นสัปดาห์นี้:</span>
                <strong className="text-slate-900 text-sm font-mono">
                  ฿{((Number(carryForwardAmountInput) || 0) + (Number(advanceAmount) || 0)).toLocaleString()}
                </strong>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">รายละเอียด/เหตุผลความจำเป็นในการใช้ทุน</label>
                <textarea 
                  required
                  rows={2}
                  placeholder="ตัวอย่าง: ซื้อวัตถุดิบทำขนมปังเนยสด โดยจะนำทุนยกมาหมุนต่อยอดขายสัปดาห์นี้..."
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80">
                <button 
                  type="button" 
                  onClick={() => setShowAdvanceModal(false)}
                  disabled={isSubmittingAdvance}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingAdvance || (!advanceAmount && !carryForwardAmountInput) || (Number(advanceAmount) === 0 && Number(carryForwardAmountInput) === 0)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/10 transition-all cursor-pointer"
                >
                  {isSubmittingAdvance ? "กำลังส่งคำขอ..." : "ส่งคำขอเบิกทุน"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Additional Advance Capital Modal */}
      {showAdditionalAdvanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200/80 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200/80">
              <h3 className="text-base font-bold text-purple-800 flex items-center gap-1.5">
                <span>💰 ขอเบิกเงินทุนล่วงหน้าเพิ่มเติม</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setShowAdditionalAdvanceModal(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleProposeAdditionalAdvanceSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">ยอดเงินทุนที่ขอเบิกเพิ่ม (บาท)</label>
                <input 
                  type="number"
                  required
                  min="1"
                  placeholder="ตัวอย่างเช่น 500"
                  value={additionalAdvanceAmount}
                  onChange={(e) => setAdditionalAdvanceAmount(e.target.value)}
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none text-sm font-semibold font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">รายละเอียด/เหตุผลความจำเป็นที่ขอเบิกเพิ่ม</label>
                <textarea 
                  required
                  rows={3}
                  placeholder="ตัวอย่าง: จำเป็นต้องซื้อวัตถุดิบและแก๊สกระป๋องเพิ่มเนื่องจากสินค้าขายดีกว่าที่คาดการณ์ไว้..."
                  value={additionalAdvanceReason}
                  onChange={(e) => setAdditionalAdvanceReason(e.target.value)}
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80">
                <button 
                  type="button" 
                  onClick={() => setShowAdditionalAdvanceModal(false)}
                  disabled={isSubmittingAdditionalAdvance}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingAdditionalAdvance || !additionalAdvanceAmount}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-500/10 transition-all cursor-pointer"
                >
                  {isSubmittingAdditionalAdvance ? "กำลังส่งคำขอ..." : "ส่งคำขอเบิกทุนเพิ่ม"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Week Modal with Team selector */}
      {showAddWeekModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200/80 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200/80">
              <h3 className="text-base font-bold text-slate-800">ลงทะเบียนรอบตลาดและสร้างทีม</h3>
              <button onClick={() => setShowAddWeekModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleCreateWeekSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 text-[11px]">วันที่จำหน่ายสินค้า (วันพุธ)</label>
                  <input 
                    type="date" 
                    value={newWeekDate}
                    onChange={(e) => setNewWeekDate(e.target.value)}
                    className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 text-[11px]">ชื่อร้านค้า / ชื่อกลุ่มทีม</label>
                  <input 
                    type="text" 
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="เช่น ทีมชาไข่มุกสะท้านโลกันตร์"
                    className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">รายละเอียดเมนู/หมายเหตุรอบ</label>
                <input 
                  type="text" 
                  value={newWeekNote}
                  onChange={(e) => setNewWeekNote(e.target.value)}
                  placeholder="เช่น ขายชาเขียว นมสด บราวนี่สติ๊กชิ้นละ 15 บาท"
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">ระบุหัวหน้าทีม (ผู้มีสิทธิ์ลงบัญชีรอบนี้)</label>
                <select 
                  value={newLeaderId}
                  onChange={(e) => setNewLeaderId(e.target.value)}
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none bg-white font-bold text-slate-700"
                >
                  {availableMembers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.nickname}) - รหัส: {u.studentId}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 text-[11px]">เลือกเพื่อนร่วมทีมขายสินค้า (สมาชิกในทีม)</label>
                <p className="text-[11px] text-slate-500">ติ๊กเลือกรายชื่อเพื่อนๆ ชั้นปีที่ 3 ที่ร่วมเป็นสมาชิกขายสินค้ารอบนี้</p>
                
                {/* Search input for friends */}
                <div className="relative">
                  <input 
                    type="text" 
                    value={newWeekSearchQuery}
                    onChange={(e) => setNewWeekSearchQuery(e.target.value)}
                    placeholder="🔍 พิมพ์ค้นหาชื่อเพื่อน..." 
                    className="w-full p-2.5 border border-slate-200/80 rounded-xl focus:outline-none text-xs bg-slate-50/50"
                  />
                  {newWeekSearchQuery && (
                    <button 
                      type="button" 
                      onClick={() => setNewWeekSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="border border-slate-200/80 rounded-xl p-3 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50">
                  {filteredNewWeekMembers.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center sm:col-span-2 py-4">ไม่พบรายชื่อเพื่อนที่ค้นหา</p>
                  ) : (
                    filteredNewWeekMembers.map(u => (
                      <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer text-xs text-slate-700">
                        <input 
                          type="checkbox"
                          checked={newMemberIds.includes(u.id)}
                          onChange={() => toggleMemberSelection(u.id, newMemberIds, setNewMemberIds)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="truncate">{u.fullName} ({u.nickname})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80">
                <button 
                  type="button" 
                  onClick={() => { setShowAddWeekModal(false); setNewWeekSearchQuery(""); }}
                  disabled={isCreatingWeek}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={isCreatingWeek}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/10"
                >
                  {isCreatingWeek ? "กำลังลงทะเบียน..." : "ลงทะเบียนรอบและทีมสำเร็จ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Team Modal */}
      {showEditTeamModal && selectedWeek && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200/80 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200/80">
              <h3 className="text-base font-bold text-slate-800">แก้ไขข้อมูลทีมและการลงทะเบียน</h3>
              <button onClick={() => setShowEditTeamModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100" disabled={isUpdatingTeam}><X size={16} /></button>
            </div>
            
            <form onSubmit={handleUpdateTeamSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">ชื่อร้านค้า / ชื่อกลุ่มทีม</label>
                <input 
                  type="text" 
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">รายละเอียดเมนู/หมายเหตุรอบ</label>
                <input 
                  type="text" 
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-[11px]">ระบุหัวหน้าทีม (ผู้มีสิทธิ์ลงบัญชีรอบนี้)</label>
                <select 
                  value={editLeaderId}
                  onChange={(e) => setEditLeaderId(e.target.value)}
                  className="w-full p-3 border border-slate-200/80 rounded-xl focus:outline-none bg-white font-bold text-slate-700"
                >
                  {availableMembers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.nickname}) - รหัส: {u.studentId}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 text-[11px]">แก้ไขรายชื่อเพื่อนในทีมขายสินค้า</label>
                
                {/* Search input for friends */}
                <div className="relative">
                  <input 
                    type="text" 
                    value={editTeamSearchQuery}
                    onChange={(e) => setEditTeamSearchQuery(e.target.value)}
                    placeholder="🔍 พิมพ์ค้นหาชื่อเพื่อน..." 
                    className="w-full p-2.5 border border-slate-200/80 rounded-xl focus:outline-none text-xs bg-slate-50/50"
                  />
                  {editTeamSearchQuery && (
                    <button 
                      type="button" 
                      onClick={() => setEditTeamSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="border border-slate-200/80 rounded-xl p-3 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50">
                  {filteredEditTeamMembers.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center sm:col-span-2 py-4">ไม่พบรายชื่อเพื่อนที่ค้นหา</p>
                  ) : (
                    filteredEditTeamMembers.map(u => (
                      <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer text-xs text-slate-700">
                        <input 
                          type="checkbox"
                          checked={editMemberIds.includes(u.id)}
                          onChange={() => toggleMemberSelection(u.id, editMemberIds, setEditMemberIds)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="truncate">{u.fullName} ({u.nickname})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80">
                <button 
                  type="button" 
                  onClick={() => { setShowEditTeamModal(false); setEditTeamSearchQuery(""); }}
                  disabled={isUpdatingTeam}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={isUpdatingTeam}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg"
                >
                  {isUpdatingTeam ? "กำลังบันทึก..." : "บันทึกการแก้ไขทีม"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          onClick={() => { setPreviewImage(null); setPreviewOriginalUrl(null); }}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50 cursor-zoom-out animate-fade-in"
        >
          <div className="max-w-2xl w-full bg-white rounded-3xl overflow-hidden p-4 relative cursor-default shadow-2xl border border-slate-200/80" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => { setPreviewImage(null); setPreviewOriginalUrl(null); }}
              className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-700 w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all shadow-md z-10"
            >
              ×
            </button>
            <h3 className="text-sm font-bold text-slate-800 mb-3 pr-8">ตรวจสอบเอกสารหลักฐาน</h3>
            <div className="bg-slate-50 p-2 rounded-2xl flex flex-col justify-center items-center overflow-hidden max-h-[75vh] w-full">
              {previewImage ? (
                <img 
                  src={previewImage} 
                  alt="Receipt Slip Preview" 
                  className="max-w-full max-h-[55vh] object-contain rounded-xl bg-slate-50 shadow-sm" 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const fallbackMsg = document.getElementById("wm-preview-fallback-msg");
                    if (fallbackMsg) fallbackMsg.style.display = "block";
                  }}
                />
              ) : null}
              <div id="wm-preview-fallback-msg" className="hidden py-8 text-center text-xs text-slate-500">
                <p className="font-semibold text-slate-700 mb-1">ไม่สามารถแสดงพรีวิวรูปภาพโดยตรงได้</p>
                <p>กรุณากดปุ่มด้านล่างเพื่อเปิดไฟล์หลักฐานบน Google Drive</p>
              </div>
              {previewOriginalUrl && (
                <div className="mt-3 text-center w-full bg-blue-50/50 p-2.5 rounded-xl border border-blue-200/60">
                  <span className="text-[11px] text-slate-500 block mb-1.5">ต้องการเปิดดูหรือดาวน์โหลดไฟล์หลักฐานโดยตรง?</span>
                  <a 
                    href={previewOriginalUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-sm"
                  >
                    🔗 เปิดใน Google Drive (แท็บใหม่)
                  </a>
                </div>
              )}
            </div>
            <div className="p-3 text-center text-xs font-bold text-slate-600">
              หลักฐานสลิป / ใบเสร็จใช้จ่ายประกอบรายการ
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Week Confirmation Modal */}
      {weekToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200/80 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">ยืนยันการลบรอบตลาด?</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                ข้อมูลบันทึกบัญชีสินค้า รายการรายรับ-รายจ่ายของทีมทั้งหมดในรอบบัญชีนี้จะถูกลบและไม่สามารถกู้คืนได้
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={isDeletingWeek}
                onClick={async () => {
                  const targetId = weekToDelete;
                  setWeekToDelete(null);
                  try {
                    setIsDeletingWeek(true);
                    await onDeleteWeek(targetId);
                    const remainingWeeks = marketWeeks.filter(w => w.id !== targetId);
                    setSelectedWeek(remainingWeeks[0] || null);
                  } catch (err: any) {
                    alert(err.message || "เกิดข้อผิดพลาดในการลบรอบตลาด");
                  } finally {
                    setIsDeletingWeek(false);
                  }
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all"
              >
                ยืนยันการลบ
              </button>
              <button
                onClick={() => setWeekToDelete(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-all"
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
