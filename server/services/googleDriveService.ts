/**
 * Google Drive API Service
 * Handles Service Account authentication, folder creation, file uploads, and streaming
 * Uses native Node.js crypto and fetch for maximum efficiency (no external dependencies)
 */

import crypto from "crypto";
import { ENV } from "../config/env";

export interface DriveUploadResult {
  id: string;
  name: string;
  mimeType: string;
}

let tokenCache: { token: string; expiresAt: number } | null = null;
const folderIdCache = new Map<string, string>();

export function clearFolderCache(): void {
  folderIdCache.clear();
}

/**
 * Parsers a Google Drive folder ID from a URL or returns the ID directly.
 * Matches drive.google.com/drive/folders/ID or ID format.
 */
export function parseFolderId(urlOrId: string): string {
  if (!urlOrId) return "";
  const trimmed = urlOrId.trim();
  if (trimmed.includes("drive.google.com")) {
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : trimmed;
  }
  return trimmed;
}

/**
 * Formats and validates a PEM private key for Node.js OpenSSL / crypto functions.
 * Strips surrounding quotes, handles single-line and multiline PEM formats,
 * unescapes newlines, and normalizes line endings.
 */
function formatPrivateKey(rawKey: string): string {
  if (!rawKey) return "";
  let key = rawKey.trim();

  // Strip leading/trailing matching quotes if present
  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith('`') && key.endsWith('`'))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Replace literal \n or \\n with actual newlines
  key = key.replace(/\\n/g, "\n").replace(/\\r/g, "");

  // 1. Check RSA PRIVATE KEY (PKCS#1)
  const rsaMatch = key.match(/-----BEGIN RSA PRIVATE KEY-----([\s\S]*?)-----END RSA PRIVATE KEY-----/);
  if (rsaMatch) {
    const body = rsaMatch[1].replace(/\s+/g, "");
    const formattedBody = body.match(/.{1,64}/g)?.join("\n") || body;
    return `-----BEGIN RSA PRIVATE KEY-----\n${formattedBody}\n-----END RSA PRIVATE KEY-----\n`;
  }

  // 2. Check PRIVATE KEY (PKCS#8)
  const pkcs8Match = key.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (pkcs8Match) {
    const body = pkcs8Match[1].replace(/\s+/g, "");
    const formattedBody = body.match(/.{1,64}/g)?.join("\n") || body;
    return `-----BEGIN PRIVATE KEY-----\n${formattedBody}\n-----END PRIVATE KEY-----\n`;
  }

  // 3. Fallback for raw base64 string
  const cleanBody = key.replace(/\s+/g, "");
  if (cleanBody.length > 100) {
    const formattedBody = cleanBody.match(/.{1,64}/g)?.join("\n") || cleanBody;
    return `-----BEGIN PRIVATE KEY-----\n${formattedBody}\n-----END PRIVATE KEY-----\n`;
  }

  return key;
}

/**
 * Signs a JWT using RS256 algorithm for Google Service Account authentication
 */
