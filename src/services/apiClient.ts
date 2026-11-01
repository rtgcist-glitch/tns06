/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safe JSON parser helper to prevent "Unexpected token '<'" crash
 * when the server or reverse proxy returns HTML error pages under load.
 */
export async function safeParseJson(res: Response): Promise<Record<string, unknown>> {
  const cloned = res.clone();
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      // Fall through to text parsing on cloned stream
    }
  }
  try {
    const readerSource = res.bodyUsed ? cloned : res;
    const text = await readerSource.text();
    const trimmed = text.trim().toLowerCase();
    if (
      trimmed.startsWith("<!doctype") ||
      trimmed.startsWith("<html") ||
      trimmed.startsWith("<div")
    ) {
      return {
        error:
          "เซิร์ฟเวอร์ขัดข้องชั่วคราว (ได้รับหน้าเว็บ HTML แทนข้อมูล JSON) - กรุณาลองใหม่อีกครั้งค่ะ",
      };
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: text || `Error ${res.status}: ${res.statusText}` };
    }
  } catch {
    return { error: `Error ${res.status}: ${res.statusText}` };
  }
}

/**
 * Uniform POST helper with safe JSON parsing and clear error handling.
 */
export async function apiPost<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  defaultErrorMessage = "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์"
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeParseJson(res);
  if (!res.ok || data.error) {
    throw new Error(String(data.error || defaultErrorMessage));
  }
  return data as unknown as T;
}
