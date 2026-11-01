import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);

    // Send error report to database logs
    try {
      let userId = "anonymous";
      try {
        const stored = localStorage.getItem("currentUser");
        if (stored) {
          const user = JSON.parse(stored);
          if (user && user.id) userId = user.id;
        }
      } catch (e) {}

      fetch("/api/system/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorMsg: error.toString(),
          componentStack: errorInfo ? errorInfo.componentStack : (error.stack || ""),
          userId,
          url: window.location.href
        })
      }).catch(err => console.error("Failed to send error log:", err));
    } catch (e) {
      console.error("Error boundary logging failed:", e);
    }
  }

  private handleReload = () => {
    try {
      localStorage.removeItem("currentUser");
    } catch (e) {}
    window.location.reload();
  };

  private handleCopyError = () => {
    const errText = `${this.state.error?.toString()}\n\nStack:\n${this.state.error?.stack}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack}`;
    try {
      navigator.clipboard.writeText(errText);
      alert("คัดลอกรายละเอียดข้อผิดพลาดไปยังคลิปบอร์ดแล้วค่ะ! สามารถส่งให้เพื่อนๆ เหรัญญิกช่วยดูได้เลยนะคะ");
    } catch (e) {
      alert("ไม่สามารถคัดลอกโดยอัตโนมัติได้ แต่คุณสามารถลากคลุมข้อความสีแดงในกรอบด้านล่างเพื่อคัดลอกแทนได้ค่ะ");
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white border border-rose-100 rounded-[2rem] p-8 max-w-md w-full text-center shadow-xl space-y-6">
            <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center text-3xl shadow-sm">
              ⚠️
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-extrabold text-slate-800">ขออภัยด้วยค่ะ! เกิดข้อผิดพลาดทางเทคนิค</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                ระบบเงินเก็บพบปัญหาบางอย่างในการแสดงผลหน้านี้ (อาจเกิดจากข้อมูลที่ดึงมาจากฐานข้อมูลไม่ตรงรุ่น หรือหน่วยความจำแคชของเบราว์เซอร์เก่าเกินไปค่ะ)
              </p>
            </div>
            
            {this.state.error && (
              <div className="bg-slate-50 p-4 rounded-2xl text-left font-mono text-[10px] text-rose-600 overflow-auto max-h-42 border border-rose-50/50">
                <span className="font-bold">{this.state.error.toString()}</span>
                {this.state.errorInfo && (
                  <pre className="mt-1.5 text-slate-400 whitespace-pre-wrap font-sans leading-relaxed text-[9px]">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button 
                onClick={this.handleReload} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-500/15 text-xs flex items-center justify-center gap-1.5"
              >
                🔄 โหลดหน้าเว็บและระบบใหม่
              </button>
              <button 
                onClick={this.handleCopyError} 
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold py-3.5 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5"
              >
                📋 คัดลอกรายละเอียดโค้ดผิดพลาด
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              💡 แนะนำให้กดปุ่มโหลดใหม่เพื่อเข้าสู่ระบบอีกครั้ง หากยังไม่สามารถเข้าใช้งานได้ กรุณาแจ้งข้อผิดพลาดให้เหรัญญิกทราบนะคะ
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
