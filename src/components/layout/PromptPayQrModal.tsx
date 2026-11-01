/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { QrCode, DollarSign, Check, Copy, X, ShieldCheck, ArrowRight } from "lucide-react";
import { SystemSettings } from "../../types";

interface PromptPayQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
  onGoToMonthly?: () => void;
}

export default function PromptPayQrModal({
  isOpen,
  onClose,
  settings,
  onGoToMonthly,
}: PromptPayQrModalProps) {
  const [copiedText, setCopiedText] = useState<boolean>(false);

  if (!isOpen || !settings) return null;

  const isPromptPayOrHasQr =
    !settings.bankName ||
    settings.bankName.includes("พร้อมเพย์") ||
    settings.bankName.toLowerCase().includes("prompt") ||
    Boolean(settings.promptpayQrUrl);

  const handleCopy = () => {
    navigator.clipboard.writeText(settings.promptpayNumber);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-sm w-full border border-slate-200/80 shadow-2xl overflow-hidden text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Official Thai PromptPay Navy Banner Header */}
        <div className="bg-gradient-to-r from-[#003D6B] via-[#00335C] to-[#002545] px-6 py-5 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 transition-all p-1.5 rounded-xl"
            aria-label="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-xs font-bold tracking-wide text-sky-100">
            <QrCode size={14} /> {settings.bankName || "Thai QR PromptPay"}
          </div>
          <h3 className="text-base font-extrabold mt-2 tracking-tight">
            {settings.fundName || "บัญชีกองทุนส่วนกลาง"}
          </h3>
          <p className="text-[11px] text-sky-200/90 mt-0.5">
            สแกน QR หรือคัดลอกเลขบัญชีเพื่อโอนชำระเงิน
          </p>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          {isPromptPayOrHasQr ? (
            <div className="mx-auto w-52 h-52 bg-white p-3.5 rounded-2xl shadow-md border-2 border-[#003D6B]/15 flex items-center justify-center relative">
              <img
                src={
                  settings.promptpayQrUrl ||
                  `https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=003D6B&data=PromptPay:${settings.promptpayNumber.replace(/[^0-9]/g, "")}`
                }
                alt="PromptPay QR Code"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
          ) : (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5 rounded-2xl w-full text-left space-y-3 shadow-md relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4 pointer-events-none">
                <DollarSign size={110} />
              </div>
              <div>
                <p className="text-[11px] text-blue-100 uppercase tracking-wider font-bold">
                  ธนาคารที่รับโอน
                </p>
                <p className="font-bold text-lg mt-0.5">{settings.bankName}</p>
              </div>
              <div>
                <p className="text-[11px] text-blue-100 uppercase tracking-wider font-bold">
                  ชื่อบัญชี
                </p>
                <p className="font-semibold text-sm">{settings.promptpayName}</p>
              </div>
            </div>
          )}

          {/* Account Name & Copyable Number Box */}
          <div className="space-y-2.5">
            <div>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                ชื่อบัญชีรับโอน
              </p>
              <h4 className="text-base font-extrabold text-slate-900 mt-0.5">
                {settings.promptpayName}
              </h4>
            </div>

            <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/90 p-3 rounded-2xl">
              <div className="text-left min-w-0 pl-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  เลขบัญชี / พร้อมเพย์
                </p>
                <p className="text-base font-mono font-bold text-slate-900 truncate tabular-nums">
                  {settings.promptpayNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={`px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  copiedText
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
                    : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 active:scale-95 shadow-2xs"
                }`}
              >
                {copiedText ? (
                  <>
                    <Check size={14} />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>คัดลอกเลข</span>
                  </>
                )}
              </button>
            </div>

            {settings.monthlyFee > 0 && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100/80 px-3 py-1 rounded-full">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>อัตราค่ารายเดือนปกติ: </span>
                <span className="font-bold text-slate-800 tabular-nums">
                  ฿{settings.monthlyFee.toLocaleString("th-TH")} / เดือน
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            {onGoToMonthly && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToMonthly();
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/15"
              >
                <span>ไปหน้าแจ้งแนบสลิปชำระเงิน</span>
                <ArrowRight size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
