/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  X, 
  Bot, 
  User as UserIcon,
  MessageSquarePlus
} from "lucide-react";
import { User } from "../types";
import { safeParseJson } from "../services/apiClient";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  createdAt: Date;
}

interface GeminiAssistantProps {
  currentUser: User;
  externalOpenTrigger?: number;
}

export default function GeminiAssistant({ currentUser, externalOpenTrigger }: GeminiAssistantProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "model",
      text: "สวัสดีค่ะ! ยินดีต้อนรับเข้าสู่ระบบผู้ช่วยเหรัญญิก AI (AI Treasurer Assistant) 🤖✨\n\nฉันพร้อมช่วยสรุปยอดเงินคงเหลือ ตรวจสอบรายชื่อผู้ที่ยังค้างชำระ วิเคราะห์กำไรตลาดนัดวันพุธ หรือช่วยร่างข้อความแจ้งเตือนแบบสุภาพให้ค่ะ เลือกหัวข้อด้านล่างหรือพิมพ์ถามได้เลยนะคะ!",
      createdAt: new Date()
    }
  ]);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (externalOpenTrigger && externalOpenTrigger > 0) {
      setIsOpen(true);
    }
  }, [externalOpenTrigger]);

  const starterPrompts = [
    { label: "💰 สรุปยอดเงินคงเหลือ", prompt: "ช่วยวิเคราะห์ผลสรุปยอดเงินคงเหลือ รายรับ และรายจ่ายของกองทุนในระบบ ณ ตอนนี้ให้หน่อยค่ะ" },
    { label: "📋 เดือนนี้ใครยังไม่จ่ายบ้าง", prompt: "ขอสรุปสถานะการเก็บเงินค่าบำรุงรายเดือนประจำเดือนปัจจุบันให้หน่อยว่าจ่ายแล้วกี่คน ค้างกี่คน และเดือนนี้ใครยังไม่จ่ายบ้าง" },
    { label: "🛍️ กำไรตลาดนัดวันพุธ", prompt: "ช่วยสรุปยอดกำไรตลาดนัดวันพุธ (Wednesday Market) และแนะนำไอเดียเพิ่มกำไรหรือลดต้นทุนให้หน่อยค่ะ" },
    { label: "✉️ ร่างข้อความทวงเงินสุภาพ", prompt: "ช่วยเขียนร่างข้อความเตือน (Reminder Message) เพื่อนำไปส่งแจ้งเตือนเพื่อนๆ ที่ยังค้างจ่ายค่าบำรุงห้องหน่อย เอาแบบภาษาเป็นกันเอง สุภาพ น่ารัก" }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      text: textToSend,
      createdAt: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const historyPayload = messages.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        text: msg.text
      }));

      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToSend,
          history: historyPayload,
          userId: currentUser.id
        })
      });

      if (!response.ok) {
        const errData = await safeParseJson(response);
        throw new Error(String(errData.error || "เซิร์ฟเวอร์ AI ไม่ตอบสนองหรือยังไม่ได้อัปเกรดคีย์สิทธิ์"));
      }

      const data = await safeParseJson(response);
      if (data.error) {
        throw new Error(String(data.error));
      }
      
      const botMsg: Message = {
        id: `msg_bot_${Date.now()}`,
        role: "model",
        text: String(data.reply || "ขออภัยด้วยค่ะ ระบบประมวลผลคำตอบไม่ได้ชั่วคราว"),
        createdAt: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error: any) {
      const errorMsg: Message = {
        id: `msg_err_${Date.now()}`,
        role: "model",
        text: `⚠️ เกิดข้อผิดพลาด: ${error.message || "ไม่สามารถดึงข้อมูล AI ได้"} รบกวนแจ้งเหรัญญิกหรือคณะกรรมการตรวจสอบการเปิดใช้งานคีย์สิทธิ์หลังบ้านนะคะ`,
        createdAt: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleSend(input);
    setInput("");
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        id="gemini_floating_toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full px-4 py-3.5 shadow-xl shadow-indigo-600/25 transition-all cursor-pointer flex items-center gap-2 border border-white/20 group hover:scale-105 active:scale-95"
        title="คุยกับผู้ช่วยเหรัญญิก AI"
      >
        <div className="relative flex items-center justify-center">
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
          </span>
          <Sparkles className="group-hover:rotate-12 transition-transform" size={20} />
        </div>
        <span className="hidden sm:inline text-xs font-extrabold tracking-wide pr-0.5">ผู้ช่วย AI</span>
      </button>

      {/* Floating Chat Modal Panel */}
      {isOpen && (
        <div className="fixed bottom-36 right-4 md:bottom-22 md:right-6 w-[calc(100vw-2rem)] sm:w-[390px] md:w-[430px] h-[540px] md:h-[580px] bg-white rounded-3xl border border-slate-200/90 shadow-2xl flex flex-col overflow-hidden z-50 text-xs sm:text-sm">
          {/* Sleek Header */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 border border-blue-400/30 p-2.5 rounded-2xl">
                <Sparkles className="text-sky-300" size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm tracking-tight">ผู้ช่วยเหรัญญิก AI</h3>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Online
                  </span>
                </div>
                <span className="text-xs text-slate-300 font-medium block mt-0.5">
                  วิเคราะห์บัญชี ตรวจสอบยอดค้าง & ร่างประกาศ
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages Log Panel */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/70">
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role !== "user" && (
                  <div className="bg-blue-600 text-white p-1.5 rounded-2xl h-8 w-8 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <Bot size={16} />
                  </div>
                )}
                
                <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-2xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-xs font-medium"
                    : msg.id.startsWith("msg_err_")
                      ? "bg-rose-50 text-rose-800 border border-rose-200 rounded-tl-xs"
                      : "bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs"
                }`}>
                  <p className="whitespace-pre-line text-xs sm:text-sm leading-relaxed">{msg.text}</p>
                  <span className={`block text-[10px] mt-1.5 text-right tabular-nums ${
                    msg.role === "user" ? "text-blue-100" : "text-slate-400"
                  }`}>
                    {msg.createdAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {msg.role === "user" && (
                  <div className="bg-slate-200 text-slate-700 p-1.5 rounded-2xl h-8 w-8 flex items-center justify-center shrink-0 mt-0.5">
                    <UserIcon size={16} />
                  </div>
                )}
              </div>
            ))}

            {/* Waiting state typing bubble */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="bg-blue-600 text-white p-1.5 rounded-2xl h-8 w-8 flex items-center justify-center shrink-0 shadow-xs">
                  <Bot size={16} />
                </div>
                <div className="bg-white text-slate-700 border border-slate-200/80 rounded-2xl rounded-tl-xs px-4 py-3.5 shadow-2xs flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick-Prompt Chips Bar */}
          <div className="px-3.5 py-2.5 bg-white border-t border-slate-100 space-y-1.5 shrink-0">
            <span className="text-[11px] font-bold text-slate-500 px-1 block">คำถามด่วนแนะนำ:</span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {starterPrompts.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSend(item.prompt)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-all text-xs rounded-full border border-slate-200/80 hover:border-blue-200 shrink-0 font-bold active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form input field box */}
          <form 
            onSubmit={handleSubmit}
            className="p-3 bg-white border-t border-slate-200/70 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="พิมพ์คำถาม เช่น สรุปยอดเงินคงเหลือ..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-blue-600 focus:bg-white text-slate-800"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl p-2.5 transition-all shadow-sm shrink-0 flex items-center justify-center cursor-pointer"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
