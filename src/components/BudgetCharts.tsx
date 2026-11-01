/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { Transaction } from "../types";
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart, 
  Activity,
  ShoppingBag,
  DollarSign,
  HelpCircle,
  Calendar
} from "lucide-react";

interface MonthlyTrendPoint {
  month: number;
  year: number;
  income: number;
  expense: number;
  balance: number;
  label: string;
  fullLabel: string;
  x?: number;
  y?: number;
}

interface DonutChartSegment {
  key: string;
  value: number;
  label: string;
  color: string;
  hoverColor: string;
  icon: React.ReactNode;
  percentage: number;
}

interface BudgetChartsProps {
  transactions: Transaction[];
}

export default function BudgetCharts({ transactions }: BudgetChartsProps) {
  const [activeChartTab, setActiveChartTab] = useState<"distribution" | "trend">("distribution");
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [activeMonthTooltip, setActiveMonthTooltip] = useState<MonthlyTrendPoint | null>(null);

  // 1. Process Data for Slices (Incomes & Expenses category breakdowns)
  const stats = useMemo(() => {
    let incomeSum = 0;
    let expenseSum = 0;

    const incomeCategories = {
      monthly_fee: { value: 0, label: "ค่าบำรุงกองทุน", color: "#2563EB", hoverColor: "#3B82F6", icon: <DollarSign size={14} /> },
      market_profit: { value: 0, label: "กำไรตลาดวันพุธ", color: "#10B981", hoverColor: "#34D399", icon: <ShoppingBag size={14} /> },
      other_income: { value: 0, label: "รายรับอื่น", color: "#8B5CF6", hoverColor: "#A78BFA", icon: <ArrowUpRight size={14} /> },
    };

    const expenseCategories = {
      activity_expense: { value: 0, label: "งบกิจกรรม", color: "#EF4444", hoverColor: "#F87171", icon: <Activity size={14} /> },
      other_expense: { value: 0, label: "รายจ่ายอื่น", color: "#F59E0B", hoverColor: "#FBBF24", icon: <ArrowDownRight size={14} /> },
    };

    transactions.forEach(tx => {
      const amount = tx.amount;
      if (tx.type === "income") {
        incomeSum += amount;
        if (tx.category in incomeCategories) {
          incomeCategories[tx.category as keyof typeof incomeCategories].value += amount;
        }
      } else {
        expenseSum += amount;
        if (tx.category in expenseCategories) {
          expenseCategories[tx.category as keyof typeof expenseCategories].value += amount;
        }
      }
    });

    return {
      incomeSum,
      expenseSum,
      incomes: Object.entries(incomeCategories).map(([key, item]) => ({
        key,
        ...item,
        percentage: incomeSum > 0 ? (item.value / incomeSum) * 100 : 0
      })),
      expenses: Object.entries(expenseCategories).map(([key, item]) => ({
        key,
        ...item,
        percentage: expenseSum > 0 ? (item.value / expenseSum) * 100 : 0
      }))
    };
  }, [transactions]);

  // 2. Process Monthly Cash Flow Trend Data
  const trendData = useMemo(() => {
    const monthlyGroups: { [key: string]: { month: number; year: number; income: number; expense: number } } = {};

    transactions.forEach(tx => {
      const key = `${tx.year}-${tx.month}`;
      if (!monthlyGroups[key]) {
        monthlyGroups[key] = {
          month: tx.month,
          year: tx.year,
          income: 0,
          expense: 0
        };
      }
      if (tx.type === "income") {
        monthlyGroups[key].income += tx.amount;
      } else {
        monthlyGroups[key].expense += tx.amount;
      }
    });

    const sortedKeys = Object.keys(monthlyGroups).sort((a, b) => {
      const [yearA, monthA] = a.split("-").map(Number);
      const [yearB, monthB] = b.split("-").map(Number);
      return yearA !== yearB ? yearA - yearB : monthA - monthB;
    });

    let cumulativeBalance = -3802;
    const items = sortedKeys.map(key => {
      const group = monthlyGroups[key];
      cumulativeBalance += (group.income - group.expense);
      return {
        ...group,
        balance: cumulativeBalance,
        label: getThaiMonthAbbr(group.month, group.year),
        fullLabel: `เดือน${getThaiMonthName(group.month)} พ.ศ. ${group.year}`
      };
    });

    return items;
  }, [transactions]);

  // SVG Helper function for Donut Chart
  const renderDonutChart = (data: DonutChartSegment[], title: string, subtitle: string, totalVal: number, prefix: string = "฿") => {
    const radius = 52;
    const strokeWidth = 14;
    const circumference = 2 * Math.PI * radius;
    let accumulatedPercentage = 0;

    const validSegments = data.filter(s => s.value > 0);

    if (validSegments.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-56 text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
          <HelpCircle className="text-slate-300 mb-2" size={28} />
          <p className="text-xs sm:text-sm font-semibold">ยังไม่มีข้อมูลในส่วนนี้</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col md:flex-row items-center justify-center gap-6 p-3 sm:p-4">
        {/* SVG Circle Rendering */}
        <div className="relative w-52 h-52 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="transparent"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />
            {validSegments.map((segment) => {
              const dashArray = `${(segment.percentage / 100) * circumference} ${circumference}`;
              const dashOffset = circumference - (accumulatedPercentage / 100) * circumference;
              accumulatedPercentage += segment.percentage;

              const isHovered = hoveredSlice === segment.key;

              return (
                <circle
                  key={segment.key}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth={isHovered ? strokeWidth + 2 : strokeWidth}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className="transition-all duration-300 cursor-pointer"
                  onMouseEnter={() => setHoveredSlice(segment.key)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  style={{
                    filter: isHovered ? `drop-shadow(0 4px 6px ${segment.color}40)` : "none"
                  }}
                />
              );
            })}
          </svg>

          {/* Center Info Panel */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-white/50 rounded-full">
            {hoveredSlice ? (
              (() => {
                const seg = data.find(s => s.key === hoveredSlice);
                if (!seg) return null;
                return (
                  <div className="animate-fade-in">
                    <span className="text-xs font-bold text-slate-500 block">{seg.label}</span>
                    <span className="text-base sm:text-lg font-extrabold text-slate-900 tabular-nums font-mono block mt-0.5">
                      {prefix}{seg.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className="bg-slate-100 text-slate-700 font-bold rounded-full text-xs px-2 py-0.5 inline-block mt-1 tabular-nums">
                      {seg.percentage.toFixed(1)}%
                    </span>
                  </div>
                );
              })()
            ) : (
              <div>
                <span className="text-xs font-bold text-slate-500 block">{title}</span>
                <span className="text-base sm:text-lg font-extrabold text-slate-900 tabular-nums font-mono block mt-0.5">
                  {prefix}{totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-xs text-slate-400 font-medium block mt-0.5">{subtitle}</span>
              </div>
            )}
          </div>
        </div>

        {/* Legend Panel */}
        <div className="flex-1 w-full space-y-3">
          {data.map((segment) => {
            const isHovered = hoveredSlice === segment.key;
            return (
              <div
                key={segment.key}
                onMouseEnter={() => setHoveredSlice(segment.key)}
                onMouseLeave={() => setHoveredSlice(null)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  isHovered 
                    ? "border-slate-300 bg-slate-50 shadow-xs translate-x-0.5" 
                    : "border-slate-100 bg-slate-50/40 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                  <div 
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="font-bold text-slate-800">{segment.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold font-mono text-slate-900 tabular-nums block">
                    {prefix}{segment.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold tabular-nums">
                    {segment.percentage.toFixed(1)}% ของทั้งหมด
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Visual Tab Selection */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-600" /> วิเคราะห์งบประมาณและสัดส่วนการเงิน
          </h3>
          <p className="text-xs text-slate-500">ภาพรวมสถิติกองทุน รายรับแยกตามหมวดหมู่ และแนวโน้มกระแสเงินสดรายเดือน</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-2xl flex gap-1 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveChartTab("distribution")}
            className={`px-3.5 py-2 rounded-xl transition-all ${
              activeChartTab === "distribution" 
                ? "bg-white text-slate-900 shadow-xs" 
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📊 สัดส่วนรายรับ-จ่าย
          </button>
          <button
            onClick={() => setActiveChartTab("trend")}
            className={`px-3.5 py-2 rounded-xl transition-all ${
              activeChartTab === "trend" 
                ? "bg-white text-slate-900 shadow-xs" 
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📈 แนวโน้มกระแสเงินสด
          </button>
        </div>
      </div>

      {activeChartTab === "distribution" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income Breakdown */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold px-3 py-1 rounded-full text-xs inline-flex items-center gap-1.5">
                  🟢 สัดส่วนรายรับ (Incomes)
                </span>
                <p className="text-xs text-slate-500 mt-1.5">
                  เปรียบเทียบแหล่งที่มาของเงินกองทุนห้องเรียนแยกตามหมวดหมู่
                </p>
              </div>
            </div>
            {renderDonutChart(stats.incomes, "รายรับรวม", "ยอดสะสมทั้งหมด", stats.incomeSum)}
          </div>

          {/* Expense Breakdown */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="bg-rose-50 text-rose-700 border border-rose-200/60 font-bold px-3 py-1 rounded-full text-xs inline-flex items-center gap-1.5">
                  🔴 สัดส่วนรายจ่าย (Expenses)
                </span>
                <p className="text-xs text-slate-500 mt-1.5">
                  แสดงสัดส่วนงบประมาณกิจกรรมเทียบกับรายจ่ายหมวดอื่นๆ
                </p>
              </div>
            </div>
            {renderDonutChart(stats.expenses, "รายจ่ายรวม", "ยอดจ่ายสะสมทั้งหมด", stats.expenseSum)}
          </div>
        </div>
      ) : (
        /* Cash Flow Trend */
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="bg-blue-50 text-blue-700 border border-blue-200/60 font-bold px-3 py-1 rounded-full text-xs inline-flex items-center gap-1.5">
                📈 กระแสเงินสดสะสมรายเดือน (Cash Flow Trend)
              </span>
              <p className="text-xs text-slate-500 mt-1.5">
                เปรียบเทียบยอดรวมรายรับ (สีเขียว) รายจ่าย (สีแดง) และยอดคงคลังสะสมสุทธิ (เส้นสีน้ำเงิน)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-xs"></span> รายรับรายเดือน</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-rose-500 rounded-xs"></span> รายจ่ายรายเดือน</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-600 inline-block"></span> ยอดคงเหลือสะสม</span>
            </div>
          </div>

          {trendData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <Calendar className="text-slate-300 mb-2" size={28} />
              <p className="text-xs sm:text-sm font-semibold">ยังไม่มีประวัติบัญชีรายเดือนที่จะนำมาสรุปแนวโน้ม</p>
            </div>
          ) : (
            (() => {
              const maxVal = Math.max(
                ...trendData.map(d => Math.max(d.income, d.expense, d.balance, 1000))
              );
              const paddingPercent = 1.15;
              const chartMaxY = maxVal * paddingPercent;

              const width = 800;
              const height = 290;
              const paddingX = 65;
              const paddingY = 32;

              const chartWidth = width - paddingX * 2;
              const chartHeight = height - paddingY * 2;

              const points = trendData.map((d, index) => {
                const x = paddingX + (index / Math.max(trendData.length - 1, 1)) * chartWidth;
                const yBalance = height - paddingY - (d.balance / chartMaxY) * chartHeight;
                const yIncome = height - paddingY - (d.income / chartMaxY) * chartHeight;
                const yExpense = height - paddingY - (d.expense / chartMaxY) * chartHeight;
                return {
                  x,
                  yBalance,
                  yIncome,
                  yExpense,
                  data: d
                };
              });

              let balancePath = "";
              if (points.length > 0) {
                if (points.length === 1) {
                  balancePath = `M ${points[0].x - 20} ${points[0].yBalance} L ${points[0].x + 20} ${points[0].yBalance}`;
                } else {
                  balancePath = points.reduce((path, p, idx) => {
                    return path + `${idx === 0 ? "M" : "L"} ${p.x} ${p.yBalance} `;
                  }, "");
                }
              }

              return (
                <div className="relative w-full overflow-x-auto pt-4">
                  <div className="min-w-[650px] relative">
                    <svg className="w-full h-auto" viewBox={`0 0 ${width} ${height}`}>
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                        const y = paddingY + ratio * chartHeight;
                        const labelValue = chartMaxY * (1 - ratio);
                        return (
                          <g key={idx}>
                            <line 
                              x1={paddingX} 
                              y1={y} 
                              x2={width - paddingX} 
                              y2={y} 
                              stroke="#E2E8F0" 
                              strokeWidth={1}
                              strokeDasharray="4 4"
                            />
                            <text 
                              x={paddingX - 10} 
                              y={y + 4} 
                              textAnchor="end" 
                              className="fill-slate-500 font-mono text-xs font-bold tabular-nums"
                            >
                              ฿{Math.round(labelValue).toLocaleString()}
                            </text>
                          </g>
                        );
                      })}

                      {points.map((p, idx) => {
                        const barWidth = Math.min(20, chartWidth / (trendData.length * 2.5));
                        const xIncome = p.x - barWidth - 2;
                        const xExpense = p.x + 2;
                        const barHeightIncome = (p.data.income / chartMaxY) * chartHeight;
                        const barHeightExpense = (p.data.expense / chartMaxY) * chartHeight;

                        return (
                          <g key={idx}>
                            {p.data.income > 0 && (
                              <rect
                                x={xIncome}
                                y={height - paddingY - barHeightIncome}
                                width={barWidth}
                                height={barHeightIncome}
                                fill="#10B981"
                                rx={3}
                                className="opacity-85 hover:opacity-100 transition-all duration-200 cursor-pointer"
                                onMouseEnter={() => setActiveMonthTooltip({ ...p.data, x: p.x, y: p.yBalance })}
                                onMouseLeave={() => setActiveMonthTooltip(null)}
                              />
                            )}
                            {p.data.expense > 0 && (
                              <rect
                                x={xExpense}
                                y={height - paddingY - barHeightExpense}
                                width={barWidth}
                                height={barHeightExpense}
                                fill="#EF4444"
                                rx={3}
                                className="opacity-85 hover:opacity-100 transition-all duration-200 cursor-pointer"
                                onMouseEnter={() => setActiveMonthTooltip({ ...p.data, x: p.x, y: p.yBalance })}
                                onMouseLeave={() => setActiveMonthTooltip(null)}
                              />
                            )}

                            <text
                              x={p.x}
                              y={height - paddingY + 18}
                              textAnchor="middle"
                              className="fill-slate-600 font-semibold text-xs"
                            >
                              {p.data.label}
                            </text>
                          </g>
                        );
                      })}

                      {balancePath && (
                        <path
                          d={balancePath}
                          fill="none"
                          stroke="#2563EB"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {points.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.yBalance}
                          r={activeMonthTooltip?.month === p.data.month && activeMonthTooltip?.year === p.data.year ? 7 : 4.5}
                          fill="#FFFFFF"
                          stroke="#2563EB"
                          strokeWidth={3}
                          className="cursor-pointer transition-all duration-150"
                          onMouseEnter={() => setActiveMonthTooltip({ ...p.data, x: p.x, y: p.yBalance })}
                          onMouseLeave={() => setActiveMonthTooltip(null)}
                        />
                      ))}
                    </svg>

                    {activeMonthTooltip && (
                      <div 
                        className="absolute bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-xl border border-slate-700/50 text-xs space-y-2 z-20 pointer-events-none transition-all duration-150"
                        style={{
                          left: `${((activeMonthTooltip.x || 0) / width) * 100}%`,
                          top: `${((activeMonthTooltip.y || 0) / height) * 100 - 90}%`,
                          transform: "translateX(-50%)"
                        }}
                      >
                        <p className="font-bold border-b border-slate-700 pb-1.5 text-slate-200">
                          📌 {activeMonthTooltip.fullLabel}
                        </p>
                        <div className="space-y-1 font-mono text-xs tabular-nums">
                          <div className="flex justify-between gap-6 text-emerald-400">
                            <span>🟢 รายรับประจำเดือน:</span>
                            <span>฿{activeMonthTooltip.income.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-6 text-rose-400">
                            <span>🔴 รายจ่ายประจำเดือน:</span>
                            <span>฿{activeMonthTooltip.expense.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-6 text-blue-300 border-t border-slate-800 pt-1.5 font-bold">
                            <span>📘 ยอดคงคลังสะสม:</span>
                            <span>฿{activeMonthTooltip.balance.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-center text-xs text-slate-500 mt-3">
                    💡 ชี้เมาส์หรือแตะที่จุดบนกราฟเพื่อดูสรุปรายรับ-รายจ่ายและยอดคงคลังสะสมของแต่ละเดือน
                  </p>
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

function getThaiMonthAbbr(month: number, year: number) {
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];
  return `${months[month - 1]} ${year % 100}`;
}

function getThaiMonthName(month: number) {
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  return months[month - 1];
}