function generateJwt(email: string, privateKey: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");

  const formattedKey = formatPrivateKey(privateKey);

  if (formattedKey.length < 200) {
    throw new Error("คีย์ GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ใน .env ไม่สมบูรณ์ กรุณาใช้การเชื่อมต่อบัญชี Google ของท่านผ่านปุ่มล็อกอินเพื่อใช้งาน Google Drive แทนค่ะ");
  }

  const now = Math.floor(Date.now() / 1000);
  const iat = now - 60; // 60s buffer for clock skew
  const claimSet = {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: iat + 3600, // 1 hour expiration from iat
    iat: iat
  };
  const base64ClaimSet = Buffer.from(JSON.stringify(claimSet)).toString("base64url");

  try {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${base64Header}.${base64ClaimSet}`);
    const signature = sign.sign(formattedKey, "base64url");

    return `${base64Header}.${base64ClaimSet}.${signature}`;
  } catch (err: any) {
    console.error("[Google OAuth] RSA signing failed:", err.message);
    throw new Error(`Service Account Key รูปแบบไม่ถูกต้อง (${err.message}) กรุณาล็อกอินผ่านบัญชี Google ของท่านแทนค่ะ`);
  }
}

/**
 * Gets a valid Google Drive API Access Token from Service Account credentials
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  const email = ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = ENV.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error("Missing Google Service Account configuration. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in .env");
  }

  try {
    const jwt = generateJwt(email, privateKey);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google OAuth error: ${response.statusText} - ${errText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
    return data.access_token;
  } catch (err: any) {
    console.warn("[Google OAuth] Service Account access token unavailable:", err?.message || err);
    throw err;
  }
}

/**
 * Searches for a folder by name and parent folder ID
 */
export async function findFolder(folderName: string, parentFolderId?: string, customToken?: string): Promise<string | null> {
  try {
    const token = customToken || await getAccessToken();
    let query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      console.warn("[Google Drive] Find folder notice:", await response.text());
      return null;
    }

    const data = await response.json() as { files?: Array<{ id: string }> };
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  } catch (err: any) {
    console.warn("[Google Drive] Find folder exception:", err?.message);
    return null;
  }
}

/**
 * Creates a folder on Google Drive
 */
export async function createFolder(folderName: string, parentFolderId?: string, customToken?: string): Promise<string> {
  const token = customToken || await getAccessToken();
  const metadata: Record<string, any> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  let response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const errText = await response.text();
    // Fallback if parent folder is restricted or not found
    if (parentFolderId && (errText.includes("notFound") || errText.includes("fileNotAssociatedWithApp") || errText.includes("insufficient") || response.status === 404 || response.status === 403)) {
      console.warn(`[Google Drive] Parent folder ${parentFolderId} restricted or not found. Retrying folder "${folderName}" creation at root...`);
      delete metadata.parents;
      response = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(metadata)
      });
    }

    if (!response.ok) {
      const finalErrText = await response.text();
      let cleanMsg = finalErrText;
      try {
        const parsed = JSON.parse(finalErrText);
        cleanMsg = parsed.error?.message || finalErrText;
      } catch {}
      throw new Error(`[Google Drive] ไม่สามารถสร้างโฟลเดอร์ "${folderName}" ได้: ${cleanMsg}`);
    }
  }

  const data = await response.json() as { id: string };
  return data.id;
}

export async function getOrCreateFolder(folderPath: string[], parentFolderId?: string, customToken?: string): Promise<string> {
  let currentParentId = parentFolderId;
  
  for (const folderName of folderPath) {
    if (!folderName) continue;
    const cacheKey = `${currentParentId || "root"}:${folderName}`;
    let foundId = folderIdCache.get(cacheKey);
    if (!foundId) {
      foundId = await findFolder(folderName, currentParentId, customToken);
      if (!foundId) {
        try {
          foundId = await createFolder(folderName, currentParentId, customToken);
          console.log(`[Google Drive] Created folder structure: ${folderName} under ${currentParentId || 'root'}`);
        } catch (err: any) {
          console.warn(`[Google Drive] Failed creating folder "${folderName}" under ${currentParentId}, trying fallback at root:`, err?.message);
          foundId = await createFolder(folderName, undefined, customToken);
        }
      }
      if (foundId) {
        folderIdCache.set(cacheKey, foundId);
      }
    }
    if (foundId) {
      currentParentId = foundId;
    }
  }

  return currentParentId || parentFolderId || "root";
}

/**
 * Uploads a file (base64) into a specific Google Drive folder
 */
export async function uploadFile(base64Data: string, filename: string, folderId: string, customToken?: string): Promise<DriveUploadResult> {
  const token = customToken || await getAccessToken();
  
  const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : "image/jpeg";
  const base64Body = match ? match[2] : base64Data;
  const binaryData = Buffer.from(base64Body, "base64");

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata: any = {
    name: filename,
    parents: [folderId]
  };

  const buildBody = (meta: any) => Buffer.concat([
    Buffer.from(delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + delimiter),
    Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`),
    binaryData,
    Buffer.from(closeDelim)
  ]);

  let response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: buildBody(metadata)
  });

  if (!response.ok) {
    const errText = await response.text();
    if (folderId && (errText.includes("notFound") || errText.includes("fileNotAssociatedWithApp") || errText.includes("insufficient") || response.status === 404 || response.status === 403)) {
      console.warn(`[Google Drive] Target folder ${folderId} restricted or not found for file "${filename}". Retrying upload at root...`);
      delete metadata.parents;
      response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: buildBody(metadata)
      });
    }

    if (!response.ok) {
      const finalErrText = await response.text();
      let cleanMsg = finalErrText;
      try {
        const parsed = JSON.parse(finalErrText);
        cleanMsg = parsed.error?.message || finalErrText;
      } catch {}
      throw new Error(`[Google Drive] อัปโหลดไฟล์ "${filename}" ไม่สำเร็จ: ${cleanMsg}`);
    }
  }

  const uploadResult = await response.json() as DriveUploadResult;
  if (uploadResult?.id) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadResult.id}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: "reader", type: "anyone" })
      });
    } catch (e) {}
  }
  return uploadResult;
}

/**
 * Downloads a file's binary stream from Google Drive
 */
export async function downloadFile(fileId: string, customToken?: string): Promise<{ data: Buffer; mimeType: string }> {
  let token: string | null = customToken || null;

  if (!token) {
    try {
      token = await getAccessToken();
    } catch (err: any) {
      console.warn(`[Google Drive] Service Account token unavailable for ${fileId}, trying public/direct CDN fallback:`, err?.message || err);
    }
  }

  if (token) {
    try {
      // Fetch Alt=media (Binary Content) directly and inspect Content-Type header
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const mimeType = response.headers.get("content-type") || "image/jpeg";
        const arrayBuffer = await response.arrayBuffer();
        return {
          data: Buffer.from(arrayBuffer),
          mimeType
        };
      }
    } catch (err: any) {
      console.warn(`[Google Drive] Authenticated fetch for file ${fileId} failed, trying public CDN fallback:`, err?.message || err);
    }
  }

  // Fallback: Download via public CDN links
  const publicUrls = [
    `https://lh3.googleusercontent.com/d/${fileId}`,
    `https://drive.google.com/uc?export=view&id=${fileId}`
  ];

  for (const url of publicUrls) {
    try {
      const pubRes = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      });
      if (pubRes.ok) {
        const contentType = pubRes.headers.get("content-type") || "image/jpeg";
        if (contentType.includes("text/html")) {
          continue;
        }
        const arrayBuffer = await pubRes.arrayBuffer();
        if (arrayBuffer.byteLength > 100) {
          return {
            data: Buffer.from(arrayBuffer),
            mimeType: contentType
          };
        }
      }
    } catch (err) {}
  }

  throw new Error(`[Google Drive] Could not download file ${fileId} via Service Account, OAuth, or public CDN link`);
}
