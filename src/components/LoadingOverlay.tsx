/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Global Loading Overlay Component
 * Shows a non-blocking floating status toast when async operations are in progress.
 * Used at the App level to provide consistent feedback across all user actions.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from "react";

// --- Context ---
interface LoadingContextType {
  /** Whether the loading overlay is currently visible */
  isActionLoading: boolean;
  /** The message displayed in the overlay */
  loadingMessage: string;
  /** Wrap any async function to automatically show/hide loading overlay */
  withLoading: <T>(fn: () => Promise<T>, message?: string) => Promise<T>;
  /** Manually show loading (for edge cases) */
  showLoading: (message?: string) => void;
  /** Manually hide loading */
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType>({
  isActionLoading: false,
  loadingMessage: "",
  withLoading: async (fn) => fn(),
  showLoading: () => {},
  hideLoading: () => {},
});

export const useLoading = () => useContext(LoadingContext);

// --- Provider ---
export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const activeCountRef = useRef(0);

  const showLoading = useCallback((message?: string) => {
    activeCountRef.current += 1;
    setIsActionLoading(true);
    if (message) setLoadingMessage(message);
  }, []);

  const hideLoading = useCallback(() => {
    activeCountRef.current = Math.max(0, activeCountRef.current - 1);
    if (activeCountRef.current === 0) {
      setIsActionLoading(false);
      setLoadingMessage("");
    }
  }, []);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>, message?: string): Promise<T> => {
    showLoading(message || "กำลังประมวลผล...");
    try {
      return await fn();
    } finally {
      hideLoading();
    }
  }, [showLoading, hideLoading]);

  return (
    <LoadingContext.Provider value={{ isActionLoading, loadingMessage, withLoading, showLoading, hideLoading }}>
      {children}
      {isActionLoading && <LoadingOverlayUI message={loadingMessage} />}
    </LoadingContext.Provider>
  );
}

// --- Overlay UI Component (Non-blocking floating status toast) ---
function LoadingOverlayUI({ message }: { message: string }) {
  return (
    <div className="fixed bottom-20 right-4 md:bottom-5 md:right-20 z-[9999] pointer-events-none flex flex-col items-end">
      <div
        className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 p-4 max-w-sm w-80 flex flex-col gap-2.5 relative overflow-hidden"
        style={{
          animation: "loadingFloatingIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(59, 130, 246, 0.15)"
        }}
      >
        <div className="flex items-center gap-3">
          {/* Animated Compact Spinner */}
          <div className="relative w-9 h-9 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-slate-100" />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "2.5px solid transparent",
                borderTopColor: "#2563eb",
                borderRightColor: "#3b82f6",
                animation: "loadingSpinnerRotate 0.8s linear infinite"
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-2 h-2 rounded-full bg-blue-600"
                style={{ animation: "loadingPulse 1.2s ease-in-out infinite" }}
              />
            </div>
          </div>

          {/* Text Information */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-bold text-slate-800 truncate">
                {message || "กำลังประมวลผล..."}
              </p>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-[9px] font-bold text-blue-600 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                ทำงานเบื้องหลัง
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
              ท่านสามารถกรอกข้อมูลหรือทำงานส่วนอื่นต่อได้ตามปกติค่ะ
            </p>
          </div>
        </div>

        {/* Animated Progress line */}
        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-0.5">
          <div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)",
              backgroundSize: "200% 100%",
              animation: "loadingBarSlide 1.5s ease-in-out infinite"
            }}
          />
        </div>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes loadingFloatingIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes loadingSpinnerRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes loadingPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes loadingBarSlide {
          0% { width: 0%; background-position: 0% 0%; }
          50% { width: 70%; background-position: 100% 0%; }
          100% { width: 100%; background-position: 0% 0%; }
        }
      `}</style>
    </div>
  );
}

export default LoadingOverlayUI;
