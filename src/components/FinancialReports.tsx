/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  FileText, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles,
  Award,
  DollarSign,
  PieChart,
  List,
  Download
} from "lucide-react";
import { Transaction, User, MonthlyBill, SystemSettings } from "../types";
import BudgetCharts from "./BudgetCharts";
 
interface FinancialReportsProps {
  transactions: Transaction[];
  users: User[];
  setTab: (tab: string) => void;
  monthlyBills?: MonthlyBill[];
  settings?: SystemSettings;
}
 
export default function FinancialReports({
  transactions,
  users,
  setTab,
  monthlyBills = [],
  settings
}: FinancialReportsProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"charts" | "ledger">("charts");

  const totalBalance = transactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0) - 3802;
  const totalFees = transactions.filter(tx => tx.category === "monthly_fee").reduce((sum, tx) => sum + tx.amount, 0);
  const totalMarkets = transactions.filter(tx => tx.category === "market_profit").reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpenses = transactions.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || tx.category === categoryFilter;
    const matchesType = typeFilter === "all" || tx.type === typeFilter;
    return matchesSearch && matchesCategory && matchesType;
  });

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "monthly_fee":
        return "ค่าบำรุงกองทุน";
      case "market_profit":
        return "กำไรตลาดวันพุธ";
      case "activity_expense":
        return "งบกิจกรรม";
      case "other_income":
        return "รายรับอื่น";
      case "other_expense":
        return "รายจ่ายอื่น";
      default:
        return category;
    }
  };

  const getMonthThaiName = (m: number) => {
    const names = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    return names[m - 1] || `${m}`;
  };

  const handleExportTransactionsCSV = () => {
    const headers = [
      "วันที่ทำรายการ",
      "ประเภทบัญชี",
      "หมวดหมู่",
      "คำอธิบายรายการ",
      "ผู้บันทึกรายการ",
      "จำนวนเงิน (บาท)"
    ];

    const rows = filteredTransactions.map(tx => {
      const dateStr = new Date(tx.createdAt).toLocaleDateString("th-TH");
      const typeStr = tx.type === "income" ? "รายรับ" : "รายจ่าย";
      const catStr = getCategoryLabel(tx.category);
      const descStr = tx.description.replace(/"/g, '""');
      const creatorStr = users.find(u => u.id === tx.createdBy)?.fullName || "ระบบ";
      const amountStr = tx.amount.toFixed(2);
      
      return [
        `"${dateStr}"`,
        `"${typeStr}"`,
        `"${catStr}"`,
        `"${descStr}"`,
        `"${creatorStr}"`,
        amountStr
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานรายรับรายจ่าย_${new Date().toLocaleDateString("th-TH").replace(/\//g, "-")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPaymentsCSV = () => {
    if (!monthlyBills || monthlyBills.length === 0) return;

    const sortedCycles = [...monthlyBills].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    const latest = sortedCycles[0];
    if (!latest) return;

    const latestMonth = latest.month;
    const latestYear = latest.year;

    const currentBills = monthlyBills.filter(b => b.month === latestMonth && b.year === latestYear);

    const headers = [
      "รหัสนักศึกษา",
      "ชื่อ-นามสกุล",
      "ชื่อเล่น",
      "เบอร์โทรศัพท์",
      "รอบบิลประจำเดือน",
      "จำนวนเงิน (บาท)",
      "สถานะการจ่ายเงิน",
      "วันที่ชำระเงิน"
    ];

    const rows = users.map(user => {
      const bill = currentBills.find(b => b.userId === user.id);
      let statusStr = "ยังไม่ชำระเงิน";
      let paidDateStr = "-";
      if (bill) {
        if (bill.status === "paid") {
          statusStr = "ชำระเงินเรียบร้อยแล้ว";
          paidDateStr = bill.paidAt ? new Date(bill.paidAt).toLocaleDateString("th-TH") : "-";
        } else if (bill.status === "pending_review") {
          statusStr = "รอเหรัญญิกตรวจสอบสลิป";
        }
      }

      return [
        `"${user.studentId || ""}"`,
        `"${user.fullName || ""}"`,
        `"${user.nickname || ""}"`,
        `"${user.phone || ""}"`,
        `"${getMonthThaiName(latestMonth)} ${latestYear}"`,
        bill ? bill.amount.toString() : "0",
        `"${statusStr}"`,
        `"${paidDateStr}"`
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานสถานะการชำระเงิน_รอบเดือน_${getMonthThaiName(latestMonth)}_${latestYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    const sortedBills = [...(monthlyBills || [])].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    const latestCycle = sortedBills[0];
    const latestMonthName = latestCycle ? getMonthThaiName(latestCycle.month) : "";
    const latestYearNum = latestCycle ? latestCycle.year : "";

    const currentBills = latestCycle 
      ? monthlyBills.filter((b: any) => b.month === latestCycle.month && b.year === latestCycle.year)
      : [];

    const paidUsers = currentBills
      .filter((b: any) => b.status === "paid")
      .map((b: any) => users.find(u => u.id === b.userId))
      .filter(Boolean);

    const pendingUsers = currentBills
      .filter((b: any) => b.status === "pending_review")
      .map((b: any) => users.find(u => u.id === b.userId))
      .filter(Boolean);

    const unpaidUsers = users.filter(u => {
      const b = currentBills.find(bill => bill.userId === u.id);
      return !b || b.status === "pending";
    });

    const room1Paid = paidUsers.filter((u: any) => u.classroom === "ห้อง 1").length;
    const room1Total = users.filter((u: any) => u.classroom === "ห้อง 1").length;
    const room2Paid = paidUsers.filter((u: any) => u.classroom === "ห้อง 2").length;
    const room2Total = users.filter((u: any) => u.classroom === "ห้อง 2").length;

    const fundName = settings?.fundName || "เงินเก็บรุ่น กองทุนนักศึกษา";

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("กรุณาอนุญาตให้เปิดหน้าต่างป็อปอัปเพื่อแสดงรายงานพิมพ์ PDF");
      return;
    }

    const docRef = `FIN-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const reportHtml = `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <base href="${window.location.origin}/">
        <title>รายงานสรุปการเงิน - ${fundName}</title>
        <meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #0f172a;
            padding: 0;
            margin: 0;
            line-height: 1.5;
            background: #ffffff;
            font-size: 13px;
          }
          
          /* Watermark background */
          .watermark {
            position: fixed;
            top: 45%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 70px;
            font-weight: 800;
            color: rgba(79, 70, 229, 0.03);
            pointer-events: none;
            z-index: 0;
            white-space: nowrap;
            letter-spacing: 4px;
          }

          .container {
            position: relative;
            z-index: 1;
          }

          .action-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8fafc;
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            margin-bottom: 24px;
          }
          .doc-tag {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            font-family: monospace;
            background: #e2e8f0;
            padding: 4px 8px;
            border-radius: 6px;
          }

          .btn-print {
            background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
            color: white;
            border: none;
            padding: 10px 22px;
            font-size: 13px;
            font-weight: 700;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
          }
          .btn-print:hover {
            opacity: 0.95;
            transform: translateY(-1px);
          }

          /* Header Section */
          .header-card {
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: white;
            border-radius: 16px;
            padding: 24px 28px;
            margin-bottom: 24px;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.2);
            position: relative;
            overflow: hidden;
          }
          .header-card::after {
            content: "";
            position: absolute;
            right: -40px;
            bottom: -40px;
            width: 180px;
            height: 180px;
            background: rgba(99, 102, 241, 0.15);
            border-radius: 50%;
            pointer-events: none;
          }
          .header-card h1 {
            margin: 0 0 6px 0;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.5px;
          }
          .header-card p {
            margin: 0;
            font-size: 13px;
            color: #cbd5e1;
          }
          .header-meta {
            display: flex;
            gap: 20px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid rgba(255,255,255,0.12);
            font-size: 11px;
            color: #94a3b8;
          }

          /* Stats Grid */
          .stats-grid {
            display: grid;
            grid-template-cols: repeat(4, 1fr);
            gap: 14px;
            margin-bottom: 24px;
          }
          .stat-card {
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 16px;
            background: #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.03);
            position: relative;
          }
          .stat-card .label {
            font-size: 11px;
            color: #64748b;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            display: block;
          }
          .stat-card .value {
            font-size: 19px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.2;
          }
          .stat-card.blue { border-left: 4px solid #3b82f6; }
          .stat-card.emerald { border-left: 4px solid #10b981; }
          .stat-card.purple { border-left: 4px solid #8b5cf6; }
          .stat-card.rose { border-left: 4px solid #f43f5e; }

          /* Section Titles */
          .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 28px 0 14px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #f1f5f9;
          }
          .section-title {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .section-badge {
            font-size: 11px;
            font-weight: 600;
            padding: 3px 10px;
            border-radius: 20px;
            background: #f1f5f9;
            color: #475569;
          }

          /* Tables */
          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 12px;
            margin-bottom: 20px;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
          }
          th {
            background-color: #f8fafc;
            color: #475569;
            font-weight: 700;
            text-align: left;
            padding: 10px 14px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          td {
            padding: 10px 14px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
          }
          tr:last-child td {
            border-bottom: none;
          }
          tr:nth-child(even) {
            background-color: #fafafa;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }

          /* Badges */
          .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
          }
          .badge-paid { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
          .badge-pending { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
          .badge-unpaid { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

          .grid-2 {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 20px;
          }

          /* Classroom Summary Box */
          .class-summary {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
          }
          .class-box {
            flex: 1;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          /* Signatures block */
          .signatures {
            margin-top: 45px;
            display: grid;
            grid-template-cols: 1fr 1fr 1fr;
            gap: 24px;
            page-break-inside: avoid;
          }
          .sig-box {
            text-align: center;
            border: 1px dashed #cbd5e1;
            border-radius: 12px;
            padding: 20px 14px 14px 14px;
            background: #fafafa;
          }
          .sig-line {
            border-bottom: 1px solid #94a3b8;
            margin: 35px 20px 10px 20px;
          }
          .sig-title {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
          }
          .sig-sub {
            font-size: 10px;
            color: #94a3b8;
            margin-top: 2px;
          }

          /* Footer */
          .footer {
            margin-top: 35px;
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
            font-size: 10px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          @media print {
            body { padding: 0; background: white; }
            .action-bar { display: none; }
            .watermark { display: block; }
            .header-card { box-shadow: none; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <div class="watermark">CONFIDENTIAL • ${fundName}</div>
        
        <div class="container">
          <div class="action-bar">
            <span class="doc-tag">DOCUMENT REF: ${docRef}</span>
            <button class="btn-print" onclick="window.print()">
              🖨️ พิมพ์เอกสารรายงาน (Save as PDF)
            </button>
          </div>
          
          <div class="header-card">
            <h1>📑 รายงานสรุปด่านการเงินและรายการค้างชำระ</h1>
            <p>ระบบกองทุนนักศึกษาแบบรายเดือน | ${fundName}</p>
            <div class="header-meta">
              <span>🏫 สถาบัน / ห้องเรียน: รวมทุกห้อง</span>
              <span>📅 วันที่พิมพ์รายงาน: ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</span>
              <span>⏰ เวลา: ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</span>
            </div>
          </div>

          <!-- Executive Summary Stats -->
          <div class="stats-grid">
            <div class="stat-card blue">
              <span class="label">ยอดเงินคงเหลือคงคลัง</span>
              <div class="value" style="color: #1e40af;">฿${totalBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="stat-card emerald">
              <span class="label">รายรับค่าบำรุงรวม</span>
              <div class="value" style="color: #047857;">฿${totalFees.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="stat-card purple">
              <span class="label">กำไรตลาดวันพุธรวม</span>
              <div class="value" style="color: #6d28d9;">฿${totalMarkets.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="stat-card rose">
              <span class="label">รายจ่ายกิจกรรมทั้งหมด</span>
              <div class="value" style="color: #be123c;">฿${totalExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          ${latestCycle ? `
          <div class="section-header">
            <div class="section-title">
              📌 สรุปสถานะบิลค่าบำรุงรายเดือน (รอบล่าสุด: ${latestMonthName} ${latestYearNum})
            </div>
            <div class="section-badge">
              ค่าบำรุง ฿${(settings?.monthlyFee || 0).toLocaleString()}.- / คน / เดือน
            </div>
          </div>

          <!-- Classroom breakdown -->
          <div class="class-summary">
            <div class="class-box">
              <span style="font-weight: 700; color: #334155;">🎓 ห้อง 1:</span>
              <span style="font-weight: 800; color: #047857;">จ่ายแล้ว ${room1Paid} / ${room1Total} คน (${room1Total > 0 ? Math.round((room1Paid/room1Total)*100) : 0}%)</span>
            </div>
            <div class="class-box">
              <span style="font-weight: 700; color: #334155;">🎓 ห้อง 2:</span>
              <span style="font-weight: 800; color: #047857;">จ่ายแล้ว ${room2Paid} / ${room2Total} คน (${room2Total > 0 ? Math.round((room2Paid/room2Total)*100) : 0}%)</span>
            </div>
            <div class="class-box" style="background: #eff6ff; border-color: #bfdbfe;">
              <span style="font-weight: 700; color: #1e40af;">👥 ภาพรวมทั้งสิ้น:</span>
              <span style="font-weight: 800; color: #1d4ed8;">จ่ายแล้ว ${paidUsers.length} คน | ค้างชำระ ${unpaidUsers.length} คน</span>
            </div>
          </div>
          
          <div class="grid-2">
            <div>
              <h4 style="font-size: 12px; margin: 0 0 8px 0; color: #047857; font-weight: 700;">
                ✅ รายชื่อผู้ที่จ่ายแล้ว (${paidUsers.length} คน)
              </h4>
              <table>
                <thead>
                  <tr>
                    <th>รหัสนักศึกษา</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>ห้อง</th>
                  </tr>
                </thead>
                <tbody>
                  ${paidUsers.length === 0 ? '<tr><td colspan="3" class="text-center" style="color: #94a3b8;">ยังไม่มีรายการ</td></tr>' : 
                    paidUsers.map((u: any) => `
                      <tr>
                        <td style="font-family: monospace; font-weight: 600;">${u.studentId || "-"}</td>
                        <td><strong>${u.fullName}</strong> ${u.nickname ? `(${u.nickname})` : ''}</td>
                        <td><span class="badge badge-paid">${u.classroom || "ไม่ระบุ"}</span></td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>

            <div>
              <h4 style="font-size: 12px; margin: 0 0 8px 0; color: #b91c1c; font-weight: 700;">
                ❌ รายชื่อผู้ที่ยังไม่จ่าย (${unpaidUsers.length} คน)
              </h4>
              <table>
                <thead>
                  <tr>
                    <th>รหัสนักศึกษา</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>ห้อง</th>
                  </tr>
                </thead>
                <tbody>
                  ${unpaidUsers.length === 0 ? '<tr><td colspan="3" class="text-center" style="color: #047857; font-weight: 700;">สมาชิกชำระครบทุกคนแล้ว! 🎉</td></tr>' : 
                    unpaidUsers.map((u: any) => `
                      <tr>
                        <td style="font-family: monospace; font-weight: 600;">${u.studentId || "-"}</td>
                        <td><strong>${u.fullName}</strong> ${u.nickname ? `(${u.nickname})` : ''}</td>
                        <td><span class="badge badge-unpaid">${u.classroom || "ไม่ระบุ"}</span></td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
          ` : ''}

          <!-- Transactions Table -->
          <div class="section-header">
            <div class="section-title">
              📋 บัญชีเงินสดและรายการเดินบัญชีแยกประเภท (Transactions Ledger)
            </div>
            <div class="section-badge">
              รวม ${transactions.length} รายการ
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 15%;">วันที่</th>
                <th style="width: 12%;">ประเภท</th>
                <th style="width: 18%;">หมวดหมู่</th>
                <th>คำอธิบายรายการ</th>
                <th class="text-right" style="width: 18%;">จำนวนเงิน (บาท)</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.length === 0 ? '<tr><td colspan="5" class="text-center" style="color: #94a3b8;">ไม่มีประวัติการทำธุรกรรม</td></tr>' : 
                transactions.map((tx: any) => `
                  <tr>
                    <td style="font-size: 11px; color: #64748b;">${new Date(tx.createdAt).toLocaleDateString("th-TH")}</td>
                    <td>
                      <span class="badge ${tx.type === 'income' ? 'badge-paid' : 'badge-unpaid'}">
                        ${tx.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </span>
                    </td>
                    <td style="font-weight: 600;">${getCategoryLabel(tx.category)}</td>
                    <td>${tx.description}</td>
                    <td class="text-right" style="font-weight: 800; font-family: monospace; font-size: 13px; color: ${tx.type === 'income' ? '#047857' : '#b91c1c'}">
                      ${tx.type === 'income' ? '+' : '-'}฿${tx.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>

          <!-- Signatures Block for Official Audit -->
          <div class="signatures">
            <div class="sig-box">
              <div class="sig-title">ผู้รับเงิน / ผู้บันทึกบัญชี</div>
              <div class="sig-line"></div>
              <div class="sig-sub">( .................................................... )</div>
              <div class="sig-sub" style="margin-top: 4px;">เหรัญญิกประจำกองทุน</div>
            </div>
            <div class="sig-box">
              <div class="sig-title">พยานตรวจสอบ</div>
              <div class="sig-line"></div>
              <div class="sig-sub">( .................................................... )</div>
              <div class="sig-sub" style="margin-top: 4px;">ตำแหน่ง: ....................................................</div>
            </div>
            <div class="sig-box">
              <div class="sig-title">อาจารย์ที่ปรึกษา / รับทราบ</div>
              <div class="sig-line"></div>
              <div class="sig-sub">( .................................................... )</div>
              <div class="sig-sub" style="margin-top: 4px;">อาจารย์ประจำชั้น</div>
            </div>
          </div>

          <div class="footer">
            <span>เอกสารนี้จัดทำขึ้นโดยระบบบริหารจัดการกองทุนและห้องเรียนอัจฉริยะ (Smart Student Fund System)</span>
            <span>Ref: ${docRef} | Page 1 of 1</span>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(reportHtml);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-1.5">
          <span className="text-xs font-bold text-slate-500 block">เงินสำรองกองทุนขณะนี้</span>
          <h3 className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
            ฿{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> พร้อมใช้งานและตรวจสอบได้
          </p>
        </div>
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-1.5">
          <span className="text-xs font-bold text-slate-500 block">รายรับค่าบำรุงรวม</span>
          <h3 className="text-2xl font-extrabold text-blue-600 font-mono tabular-nums">
            ฿{totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-slate-500 font-medium">จากระบบเก็บเงิน {users.length} สมาชิก</p>
        </div>
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-1.5">
          <span className="text-xs font-bold text-slate-500 block">รายรับกำไรตลาดรวม</span>
          <h3 className="text-2xl font-extrabold text-emerald-600 font-mono tabular-nums">
            ฿{totalMarkets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-emerald-600 font-semibold">สมทบทุนจากตลาดวันพุธ</p>
        </div>
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-1.5">
          <span className="text-xs font-bold text-slate-500 block">รายจ่ายเพื่อกิจกรรมทั้งหมด</span>
          <h3 className="text-2xl font-extrabold text-rose-600 font-mono tabular-nums">
            ฿{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-xs text-slate-500 font-medium">กีฬาเฟรชชี่, อุปกรณ์และสวัสดิการรุ่น</p>
        </div>
      </div>

      {/* Control filters & AI assistance call-to-action */}
      <div className="bg-gradient-to-r from-indigo-50/90 via-blue-50/60 to-white border border-indigo-200/70 rounded-3xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-sm shadow-indigo-600/20 shrink-0">
            <Sparkles size={20} />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-sm sm:text-base font-extrabold text-slate-900">ต้องการตรวจสอบยอดการเงินกองทุนเชิงรุกหรือไม่?</h4>
            <p className="text-xs sm:text-sm text-slate-600">
              ให้ผู้ช่วย AI ตรวจสอบความถูกต้องและร่างคำอธิบายงบประมาณแบบละเอียดส่งเข้ากลุ่มห้องเรียนได้ทันที
            </p>
          </div>
        </div>
        <button 
          onClick={() => setTab("ai_chat")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs sm:text-sm px-5 py-3 flex items-center gap-2 shadow-md shadow-indigo-600/15 shrink-0 w-full md:w-auto justify-center transition-all cursor-pointer"
        >
          <Sparkles size={16} />
          วิเคราะห์บัญชีด้วย AI
        </button>
      </div>

      {/* Tab Switcher for Reports Panel & Export Options */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="bg-slate-100 p-1.5 rounded-2xl flex w-full lg:w-fit gap-1.5 text-xs sm:text-sm font-bold">
          <button
            onClick={() => setViewMode("charts")}
            className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
              viewMode === "charts"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <PieChart size={16} className="text-blue-600" /> วิเคราะห์แผนภูมิและงบประมาณ
          </button>
          <button
            onClick={() => setViewMode("ledger")}
            className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
              viewMode === "ledger"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <List size={16} className="text-blue-600" /> รายการเดินบัญชีแยกประเภท (Ledger)
          </button>
        </div>

        {/* Export & Download Button Group */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button 
            onClick={handleExportTransactionsCSV}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-xs sm:text-sm px-4 py-2.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            title="ดาวน์โหลดรายการบัญชีรายรับรายจ่ายทั้งหมดเป็นไฟล์ Excel CSV"
          >
            <Download size={15} className="text-emerald-600" />
            โหลดบัญชีรับ-จ่าย (.csv)
          </button>
          
          {monthlyBills && monthlyBills.length > 0 && (
            <button 
              onClick={handleExportPaymentsCSV}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-xs sm:text-sm px-4 py-2.5 shadow-2xs transition-all cursor-pointer active:scale-95"
              title="ดาวน์โหลดรายงานคนจ่ายและไม่จ่ายค่าบำรุงประจำรอบบิลล่าสุดเป็นไฟล์ CSV"
            >
              <Download size={15} className="text-blue-600" />
              รายชื่อคนจ่าย-ค้างจ่าย (.csv)
            </button>
          )}

          <button 
            onClick={handlePrintPDF}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs sm:text-sm px-5 py-2.5 shadow-sm transition-all cursor-pointer active:scale-95"
            title="พิมพ์หน้ารายงานสรุปแบบทางการเป็นไฟล์ PDF"
          >
            <FileText size={15} className="text-sky-400" />
            พิมพ์สรุป PDF
          </button>
        </div>
      </div>

      {/* Conditional rendering based on active viewMode */}
      {viewMode === "charts" ? (
        <BudgetCharts transactions={transactions} />
      ) : (
        /* Ledger and Filtering panel */
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <FileText size={20} className="text-blue-600" /> บันทึกรายการเดินบัญชีแยกประเภท (Ledger)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                รายการเดินบัญชีโปร่งใส อัปเดตอัตโนมัติทุกครั้งที่มีการอนุมัติรายรับหรือรายจ่าย
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full tabular-nums self-start sm:self-center">
              ทั้งหมด {filteredTransactions.length} รายการ
            </span>
          </div>

          {/* Input filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาตามคำอธิบายรายการ หรือหมวดหมู่..." 
                className="w-full text-xs sm:text-sm p-3 pl-10 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 bg-slate-50/50 focus:bg-white text-slate-800"
              />
            </div>

            <div>
              <select 
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full text-xs sm:text-sm p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 bg-white font-semibold text-slate-700"
              >
                <option value="all">หมวดหมู่ทั้งหมด</option>
                <option value="monthly_fee">ค่าบำรุงกองทุน</option>
                <option value="market_profit">กำไรตลาดวันพุธ</option>
                <option value="activity_expense">งบกิจกรรม</option>
                <option value="other_income">รายรับอื่น</option>
                <option value="other_expense">รายจ่ายอื่น</option>
              </select>
            </div>

            <div>
              <select 
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full text-xs sm:text-sm p-3 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 bg-white font-semibold text-slate-700"
              >
                <option value="all">ประเภทบัญชีทั้งหมด</option>
                <option value="income">รายรับ (+)</option>
                <option value="expense">รายจ่าย (-)</option>
              </select>
            </div>
          </div>

          {/* Financial Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80">
                  <th className="p-3.5 sm:p-4">วันที่ทำรายการ</th>
                  <th className="p-3.5 sm:p-4">ประเภท</th>
                  <th className="p-3.5 sm:p-4">หมวดหมู่</th>
                  <th className="p-3.5 sm:p-4">คำอธิบายรายการ</th>
                  <th className="p-3.5 sm:p-4">ผู้บันทึก</th>
                  <th className="p-3.5 sm:p-4 text-right">จำนวนเงิน (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400 text-sm">
                      ไม่พบรายการทำธุรกรรมการเงินที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 sm:p-4 text-slate-600 font-mono tabular-nums whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "numeric"
                        })}
                      </td>
                      <td className="p-3.5 sm:p-4 whitespace-nowrap">
                        {tx.type === "income" ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <ArrowUpRight size={13} /> รายรับ
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 font-bold text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <ArrowDownRight size={13} /> รายจ่าย
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 sm:p-4 text-slate-700 font-semibold whitespace-nowrap">
                        {getCategoryLabel(tx.category)}
                      </td>
                      <td className="p-3.5 sm:p-4 text-slate-900 font-medium min-w-[200px]">
                        {tx.description}
                      </td>
                      <td className="p-3.5 sm:p-4 text-slate-600 whitespace-nowrap">
                        {users.find(u => u.id === tx.createdBy)?.fullName || "ระบบหลัก"}
                      </td>
                      <td className={`p-3.5 sm:p-4 text-right font-extrabold font-mono tabular-nums whitespace-nowrap ${
                        tx.type === "income" ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {tx.type === "income" ? "+" : "-"}฿{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
