/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Award, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MapPin, 
  Calendar,
  DollarSign,
  FileText,
  UserCheck,
  Paperclip,
  Trash2,
  X,
  Edit
} from "lucide-react";
import { User, Activity, BudgetRequest, SystemSettings } from "../types";
import { compressImage } from "../utils/imageCompressor";

export function getDirectDriveImageUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("/api/images/") || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("google_drive:")) {
    const fileId = trimmed.replace("google_drive:", "");
    return `/api/images/${fileId}`;
  }
  const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                      trimmed.match(/id=([a-zA-Z0-9_-]+)/) ||
                      trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    const fileId = fileIdMatch[1];
    return `/api/images/${fileId}`;
  }
  return trimmed;
}

interface ProjectProgressStepsProps {
  status: string;
}

function ProjectProgressSteps({ status }: ProjectProgressStepsProps) {
  // 1. เสนอโครงการ (proposed, rejected)
  // 2. ดำเนินการ (approved, in_progress, pending_settlement)
  // 3. เสร็จสิ้น (completed)
  
  let currentStep = 1;
  if (["approved", "in_progress", "pending_settlement"].includes(status)) {
    currentStep = 2;
  } else if (status === "completed") {
    currentStep = 3;
  }

  const steps = [
    {
      step: 1,
      title: "เสนอโครงการ",
      desc: "ยื่นแผน วัตถุประสงค์ และเสนอเบิกงบเบื้องต้น",
      badge: "เสนอรายละเอียดโครงการ",
    },
    {
      step: 2,
      title: "ดำเนินงาน",
      desc: "จัดโครงการ เบิกเงินย่อย / ขอขยายงบเพิ่มเติม",
      badge: "เบิกเงิน & แนบสลิปผ่าน Google Drive",
    },
    {
      step: 3,
      title: "เสร็จสิ้น",
      desc: "สรุปยอดจ่ายจริง คืนเงินทอน และสร้างสรุป PDF",
      badge: "สรุปผลโปร่งใส ตรวจสอบได้",
    }
  ];

  return (
    <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">ขั้นตอนโครงการกิจกรรม (Project Lifecycle)</span>
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-sans">
          ขั้นตอนปัจจุบัน: {steps[currentStep - 1].title}
        </span>
      </div>
      
      <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-2">
        {/* Connection line for desktop */}
        <div className="absolute top-[22px] left-[50px] right-[50px] h-0.5 bg-slate-200 hidden md:block -z-0" />
        
        {steps.map((s) => {
          const isActive = currentStep >= s.step;
          const isCurrent = currentStep === s.step;
          
          return (
            <div key={s.step} className="flex md:flex-col items-center gap-3 md:gap-1.5 md:text-center md:flex-1 relative z-10 w-full md:w-auto">
              <div 
                className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm transition-all border shadow-xs shrink-0 tabular-nums ${
                  isCurrent 
                    ? "bg-blue-600 text-white border-blue-600 ring-4 ring-blue-100 scale-105" 
                    : isActive 
                      ? "bg-emerald-500 text-white border-emerald-500" 
                      : "bg-white text-slate-400 border-slate-200"
                }`}
              >
                {isActive && s.step < currentStep ? "✓" : s.step}
              </div>
              
              <div className="text-left md:text-center">
                <p className={`font-bold text-xs ${isActive ? "text-slate-800" : "text-slate-400"}`}>
                  {s.step}. {s.title}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{s.desc}</p>
                <span className="inline-block text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-lg mt-1 font-sans">
                  {s.badge}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ActivitiesProps {
  currentUser: User;
  users: User[];
  activities: Activity[];
  budgetRequests: BudgetRequest[];
  settings: SystemSettings;
  onProposeActivity: (title: string, description: string, eventDate: string, location: string, budgetEstimated: number, documentUrls?: string[]) => Promise<{ activity: Activity }>;
  onApproveActivity: (activityId: string, action: "approve" | "reject", rejectReason?: string, budgetApproved?: number) => Promise<{ activity: Activity }>;
  onProposeBudget: (activityId: string, title: string, amount: number, reason: string, details?: string, documentUrls?: string[]) => Promise<unknown>;
  onApproveBudget: (requestId: string, action: "approve" | "reject", rejectReason?: string) => Promise<unknown>;
  onDeleteActivity: (activityId: string) => Promise<unknown>;
  onProposeSettlement?: (activityId: string, actualExpense: number, refundAmount: number, refundSlipUrl?: string, expenseReceipts?: string[]) => Promise<{ activity: Activity }>;
  onApproveSettlement?: (activityId: string, action: "approve" | "reject", rejectReason?: string) => Promise<{ activity: Activity }>;
  onProposeBudgetExpansion?: (activityId: string, originalRequestId: string, amount: number, reason: string) => Promise<unknown>;
  onApproveBudgetExpansion?: (requestId: string, action: "approve" | "reject", rejectReason?: string) => Promise<unknown>;
  onProposeExternalIncome?: (activityId: string, amount: number, source: string, slipUrl?: string) => Promise<{ activity: Activity }>;
  onApproveExternalIncome?: (activityId: string, incomeId: string, action: "approve" | "reject", rejectReason?: string) => Promise<{ activity: Activity }>;
  onUpdateActivity?: (activityId: string, updatedData: any) => Promise<{ activity: Activity }>;
}

export default function Activities({
  currentUser,
  users,
  activities,
  budgetRequests,
  settings,
  onProposeActivity,
  onApproveActivity,
  onProposeBudget,
  onApproveBudget,
  onDeleteActivity,
  onProposeSettlement,
  onApproveSettlement,
  onProposeBudgetExpansion,
  onApproveBudgetExpansion,
  onProposeExternalIncome,
  onApproveExternalIncome,
  onUpdateActivity
}: ActivitiesProps) {
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(activities[0] || null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "completed">("all");
  const [activeSubTab, setActiveSubTab] = useState<"all" | "overview" | "budgets" | "income" | "settlement" | "team">("all");

  React.useEffect(() => {
    if (selectedActivity) {
      const updated = activities.find(a => a.id === selectedActivity.id);
      if (updated) {
        setSelectedActivity(updated);
      }
    }
  }, [activities]);
  const [showProposeModal, setShowProposeModal] = useState<boolean>(false);
  const [showBudgetModal, setShowBudgetModal] = useState<boolean>(false);
  const [showExpansionModal, setShowExpansionModal] = useState<boolean>(false);
  const [selectedOriginalRequest, setSelectedOriginalRequest] = useState<BudgetRequest | null>(null);
  const [expansionAmount, setExpansionAmount] = useState<string>("");
  const [expansionReason, setExpansionReason] = useState<string>("");
  const [isSubmittingExpansion, setIsSubmittingExpansion] = useState<boolean>(false);

  const [showExternalIncomeModal, setShowExternalIncomeModal] = useState<boolean>(false);
  const [externalIncomeAmount, setExternalIncomeAmount] = useState<string>("");
  const [externalIncomeSource, setExternalIncomeSource] = useState<string>("");
  const [externalIncomeSlipUrl, setExternalIncomeSlipUrl] = useState<string>("");
  const [isSubmittingExternalIncome, setIsSubmittingExternalIncome] = useState<boolean>(false);
  const [isReviewingExternalIncome, setIsReviewingExternalIncome] = useState<boolean>(false);

  const [activityToDelete, setActivityToDelete] = useState<string | null>(null);

  const [activityToEdit, setActivityToEdit] = useState<Activity | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editLoc, setEditLoc] = useState<string>("");
  const [editBudgetEstimated, setEditBudgetEstimated] = useState<string>("");
  const [editBudgetApproved, setEditBudgetApproved] = useState<string>("");
  const [editActualExpense, setEditActualExpense] = useState<string>("");
  const [editRefundAmount, setEditRefundAmount] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const handleEditActivityClick = (act: Activity) => {
    setActivityToEdit(act);
    setEditTitle(act.title || "");
    setEditDesc(act.description || "");
    setEditDate(act.eventDate ? act.eventDate.substring(0, 10) : "");
    setEditLoc(act.location || "");
    setEditBudgetEstimated(act.budgetEstimated !== undefined ? act.budgetEstimated.toString() : "0");
    setEditBudgetApproved(act.budgetApproved !== undefined ? act.budgetApproved.toString() : "0");
    setEditActualExpense(act.actualExpense !== undefined ? act.actualExpense.toString() : "0");
    setEditRefundAmount(act.refundAmount !== undefined ? act.refundAmount.toString() : "0");
    setEditStatus(act.status || "proposed");
  };

  const handleSaveEdit = async () => {
    if (!activityToEdit || !onUpdateActivity) return;
    try {
      setIsSavingEdit(true);
      const updatedFields: any = {
        title: editTitle,
        description: editDesc,
        eventDate: editDate || null,
        location: editLoc,
        budgetEstimated: Number(editBudgetEstimated || 0),
        status: editStatus,
      };

      if (canProposeActivity) {
        updatedFields.budgetApproved = Number(editBudgetApproved || 0);
        updatedFields.actualExpense = Number(editActualExpense || 0);
        updatedFields.refundAmount = Number(editRefundAmount || 0);
      }

      await onUpdateActivity(activityToEdit.id, updatedFields);
      setActivityToEdit(null);
    } catch (err: any) {
      alert(err.message || "เกิดข้อผิดพลาดในการแก้ไขโครงการ");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteActivityClick = (activityId: string) => {
    setActivityToDelete(activityId);
  };

  const handleExportActivityPDF = () => {
    if (!selectedActivity) return;
    const dateFormatted = selectedActivity.eventDate 
      ? new Date(selectedActivity.eventDate).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })
      : "ไม่ระบุวัน";
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
          <img src="${absUrl}" referrerpolicy="no-referrer" style="max-height: 250px; max-width: 100%; object-fit: contain; border-radius: 8px; border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,0.08);" />
          ${originalDriveLink ? `
            <a href="${originalDriveLink}" target="_blank" style="font-size: 9px; color: #2563eb; font-weight: 600; text-decoration: underline; display: block; margin-top: 4px;">
              🔗 เปิดใน Google Drive
            </a>
          ` : ""}
        </div>
      `;
    };

    const renderPdfThumbnail = (url: string, size = 50) => {
      if (!url) return "";
      const directUrl = getDirectDriveImageUrl(url);
      const absUrl = directUrl.startsWith('/') ? `${window.location.origin}${directUrl}` : directUrl;
      return `<img src="${absUrl}" referrerpolicy="no-referrer" style="width: ${size}px; height: ${size}px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; vertical-align: middle;" />`;
    };

    const filteredRequests = budgetRequests.filter(r => r.activityId === selectedActivity.id);
    const budgetRequestsHtml = filteredRequests.length === 0
      ? `<p style="color:#888; font-style:italic;">ไม่มีรายการเบิกงบประมาณ</p>`
      : `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <thead>
            <tr>
              <th style="background: #f1f5f9; padding: 12px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; width: 50%;">หัวข้อการเบิกเงิน</th>
              <th style="background: #f1f5f9; padding: 12px 10px; text-align: right; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; width: 20%;">จำนวนเงิน</th>
              <th style="background: #f1f5f9; padding: 12px 10px; text-align: center; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; width: 15%;">สถานะ</th>
              <th style="background: #f1f5f9; padding: 12px 10px; text-align: right; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; width: 15%;">วันที่อนุมัติ</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRequests.map(r => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                  <strong>${r.title}</strong>
                  ${r.isExpansion ? `<span style="font-size: 8px; background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff; padding: 1px 5px; border-radius: 4px; font-weight: bold; margin-left: 6px;">ขยายงบประมาณ</span>` : ""}
                  <br/>
                  <small style="color:#666;">เหตุผล: ${r.reason || "-"}</small>
                  ${r.documentUrls && r.documentUrls.length > 0 ? `
                    <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px;">
                      ${r.documentUrls.map((url, uidx) => `
                        <div style="text-align: center; display: inline-block;">
                          ${renderPdfThumbnail(url, 50)}
                          <br/><span style="font-size: 7px; color: #64748b;">หลักฐาน #${uidx + 1}</span>
                        </div>
                      `).join("")}
                    </div>
                  ` : ""}
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align:right; font-weight:bold;">฿${r.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align:center;">${r.status === "approved" ? "โอนเงินแล้ว" : r.status === "rejected" ? "ปฏิเสธ" : "รออนุมัติ"}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align:right;">${r.approvedAt ? new Date(r.approvedAt).toLocaleDateString("th-TH") : "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

    const approvedExternalIncomes = selectedActivity.externalIncomes 
      ? selectedActivity.externalIncomes.filter(i => i.status === "approved") 
      : [];
    
    const totalExternalIncome = approvedExternalIncomes.reduce((sum, i) => sum + i.amount, 0);

    const externalIncomesHtml = approvedExternalIncomes.length === 0
      ? `<p style="color:#888; font-style:italic;">ไม่มีรายการเงินสนับสนุนหรือรายรับเพิ่มเติม</p>`
      : `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <thead>
            <tr>
              <th style="background: #f1f5f9; padding: 12px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; width: 50%;">แหล่งที่มา/คำอธิบาย</th>
              <th style="background: #f1f5f9; padding: 12px 10px; text-align: right; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; width: 25%;">จำนวนเงิน</th>
              <th style="background: #f1f5f9; padding: 12px 10px; text-align: right; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; width: 25%;">วันที่ได้รับการอนุมัติ</th>
            </tr>
          </thead>
          <tbody>
            ${approvedExternalIncomes.map(i => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                  <strong>${i.source}</strong>
                  ${i.slipUrl ? `
                    <div style="margin-top: 6px;">
                      ${renderPdfThumbnail(i.slipUrl, 50)}
                      <br/><span style="font-size: 7px; color: #64748b;">หลักฐานสลิปเงินเข้า</span>
                    </div>
                  ` : ""}
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align:right; font-weight:bold; color: #059669;">฿${i.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align:right;">${i.approvedAt ? new Date(i.approvedAt).toLocaleDateString("th-TH") : "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

    let proposalDocsHtml = "";
    if (!selectedActivity.documentUrls || selectedActivity.documentUrls.length === 0) {
      proposalDocsHtml = `<p style="color:#888; font-style:italic; text-align: center; margin: 15px 0;">ไม่มีเอกสารแนบโครงการ</p>`;
    } else {
      const cells: string[] = [];
      selectedActivity.documentUrls.forEach((url: string, index: number) => {
        cells.push(`
          <td style="width: 50%; vertical-align: top; padding: 6px; box-sizing: border-box;">
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center; background: #fafafa; page-break-inside: avoid; min-height: 200px; display: flex; flex-direction: column; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: bold; color: #475569; display: block; margin-bottom: 8px;">เอกสารแนบเสนอโครงการชิ้นที่ ${index + 1}</span>
              <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;">
                ${renderPdfItem(url)}
              </div>
            </div>
          </td>
        `);
      });
      const tableRows = [];
      for (let i = 0; i < cells.length; i += 2) {
        const cell1 = cells[i];
        const cell2 = cells[i + 1] || `<td style="width: 50%;"></td>`;
        tableRows.push(`<tr>${cell1}${cell2}</tr>`);
      }
      proposalDocsHtml = `
        <table style="width: 100%; border-collapse: separate; border-spacing: 12px; margin: 0 -12px; page-break-inside: avoid;">
          ${tableRows.join("")}
        </table>
      `;
    }

    const budgetReceipts = filteredRequests
      .filter(r => r.status === "approved")
      .flatMap(r => r.documentUrls || []);

    const allReceipts = [
      ...budgetReceipts,
      ...(selectedActivity.expenseReceipts || [])
    ];

    let receiptsHtml = "";
    if (allReceipts.length === 0) {
      receiptsHtml = `<p style="color:#888; font-style:italic; text-align: center; margin: 15px 0;">ไม่มีรูปภาพใบเสร็จ/หลักฐานการจ่ายเงินแนบไว้</p>`;
    } else {
      const cells: string[] = [];
      allReceipts.forEach((url: string, index: number) => {
        cells.push(`
          <td style="width: 50%; vertical-align: top; padding: 6px; box-sizing: border-box;">
            <div class="attachment-card" style="min-height: 220px; display: flex; flex-direction: column; justify-content: space-between;">
              <span class="attachment-title">ใบเสร็จ/บิลหลักฐานชิ้นที่ ${index + 1}</span>
              <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;">
                ${renderPdfItem(url)}
              </div>
            </div>
          </td>
        `);
      });
      const tableRows = [];
      for (let i = 0; i < cells.length; i += 2) {
        const cell1 = cells[i];
        const cell2 = cells[i + 1] || `<td style="width: 50%;"></td>`;
        tableRows.push(`<tr>${cell1}${cell2}</tr>`);
      }
      receiptsHtml = `
        <table style="width: 100%; border-collapse: separate; border-spacing: 12px; margin: 0 -12px; page-break-inside: avoid;">
          ${tableRows.join("")}
        </table>
      `;
    }

    const refundSlipHtml = !selectedActivity.refundSlipUrl
      ? `<p style="color:#888; font-style:italic; text-align: center; margin: 15px 0;">ไม่มีรูปสลิปโอนคืนเงินทอนแนบไว้</p>`
      : `
        <div class="attachment-card" style="max-width: 450px; margin: 15px auto; text-align: center;">
          <span class="attachment-title">สลิปโอนเงินทอนคืนกองทุนกลาง</span>
          ${renderPdfItem(selectedActivity.refundSlipUrl)}
        </div>
      `;

    printWindow.document.write(`
      <html>
        <head>
          <base href="${window.location.origin}/">
          <meta name="referrer" content="no-referrer">
          <title>สรุปเอกสารโครงการ - ${selectedActivity.title}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
          <style>
            body { 
              font-family: 'Sarabun', 'Inter', "Tahoma", sans-serif; 
              font-size: 12.5px; 
              color: #1e293b; 
              margin: 0; 
              padding: 0; 
              line-height: 1.6; 
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
              margin-bottom: 25px; 
              border-bottom: 3px double #cbd5e1; 
              padding-bottom: 18px; 
            }
            .title { 
              font-size: 22px; 
              font-weight: 700; 
              color: #0f172a; 
              margin-bottom: 4px; 
              letter-spacing: -0.5px;
            }
            .subtitle { 
              font-size: 12px; 
              color: #64748b; 
              font-weight: 500;
            }
            .meta-box { 
              border: 1px solid #e2e8f0; 
              border-radius: 12px; 
              padding: 8px 12px; 
              background: #f8fafc; 
              margin-bottom: 25px; 
              page-break-inside: avoid;
            }
            .meta-table {
              width: 100%;
              border-collapse: collapse;
            }
            .meta-table td {
              padding: 8px 12px;
              font-size: 12px;
              color: #334155;
              line-height: 1.5;
            }
            .meta-table td strong {
              color: #0f172a;
              font-weight: 600;
            }
            .section-title { 
              font-size: 13.5px; 
              font-weight: 700; 
              margin-top: 30px; 
              margin-bottom: 12px; 
              color: #1e3a8a; 
              border-bottom: 2px solid #3b82f6; 
              padding-bottom: 6px; 
              text-transform: uppercase; 
              page-break-after: avoid;
            }
            .summary-table { 
              width: 100%; 
              border-collapse: separate; 
              border-spacing: 12px 0; 
              margin: 0 -12px 25px -12px; 
              page-break-inside: avoid;
            }
            .summary-cell { 
              padding: 16px; 
              border-radius: 12px; 
              text-align: center; 
              border: 1px solid #e2e8f0; 
              width: 33.33%;
              box-shadow: 0 1px 3px rgba(0,0,0,0.02);
              box-sizing: border-box;
            }
            .card-profit { 
              border-top: 4px solid #2563eb; 
              background: #f8fafc; 
            }
            .card-cost { 
              border-top: 4px solid #ef4444; 
              background: #fdf2f2; 
            }
            .card-rev { 
              border-top: 4px solid #10b981; 
              background: #f0fdf4; 
            }
            .summary-label {
              font-size: 11px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .summary-value { 
              font-size: 20px; 
              font-weight: 700; 
              margin-top: 6px; 
              font-family: 'Inter', sans-serif;
            }
            .summary-value.profit { color: #1e40af; }
            .summary-value.cost { color: #b91c1c; }
            .summary-value.rev { color: #047857; }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 25px;
              font-size: 12px;
            }
            th {
              background: #f1f5f9;
              padding: 10px 12px;
              text-align: left;
              border-bottom: 2px solid #cbd5e1;
              font-weight: 700;
              color: #334155;
            }
            td {
              padding: 10px 12px;
              border-bottom: 1px solid #e2e8f0;
              color: #334155;
              vertical-align: top;
            }
            tr {
              page-break-inside: avoid;
            }
            .amount-col {
              font-family: 'Inter', sans-serif;
              font-weight: 600;
              text-align: right;
            }
            .badge {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 9999px;
              font-size: 10px;
              font-weight: 600;
              text-align: center;
            }
            .badge-approved { background: #dcfce7; color: #166534; }
            .badge-rejected { background: #fee2e2; color: #991b1b; }
            .badge-pending { background: #fef9c3; color: #854d0e; }
            
            .attachment-card {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 12px;
              background: #ffffff;
              box-shadow: 0 1px 3px rgba(0,0,0,0.02);
              page-break-inside: avoid;
              box-sizing: border-box;
            }
            .attachment-title {
              font-size: 11.5px;
              font-weight: 700;
              color: #475569;
              margin-bottom: 8px;
              display: block;
              text-align: center;
            }
            .footer-note { 
              text-align: center; 
              color: #94a3b8; 
              font-size: 11px; 
              margin-top: 50px; 
              border-top: 1px dashed #cbd5e1; 
              padding-top: 15px; 
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">รายงานสรุปผลการจัดโครงการกิจกรรม (Class Activity Report)</div>
            <div class="subtitle">ระบบสารสนเทศเพื่อความโปร่งใสกองทุนห้องเรียน</div>
          </div>
          
          <div class="meta-box">
            <table class="meta-table">
              <tr>
                <td style="width: 50%;"><strong>ชื่อโครงการ:</strong> ${selectedActivity.title}</td>
                <td style="width: 50%;"><strong>วันที่จัดกิจกรรม:</strong> ${dateFormatted}</td>
              </tr>
              <tr>
                <td><strong>สถานที่จัดงาน:</strong> ${selectedActivity.location || "ไม่ระบุ"}</td>
                <td><strong>ผู้รับผิดชอบเสนอโครงการ:</strong> ${users.find(u => u.id === selectedActivity.proposedBy)?.fullName || "ไม่ระบุ"}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 4px;"><strong>รายละเอียดโครงการ:</strong> ${selectedActivity.description || "ไม่มีคำอธิบาย"}</td>
              </tr>
              <tr>
                <td colspan="2"><strong>เงินสนับสนุนเพิ่มเติมจากภายนอก:</strong> <span style="font-family: 'Inter'; font-weight: 600;">฿${totalExternalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></td>
              </tr>
              <tr>
                <td colspan="2"><strong>สถานะปัจจุบัน:</strong> ${selectedActivity.status === "completed" ? "ดำเนินการเสร็จสิ้นและปิดบัญชีแล้ว" : "อยู่ระหว่างดำเนินงาน"}</td>
              </tr>
            </table>
          </div>
 
          <table class="summary-table">
            <tr>
              <td class="summary-cell card-profit">
                <div class="summary-label">งบประมาณที่อนุมัติเบิก</div>
                <div class="summary-value profit">฿${(selectedActivity.budgetApproved || selectedActivity.budgetEstimated || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              </td>
              <td class="summary-cell card-cost">
                <div class="summary-label">ยอดใช้จ่ายจริงตามใบเสร็จ</div>
                <div class="summary-value cost">฿${(selectedActivity.actualExpense || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              </td>
              <td class="summary-cell card-rev">
                <div class="summary-label">เงินทอนส่งคืนกองทุนกลาง</div>
                <div class="summary-value rev">฿${(selectedActivity.refundAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              </td>
            </tr>
          </table>

          <div class="section-title">📋 เอกสารเสนอโครงการและเอกสารแนบ (Project Proposal Documents)</div>
          ${proposalDocsHtml}

          <div class="section-title">📊 รายการเบิกจ่ายงบประมาณ (Budget Requests)</div>
          ${budgetRequestsHtml}

          <div class="section-title">📥 รายการเงินสนับสนุนและรายรับเพิ่มเติม (External Sponsorship & Additional Revenues)</div>
          ${externalIncomesHtml}

          <div class="section-title">🧾 รูปภาพบิลใบเสร็จและหลักฐานการจ่ายเงิน (Receipt Documents)</div>
          ${receiptsHtml}

          <div class="section-title">💸 รูปภาพสลิปโอนคืนเงินทอน (Refund Slip Document)</div>
          ${refundSlipHtml}

          <div class="footer-note">
            จัดพิมพ์เอกสารรายงานอิเล็กทรอนิกส์สรุปโครงการสำเร็จรูป ณ วันที่ ${new Date().toLocaleDateString("th-TH")} เวลา ${new Date().toLocaleTimeString("th-TH")} น.
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


  const userPos = (currentUser.position || "").toLowerCase();
  const canProposeActivity = currentUser.role === "treasurer" || 
    currentUser.role === "committee" ||
    userPos.includes("ประธาน") || 
    userPos.includes("รอง") || 
    userPos.includes("เลข") || 
    userPos.includes("เลขา") || 
    userPos.includes("เหรัญญิก");

  // New Activity Form States
  const [actTitle, setActTitle] = useState<string>("");
  const [actDesc, setActDesc] = useState<string>("");
  const [actDate, setActDate] = useState<string>("");
  const [actLoc, setActLoc] = useState<string>("");
  const [actBudget, setActBudget] = useState<string>("");
  const [actAttachments, setActAttachments] = useState<{ name: string; url: string }[]>([]);
  const [actLink, setActLink] = useState<string>("");
  const [actLinkName, setActLinkName] = useState<string>("");

  const handleAddActLink = () => {
    if (!actLink) return;
    const url = actLink.trim();
    const name = actLinkName.trim() || "ลิงก์หลักฐาน Google Drive";
    setActAttachments((prev: { name: string; url: string }[]) => {
      if (prev.some(p => p.url === url)) return prev;
      return [...prev, { name, url }];
    });
    setActLink("");
    setActLinkName("");
  };

  const handleActFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      files.forEach(async (file) => {
        const compressed = await compressImage(file, 800, 0.6);
        setActAttachments((prev: { name: string; url: string }[]) => {
          if (prev.some(p => p.name === file.name)) return prev;
          return [...prev, { name: file.name, url: compressed }];
        });
      });
    }
  };

  const removeActAttachment = (index: number) => {
    setActAttachments((prev: { name: string; url: string }[]) => prev.filter((_, i) => i !== index));
  };

  // New Budget Form States
  const [budTitle, setBudTitle] = useState<string>("");
  const [budAmount, setBudAmount] = useState<string>("");
  const [budReason, setBudReason] = useState<string>("");
  const [budDetails, setBudDetails] = useState<string>("");
  const [budAttachments, setBudAttachments] = useState<{ name: string; url: string }[]>([]);
  const [budLink, setBudLink] = useState<string>("");
  const [budLinkName, setBudLinkName] = useState<string>("");

  const handleAddBudLink = () => {
    if (!budLink) return;
    const url = budLink.trim();
    const name = budLinkName.trim() || "ลิงก์หลักฐาน Google Drive";
    setBudAttachments((prev: { name: string; url: string }[]) => {
      if (prev.some(p => p.url === url)) return prev;
      return [...prev, { name, url }];
    });
    setBudLink("");
    setBudLinkName("");
  };

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewOriginalUrl, setPreviewOriginalUrl] = useState<string | null>(null);

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
          <span className="text-[11px] truncate max-w-full block leading-none font-sans font-medium">{fallbackText}</span>
        </div>
      </div>
    );
  };

  // Settlement Form States
  const [showSettleModal, setShowSettleModal] = useState<boolean>(false);
  const [settleActualExpense, setSettleActualExpense] = useState<string>("");
  const [settleRefundSlip, setSettleRefundSlip] = useState<{ name: string; url: string } | null>(null);
  const [settleReceipts, setSettleReceipts] = useState<{ name: string; url: string }[]>([]);
  const [settleRefundLink, setSettleRefundLink] = useState<string>("");
  const [settleReceiptLink, setSettleReceiptLink] = useState<string>("");
  const [settleReceiptLinkName, setSettleReceiptLinkName] = useState<string>("");

  const handleRefundLinkChange = (urlVal: string) => {
    const cleanUrl = urlVal.trim();
    setSettleRefundLink(cleanUrl);
    if (cleanUrl) {
      setSettleRefundSlip({ name: "ลิงก์สลิปเงินคืน Google Drive", url: cleanUrl });
    } else {
      setSettleRefundSlip(null);
    }
  };

  const handleAddSettleReceiptLink = () => {
    if (!settleReceiptLink) return;
    const url = settleReceiptLink.trim();
    const name = settleReceiptLinkName.trim() || "ลิงก์ใบเสร็จ Google Drive";
    setSettleReceipts((prev: { name: string; url: string }[]) => {
      if (prev.some(p => p.url === url)) return prev;
      return [...prev, { name, url }];
    });
    setSettleReceiptLink("");
    setSettleReceiptLinkName("");
  };
  const [isSettling, setIsSettling] = useState<boolean>(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const [isCreatingActivity, setIsCreatingActivity] = useState<boolean>(false);
  const [isSubmittingBudget, setIsSubmittingBudget] = useState<boolean>(false);
  const [isReviewingActivity, setIsReviewingActivity] = useState<boolean>(false);
  const [isReviewingBudget, setIsReviewingBudget] = useState<boolean>(false);
  const [isReviewingSettlement, setIsReviewingSettlement] = useState<boolean>(false);
  const [isDeletingActivity, setIsDeletingActivity] = useState<boolean>(false);

  const mockReceipts = [
    { name: "ใบเสร็จค่าของ.png", url: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?q=80&w=300" },
    { name: "ใบเสนอราคาอุปกรณ์.png", url: "https://images.unsplash.com/photo-1563013544-824ae1d704d3?q=80&w=300" },
    { name: "ค่าจัดพิมพ์เอกสาร.png", url: "https://images.unsplash.com/photo-1543269865-cbf427effbad?q=80&w=300" }
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      files.forEach(async (file) => {
        const compressed = await compressImage(file, 800, 0.6);
        setBudAttachments((prev: { name: string; url: string }[]) => {
          if (prev.some(p => p.name === file.name)) return prev;
          return [...prev, { name: file.name, url: compressed }];
        });
      });
    }
  };

  const handleSettleReceiptsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      files.forEach(async (file) => {
        const compressed = await compressImage(file, 800, 0.6);
        setSettleReceipts((prev: { name: string; url: string }[]) => {
          if (prev.some(p => p.name === file.name)) return prev;
          return [...prev, { name: file.name, url: compressed }];
        });
      });
    }
  };

  const handleSettleRefundSlipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const compressed = await compressImage(file, 800, 0.6);
      setSettleRefundSlip({ name: file.name, url: compressed });
    }
  };

  const selectMockReceipt = (name: string, url: string) => {
    setBudAttachments((prev: { name: string; url: string }[]) => {
      if (prev.some(a => a.name === name)) return prev;
      return [...prev, { name, url }];
    });
  };

  const removeAttachment = (index: number) => {
    setBudAttachments((prev: { name: string; url: string }[]) => prev.filter((_, i) => i !== index));
  };

  // Reject States
  const [rejectReason, setRejectReason] = useState<string>("");
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null); // 'act' or 'bud'

  const selectedBudgets = selectedActivity ? budgetRequests.filter(r => r.activityId === selectedActivity.id) : [];

  const handleProposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actTitle || isCreatingActivity) return;
    setIsCreatingActivity(true);
    try {
      const res = await onProposeActivity(
        actTitle,
        actDesc,
        actDate,
        actLoc,
        Number(actBudget || 0),
        actAttachments.map(a => a.url)
      );
      setSelectedActivity(res.activity);
      setActTitle("");
      setActDesc("");
      setActDate("");
      setActLoc("");
      setActBudget("");
      setActAttachments([]);
      setShowProposeModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingActivity(false);
    }
  };

  const handleBudgetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity || !budTitle || !budAmount || isSubmittingBudget) return;
    setIsSubmittingBudget(true);
    try {
      await onProposeBudget(
        selectedActivity.id,
        budTitle,
        Number(budAmount),
        budReason,
        budDetails,
        budAttachments.map(a => a.url)
      );
      setBudTitle("");
      setBudAmount("");
      setBudReason("");
      setBudDetails("");
      setBudAttachments([]);
      setShowBudgetModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingBudget(false);
    }
  };

  const handleApproveActivityClick = async (action: "approve" | "reject") => {
    if (!selectedActivity || isReviewingActivity) return;
    if (action === "reject" && !rejectReason) {
      setShowRejectInput("act");
      return;
    }

    setIsReviewingActivity(true);
    try {
      const res = await onApproveActivity(
        selectedActivity.id,
        action,
        action === "reject" ? rejectReason : undefined,
        action === "approve" ? selectedActivity.budgetEstimated : undefined
      );
      setSelectedActivity(res.activity);
      setRejectReason("");
      setShowRejectInput(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReviewingActivity(false);
    }
  };

  const handleApproveBudgetClick = async (requestId: string, action: "approve" | "reject") => {
    if (isReviewingBudget) return;
    if (action === "reject" && !rejectReason) {
      setShowRejectInput(`bud_${requestId}`);
      return;
    }

    const req = budgetRequests.find(r => r.id === requestId);
    const isExp = req?.isExpansion;

    setIsReviewingBudget(true);
    try {
      if (isExp && onApproveBudgetExpansion) {
        await onApproveBudgetExpansion(
          requestId,
          action,
          action === "reject" ? rejectReason : undefined
        );
      } else {
        await onApproveBudget(
          requestId,
          action,
          action === "reject" ? rejectReason : undefined
        );
      }
      setRejectReason("");
      setShowRejectInput(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReviewingBudget(false);
    }
  };

  const handleProposeExpansionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity || !selectedOriginalRequest || !onProposeBudgetExpansion || isSubmittingExpansion || !expansionAmount) return;
    setIsSubmittingExpansion(true);
    try {
      await onProposeBudgetExpansion(
        selectedActivity.id,
        selectedOriginalRequest.id,
        Number(expansionAmount),
        expansionReason
      );
      setExpansionAmount("");
      setExpansionReason("");
      setShowExpansionModal(false);
      setSelectedOriginalRequest(null);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเสนอขอขยายงบประมาณ");
    } finally {
      setIsSubmittingExpansion(false);
    }
  };

  const handleExternalIncomeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const compressed = await compressImage(reader.result as string, 800, 0.6);
        setExternalIncomeSlipUrl(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExternalIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity || !onProposeExternalIncome || isSubmittingExternalIncome || !externalIncomeAmount || !externalIncomeSource) return;
    setIsSubmittingExternalIncome(true);
    try {
      const res = await onProposeExternalIncome(
        selectedActivity.id,
        Number(externalIncomeAmount),
        externalIncomeSource,
        externalIncomeSlipUrl
      );
      setSelectedActivity(res.activity);
      setExternalIncomeAmount("");
      setExternalIncomeSource("");
      setExternalIncomeSlipUrl("");
      setShowExternalIncomeModal(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "เกิดข้อผิดพลาดในการบันทึกเงินสนับสนุน");
    } finally {
      setIsSubmittingExternalIncome(false);
    }
  };

  const handleApproveExternalIncomeClick = async (incomeId: string, action: "approve" | "reject") => {
    if (!selectedActivity || !onApproveExternalIncome || isReviewingExternalIncome) return;
    if (action === "reject" && !rejectReason) {
      setShowRejectInput(`ext_inc_${incomeId}`);
      return;
    }

    setIsReviewingExternalIncome(true);
    try {
      const res = await onApproveExternalIncome(
        selectedActivity.id,
        incomeId,
        action,
        action === "reject" ? rejectReason : undefined
      );
      setSelectedActivity(res.activity);
      setRejectReason("");
      setShowRejectInput(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReviewingExternalIncome(false);
    }
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity || !onProposeSettlement) return;
    if (!settleActualExpense) {
      setSettleError("กรุณาระบุยอดใช้จ่ายจริง");
      return;
    }

    const approvedBudgets = budgetRequests.filter(r => r.activityId === selectedActivity.id && r.status === "approved");
    const totalBudgetApproved = approvedBudgets.reduce((sum, r) => sum + r.amount, 0);
    const approvedExternalIncomes = selectedActivity.externalIncomes ? selectedActivity.externalIncomes.filter((i: any) => i.status === "approved") : [];
    const totalExternalIncome = approvedExternalIncomes.reduce((sum: number, i: any) => sum + i.amount, 0);
    const totalProjectFunds = totalBudgetApproved + totalExternalIncome;
    const actual = Number(settleActualExpense);
    const refund = Math.max(0, totalProjectFunds - actual);

    if (refund > 0 && !settleRefundSlip) {
      setSettleError("มีเงินทอนเกิดขึ้น กรุณาอัปโหลดรูปภาพสลิปโอนคืนเงินทอน");
      return;
    }

    setIsSettling(true);
    setSettleError(null);

    try {
      const res = await onProposeSettlement(
        selectedActivity.id,
        actual,
        refund,
        settleRefundSlip ? settleRefundSlip.url : "",
        settleReceipts.map(r => r.url)
      );
      setSelectedActivity(res.activity);
      setShowSettleModal(false);
      setSettleActualExpense("");
      setSettleRefundSlip(null);
      setSettleReceipts([]);
    } catch (err: any) {
      setSettleError(err.message || "เกิดข้อผิดพลาดในการยื่นส่งทอนเงิน");
    } finally {
      setIsSettling(false);
    }
  };

  const handleApproveSettlementClick = async (action: "approve" | "reject") => {
    if (!selectedActivity || !onApproveSettlement || isReviewingSettlement) return;
    if (action === "reject" && !rejectReason) {
      setShowRejectInput("settle_reject");
      return;
    }

    setIsReviewingSettlement(true);
    try {
      const res = await onApproveSettlement(
        selectedActivity.id,
        action,
        action === "reject" ? rejectReason : undefined
      );
      setSelectedActivity(res.activity);
      setRejectReason("");
      setShowRejectInput(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReviewingSettlement(false);
    }
  };

  const getActivityStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full">เสร็จสิ้นกิจกรรม</span>;
      case "archived":
        return <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">📦 จัดเก็บเป็นไฟล์แล้ว</span>;
      case "in_progress":
        return <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full">กำลังดำเนินโครงการ</span>;
      case "approved":
        return <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-3 py-1 rounded-full">อนุมัติงบโครงการแล้ว</span>;
      case "pending_settlement":
        return <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200/80 px-3 py-1 rounded-full inline-flex items-center gap-1"><Clock size={12} /> รอตรวจทอนเงิน/ปิดงาน</span>;
      case "rejected":
        return <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-3 py-1 rounded-full">โครงการไม่ได้รับการอนุมัติ</span>;
      case "proposed":
      default:
        return <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1 rounded-full inline-flex items-center gap-1"><Clock size={12} /> รอเหรัญญิกอนุมัติ</span>;
    }
  };

  const getBudgetStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full shrink-0">อนุมัติและโอนเงินแล้ว</span>;
      case "rejected":
        return <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-0.5 rounded-full shrink-0">ปฏิเสธคำขอ</span>;
      case "pending":
      default:
        return <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full shrink-0">รอตรวจสอบ</span>;
    }
  };

  const filteredActivities = activities.filter((act) => {
    if (statusFilter === "active") return act.status === "approved" || act.status === "in_progress";
    if (statusFilter === "pending") return act.status === "proposed" || act.status === "pending_settlement";
    if (statusFilter === "completed") return act.status === "completed" || (act.status as string) === "archived";
    return true;
  });

  const totalApprovedPool = activities.reduce((sum, a) => sum + (a.budgetApproved || a.budgetEstimated || 0), 0);
  const totalActualSpentPool = activities.reduce((sum, a) => {
    const reqSpent = budgetRequests
      .filter((r) => r.activityId === a.id && r.status === "approved")
      .reduce((s, r) => s + r.amount, 0);
    return sum + (a.actualExpense !== undefined && a.actualExpense > 0 ? a.actualExpense : reqSpent);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200/60">
              <Award size={13} /> ระบบบริหารโครงการและงบประมาณส่วนกลาง
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2 tracking-tight">
              โครงการและงบประมาณกิจกรรม
            </h1>
            <p className="text-xs text-slate-500">
              เสนอแผนงานโครงการเพื่อขออนุมัติใช้วงเงินงบประมาณจากส่วนกลางเงินเก็บ Tns รุ่น 06 พร้อมติดตามเบิกงบย่อยและคืนเงินทอน
            </p>
          </div>

          {canProposeActivity ? (
            <button 
              onClick={() => setShowProposeModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-xs px-4 py-3 flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/15 shrink-0 w-full sm:w-fit cursor-pointer"
            >
              <Plus size={16} /> เสนอโครงการกิจกรรมใหม่
            </button>
          ) : (
            <div className="bg-slate-100 border border-slate-200/80 text-slate-600 font-bold rounded-2xl text-xs px-3.5 py-2.5 flex items-center gap-1.5 shrink-0 select-none">
              🔒 เฉพาะประธาน, รอง, เลขา และเหรัญญิกเท่านั้นที่เสนอกิจกรรมได้
            </div>
          )}
        </div>

        {/* Summary KPI Strip & Status Filter Tabs */}
        <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60 w-full md:w-auto">
            {[
              { id: "all", label: "ทั้งหมด", count: activities.length },
              { id: "active", label: "กำลังดำเนินงาน", count: activities.filter(a => a.status === "approved" || a.status === "in_progress").length },
              { id: "pending", label: "รออนุมัติ/ปิดงบ", count: activities.filter(a => a.status === "proposed" || a.status === "pending_settlement").length },
              { id: "completed", label: "เสร็จสิ้น", count: activities.filter(a => a.status === "completed" || (a.status as string) === "archived").length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  statusFilter === tab.id
                    ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[11px] px-1.5 py-0.2 rounded-full tabular-nums ${
                  statusFilter === tab.id ? "bg-blue-50 text-blue-700" : "bg-slate-200/70 text-slate-600"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 text-xs bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200/60 shrink-0">
            <div>
              <span className="text-[11px] text-slate-500 block">วงเงินโครงการรวม</span>
              <strong className="text-slate-900 font-bold tabular-nums">฿{totalApprovedPool.toLocaleString()}</strong>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-[11px] text-slate-500 block">เบิกจ่าย/ใช้จริงรวม</span>
              <strong className="text-blue-700 font-bold tabular-nums">฿{totalActualSpentPool.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* List of projects */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">รายการโครงการ ({filteredActivities.length})</h3>
              <span className="text-[11px] text-slate-400 font-medium">คลิกเพื่อดูรายละเอียด</span>
            </div>
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {filteredActivities.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-xs">ไม่พบโครงการในหมวดหมู่นี้</p>
              ) : (
                filteredActivities.map((act) => {
                  const actApprovedBudgets = budgetRequests
                    .filter((r) => r.activityId === act.id && r.status === "approved")
                    .reduce((s, r) => s + r.amount, 0);
                  const budgetTarget = act.budgetApproved && act.budgetApproved > 0 ? act.budgetApproved : act.budgetEstimated || 0;
                  const spentAmount = act.status === "completed" || act.status === "pending_settlement"
                    ? (act.actualExpense || actApprovedBudgets)
                    : actApprovedBudgets;
                  const usagePercent = budgetTarget > 0 ? Math.min(100, Math.round((spentAmount / budgetTarget) * 100)) : 0;

                  const statusPill = (() => {
                    switch (act.status) {
                      case "completed":
                        return <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full shrink-0">เสร็จสิ้น</span>;
                      case "in_progress":
                        return <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 rounded-full shrink-0">กำลังดำเนินการ</span>;
                      case "approved":
                        return <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-full shrink-0">อนุมัติแล้ว</span>;
                      case "pending_settlement":
                        return <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200/70 px-2 py-0.5 rounded-full shrink-0">รอตรวจปิดงบ</span>;
                      case "rejected":
                        return <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/70 px-2 py-0.5 rounded-full shrink-0">ไม่อนุมัติ</span>;
                      default:
                        return <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-full shrink-0">รออนุมัติ</span>;
                    }
                  })();

                  return (
                    <div 
                      key={act.id}
                      onClick={() => setSelectedActivity(act)}
                      className={`p-3.5 rounded-2xl cursor-pointer transition-all border text-xs space-y-2.5 ${
                        selectedActivity?.id === act.id 
                          ? "border-blue-500 bg-blue-50/40 shadow-xs ring-1 ring-blue-500/20" 
                          : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/70 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-slate-900 font-bold line-clamp-1 leading-snug">{act.title}</p>
                        {statusPill}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                        <div className="bg-slate-50/90 px-2.5 py-1.5 rounded-xl border border-slate-100">
                          <span className="text-slate-400 block">งบที่อนุมัติ/ตั้งไว้</span>
                          <strong className="text-slate-800 font-bold tabular-nums">฿{budgetTarget.toLocaleString()}</strong>
                        </div>
                        <div className="bg-slate-50/90 px-2.5 py-1.5 rounded-xl border border-slate-100">
                          <span className="text-slate-400 block">เบิก/ใช้จ่ายจริง</span>
                          <strong className="text-blue-700 font-bold tabular-nums">฿{spentAmount.toLocaleString()}</strong>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">สัดส่วนการใช้งบ</span>
                          <span className="font-bold text-slate-700 tabular-nums">{usagePercent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              usagePercent >= 100
                                ? "bg-amber-500"
                                : act.status === "completed"
                                  ? "bg-emerald-500"
                                  : "bg-blue-600"
                            }`}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Project workspace */}
        <div className="lg:col-span-8 space-y-6">
          {selectedActivity ? (
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-6">
              {/* Header inside */}
              <div className="flex flex-col md:flex-row md:items-start justify-between pb-4 border-b border-slate-100 gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">{selectedActivity.title}</h2>
                    {(canProposeActivity || selectedActivity.proposedBy === currentUser.id) && (
                      <button 
                        onClick={() => handleEditActivityClick(selectedActivity)}
                        className="text-slate-500 hover:text-blue-600 p-1.5 rounded-xl hover:bg-blue-50 transition-all shrink-0 border border-transparent hover:border-blue-200/60 cursor-pointer"
                        title="แก้ไขรายละเอียดโครงการ"
                      >
                        <Edit size={16} />
                      </button>
                    )}
                    {(canProposeActivity || (selectedActivity.proposedBy === currentUser.id && selectedActivity.status !== "completed")) && (
                      <button 
                        onClick={() => handleDeleteActivityClick(selectedActivity.id)}
                        className="text-slate-500 hover:text-rose-600 p-1.5 rounded-xl hover:bg-rose-50 transition-all shrink-0 border border-transparent hover:border-rose-200/60 cursor-pointer"
                        title="ลบโครงการกิจกรรมนี้"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{selectedActivity.description || "ไม่มีรายละเอียดประกอบโครงการ"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {selectedActivity.status === "completed" && (
                    <button 
                      onClick={handleExportActivityPDF}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs px-3.5 py-2 flex items-center gap-1.5 transition-all border border-blue-200/80 cursor-pointer shadow-xs shrink-0"
                      title="ดาวน์โหลดสรุปผลและใบเสร็จทั้งหมดเป็น PDF"
                    >
                      📄 PDF / พิมพ์สรุปงาน
                    </button>
                  )}
                  {getActivityStatusBadge(selectedActivity.status)}
                </div>
              </div>

              {/* Sub-navigation tabs inside Activity Detail Workspace (Mobile-friendly) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
                {[
                  { id: "all", label: "ทั้งหมด" },
                  { id: "overview", label: "ภาพรวม" },
                  { id: "budgets", label: `เบิกงบย่อย (${selectedBudgets.length})` },
                  { id: "income", label: `รายรับภายนอก (${selectedActivity.externalIncomes?.length || 0})` },
                  { id: "settlement", label: "สรุปยอด/คืนเงิน" },
                  { id: "team", label: "ทีมงาน" },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setActiveSubTab(sub.id as any)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                      activeSubTab === sub.id
                        ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              {/* Progress Steps for 3 logical phases requested by user */}
              {(activeSubTab === "all" || activeSubTab === "overview") && (
                <ProjectProgressSteps status={selectedActivity.status} />
              )}

              {/* Grid properties */}
              {(activeSubTab === "all" || activeSubTab === "overview") && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs font-sans text-slate-600">
                  <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <Calendar size={18} className="text-blue-600 shrink-0" />
                    <div>
                      <span className="block text-[11px] text-slate-500">วันที่จัดกิจกรรม</span>
                      <strong className="text-slate-900">{selectedActivity.eventDate ? new Date(selectedActivity.eventDate).toLocaleDateString("th-TH") : "ไม่ระบุวัน"}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60">
                    <MapPin size={18} className="text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-[11px] text-slate-500">สถานที่จัดงาน</span>
                      <strong className="line-clamp-1 text-slate-900">{selectedActivity.location || "ไม่ระบุสถานที่"}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200/60">
                    <DollarSign size={18} className="text-blue-600 shrink-0" />
                    <div>
                      <span className="block text-[11px] text-blue-600 font-medium">งบประมาณเสนอขอ</span>
                      <strong className="text-slate-900 text-sm tabular-nums">฿{selectedActivity.budgetEstimated.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Activity document attachments */}
              {(activeSubTab === "all" || activeSubTab === "overview") && selectedActivity.documentUrls && selectedActivity.documentUrls.length > 0 && (
                <div className="space-y-2 text-xs">
                  <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText size={14} className="text-blue-500" /> เอกสารแนบ / สลิปหลักฐานเสนอขอโครงการ:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedActivity.documentUrls.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handlePreviewImage(url)}
                        className="bg-slate-50 border border-slate-200/80 hover:border-blue-300 text-xs text-blue-700 font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <Paperclip size={13} className="text-slate-400" />
                        <span>เอกสารประกอบ #{i+1}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Settlement Section (คืนเงินทอน & สรุปยอดจ่ายจริง) */}
              {(activeSubTab === "all" || activeSubTab === "settlement" || activeSubTab === "overview") && selectedActivity.status === "in_progress" && (
                <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs space-y-3">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                    <DollarSign size={16} className="text-indigo-600" /> สรุปข้อมูลโครงการ & คืนเงินทอน
                  </h4>
                  {(() => {
                    const approvedBudgets = budgetRequests.filter(r => r.activityId === selectedActivity.id && r.status === "approved");
                    const totalBudgetApproved = approvedBudgets.reduce((sum, r) => sum + r.amount, 0);
                    return (
                      <div className="space-y-3">
                        <p className="text-slate-600 leading-relaxed font-sans">
                          โครงการนี้ได้รับอนุมัติโอนเงินงบประมาณไปแล้วรวม <strong className="tabular-nums text-slate-900">฿{totalBudgetApproved.toLocaleString()}</strong> เมื่อกิจกรรมดำเนินงานเสร็จสิ้นกรุณากรอกรายงานสรุปยอดจ่ายจริง แนบใบเสร็จ และส่งสลิปเงินทอนโอนคืนระบบ (ถ้ามี)
                        </p>
                        {(currentUser.id === selectedActivity.proposedBy || currentUser.role === "treasurer" || currentUser.role === "committee") && (
                          <button
                            type="button"
                            onClick={() => {
                              setSettleActualExpense("");
                              setSettleRefundSlip(null);
                              setSettleReceipts([]);
                              setSettleError(null);
                              setShowSettleModal(true);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 w-full sm:w-fit cursor-pointer"
                          >
                            ✍️ บันทึกสรุปงาน & ส่งสลิปเงินทอน
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Pending Settlement Status (เหรัญญิกตรวจสอบปิดงาน) */}
              {(activeSubTab === "all" || activeSubTab === "settlement" || activeSubTab === "overview") && selectedActivity.status === "pending_settlement" && (
                <div className="p-4 sm:p-5 bg-purple-50/50 border border-purple-200/80 rounded-2xl text-xs space-y-4">
                  <h4 className="font-bold text-purple-900 flex items-center gap-1.5 font-display text-sm">
                    <FileText size={16} className="text-purple-600" /> ข้อมูลส่งตรวจประเมินปิดงาน & เงินทอน
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 bg-white rounded-2xl border border-purple-200/60">
                      <span className="block text-[11px] text-slate-500">ยอดใช้จ่ายจริง</span>
                      <strong className="text-slate-900 text-sm tabular-nums">฿{(selectedActivity.actualExpense || 0).toLocaleString()}</strong>
                    </div>
                    <div className="p-3.5 bg-white rounded-2xl border border-purple-200/60">
                      <span className="block text-[11px] text-slate-500">ยอดเงินทอนคืนระบบ</span>
                      <strong className="text-emerald-700 text-sm tabular-nums">฿{(selectedActivity.refundAmount || 0).toLocaleString()}</strong>
                    </div>
                    <div className="p-3.5 bg-white rounded-2xl border border-purple-200/60">
                      <span className="block text-[11px] text-slate-500">สถานะสรุปบัญชี</span>
                      <span className="text-[11px] bg-purple-100 text-purple-700 font-bold px-2.5 py-0.5 rounded-full mt-1 inline-block">รอเหรัญญิกตรวจสอบ</span>
                    </div>
                  </div>

                  {/* Expense receipts from settlement */}
                  {selectedActivity.expenseReceipts && selectedActivity.expenseReceipts.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="block text-xs text-slate-600 font-bold">ใบเสร็จ/หลักฐานการจ่ายจริง ({selectedActivity.expenseReceipts.length} ใบ):</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedActivity.expenseReceipts.map((url, uidx) => (
                          <div 
                            key={uidx} 
                            onClick={() => handlePreviewImage(url)}
                            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-purple-400 transition-all w-14 h-14 flex items-center justify-center shrink-0 shadow-xs"
                            title="คลิกเพื่อขยายดูหลักฐาน"
                          >
                            {renderAttachmentThumbnail(url, "receipt")}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="text-[11px] text-white font-bold">เปิดดู</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Refund slip from settlement */}
                  {selectedActivity.refundSlipUrl && (
                    <div className="space-y-1.5">
                      <span className="block text-xs text-slate-600 font-bold">สลิปโอนคืนเงินทอนเข้าระบบ:</span>
                      <div className="flex gap-2">
                        <div 
                          onClick={() => handlePreviewImage(selectedActivity.refundSlipUrl!)}
                          className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-emerald-400 transition-all w-24 h-16 flex items-center justify-center shrink-0 shadow-xs"
                          title="คลิกเพื่อดูสลิปโอนเงินทอน"
                        >
                          {renderAttachmentThumbnail(selectedActivity.refundSlipUrl!, "slip")}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-[11px] text-white font-bold">เปิดดู</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Treasurer controls for pending settlement */}
                  {currentUser.role === "treasurer" && (
                    <div className="pt-3 border-t border-purple-200/60 space-y-3">
                      <span className="block font-bold text-slate-800">✍️ การตัดสินใจของเหรัญญิกในการปิดงาน:</span>
                      {showRejectInput === "settle_reject" ? (
                        <div className="space-y-2">
                          <label className="block text-xs text-slate-600 font-bold">ระบุเหตุผลที่ปฏิเสธรายงานสรุปงาน</label>
                          <input 
                            type="text" 
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="เช่น ยอดเงินทอนไม่ตรงกับสลิปโอน หรือหลักฐานสลิปไม่ถูกต้อง" 
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-sans"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => handleApproveSettlementClick("reject")} disabled={isReviewingSettlement} className="bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                              {isReviewingSettlement ? "กำลังส่งกลับ..." : "ยืนยันส่งกลับแก้ไข"}
                            </button>
                            <button onClick={() => setShowRejectInput(null)} disabled={isReviewingSettlement} className="bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl cursor-pointer">ยกเลิก</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => handleApproveSettlementClick("approve")} disabled={isReviewingSettlement} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer">
                            {isReviewingSettlement ? "กำลังดำเนินการ..." : "อนุมัติสรุปงาน & ตรวจรับเงินทอนสำเร็จ"}
                          </button>
                          <button onClick={() => setShowRejectInput("settle_reject")} disabled={isReviewingSettlement} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer">ส่งกลับไปแก้ไข</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Completed Settlement Status details */}
              {(activeSubTab === "all" || activeSubTab === "settlement" || activeSubTab === "overview") && (selectedActivity.status === "completed") && (
                <div className="p-4 sm:p-5 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl text-xs space-y-3">
                  <h4 className="font-bold text-emerald-900 flex items-center gap-1.5 font-display text-sm">
                    <CheckCircle2 size={16} className="text-emerald-600" /> โครงการเสร็จสิ้นและปิดบัญชีแล้ว
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans">
                    <div>
                      <span className="text-slate-500">ยอดใช้จ่ายจริง:</span>
                      <strong className="text-slate-900 ml-1.5 tabular-nums">฿{(selectedActivity.actualExpense || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">เงินทอนคืนระบบ:</span>
                      <strong className="text-emerald-700 ml-1.5 tabular-nums">฿{(selectedActivity.refundAmount || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">ผู้ปิดบัญชี:</span>
                      <strong className="text-slate-800 ml-1.5">{users.find(u => u.id === selectedActivity.settledBy)?.fullName || "เหรัญญิก"}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">วันที่ปิดยอดบัญชี:</span>
                      <strong className="text-slate-800 ml-1.5">{selectedActivity.settledAt ? new Date(selectedActivity.settledAt).toLocaleDateString("th-TH") : "ไม่ระบุ"}</strong>
                    </div>
                  </div>

                  {/* Expense receipts from settlement */}
                  {selectedActivity.expenseReceipts && selectedActivity.expenseReceipts.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-emerald-200/50">
                      <span className="block text-xs text-slate-600 font-bold">เอกสารใบเสร็จจ่ายจริง ({selectedActivity.expenseReceipts.length} ใบ):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedActivity.expenseReceipts.map((url, uidx) => (
                          <div 
                            key={uidx} 
                            onClick={() => handlePreviewImage(url)}
                            className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-emerald-400 transition-all w-12 h-12 flex items-center justify-center shrink-0 shadow-xs"
                            title="คลิกเพื่อขยายดูหลักฐาน"
                          >
                            {renderAttachmentThumbnail(url, "receipt")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Refund slip from settlement */}
                  {selectedActivity.refundSlipUrl && (
                    <div className="space-y-1.5">
                      <span className="block text-xs text-slate-600 font-bold">หลักฐานสลิปเงินทอน:</span>
                      <div 
                        onClick={() => handlePreviewImage(selectedActivity.refundSlipUrl!)}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-emerald-400 transition-all w-20 h-12 flex items-center justify-center shrink-0 shadow-xs"
                      >
                        {renderAttachmentThumbnail(selectedActivity.refundSlipUrl!, "slip")}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeSubTab === "settlement" && selectedActivity.status !== "in_progress" && selectedActivity.status !== "pending_settlement" && selectedActivity.status !== "completed" && (
                <div className="p-8 bg-slate-50 border border-slate-200/80 rounded-2xl text-center text-xs text-slate-500">
                  โครงการต้องอยู่ในสถานะกำลังดำเนินงานหรือเสร็จสิ้น จึงจะสามารถบันทึกสรุปยอดใช้จ่ายและคืนเงินทอนได้
                </div>
              )}

              {/* Treasurer validation controls */}
              {(activeSubTab === "all" || activeSubTab === "overview") && selectedActivity.status === "proposed" && currentUser.role === "treasurer" && (
                <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs space-y-3">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                    <UserCheck size={16} className="text-blue-600" /> แผงการตัดสินใจของเหรัญญิก
                  </h4>
                  {showRejectInput === "act" ? (
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-600 font-bold">ระบุเหตุผลที่ปฏิเสธโครงการ</label>
                      <input 
                        type="text" 
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="เช่น เกินงบวงเงินกองทุนสำรองขณะนี้" 
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleApproveActivityClick("reject")} disabled={isReviewingActivity} className="bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                          {isReviewingActivity ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}
                        </button>
                        <button onClick={() => setShowRejectInput(null)} disabled={isReviewingActivity} className="bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl cursor-pointer">ยกเลิก</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleApproveActivityClick("approve")} disabled={isReviewingActivity} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer">
                        {isReviewingActivity ? "กำลังดำเนินการ..." : "อนุมัติโครงการกิจกรรม"}
                      </button>
                      <button onClick={() => setShowRejectInput("act")} disabled={isReviewingActivity} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer">ปฏิเสธโครงการ</button>
                    </div>
                  )}
                </div>
              )}

              {/* Budget request logs for the selected activity */}
              {(activeSubTab === "all" || activeSubTab === "budgets") && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">คำขอเบิกเงินงบประมาณสัญญาย่อย</h3>
                      <p className="text-xs text-slate-500">รายการเบิกจ่ายย่อยและขอขยายวงเงินภายใต้โครงการนี้</p>
                    </div>
                    {(selectedActivity.status === "approved" || selectedActivity.status === "in_progress") && 
                     (currentUser.role === "treasurer" || 
                      currentUser.role === "committee" || 
                      selectedActivity.proposedBy === currentUser.id) && (
                      <button 
                        onClick={() => setShowBudgetModal(true)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-bold rounded-xl text-xs px-3.5 py-2 flex items-center justify-center gap-1.5 transition-all shrink-0 w-full sm:w-fit cursor-pointer"
                      >
                        <Plus size={14} /> เบิกงบประมาณก้อนย่อย
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {selectedBudgets.length === 0 ? (
                      <p className="text-center py-6 text-slate-400 text-xs bg-slate-50/60 rounded-2xl border border-slate-100">ยังไม่มีรายการคำขอเบิกเงินของกิจกรรมนี้</p>
                    ) : (
                      selectedBudgets.map((req) => (
                        <div key={req.id} className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl text-xs space-y-2.5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h4 className="font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                              <span>{req.title}</span>
                              {req.isExpansion && (
                                <span className="text-[11px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-lg">
                                  ขยายงบประมาณ
                                </span>
                              )}
                            </h4>
                            {getBudgetStatusBadge(req.status)}
                          </div>
                          <p className="text-slate-600 leading-relaxed font-sans">{req.reason}</p>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                            <span className="text-indigo-700 font-bold font-display tabular-nums">ยอดเงินเบิก: ฿{req.amount.toLocaleString()}</span>
                            <span className="text-slate-500">ผู้ยื่น: {users.find(u => u.id === req.requestedBy)?.fullName}</span>
                          </div>

                          {req.documentUrls && req.documentUrls.length > 0 && (
                            <div className="pt-2 mt-1 border-t border-slate-200/60">
                              <span className="block text-[11px] text-slate-500 font-bold mb-1.5 flex items-center gap-1">
                                <FileText size={12} className="text-blue-500" /> เอกสาร/หลักฐานแนบ ({req.documentUrls.length}):
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {req.documentUrls.map((url, uidx) => (
                                  <div 
                                    key={uidx} 
                                    onClick={() => handlePreviewImage(url)}
                                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-blue-400 transition-all w-14 h-14 flex items-center justify-center shrink-0 shadow-xs"
                                    title="คลิกเพื่อขยายดูหลักฐาน"
                                  >
                                    {renderAttachmentThumbnail(url, `หลักฐานที่ ${uidx + 1}`)}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                      <span className="text-[11px] text-white font-bold">เปิดดู</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Approvals for budget release */}
                          {req.status === "pending" && currentUser.role === "treasurer" && (
                            <div className="pt-2.5 border-t border-dashed border-slate-200 flex flex-wrap gap-2">
                              {showRejectInput === `bud_${req.id}` ? (
                                <div className="w-full space-y-2">
                                  <input 
                                    type="text" 
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="ระบุเหตุผลที่ไม่อนุมัติเบิกเงิน" 
                                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button onClick={() => handleApproveBudgetClick(req.id, "reject")} disabled={isReviewingBudget} className="bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                                      {isReviewingBudget ? "กำลังปฏิเสธ..." : "ยืนยันปฏิเสธ"}
                                    </button>
                                    <button onClick={() => setShowRejectInput(null)} disabled={isReviewingBudget} className="bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl cursor-pointer">ยกเลิก</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button onClick={() => handleApproveBudgetClick(req.id, "approve")} disabled={isReviewingBudget} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                                    {isReviewingBudget ? "กำลังดำเนินการ..." : "อนุมัติและโอนเงินเบิก"}
                                  </button>
                                  <button onClick={() => setShowRejectInput(`bud_${req.id}`)} disabled={isReviewingBudget} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">ปฏิเสธคำขอ</button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Propose Budget Expansion Option */}
                          {req.status === "approved" && !req.isExpansion && (
                            <div className="pt-2 border-t border-dashed border-slate-200 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOriginalRequest(req);
                                  setExpansionAmount("");
                                  setExpansionReason("");
                                  setShowExpansionModal(true);
                                }}
                                className="bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer border border-purple-200/80"
                              >
                                💸 ขอขยายงบเพิ่มเติม
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* External Income / Sponsorship section */}
              {(activeSubTab === "all" || activeSubTab === "income") && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">เงินสนับสนุนจากภายนอก / รายรับเพิ่มเติม</h3>
                      <p className="text-xs text-slate-500 font-sans">รายรับสนับสนุนกิจกรรมที่ได้รับเพิ่มระหว่างดำเนินงานเพื่อสมทบเข้ากองทุนกลาง</p>
                    </div>
                    {(selectedActivity.status === "approved" || selectedActivity.status === "in_progress") && (
                      <button 
                        onClick={() => {
                          setExternalIncomeAmount("");
                          setExternalIncomeSource("");
                          setExternalIncomeSlipUrl("");
                          setShowExternalIncomeModal(true);
                        }}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-bold rounded-xl text-xs px-3.5 py-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 w-full sm:w-fit"
                      >
                        <Plus size={14} /> บันทึกยอดเงินสนับสนุน
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {(!selectedActivity.externalIncomes || selectedActivity.externalIncomes.length === 0) ? (
                      <p className="text-center py-6 text-slate-400 text-xs bg-slate-50/60 rounded-2xl border border-slate-100">ยังไม่มีรายการเงินสนับสนุนหรือรายรับเพิ่มเติม</p>
                    ) : (
                      selectedActivity.externalIncomes.map((inc) => (
                        <div key={inc.id} className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl text-xs space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-bold text-slate-900">
                              {inc.source}
                            </h4>
                            <div>
                              {inc.status === "approved" && (
                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">อนุมัติแล้ว</span>
                              )}
                              {inc.status === "rejected" && (
                                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-0.5 rounded-full">ปฏิเสธ</span>
                              )}
                              {inc.status === "pending" && (
                                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full">รอเหรัญญิกอนุมัติ</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-sans text-slate-600">
                            <div>จำนวนเงินสนับสนุน: <strong className="text-emerald-700 tabular-nums">฿{inc.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
                            <div>วันที่บันทึก: <strong className="text-slate-800">{new Date(inc.createdAt).toLocaleDateString("th-TH")}</strong></div>
                          </div>

                          {inc.slipUrl && (
                            <div className="pt-1.5">
                              <span className="text-[11px] text-slate-500 font-bold block mb-1.5 font-sans">สลิป/หลักฐานการรับเงิน:</span>
                              <div 
                                onClick={() => handlePreviewImage(inc.slipUrl!)}
                                className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:border-indigo-500 transition-all shadow-xs flex items-center justify-center bg-white"
                              >
                                {renderAttachmentThumbnail(inc.slipUrl, "slip")}
                              </div>
                            </div>
                          )}

                          {inc.rejectReason && (
                            <p className="text-xs text-rose-700 font-bold bg-rose-50/70 p-2.5 rounded-xl font-sans">
                              ❌ ปฏิเสธเนื่องจาก: {inc.rejectReason}
                            </p>
                          )}

                          {/* Treasurer actions for pending sponsorship */}
                          {inc.status === "pending" && currentUser.role === "treasurer" && (
                            <div className="pt-2.5 border-t border-slate-200/60 space-y-2">
                              {showRejectInput === `ext_inc_${inc.id}` ? (
                                <div className="space-y-2">
                                  <label className="block text-xs text-slate-600 font-bold">ระบุเหตุผลที่ปฏิเสธยอดเงินสนับสนุน</label>
                                  <input 
                                    type="text" 
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="ระบุเหตุผล เช่น ไม่พบยอดเงินเข้าบัญชี หรือรูปสลิปไม่ชัดเจน" 
                                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button onClick={() => handleApproveExternalIncomeClick(inc.id, "reject")} disabled={isReviewingExternalIncome} className="bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                                      {isReviewingExternalIncome ? "กำลังปฏิเสธ..." : "ยืนยันปฏิเสธ"}
                                    </button>
                                    <button onClick={() => setShowRejectInput(null)} disabled={isReviewingExternalIncome} className="bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl cursor-pointer">ยกเลิก</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  <button onClick={() => handleApproveExternalIncomeClick(inc.id, "approve")} disabled={isReviewingExternalIncome} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">
                                    {isReviewingExternalIncome ? "กำลังอนุมัติ..." : "อนุมัติเงินสมทบกองทุนกลาง"}
                                  </button>
                                  <button onClick={() => setShowRejectInput(`ext_inc_${inc.id}`)} disabled={isReviewingExternalIncome} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer">ปฏิเสธ</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Team & Responsible Members section */}
              {(activeSubTab === "all" || activeSubTab === "team") && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">ทีมงานและผู้รับผิดชอบโครงการ</h3>
                    <p className="text-xs text-slate-500">ผู้เสนอโครงการ ผู้เบิกงบประมาณย่อย และผู้ตรวจสอบบัญชี</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                      <span className="text-[11px] text-slate-500 block">ผู้เสนอโครงการ</span>
                      <strong className="text-slate-900 font-bold mt-0.5 block">
                        {users.find(u => u.id === selectedActivity.proposedBy)?.fullName || "คณะกรรมการ"}
                      </strong>
                    </div>
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                      <span className="text-[11px] text-slate-500 block">ผู้อนุมัติ/ตรวจสอบงบ</span>
                      <strong className="text-slate-900 font-bold mt-0.5 block">
                        {users.find(u => u.id === selectedActivity.approvedBy)?.fullName || "เหรัญญิกประจำรุ่น"}
                      </strong>
                    </div>
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                      <span className="text-[11px] text-slate-500 block">ผู้ยื่นเบิกงบย่อย ({selectedBudgets.length} รายการ)</span>
                      <strong className="text-slate-900 font-bold mt-0.5 block line-clamp-1">
                        {selectedBudgets.length > 0
                          ? Array.from(new Set(selectedBudgets.map(b => users.find(u => u.id === b.requestedBy)?.fullName).filter(Boolean))).join(", ") || "ทีมงานโครงการ"
                          : "ยังไม่มีรายการเบิกย่อย"}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200/80">
              ไม่มีข้อมูลโครงการกิจกรรมที่ถูกเลือก
            </div>
          )}
        </div>
      </div>

      {/* Propose Activity Modal */}
      {showProposeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-100 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-800">เสนอโครงการกิจกรรมกองทุนใหม่</h3>
            <form onSubmit={handleProposeSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">ชื่อกิจกรรม/โครงการ</label>
                <input 
                  type="text" 
                  value={actTitle}
                  onChange={(e) => setActTitle(e.target.value)}
                  placeholder="เช่น โครงการค่ายจิตอาสาเทคโนโลยีคอมพิวเตอร์"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">รายละเอียดโครงการ</label>
                <textarea 
                  value={actDesc}
                  onChange={(e) => setActDesc(e.target.value)}
                  placeholder="วัตถุประสงค์ และ กลุ่มเป้าหมายประกอบกิจกรรม..."
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none h-24 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-600">วันที่จัด</label>
                  <input 
                    type="date" 
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-slate-600">งบประมาณโดยสังเขป (บาท)</label>
                  <input 
                    type="number" 
                    value={actBudget}
                    onChange={(e) => setActBudget(e.target.value)}
                    placeholder="เช่น 15000"
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">สถานที่จัดงาน</label>
                <input 
                  type="text" 
                  value={actLoc}
                  onChange={(e) => setActLoc(e.target.value)}
                  placeholder="เช่น มหาวิทยาลัยเทคโนโลยีราชมงคล ตึกคอม"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              {/* Activity Document/Slip uploads */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-600">แนบไฟล์โครงการ / สลิปหรือหลักฐานประกอบ</label>
                <div className="flex flex-wrap gap-2 items-center">
                  <input 
                    type="file" 
                    id="act_file_propose" 
                    multiple
                    accept="image/*"
                    onChange={handleActFileChange}
                    className="hidden" 
                  />
                  <label 
                    htmlFor="act_file_propose"
                    className="cursor-pointer bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition-all"
                  >
                    <Paperclip size={13} className="text-slate-400" /> เลือกไฟล์แนบ
                  </label>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-2">
                  <span className="block text-[11px] font-bold text-slate-500 uppercase">หรือ แนบลิงก์ Google Drive / ลิงก์แนบภายนอก:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      placeholder="ชื่อลิงก์ เช่น สลิปโอนเงิน"
                      value={actLinkName}
                      onChange={(e) => setActLinkName(e.target.value)}
                      className="p-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                    />
                    <input 
                      type="text" 
                      placeholder="วางลิงก์ https://drive.google.com/..."
                      value={actLink}
                      onChange={(e) => setActLink(e.target.value)}
                      className="p-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddActLink}
                    disabled={!actLink}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold p-2 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    ➕ เพิ่มลิงก์แนบ
                  </button>
                </div>
                {actAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {actAttachments.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-xl text-xs">
                        <span className="truncate max-w-[140px] font-mono">{file.name}</span>
                        <button type="button" onClick={() => removeActAttachment(idx)} className="text-rose-500 hover:text-rose-600 font-bold"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setActAttachments([]); setShowProposeModal(false); }} disabled={isCreatingActivity} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-4 py-2.5 rounded-xl">ยกเลิก</button>
                <button type="submit" disabled={isCreatingActivity} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-lg">
                  {isCreatingActivity ? "กำลังส่งคำขอ..." : "เสนอโครงการ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Propose Budget release Modal */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200/80 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-800">ยื่นขอเบิกงบประมาณโครงการย่อย</h3>
            <form onSubmit={handleBudgetSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">รายการขอเบิกเงิน</label>
                <input 
                  type="text" 
                  value={budTitle}
                  onChange={(e) => setBudTitle(e.target.value)}
                  placeholder="เช่น ค่าจัดหาข้าวกล่อง มื้อเย็น"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">ยอดเงินเบิก (บาท)</label>
                <input 
                  type="number" 
                  value={budAmount}
                  onChange={(e) => setBudAmount(e.target.value)}
                  placeholder="เช่น 3500"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none tabular-nums"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">วัตถุประสงค์และหมายเหตุ</label>
                <textarea 
                  value={budReason}
                  onChange={(e) => setBudReason(e.target.value)}
                  placeholder="ชี้แจงความคุ้มค่าและความโปร่งใสประกอบคำขอ..."
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none h-20 resize-none"
                  required
                />
              </div>

              {/* File Attachment section */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-600">แนบหลักฐานการเบิกจ่าย (ใบเสร็จ, ใบเสนอราคา, ภาพถ่าย)</label>
                
                {/* Drag & Drop or Click upload zone */}
                <div 
                  className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50 rounded-2xl p-3.5 text-center cursor-pointer transition-all relative"
                  onClick={() => document.getElementById("budget_file_upload")?.click()}
                >
                  <input 
                    id="budget_file_upload"
                    type="file" 
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">คลิกอัปโหลด หรือลากไฟล์มาวางที่นี่</p>
                    <p className="text-[11px] text-slate-400">รองรับไฟล์รูปภาพและสลิปหลักฐาน</p>
                  </div>
                </div>

                {/* Preconfigured mock evidence options to make testing extremely easy */}
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-500 font-bold">หรือใช้ไฟล์หลักฐานจำลองสำหรับการประเมิน:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {mockReceipts.map((rc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectMockReceipt(rc.name, rc.url)}
                        className="text-[11px] bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 py-1.5 px-2 rounded-xl border border-slate-200 hover:border-blue-200 font-medium truncate transition-all text-center cursor-pointer"
                        title={rc.name}
                      >
                        📎 {rc.name.split('.')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 mt-2 space-y-2">
                  <span className="block text-[11px] font-bold text-slate-500 uppercase">หรือ แนบลิงก์ Google Drive / ลิงก์หลักฐานแนบ:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      placeholder="ชื่อลิงก์ เช่น บิลค่าอุปกรณ์"
                      value={budLinkName}
                      onChange={(e) => setBudLinkName(e.target.value)}
                      className="p-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                    />
                    <input 
                      type="text" 
                      placeholder="วางลิงก์ https://drive.google.com/..."
                      value={budLink}
                      onChange={(e) => setBudLink(e.target.value)}
                      className="p-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBudLink}
                    disabled={!budLink}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold p-2 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    ➕ เพิ่มลิงก์แนบ
                  </button>
                </div>

                {/* Selected Attachments list */}
                {budAttachments.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[11px] text-slate-600 font-bold">ไฟล์ที่แนบแล้ว ({budAttachments.length}):</p>
                    <div className="flex flex-wrap gap-1.5 max-h-[90px] overflow-y-auto p-0.5">
                      {budAttachments.map((file, idx) => (
                        <div key={idx} className="relative group rounded-xl border border-slate-200 bg-white px-2 py-1 flex items-center gap-1.5 max-w-full">
                          {file.url.startsWith("http") ? (
                            <div className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">🔗</div>
                          ) : (
                            <img src={file.url} className="w-5 h-5 rounded object-cover" />
                          )}
                          <span className="text-[11px] text-slate-700 truncate max-w-[110px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="text-rose-500 hover:text-rose-700 font-bold text-xs px-1 hover:bg-rose-50 rounded"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowBudgetModal(false); setBudAttachments([]); }} disabled={isSubmittingBudget} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-4 py-2.5 rounded-xl">ยกเลิก</button>
                <button type="submit" disabled={isSubmittingBudget} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-lg">
                  {isSubmittingBudget ? "กำลังส่งคำขอ..." : "ส่งคำขอเบิก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Budget Expansion Propose Modal */}
      {showExpansionModal && selectedOriginalRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200/80 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-1 border-b border-slate-100">
              <h3 className="text-base font-bold text-purple-800">💸 ขอขยายวงเงินงบประมาณเพิ่มเติม</h3>
              <button 
                type="button" 
                onClick={() => { setShowExpansionModal(false); setSelectedOriginalRequest(null); }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="bg-purple-50/50 border border-purple-200/60 rounded-2xl p-3.5 text-xs text-purple-900 space-y-1">
              <p><strong>ขยายงบของคำขอย่อย:</strong> {selectedOriginalRequest.title}</p>
              <p><strong>งบเดิมที่ได้รับอนุมัติ:</strong> <span className="tabular-nums font-bold">฿{selectedOriginalRequest.amount.toLocaleString()}</span></p>
            </div>

            <form onSubmit={handleProposeExpansionSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">ยอดเงินที่ขอขยายเพิ่ม (บาท)</label>
                <input 
                  type="number" 
                  value={expansionAmount}
                  onChange={(e) => setExpansionAmount(e.target.value)}
                  placeholder="เช่น 1500"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none text-sm font-semibold tabular-nums"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">เหตุผลความจำเป็นในการขยายงบเพิ่ม</label>
                <textarea 
                  value={expansionReason}
                  onChange={(e) => setExpansionReason(e.target.value)}
                  placeholder="เช่น ราคาสินค้าปรับตัวขึ้น, หรือต้องการจัดซื้อเพิ่มเติมหน้างาน..."
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none h-24 resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => { setShowExpansionModal(false); setSelectedOriginalRequest(null); }} 
                  disabled={isSubmittingExpansion} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingExpansion || !expansionAmount} 
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-500/10 transition-all cursor-pointer"
                >
                  {isSubmittingExpansion ? "กำลังส่งคำขอ..." : "ส่งคำขอขยายงบ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Activity & Refund Modal */}
      {showSettleModal && selectedActivity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200/80 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1">
                📝 สรุปรายงานใช้จ่าย & คืนเงินทอน
              </h3>
              <button 
                onClick={() => { setShowSettleModal(false); setSettleRefundSlip(null); setSettleReceipts([]); }}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ×
              </button>
            </div>
            
            {(() => {
              const approvedBudgets = budgetRequests.filter(r => r.activityId === selectedActivity.id && r.status === "approved");
              const totalBudgetApproved = approvedBudgets.reduce((sum, r) => sum + r.amount, 0);
              const approvedExternalIncomes = selectedActivity.externalIncomes ? selectedActivity.externalIncomes.filter((i: any) => i.status === "approved") : [];
              const totalExternalIncome = approvedExternalIncomes.reduce((sum: number, i: any) => sum + i.amount, 0);
              const totalProjectFunds = totalBudgetApproved + totalExternalIncome;
              const actual = Number(settleActualExpense || 0);
              const refund = Math.max(0, totalProjectFunds - actual);

              return (
                <form onSubmit={handleSettleSubmit} className="space-y-4 text-xs font-sans">
                  {settleError && (
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl font-bold border border-rose-100">
                      ⚠️ {settleError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60">
                      <span className="block text-[11px] text-slate-500">งบประมาณเบิก</span>
                      <strong className="text-slate-900 text-xs tabular-nums">฿{totalBudgetApproved.toLocaleString()}</strong>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/60">
                      <span className="block text-[11px] text-emerald-700 font-bold">เงินสนับสนุน</span>
                      <strong className="text-emerald-800 text-xs tabular-nums">฿{totalExternalIncome.toLocaleString()}</strong>
                    </div>
                    <div className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-200/60">
                      <span className="block text-[11px] text-indigo-700 font-bold font-sans">รวมทอนคืนทั้งหมด</span>
                      <strong className="text-indigo-800 text-xs tabular-nums">฿{refund.toLocaleString()}</strong>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-600 font-sans">ยอดใช้จ่ายจริงทั้งหมด (บาท)</label>
                    <input 
                      type="number"
                      min={0}
                      value={settleActualExpense}
                      onChange={(e) => setSettleActualExpense(e.target.value)}
                      placeholder="กรอกยอดเงินใช้จ่ายตามใบเสร็จจริง"
                      className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 font-mono text-xs tabular-nums"
                      required
                    />
                  </div>

                  {/* If there is a refund, require the refund slip upload */}
                  {refund > 0 && (
                    <div className="space-y-2 p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/80">
                      <span className="block font-bold text-amber-800 font-sans tabular-nums">
                        💰 ยอดเงินทอน ฿{refund.toLocaleString()} (กรุณาโอนเงินคืน PromptPay กองทุน)
                      </span>
                      <p className="text-xs text-amber-800 font-sans">
                        โอนคืนบัญชี: <strong className="tabular-nums">{settings.promptpayNumber}</strong> ({settings.promptpayName})
                      </p>
                      
                      <div className="space-y-1.5 mt-2">
                        <label className="block font-bold text-slate-700 font-sans">อัปโหลดสลิปโอนคืนเงินทอน</label>
                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-3 text-center bg-white hover:bg-slate-50 cursor-pointer relative transition-all">
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleSettleRefundSlipChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          {settleRefundSlip ? (
                            <div className="flex items-center gap-1.5 justify-center">
                              {settleRefundSlip.url.startsWith("http") ? (
                                <div className="text-xs">🔗</div>
                              ) : (
                                <img src={settleRefundSlip.url} className="w-6 h-6 object-cover rounded" />
                              )}
                              <span className="text-xs font-bold text-emerald-600 truncate max-w-[160px]">{settleRefundSlip.name}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-slate-500">คลิกเพื่ออัปโหลดสลิปเงินทอน</p>
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 space-y-2 mt-2">
                          <span className="block text-[11px] font-bold text-slate-500 uppercase">หรือ วางลิงก์สลิปโอนเงินคืน (เช่น ลิงก์ Google Drive):</span>
                          <input 
                            type="text" 
                            placeholder="วางลิงก์ https://drive.google.com/..."
                            value={settleRefundLink}
                            onChange={(e) => handleRefundLinkChange(e.target.value)}
                            className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Upload receipts files */}
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-600 font-sans">ใบเสร็จ/หลักฐานการจ่ายจริงของโครงการ (แนบกี่รูปก็ได้)</label>
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:bg-slate-50 cursor-pointer relative transition-all">
                      <input 
                        type="file" 
                        accept="image/*"
                        multiple
                        onChange={handleSettleReceiptsChange}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-600">คลิกเพื่ออัปโหลดรูปใบเสร็จทั้งหมด</p>
                        <p className="text-[11px] text-slate-400">ภาพบิล บัญชีรายการสิ่งของ หรือใบเสร็จร้านค้า</p>
                      </div>
                    </div>

                    {/* Preconfigured mock receipts options inside Settle Modal for easy evaluation */}
                    <div className="space-y-1.5 mt-2">
                      <p className="text-[11px] text-slate-500 font-bold font-sans">หรือเลือกภาพใบเสร็จจำลองสำหรับทดสอบ:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        {mockReceipts.map((rc, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSettleReceipts(prev => {
                                if (prev.some(a => a.name === rc.name)) return prev;
                                return [...prev, { name: rc.name, url: rc.url }];
                              });
                            }}
                            className="text-[11px] bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 py-1.5 px-2 rounded-xl border border-slate-200 hover:border-indigo-200 font-medium truncate transition-all text-center cursor-pointer"
                            title={rc.name}
                          >
                            📎 {rc.name.split('.')[0]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 mt-2 space-y-2">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase">หรือ แนบลิงก์ Google Drive / ลิงก์ใบเสร็จใช้จ่าย:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input 
                          type="text" 
                          placeholder="ชื่อลิงก์ เช่น บิลค่าพิมพ์งาน"
                          value={settleReceiptLinkName}
                          onChange={(e) => setSettleReceiptLinkName(e.target.value)}
                          className="p-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                        />
                        <input 
                          type="text" 
                          placeholder="วางลิงก์ https://drive.google.com/..."
                          value={settleReceiptLink}
                          onChange={(e) => setSettleReceiptLink(e.target.value)}
                          className="p-2.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSettleReceiptLink}
                        disabled={!settleReceiptLink}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold p-2 rounded-xl text-xs transition-all cursor-pointer"
                      >
                        ➕ เพิ่มลิงก์ใบเสร็จ
                      </button>
                    </div>

                    {/* Render uploaded receipts list inside Settle Modal */}
                    {settleReceipts.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <p className="text-[11px] text-slate-600 font-bold">ใบเสร็จที่แนบแล้ว ({settleReceipts.length}):</p>
                        <div className="flex flex-wrap gap-1.5 max-h-[90px] overflow-y-auto p-0.5">
                          {settleReceipts.map((file, idx) => (
                            <div key={idx} className="relative group rounded-xl border border-slate-200 bg-white px-2 py-1 flex items-center gap-1.5 max-w-full">
                              {file.url.startsWith("http") ? (
                                <div className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">🔗</div>
                              ) : (
                                <img src={file.url} className="w-5 h-5 rounded object-cover" />
                              )}
                              <span className="text-[11px] text-slate-700 truncate max-w-[110px]">{file.name}</span>
                              <button
                                type="button"
                                onClick={() => setSettleReceipts(prev => prev.filter((_, i) => i !== idx))}
                                className="text-rose-500 hover:text-rose-700 font-bold text-xs px-1 hover:bg-rose-50 rounded"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={() => { setShowSettleModal(false); setSettleRefundSlip(null); setSettleReceipts([]); }} 
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl font-sans"
                    >
                      ยกเลิก
                    </button>
                    <button 
                      type="submit" 
                      disabled={isSettling}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1 font-sans"
                    >
                      {isSettling ? "กำลังส่ง..." : "ส่งสรุปโครงการ 🚀"}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* Image Lightbox Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => { setPreviewImage(null); setPreviewOriginalUrl(null); }}>
          <div className="bg-white rounded-3xl p-4 max-w-lg w-full border border-slate-100 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => { setPreviewImage(null); setPreviewOriginalUrl(null); }}
              className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-700 w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all shadow-md animate-hover"
            >
              ×
            </button>
            <h3 className="text-sm font-bold text-slate-800 mb-3">ตรวจสอบเอกสารหลักฐาน</h3>
            <div className="bg-slate-50 p-2 rounded-2xl flex flex-col justify-center items-center overflow-hidden max-h-[75vh] w-full">
              {previewImage ? (
                <img 
                  src={previewImage} 
                  alt="Document Evidence Preview" 
                  className="max-w-full max-h-[55vh] object-contain rounded-xl shadow-xs" 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const fallbackMsg = document.getElementById("act-preview-fallback-msg");
                    if (fallbackMsg) fallbackMsg.style.display = "block";
                  }}
                />
              ) : null}
              <div id="act-preview-fallback-msg" className="hidden py-8 text-center text-xs text-slate-500">
                <p className="font-semibold text-slate-700 mb-1">ไม่สามารถแสดงพรีวิวรูปภาพโดยตรงได้</p>
                <p>กรุณากดปุ่มด้านล่างเพื่อเปิดไฟล์หลักฐานบน Google Drive</p>
              </div>
              {previewOriginalUrl && (
                <div className="mt-3 text-center w-full bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/50">
                  <span className="text-xs text-slate-500 block mb-1.5">ต้องการเปิดดูหรือดาวน์โหลดไฟล์หลักฐานโดยตรง?</span>
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
            <div className="mt-4 flex justify-end">
              <button onClick={() => { setPreviewImage(null); setPreviewOriginalUrl(null); }} className="bg-slate-700 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-md">
                ปิดหน้าต่างตรวจสอบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Activity Confirmation Modal */}
      {activityToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">ยืนยันการลบโครงการ/กิจกรรม?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                โครงการและข้อมูลคำขอเบิกงบประมาณย่อยทั้งหมดในโครงการนี้จะถูกลบและไม่สามารถกู้คืนได้
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={isDeletingActivity}
                onClick={async () => {
                  const targetId = activityToDelete;
                  setActivityToDelete(null);
                  try {
                    setIsDeletingActivity(true);
                    await onDeleteActivity(targetId);
                    const remainingActivities = activities.filter(a => a.id !== targetId);
                    setSelectedActivity(remainingActivities[0] || null);
                  } catch (err: any) {
                    alert(err.message || "เกิดข้อผิดพลาดในการลบโครงการกิจกรรม");
                  } finally {
                    setIsDeletingActivity(false);
                  }
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all animate-none"
              >
                {isDeletingActivity ? "กำลังลบ..." : "ยืนยันการลบ"}
              </button>
              <button
                onClick={() => setActivityToDelete(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-all"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Edit Activity Modal */}
      {activityToEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-100 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 font-display">
                <Edit size={18} className="text-blue-500" />
                <span>แก้ไขรายละเอียดโครงการ / กิจกรรม</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setActivityToEdit(null)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs text-left">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">ชื่อโครงการ / กิจกรรม</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  placeholder="เช่น ไหว้ครู, กีฬาสี, ปีใหม่"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">รายละเอียดโครงการ</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white min-h-[80px]"
                  placeholder="ระบุจุดประสงค์ แผนงาน หรือรายละเอียดอื่น ๆ"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">วันที่จัดกิจกรรม</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">สถานที่จัดงาน</label>
                  <input
                    type="text"
                    value={editLoc}
                    onChange={(e) => setEditLoc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                    placeholder="ระบุสถานที่จัดงาน เช่น ห้องเรียน, โรงยิม"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">งบประมาณเสนอขอ (฿)</label>
                  <input
                    type="number"
                    value={editBudgetEstimated}
                    onChange={(e) => setEditBudgetEstimated(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                    placeholder="0"
                  />
                </div>
                
                {canProposeActivity && (
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">งบประมาณที่อนุมัติ (฿)</label>
                    <input
                      type="number"
                      value={editBudgetApproved}
                      onChange={(e) => setEditBudgetApproved(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              {canProposeActivity && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">ยอดใช้จ่ายจริง (฿)</label>
                    <input
                      type="number"
                      value={editActualExpense}
                      onChange={(e) => setEditActualExpense(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">เงินทอนคืนระบบ (฿)</label>
                    <input
                      type="number"
                      value={editRefundAmount}
                      onChange={(e) => setEditRefundAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-700">สถานะของโครงการ</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  <option value="proposed">เสนอโครงการ (รออนุมัติ)</option>
                  <option value="approved">อนุมัติแล้ว / ตั้งหลักฐานเบิกจ่าย</option>
                  <option value="in_progress">กำลังดำเนินงาน / ยื่นเบิกเงินย่อย</option>
                  <option value="pending_settlement">ยื่นขอปิดบัญชี (รอตรวจสอบ)</option>
                  <option value="completed">เสร็จสิ้นและปิดบัญชีแล้ว</option>
                  <option value="rejected">ถูกปฏิเสธโครงการ</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEdit}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
              >
                {isSavingEdit ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
              <button
                type="button"
                onClick={() => setActivityToEdit(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record External Income / Sponsorship Modal */}
      {showExternalIncomeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-100 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 font-display">
                <span>📥 บันทึกยอดเงินสนับสนุน / รายรับเพิ่มเติม</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setShowExternalIncomeModal(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExternalIncomeSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-600 font-sans">ยอดเงินสนับสนุนที่ได้รับ (บาท)</label>
                <input 
                  type="number"
                  required
                  min="1"
                  placeholder="ตัวอย่างเช่น 1000"
                  value={externalIncomeAmount}
                  onChange={(e) => setExternalIncomeAmount(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none text-sm font-semibold font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-600 font-sans">แหล่งที่มา / รายละเอียดของรายรับ</label>
                <textarea 
                  required
                  rows={2}
                  placeholder="ตัวอย่าง: อาจารย์ประสงค์ มอบทุนสนับสนุนการจัดกิจกรรม หรือ รายรับจากการจำหน่ายบัตรเข้าชม..."
                  value={externalIncomeSource}
                  onChange={(e) => setExternalIncomeSource(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-600 font-sans">อัปโหลดสลิป/หลักฐานรับเงิน (ถ้ามี)</label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-3 text-center bg-white hover:bg-slate-50 cursor-pointer relative transition-all">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleExternalIncomeFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {externalIncomeSlipUrl ? (
                    <div className="flex items-center gap-1.5 justify-center">
                      <img src={externalIncomeSlipUrl} className="w-6 h-6 object-cover rounded" />
                      <span className="text-xs font-bold text-emerald-600 truncate max-w-[160px]">สลิปอัปโหลดแล้ว.png</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-500 font-sans">คลิกเพื่ออัปโหลดรูปภาพหลักฐาน</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Preconfigured mock slips for easy evaluation */}
              <div className="space-y-1.5 mt-2">
                <p className="text-[11px] text-slate-500 font-bold font-sans">หรือเลือกรูปสลิปจำลองสำหรับทดสอบ:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {mockReceipts.map((rc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setExternalIncomeSlipUrl(rc.url)}
                      className="text-[11px] bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 py-1.5 px-2 rounded-xl border border-slate-200 hover:border-emerald-200 font-medium truncate transition-all text-center cursor-pointer"
                      title={rc.name}
                    >
                      📎 สลิปจำลอง {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowExternalIncomeModal(false)}
                  disabled={isSubmittingExternalIncome}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer font-sans"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingExternalIncome || !externalIncomeAmount || !externalIncomeSource}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/10 transition-all cursor-pointer font-sans"
                >
                  {isSubmittingExternalIncome ? "กำลังบันทึก..." : "ส่งรายงานเงินสนับสนุน"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
