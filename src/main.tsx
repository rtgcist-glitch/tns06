import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LoadingProvider } from './components/LoadingOverlay.tsx';
import './index.css';

// Global safety wrapper for Response.prototype.json to completely prevent "Unexpected token '<'"
// and "TypeError: body stream already read" crashes when the server or reverse proxy returns HTML error pages
const originalJson = Response.prototype.json;
Response.prototype.json = async function () {
  const cloned = this.clone();
  const contentType = this.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      return await originalJson.call(this);
    } catch {
      // Fall through to text parsing on the cloned stream if original JSON parser fails
    }
  }

  try {
    const readerSource = this.bodyUsed ? cloned : this;
    const text = await readerSource.text();
    const trimmed = text.trim();
    if (
      trimmed.toLowerCase().startsWith("<!doctype") ||
      trimmed.toLowerCase().startsWith("<html") ||
      trimmed.toLowerCase().startsWith("<div")
    ) {
      return { error: "เซิร์ฟเวอร์ขัดข้องชั่วคราว (ได้รับหน้าเว็บ HTML แทนข้อมูล JSON) - กรุณาลองใหม่อีกครั้งค่ะ" };
    }
    try {
      return JSON.parse(text);
    } catch {
      return { error: text || `Error ${this.status}: ${this.statusText}` };
    }
  } catch {
    return { error: `Error ${this.status}: ${this.statusText}` };
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LoadingProvider>
        <App />
      </LoadingProvider>
    </ErrorBoundary>
  </StrictMode>,
);
