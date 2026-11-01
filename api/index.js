// server/index.ts
import express2 from "express";
import path2 from "path";

// server/config/env.ts
import dotenv from "dotenv";
dotenv.config({ override: true });
function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(", ")}`);
    console.error("Please set these in your .env file or Vercel Environment Variables.");
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
  const googleDriveVars = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_DRIVE_ROOT_FOLDER_LINK"];
  const missingGoogle = googleDriveVars.filter((key) => !process.env[key]);
  if (missingGoogle.length > 0) {
    console.warn(`[Google Drive] \u26A0\uFE0F Google Drive integration is disabled. Missing configuration: ${missingGoogle.join(", ")}`);
  } else {
    console.log("[Google Drive] \u2705 Integration credentials configured!");
  }
}
var ENV = {
  get SUPABASE_URL() {
    return process.env.SUPABASE_URL;
  },
  get SUPABASE_SERVICE_KEY() {
    return process.env.SUPABASE_SERVICE_KEY;
  },
  get GEMINI_API_KEY() {
    return process.env.GEMINI_API_KEY;
  },
  get NODE_ENV() {
    return process.env.NODE_ENV || "development";
  },
  get PORT() {
    return Number(process.env.PORT) || 3e3;
  },
  get GOOGLE_SERVICE_ACCOUNT_EMAIL() {
    return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  },
  get GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY() {
    return process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  },
  get GOOGLE_DRIVE_ROOT_FOLDER_LINK() {
    const raw = process.env.GOOGLE_DRIVE_ROOT_FOLDER_LINK;
    if (!raw || raw.includes("your-folder-id")) {
      return "https://drive.google.com/drive/folders/1GLcxUIo3asg_RYAfh589bPLGEC1hchye?usp=drive_link";
    }
    return raw;
  }
};

// server/config/supabase.ts
import { createClient } from "@supabase/supabase-js";
var supabase = createClient(
  ENV.SUPABASE_URL || "https://placeholder.supabase.co",
  ENV.SUPABASE_SERVICE_KEY || "placeholder-key",
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);
var dbConnected = false;
var dbSyncError = "";
async function testSupabaseConnection(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.from("users").select("id").limit(1);
      if (error) throw error;
      dbConnected = true;
      dbSyncError = "";
      console.log("[Supabase] \u2705 Connected successfully!");
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      dbSyncError = errMsg || "Failed to connect to Supabase";
      if (attempt < retries) {
        console.warn(`[Supabase] \u26A0\uFE0F Connection attempt ${attempt}/${retries} failed: ${dbSyncError}. Retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2e3));
      } else {
        dbConnected = false;
        console.error(`[Supabase] \u274C Connection failed after ${retries} attempts: ${dbSyncError}`);
      }
    }
  }
  return false;
}

// server/middleware/security.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
function applySecurityMiddleware(app2) {
  app2.set("trust proxy", 1);
  app2.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app2.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));
  app2.use(express.json({ limit: "10mb" }));
}
var authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 30,
  // Max 30 attempts per 15 minutes per IP
  message: { error: "\u0E04\u0E38\u0E13\u0E17\u0E33\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E39\u0E49\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E16\u0E35\u0E48\u0E40\u0E01\u0E34\u0E19\u0E44\u0E1B \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D 15 \u0E19\u0E32\u0E17\u0E35\u0E01\u0E48\u0E2D\u0E19\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E48\u0E30" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false
});

// server/services/googleDriveService.ts
import crypto from "crypto";
var tokenCache = null;
var folderIdCache = /* @__PURE__ */ new Map();
function parseFolderId(urlOrId) {
  if (!urlOrId) return "";
  const trimmed = urlOrId.trim();
  if (trimmed.includes("drive.google.com")) {
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : trimmed;
  }
  return trimmed;
}
function formatPrivateKey(rawKey) {
  if (!rawKey) return "";
  let key = rawKey.trim();
  while (key.startsWith('"') && key.endsWith('"') || key.startsWith("'") && key.endsWith("'") || key.startsWith("`") && key.endsWith("`")) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\\n/g, "\n").replace(/\\r/g, "");
  const rsaMatch = key.match(/-----BEGIN RSA PRIVATE KEY-----([\s\S]*?)-----END RSA PRIVATE KEY-----/);
  if (rsaMatch) {
    const body = rsaMatch[1].replace(/\s+/g, "");
    const formattedBody = body.match(/.{1,64}/g)?.join("\n") || body;
    return `-----BEGIN RSA PRIVATE KEY-----
${formattedBody}
-----END RSA PRIVATE KEY-----
`;
  }
  const pkcs8Match = key.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (pkcs8Match) {
    const body = pkcs8Match[1].replace(/\s+/g, "");
    const formattedBody = body.match(/.{1,64}/g)?.join("\n") || body;
    return `-----BEGIN PRIVATE KEY-----
${formattedBody}
-----END PRIVATE KEY-----
`;
  }
  const cleanBody = key.replace(/\s+/g, "");
  if (cleanBody.length > 100) {
    const formattedBody = cleanBody.match(/.{1,64}/g)?.join("\n") || cleanBody;
    return `-----BEGIN PRIVATE KEY-----
${formattedBody}
-----END PRIVATE KEY-----
`;
  }
  return key;
}
function generateJwt(email, privateKey) {
  const header = { alg: "RS256", typ: "JWT" };
  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const formattedKey = formatPrivateKey(privateKey);
  if (formattedKey.length < 200) {
    throw new Error("\u0E04\u0E35\u0E22\u0E4C GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY \u0E43\u0E19 .env \u0E44\u0E21\u0E48\u0E2A\u0E21\u0E1A\u0E39\u0E23\u0E13\u0E4C \u0E01\u0E23\u0E38\u0E13\u0E32\u0E43\u0E0A\u0E49\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E02\u0E2D\u0E07\u0E17\u0E48\u0E32\u0E19\u0E1C\u0E48\u0E32\u0E19\u0E1B\u0E38\u0E48\u0E21\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E34\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 Google Drive \u0E41\u0E17\u0E19\u0E04\u0E48\u0E30");
  }
  const now = Math.floor(Date.now() / 1e3);
  const iat = now - 60;
  const claimSet = {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: iat + 3600,
    // 1 hour expiration from iat
    iat
  };
  const base64ClaimSet = Buffer.from(JSON.stringify(claimSet)).toString("base64url");
  try {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${base64Header}.${base64ClaimSet}`);
    const signature = sign.sign(formattedKey, "base64url");
    return `${base64Header}.${base64ClaimSet}.${signature}`;
  } catch (err) {
    console.error("[Google OAuth] RSA signing failed:", err.message);
    throw new Error(`Service Account Key \u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 (${err.message}) \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E34\u0E19\u0E1C\u0E48\u0E32\u0E19\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E02\u0E2D\u0E07\u0E17\u0E48\u0E32\u0E19\u0E41\u0E17\u0E19\u0E04\u0E48\u0E30`);
  }
}
async function getAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 6e4) {
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
    const data = await response.json();
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1e3
    };
    return data.access_token;
  } catch (err) {
    console.warn("[Google OAuth] Service Account access token unavailable:", err?.message || err);
    throw err;
  }
}
async function findFolder(folderName, parentFolderId, customToken) {
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
    const data = await response.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  } catch (err) {
    console.warn("[Google Drive] Find folder exception:", err?.message);
    return null;
  }
}
async function createFolder(folderName, parentFolderId, customToken) {
  const token = customToken || await getAccessToken();
  const metadata = {
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
      } catch {
      }
      throw new Error(`[Google Drive] \u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C "${folderName}" \u0E44\u0E14\u0E49: ${cleanMsg}`);
    }
  }
  const data = await response.json();
  return data.id;
}
async function getOrCreateFolder(folderPath, parentFolderId, customToken) {
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
          console.log(`[Google Drive] Created folder structure: ${folderName} under ${currentParentId || "root"}`);
        } catch (err) {
          console.warn(`[Google Drive] Failed creating folder "${folderName}" under ${currentParentId}, trying fallback at root:`, err?.message);
          foundId = await createFolder(folderName, void 0, customToken);
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
async function uploadFile(base64Data, filename, folderId, customToken) {
  const token = customToken || await getAccessToken();
  const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : "image/jpeg";
  const base64Body = match ? match[2] : base64Data;
  const binaryData = Buffer.from(base64Body, "base64");
  const boundary = "-------314159265358979323846";
  const delimiter = `\r
--${boundary}\r
`;
  const closeDelim = `\r
--${boundary}--`;
  const metadata = {
    name: filename,
    parents: [folderId]
  };
  const buildBody = (meta) => Buffer.concat([
    Buffer.from(delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + delimiter),
    Buffer.from(`Content-Type: ${mimeType}\r
\r
`),
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
      } catch {
      }
      throw new Error(`[Google Drive] \u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E1F\u0E25\u0E4C "${filename}" \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08: ${cleanMsg}`);
    }
  }
  const uploadResult = await response.json();
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
    } catch (e) {
    }
  }
  return uploadResult;
}
async function downloadFile(fileId, customToken) {
  let token = customToken || null;
  if (!token) {
    try {
      token = await getAccessToken();
    } catch (err) {
      console.warn(`[Google Drive] Service Account token unavailable for ${fileId}, trying public/direct CDN fallback:`, err?.message || err);
    }
  }
  if (token) {
    try {
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
    } catch (err) {
      console.warn(`[Google Drive] Authenticated fetch for file ${fileId} failed, trying public CDN fallback:`, err?.message || err);
    }
  }
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
    } catch (err) {
    }
  }
  throw new Error(`[Google Drive] Could not download file ${fileId} via Service Account, OAuth, or public CDN link`);
}

// server/utils/thaiMonths.ts
function getMonthThaiName(m) {
  const months = ["", "\u0E21\u0E01\u0E23\u0E32\u0E04\u0E21", "\u0E01\u0E38\u0E21\u0E20\u0E32\u0E1E\u0E31\u0E19\u0E18\u0E4C", "\u0E21\u0E35\u0E19\u0E32\u0E04\u0E21", "\u0E40\u0E21\u0E29\u0E32\u0E22\u0E19", "\u0E1E\u0E24\u0E29\u0E20\u0E32\u0E04\u0E21", "\u0E21\u0E34\u0E16\u0E38\u0E19\u0E32\u0E22\u0E19", "\u0E01\u0E23\u0E01\u0E0E\u0E32\u0E04\u0E21", "\u0E2A\u0E34\u0E07\u0E2B\u0E32\u0E04\u0E21", "\u0E01\u0E31\u0E19\u0E22\u0E32\u0E22\u0E19", "\u0E15\u0E38\u0E25\u0E32\u0E04\u0E21", "\u0E1E\u0E24\u0E28\u0E08\u0E34\u0E01\u0E32\u0E22\u0E19", "\u0E18\u0E31\u0E19\u0E27\u0E32\u0E04\u0E21"];
  return months[m] || String(m);
}
function getCurrentBuddhistYear() {
  return (/* @__PURE__ */ new Date()).getFullYear() + 543;
}
function getCurrentMonth() {
  return (/* @__PURE__ */ new Date()).getMonth() + 1;
}

// server/utils/idGenerator.ts
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// server/services/imageService.ts
async function determineTargetFolderAndFilename(path3, body) {
  const rootLink = ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK || "";
  const rootFolderId = parseFolderId(rootLink);
  let targetFolderId = rootFolderId;
  let filename = `image_${Date.now()}_${Math.floor(Math.random() * 1e3)}.jpg`;
  if (!rootFolderId) {
    return { folderId: "", filename };
  }
  try {
    if ((path3 === "/api/payments/submit" || path3 === "/api/payments/upload-slip-admin") && body) {
      const { billId, userId } = body;
      const { data: bill } = await supabase.from("monthly_bills").select("month, year").eq("id", billId).single();
      const { data: user } = await supabase.from("users").select("full_name, student_id").eq("id", userId).single();
      const month = bill?.month || getCurrentMonth();
      const year = bill?.year || getCurrentBuddhistYear();
      const studentId = user?.student_id || "unknown";
      const fullName = user?.full_name || "member";
      const cleanName = fullName.replace(/[\s\/\\]+/g, "_");
      filename = `\u0E2A\u0E25\u0E34\u0E1B_${studentId}_${cleanName}.jpg`;
      const folderPath = ["\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19", `\u0E1B\u0E35 \u0E1E.\u0E28. ${year}`, `\u0E40\u0E14\u0E37\u0E2D\u0E19 ${String(month).padStart(2, "0")}`];
      targetFolderId = await getOrCreateFolder(folderPath, rootFolderId);
    } else if (path3 && path3.startsWith("/api/market/") && body) {
      const { marketWeekId, itemName } = body;
      const { data: week } = await supabase.from("market_weeks").select("week_date, team_name").eq("id", marketWeekId).single();
      const weekDate = week?.week_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const teamName = week?.team_name || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E08\u0E33\u0E2B\u0E19\u0E48\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32";
      const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");
      if (path3.includes("/advance/approve")) {
        filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32.jpg`;
      } else if (path3.includes("/advance-additional/approve")) {
        filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21.jpg`;
      } else if (itemName) {
        const cleanItemName = itemName.replace(/[\s\/\\]+/g, "_");
        filename = `\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08_\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32_${cleanItemName}.jpg`;
      } else {
        filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E15\u0E25\u0E32\u0E14_${Date.now()}.jpg`;
      }
      const folderPath = ["\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18", `\u0E23\u0E2D\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${weekDate}_${cleanTeam}`];
      targetFolderId = await getOrCreateFolder(folderPath, rootFolderId);
    } else if (path3 && path3.startsWith("/api/activities/") && body) {
      const { activityId, title, source } = body;
      const { data: act } = await supabase.from("activities").select("title, document_urls").eq("id", activityId).single();
      const actTitle = act?.title || title || "\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21";
      const cleanTitle = actTitle.replace(/[\s\/\\]+/g, "_");
      const docUrls = act?.document_urls || [];
      const driveFolderUrl = docUrls.find((url) => url.includes("drive.google.com/drive/folders/"));
      if (driveFolderUrl) {
        const customFolderId = parseFolderId(driveFolderUrl);
        if (customFolderId) {
          targetFolderId = customFolderId;
          console.log(`[Google Drive] Using activity specific folder: ${customFolderId}`);
        }
      } else {
        const folderPath = ["\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E41\u0E25\u0E30\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23_${cleanTitle}`];
        targetFolderId = await getOrCreateFolder(folderPath, rootFolderId);
      }
      if (path3.includes("/external-income/propose")) {
        const cleanSource = (source || "\u0E1C\u0E39\u0E49\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19").replace(/[\s\/\\]+/g, "_");
        filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19_${cleanSource}.jpg`;
      } else if (path3.includes("/settle/propose")) {
        filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E40\u0E07\u0E34\u0E19\u0E17\u0E2D\u0E19\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D.jpg`;
      } else if (path3.includes("/budget/request")) {
        const cleanReqTitle = (title || "\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E40\u0E1A\u0E34\u0E01\u0E08\u0E48\u0E32\u0E22").replace(/[\s\/\\]+/g, "_");
        filename = `\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08_\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01_${cleanReqTitle}.jpg`;
      } else {
        filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21_${Date.now()}.jpg`;
      }
    } else {
      const folderPath = ["\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"];
      targetFolderId = await getOrCreateFolder(folderPath, rootFolderId);
    }
  } catch (err) {
    console.error("[Google Drive Path Resolver] Failed to resolve path:", err);
  }
  return { folderId: targetFolderId, filename };
}
async function extractAndSaveImage(base64Str, path3, body) {
  if (!base64Str || typeof base64Str !== "string") return base64Str;
  if (!base64Str.startsWith("data:image/")) return base64Str;
  const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E25\u0E34\u0E1B\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E04\u0E48\u0E30");
  }
  const mimeType = match[1];
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error("\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E\u0E2A\u0E25\u0E34\u0E1B\u0E15\u0E23\u0E30\u0E01\u0E39\u0E25 JPG, PNG, \u0E41\u0E25\u0E30 WEBP \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22\u0E04\u0E48\u0E30");
  }
  const rawSizeBytes = base64Str.length * 0.75;
  if (rawSizeBytes > 5 * 1024 * 1024) {
    throw new Error("\u0E02\u0E19\u0E32\u0E14\u0E44\u0E1F\u0E25\u0E4C\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E\u0E2A\u0E25\u0E34\u0E1B\u0E2B\u0E49\u0E32\u0E21\u0E40\u0E01\u0E34\u0E19 5MB \u0E04\u0E48\u0E30");
  }
  const imgId = generateId("img");
  const driveConfigured = ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL && ENV.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK;
  if (driveConfigured) {
    try {
      const { folderId, filename } = await determineTargetFolderAndFilename(path3, body);
      if (folderId) {
        console.log(`[Google Drive] Uploading ${filename} to folder ${folderId}...`);
        const driveResult = await uploadFile(base64Str, filename, folderId);
        const { error } = await supabase.from("images").insert({
          id: imgId,
          base64: `google_drive:${driveResult.id}`
        });
        if (error) throw error;
        console.log(`[Google Drive] \u2705 Successfully saved image reference ${imgId} linking to Drive File ${driveResult.id}`);
        return `/api/images/${imgId}`;
      }
    } catch (err) {
      console.warn("[Google Drive] Upload failed. Falling back to local storage:", err.message);
    }
  }
  try {
    const { error } = await supabase.from("images").insert({ id: imgId, base64: base64Str });
    if (error) throw error;
    console.log(`[Supabase] Saved image ${imgId} locally (Fallback)`);
  } catch (err) {
    console.error("[Supabase] Failed to save image locally:", err);
    throw new Error("\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E25\u0E34\u0E1B\u0E02\u0E36\u0E49\u0E19\u0E23\u0E30\u0E1A\u0E1A Cloud \u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E48\u0E30");
  }
  return `/api/images/${imgId}`;
}
async function extractImagesFromPayload(obj, path3, body) {
  if (obj === null || obj === void 0) return obj;
  if (typeof obj === "string") {
    if (obj.startsWith("data:image/")) return await extractAndSaveImage(obj, path3, body);
    if (obj.startsWith("SLIP_URL:data:image/")) {
      const parts = obj.split("|NOTE:");
      const rawBase64 = parts[0].replace("SLIP_URL:", "");
      const notePart = parts[1] || "";
      const savedImageUrl = await extractAndSaveImage(rawBase64, path3, body);
      return `SLIP_URL:${savedImageUrl}|NOTE:${notePart}`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    const newArr = [];
    for (const item of obj) {
      newArr.push(await extractImagesFromPayload(item, path3, body));
    }
    return newArr;
  }
  if (typeof obj === "object") {
    const newObj = {};
    const record = obj;
    for (const key of Object.keys(record)) {
      newObj[key] = await extractImagesFromPayload(record[key], path3, body);
    }
    return newObj;
  }
  return obj;
}

// server/middleware/broadcastHook.ts
var sseClients = [];
var supabaseRealtimeChannel = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabaseRealtimeChannel = supabase.channel("app-updates");
    supabaseRealtimeChannel.subscribe((status) => {
      console.log(`[Supabase Realtime] Server subscription status: ${status}`);
    });
  }
} catch (err) {
  console.warn("[Supabase Realtime] Could not subscribe channel at init:", err);
}
function broadcastStateUpdate() {
  if (supabaseRealtimeChannel) {
    supabaseRealtimeChannel.send({
      type: "broadcast",
      event: "state_changed",
      payload: { timestamp: Date.now() }
    }).then((res) => {
      console.log("[Supabase Realtime] Broadcast sent successfully:", res);
    }).catch((err) => {
      console.error("[Supabase Realtime] Broadcast error:", err);
    });
  }
  const message = `data: ${JSON.stringify({ type: "state_changed", timestamp: Date.now() })}

`;
  sseClients.forEach((client) => {
    try {
      client.res.write(message);
    } catch (e) {
    }
  });
}
var broadcastDebounceTimer = null;
var NON_MUTATING_PATHS = [
  "/auth/login",
  "/auth/email-login",
  "/realtime-stream",
  "/supabase-config",
  "/gemini/chat",
  "/system/generate-summary",
  "/system/sync-cloud",
  "/system/log-error"
];
function applyBroadcastHook(app2) {
  app2.use((req, res, next) => {
    res.on("finish", () => {
      if (req.method !== "GET" && req.path.startsWith("/api/") && res.statusCode >= 200 && res.statusCode < 300) {
        const isNonMutating = NON_MUTATING_PATHS.some((p) => req.path.includes(p));
        if (!isNonMutating) {
          if (process.env.VERCEL) {
            broadcastStateUpdate();
          } else {
            if (broadcastDebounceTimer) {
              clearTimeout(broadcastDebounceTimer);
            }
            broadcastDebounceTimer = setTimeout(() => {
              broadcastDebounceTimer = null;
              broadcastStateUpdate();
            }, 150);
          }
        }
      }
    });
    next();
  });
}
function applyCacheControl(app2) {
  app2.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
}
function applyImageExtractor(app2) {
  app2.use(async (req, res, next) => {
    if (req.body && req.method !== "GET") {
      try {
        req.body = await extractImagesFromPayload(req.body, req.path, req.body);
      } catch (err) {
        console.error("Failed to extract images from request payload:", err);
        return res.status(400).json({ error: err?.message || "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25\u0E44\u0E1F\u0E25\u0E4C\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E\u0E2A\u0E25\u0E34\u0E1B\u0E44\u0E14\u0E49\u0E04\u0E48\u0E30" });
      }
    }
    next();
  });
}
function handleRealtimeStream(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const clientId = `${Date.now()}_${Math.floor(Math.random() * 1e3)}`;
  if (process.env.VERCEL) {
    res.write(`data: ${JSON.stringify({ type: "connected", clientId, serverless: true })}

`);
    res.end();
    return;
  }
  const newClient = { id: clientId, res };
  sseClients.push(newClient);
  res.write(`data: ${JSON.stringify({ type: "connected", clientId })}

`);
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(`: keep-alive

`);
    } catch (e) {
    }
  }, 2e4);
  req.on("close", () => {
    clearInterval(keepAliveInterval);
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
}

// server/middleware/errorHandler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
function centralizedErrorHandler(err, req, res, next) {
  console.error("[Centralized Server Error Handler] Caught unhandled route error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "\u0E40\u0E01\u0E34\u0E14\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14\u0E20\u0E32\u0E22\u0E43\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E04\u0E48\u0E30",
    details: process.env.NODE_ENV !== "production" ? err.stack : void 0
  });
}

// server/routes/auth.ts
import { Router } from "express";

// server/utils/camelCase.ts
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
function convertKeysToCamel(obj) {
  if (obj === null || obj === void 0) return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToCamel);
  if (typeof obj !== "object") return obj;
  const result = {};
  const record = obj;
  for (const key of Object.keys(record)) {
    const camelKey = toCamelCase(key);
    const value = record[key];
    if (Array.isArray(value)) {
      result[camelKey] = value.map((item) => typeof item === "object" && item !== null ? convertKeysToCamel(item) : item);
    } else if (typeof value === "object" && value !== null) {
      result[camelKey] = convertKeysToCamel(value);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

// server/services/notificationService.ts
async function createNotification(userId, title, message, type, referenceId, referenceType) {
  const newNot = {
    id: generateId("not"),
    user_id: userId,
    title,
    message,
    type,
    reference_id: referenceId,
    reference_type: referenceType,
    is_read: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { error } = await supabase.from("notifications").insert(newNot);
  if (error) console.error("[Notification] Failed:", error.message);
}
async function createNotificationsBulk(userIds, title, message, type, referenceId, referenceType) {
  if (!userIds || userIds.length === 0) return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const rows = userIds.map((userId) => ({
    id: generateId("not"),
    user_id: userId,
    title,
    message,
    type,
    reference_id: referenceId,
    reference_type: referenceType,
    is_read: false,
    created_at: now
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("[Notification Bulk] Failed:", error.message);
}

// server/services/logService.ts
async function writeLog(userId, action, targetType, targetId, details) {
  const newLog = {
    id: generateId("log"),
    user_id: userId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details || {},
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const { error } = await supabase.from("logs").insert(newLog);
  if (error) console.error("[Log] Failed to write log:", error.message);
}

// server/utils/crypto.ts
import crypto2 from "crypto";
var ITERATIONS = 1e4;
var KEY_LENGTH = 64;
var DIGEST = "sha512";
function hashPassword(password) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const hash = crypto2.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}
function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith("pbkdf2:")) {
    return password === storedHash;
  }
  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const computedHash = crypto2.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return crypto2.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computedHash, "hex"));
}

// server/routes/auth.ts
var router = Router();
function stripPassword(user) {
  const { password: _, ...safeUser } = user;
  return safeUser;
}
router.post("/auth/login", authRateLimiter, asyncHandler(async (req, res) => {
  const { studentId, password } = req.body;
  if (!studentId || !password) {
    return res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32\u0E41\u0E25\u0E30\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19" });
  }
  const trimmedId = String(studentId).trim();
  const { data: candidates, error } = await supabase.from("users").select("*").or(`student_id.eq.${trimmedId},student_id.like.%${trimmedId}`);
  if (error) return res.status(500).json({ error: error.message });
  const user = (candidates || []).find((u) => {
    const last3Digits = u.student_id ? u.student_id.slice(-3) : "";
    const isIdMatch = trimmedId === last3Digits || trimmedId === u.student_id;
    return isIdMatch && verifyPassword(password, u.password || "");
  });
  if (!user) {
    return res.status(401).json({ error: "\u0E23\u0E2B\u0E31\u0E2A\u0E17\u0E49\u0E32\u0E22\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" });
  }
  if (user.password && !user.password.startsWith("pbkdf2:")) {
    const hashed = hashPassword(password);
    await supabase.from("users").update({ password: hashed, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", user.id);
    user.password = hashed;
    console.log(`[Auth] Auto-migrated user ${user.id} to PBKDF2 hashed password.`);
  }
  res.json({ success: true, user: convertKeysToCamel(stripPassword(user)) });
}));
router.post("/auth/email-login", authRateLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E21\u0E2B\u0E32\u0E25\u0E31\u0E22\u0E43\u0E19\u0E01\u0E32\u0E23\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E04\u0E48\u0E30" });
  const { data: users } = await supabase.from("users").select("*").ilike("email", email.trim());
  const user = users && users.length > 0 ? users[0] : null;
  if (!user) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E2B\u0E49\u0E2D\u0E07\u0E04\u0E48\u0E30 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E1B\u0E49\u0E2D\u0E19\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E41\u0E1A\u0E1A\u0E1B\u0E01\u0E15\u0E34 \u0E41\u0E25\u0E49\u0E27\u0E40\u0E02\u0E49\u0E32\u0E44\u0E1B\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E21\u0E2B\u0E32\u0E25\u0E31\u0E22\u0E02\u0E2D\u0E07\u0E17\u0E48\u0E32\u0E19\u0E17\u0E35\u0E48\u0E40\u0E21\u0E19\u0E39\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27\u0E01\u0E48\u0E2D\u0E19\u0E19\u0E30\u0E04\u0E30" });
  res.json({ success: true, user: convertKeysToCamel(stripPassword(user)) });
}));
router.post("/auth/change-password", authRateLimiter, asyncHandler(async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19" });
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19" });
  if (!verifyPassword(oldPassword, user.password || "")) return res.status(400).json({ error: "\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" });
  const hashedNew = hashPassword(newPassword);
  await supabase.from("users").update({ password: hashedNew, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", userId);
  res.json({ success: true, message: "\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27" });
}));
router.post("/auth/forgot-password", authRateLimiter, asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E25\u0E02 3 \u0E15\u0E31\u0E27\u0E17\u0E49\u0E32\u0E22" });
  const trimmedId = String(studentId).trim();
  const { data: candidates } = await supabase.from("users").select("*").or(`student_id.eq.${trimmedId},student_id.like.%${trimmedId}`);
  const user = (candidates || []).find((u) => {
    const last3Digits = u.student_id ? u.student_id.slice(-3) : "";
    return trimmedId === last3Digits || trimmedId === u.student_id;
  });
  if (!user) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32\u0E02\u0E2D\u0E07\u0E17\u0E48\u0E32\u0E19\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A" });
  const { data: existing } = await supabase.from("password_resets").select("*").eq("user_id", user.id).eq("status", "pending");
  if (existing && existing.length > 0) {
    return res.json({ success: true, message: "\u0E17\u0E48\u0E32\u0E19\u0E44\u0E14\u0E49\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E42\u0E1B\u0E23\u0E14\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E2B\u0E49\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E04\u0E48\u0E30" });
  }
  const newRequest = {
    id: generateId("reset"),
    user_id: user.id,
    student_id: user.student_id,
    full_name: user.full_name,
    classroom: user.classroom || "\u0E2B\u0E49\u0E2D\u0E07 1",
    status: "pending",
    requested_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await supabase.from("password_resets").insert(newRequest);
  const { data: treasurers } = await supabase.from("users").select("id").in("role", ["treasurer", "committee", "leader"]);
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u{1F514} \u0E04\u0E33\u0E02\u0E2D\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E43\u0E2B\u0E21\u0E48", `\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E19 ${user.full_name} (${user.student_id}) \u0E44\u0E14\u0E49\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B\u0E40\u0E1B\u0E47\u0E19\u0E04\u0E48\u0E32\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19`, "petition");
  res.json({ success: true, message: "\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30 \u0E42\u0E1B\u0E23\u0E14\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E17\u0E33\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D\u0E19\u0E30\u0E04\u0E30" });
}));
router.post("/treasurer/resolve-reset-password", asyncHandler(async (req, res) => {
  const { resetId, treasurerId } = req.body;
  if (!resetId || !treasurerId) return res.status(400).json({ error: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19" });
  const { data: actingUser } = await supabase.from("users").select("*").eq("id", treasurerId).single();
  if (!actingUser || actingUser.role !== "treasurer") return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19)" });
  const { data: request } = await supabase.from("password_resets").select("*").eq("id", resetId).single();
  if (!request) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E19\u0E35\u0E49" });
  if (request.status === "approved" || request.status === "resolved") {
    return res.json({ success: true, message: "\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E40\u0E1B\u0E47\u0E19 123456 \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30!" });
  }
  const hashedDefault = hashPassword("123456");
  await supabase.from("users").update({ password: hashedDefault, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", request.user_id);
  await supabase.from("password_resets").update({ status: "approved", resolved_at: (/* @__PURE__ */ new Date()).toISOString(), resolved_by: treasurerId }).eq("id", resetId);
  await createNotification(request.user_id, "\u{1F511} \u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08", "\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E44\u0E14\u0E49\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E02\u0E2D\u0E07\u0E17\u0E48\u0E32\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B\u0E40\u0E1B\u0E47\u0E19 '123456' \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30 \u0E42\u0E1B\u0E23\u0E14\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E41\u0E25\u0E30\u0E23\u0E35\u0E1A\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22\u0E19\u0E30\u0E04\u0E30", "system");
  await writeLog(treasurerId, "reset_user_password", "user", request.user_id, { message: `\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01 ${actingUser.full_name} \u0E44\u0E14\u0E49\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E02\u0E2D\u0E07 ${request.full_name} \u0E01\u0E25\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19 123456` });
  res.json({ success: true, message: "\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E40\u0E1B\u0E47\u0E19 123456 \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30!" });
}));
var auth_default = router;

// server/routes/system.ts
import { Router as Router2 } from "express";

// server/services/stateLoader.ts
async function loadFullState() {
  const [
    { data: users },
    { data: settingsArr },
    { data: monthlyBills },
    { data: payments },
    { data: transactions },
    { data: marketWeeks },
    { data: marketItems },
    { data: marketTeams },
    { data: activities },
    { data: budgetRequests },
    { data: announcements },
    { data: notifications },
    { data: logs },
    { data: petitions },
    { data: passwordResets }
  ] = await Promise.all([
    supabase.from("users").select("*").order("student_id"),
    supabase.from("settings").select("*"),
    supabase.from("monthly_bills").select("*").order("created_at", { ascending: false }),
    supabase.from("payments").select("*").order("created_at", { ascending: false }),
    supabase.from("transactions").select("*").order("created_at", { ascending: false }),
    supabase.from("market_weeks").select("*").order("created_at", { ascending: false }),
    supabase.from("market_items").select("*"),
    supabase.from("market_teams").select("*"),
    supabase.from("activities").select("*").order("created_at", { ascending: false }),
    supabase.from("budget_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }),
    supabase.from("logs").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("petitions").select("*").order("created_at", { ascending: false }),
    supabase.from("password_resets").select("*").order("requested_at", { ascending: false })
  ]);
  const settings = settingsArr && settingsArr.length > 0 ? convertKeysToCamel(settingsArr[0]) : { fundName: "\u0E40\u0E07\u0E34\u0E19\u0E40\u0E01\u0E47\u0E1ATns \u0E23\u0E38\u0E48\u0E1906", monthlyFee: 150, promptpayNumber: "", promptpayName: "", promptpayQrUrl: "", bankName: "\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E40\u0E1E\u0E22\u0E4C" };
  if (settings.id) delete settings.id;
  const safeUsers = (users || []).map(({ password, ...rest }) => rest);
  return {
    users: convertKeysToCamel(safeUsers),
    settings,
    monthlyBills: convertKeysToCamel(monthlyBills || []),
    payments: convertKeysToCamel(payments || []),
    transactions: convertKeysToCamel(transactions || []),
    marketWeeks: convertKeysToCamel(marketWeeks || []),
    marketItems: convertKeysToCamel(marketItems || []),
    marketTeams: convertKeysToCamel(marketTeams || []),
    activities: convertKeysToCamel(activities || []),
    budgetRequests: convertKeysToCamel(budgetRequests || []),
    announcements: convertKeysToCamel(announcements || []),
    notifications: convertKeysToCamel(notifications || []),
    logs: convertKeysToCamel(logs || []),
    petitions: convertKeysToCamel(petitions || []),
    passwordResets: convertKeysToCamel(passwordResets || [])
  };
}

// server/data/seedStudents.ts
var REAL_STUDENTS = [
  // ห้อง 1
  { idSuffix: "001", name: "\u0E19\u0E32\u0E22\u0E08\u0E31\u0E01\u0E23\u0E35 \u0E24\u0E17\u0E18\u0E34\u0E40\u0E19\u0E35\u0E22\u0E21", nickname: "\u0E08\u0E31\u0E01\u0E23\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "002", name: "\u0E19\u0E32\u0E22\u0E01\u0E24\u0E29\u0E13\u0E30 \u0E02\u0E27\u0E31\u0E0D\u0E17\u0E2D\u0E07", nickname: "\u0E19\u0E30", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "treasurer", pos: "\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01 (\u0E41\u0E2D\u0E14\u0E21\u0E34\u0E19)" },
  { idSuffix: "004", name: "\u0E19\u0E32\u0E22\u0E0A\u0E19\u0E34\u0E19\u0E17\u0E23\u0E4C \u0E21\u0E13\u0E35\u0E23\u0E31\u0E01\u0E29\u0E4C", nickname: "\u0E19\u0E19\u0E17\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "005", name: "\u0E19\u0E32\u0E22\u0E0A\u0E27\u0E01\u0E23\u0E13\u0E4C \u0E1B\u0E23\u0E30\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E19\u0E38\u0E49\u0E22", nickname: "\u0E01\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "006", name: "\u0E19\u0E32\u0E22\u0E13\u0E31\u0E10\u0E1E\u0E25 \u0E01\u0E27\u0E32\u0E07\u0E15\u0E38\u0E49\u0E07", nickname: "\u0E1E\u0E25", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "007", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E13\u0E31\u0E10\u0E2A\u0E34\u0E21\u0E32 \u0E28\u0E32\u0E25\u0E32\u0E08\u0E31\u0E19\u0E17\u0E23\u0E4C", nickname: "\u0E2A\u0E34\u0E21\u0E32", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "008", name: "\u0E19\u0E32\u0E22\u0E18\u0E19\u0E01\u0E24\u0E15\u0E15\u0E34\u0E01\u0E23\u0E13\u0E4C \u0E40\u0E23\u0E37\u0E2D\u0E07\u0E23\u0E31\u0E01\u0E29\u0E4C", nickname: "\u0E01\u0E24\u0E15", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "009", name: "\u0E19\u0E32\u0E22\u0E18\u0E35\u0E23\u0E20\u0E31\u0E17\u0E23\u0E4C \u0E2A\u0E07\u0E2A\u0E31\u0E07\u0E02\u0E4C", nickname: "\u0E20\u0E31\u0E17\u0E23\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "010", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E19\u0E23\u0E20\u0E31\u0E17\u0E23 \u0E2D\u0E32\u0E22\u0E38\u0E22\u0E37\u0E19", nickname: "\u0E20\u0E31\u0E17\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "011", name: "\u0E19\u0E32\u0E22\u0E19\u0E31\u0E19\u0E17\u0E30\u0E27\u0E31\u0E15\u0E23 \u0E19\u0E31\u0E19\u0E17\u0E30\u0E01\u0E38\u0E25", nickname: "\u0E27\u0E31\u0E15\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "012", name: "\u0E19\u0E32\u0E22\u0E13\u0E31\u0E10\u0E20\u0E31\u0E17\u0E23 \u0E40\u0E09\u0E25\u0E34\u0E21\u0E1A\u0E38\u0E0D", nickname: "\u0E20\u0E31\u0E17\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "013", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E1B\u0E23\u0E35\u0E22\u0E32\u0E20\u0E23\u0E13\u0E4C \u0E1B\u0E23\u0E30\u0E0A\u0E38\u0E21\u0E23\u0E31\u0E15\u0E19\u0E4C", nickname: "\u0E1B\u0E23\u0E35\u0E22\u0E32", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "014", name: "\u0E19\u0E32\u0E22\u0E1E\u0E31\u0E0A\u0E23\u0E0A\u0E31\u0E22 \u0E41\u0E2A\u0E07\u0E2A\u0E49\u0E2D\u0E07", nickname: "\u0E0A\u0E31\u0E22", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "015", name: "\u0E19\u0E32\u0E22\u0E27\u0E35\u0E23\u0E20\u0E31\u0E17\u0E23 \u0E40\u0E08\u0E37\u0E2D\u0E01\u0E42\u0E27\u0E49\u0E19", nickname: "\u0E20\u0E31\u0E17\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "016", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E2A\u0E38\u0E0A\u0E32\u0E19\u0E32\u0E16 \u0E1A\u0E38\u0E0D\u0E40\u0E01\u0E25\u0E35\u0E49\u0E22\u0E07", nickname: "\u0E19\u0E32\u0E16", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "017", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E2A\u0E38\u0E19\u0E34\u0E2A\u0E32 \u0E27\u0E31\u0E22\u0E22\u0E30", nickname: "\u0E2A\u0E32", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "018", name: "\u0E19\u0E32\u0E22\u0E2A\u0E38\u0E1E\u0E27\u0E34\u0E0A\u0E0D\u0E4C \u0E17\u0E2D\u0E07\u0E04\u0E33", nickname: "\u0E27\u0E34\u0E0A\u0E0D\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "019", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E2A\u0E38\u0E20\u0E32\u0E27\u0E14\u0E35 \u0E01\u0E32\u0E0D\u0E08\u0E19\u0E30\u0E1E\u0E31\u0E19\u0E18\u0E4C", nickname: "\u0E14\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "020", name: "\u0E19\u0E32\u0E22\u0E2A\u0E38\u0E23\u0E34\u0E22\u0E32 \u0E14\u0E27\u0E07\u0E2A\u0E38\u0E27\u0E23\u0E23\u0E13", nickname: "\u0E22\u0E32", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "021", name: "\u0E19\u0E32\u0E22\u0E18\u0E19\u0E32\u0E04\u0E34\u0E21 \u0E2A\u0E34\u0E07\u0E2B\u0E30\u0E1E\u0E25", nickname: "\u0E04\u0E34\u0E21", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "022", name: "\u0E19\u0E32\u0E22\u0E2D\u0E31\u0E29\u0E0E\u0E32\u0E27\u0E38\u0E18 \u0E17\u0E2D\u0E07\u0E2D\u0E48\u0E2D\u0E19", nickname: "\u0E27\u0E38\u0E18", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "023", name: "\u0E19\u0E32\u0E22\u0E2D\u0E32\u0E13\u0E32\u0E08\u0E31\u0E01\u0E23 \u0E14\u0E33\u0E14\u0E35", nickname: "\u0E08\u0E31\u0E01\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "024", name: "\u0E19\u0E32\u0E22\u0E2D\u0E32\u0E17\u0E34\u0E19\u0E31\u0E19\u0E17\u0E4C \u0E40\u0E17\u0E35\u0E22\u0E07\u0E14\u0E32\u0E2B\u0E4C", nickname: "\u0E19\u0E31\u0E19\u0E17\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "025", name: "\u0E19\u0E32\u0E22\u0E1B\u0E0F\u0E34\u0E27\u0E31\u0E15\u0E34 \u0E2B\u0E21\u0E31\u0E14\u0E1A\u0E32\u0E0B\u0E32", nickname: "\u0E27\u0E31\u0E15\u0E34", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "026", name: "\u0E19\u0E32\u0E22\u0E20\u0E23\u0E32\u0E14\u0E23 \u0E2A\u0E07\u0E48\u0E32\u0E27\u0E07\u0E04\u0E4C", nickname: "\u0E14\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "027", name: "\u0E19\u0E32\u0E22\u0E23\u0E1E\u0E34\u0E20\u0E31\u0E17\u0E23 \u0E1E\u0E34\u0E17\u0E31\u0E01\u0E2D\u0E31\u0E01\u0E29\u0E23", nickname: "\u0E23\u0E1E\u0E34", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "committee", pos: "\u0E1B\u0E23\u0E30\u0E18\u0E32\u0E19\u0E23\u0E38\u0E48\u0E19" },
  { idSuffix: "028", name: "\u0E19\u0E32\u0E22\u0E2A\u0E23\u0E27\u0E34\u0E28 \u0E17\u0E27\u0E35\u0E28\u0E23\u0E35", nickname: "\u0E27\u0E34\u0E28", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "029", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E2A\u0E34\u0E23\u0E34\u0E09\u0E31\u0E15\u0E23 \u0E1C\u0E32\u0E25\u0E34\u0E1E\u0E31\u0E12\u0E19\u0E4C", nickname: "\u0E09\u0E31\u0E15\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "030", name: "\u0E19\u0E32\u0E22\u0E2D\u0E31\u0E1A\u0E14\u0E38\u0E25\u0E40\u0E25\u0E4A\u0E32\u0E30 \u0E22\u0E35\u0E15\u0E32\u0E40\u0E2B", nickname: "\u0E40\u0E25\u0E4A\u0E32\u0E30", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "031", name: "\u0E19\u0E32\u0E22\u0E20\u0E32\u0E19\u0E38\u0E1E\u0E07\u0E28\u0E4C -", nickname: "\u0E1B\u0E2D\u0E19\u0E14\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "032", name: "\u0E19\u0E32\u0E22\u0E18\u0E20\u0E31\u0E17\u0E23 \u0E21\u0E31\u0E07\u0E04\u0E30\u0E21\u0E13\u0E35", nickname: "\u0E18\u0E20\u0E31\u0E17\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "033", name: "\u0E19\u0E32\u0E22\u0E40\u0E2A\u0E0F\u0E10\u0E27\u0E38\u0E12\u0E34 \u0E08\u0E38\u0E11\u0E32\u0E19\u0E31\u0E19\u0E17\u0E4C", nickname: "\u0E27\u0E38\u0E12\u0E34", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "034", name: "\u0E19\u0E32\u0E22\u0E2D\u0E32\u0E25\u0E35\u0E1F \u0E40\u0E08\u0E30\u0E40\u0E15\u0E30", nickname: "\u0E2D\u0E32\u0E25\u0E35\u0E1F", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "035", name: "\u0E19\u0E32\u0E22\u0E01\u0E32\u0E0B\u0E34\u0E21 \u0E40\u0E2A\u0E21\u0E2D\u0E20\u0E1E", nickname: "\u0E01\u0E32\u0E0B\u0E34\u0E21", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "036", name: "\u0E19\u0E32\u0E22\u0E2D\u0E23\u0E34\u0E22\u0E4C\u0E18\u0E31\u0E0A \u0E2A\u0E31\u0E07\u0E02\u0E4C\u0E42\u0E0A\u0E15\u0E34", nickname: "\u0E18\u0E31\u0E0A", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "037", name: "\u0E19\u0E32\u0E22\u0E1E\u0E35\u0E23\u0E30\u0E1E\u0E31\u0E12\u0E19\u0E4C \u0E40\u0E0B\u0E48\u0E07\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E34\u0E4C", nickname: "\u0E1E\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 1", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  // ห้อง 2
  { idSuffix: "038", name: "\u0E19\u0E32\u0E22\u0E2E\u0E39\u0E0B\u0E32\u0E19 \u0E27\u0E32\u0E21\u0E30", nickname: "\u0E0B\u0E32\u0E19", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "039", name: "\u0E19\u0E32\u0E22\u0E01\u0E23\u0E27\u0E34\u0E0A\u0E0D\u0E4C \u0E18\u0E23\u0E24\u0E17\u0E18\u0E34\u0E4C", nickname: "\u0E01\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "040", name: "\u0E19\u0E32\u0E22\u0E0B\u0E32\u0E1F\u0E39\u0E14\u0E34\u0E07 \u0E2B\u0E21\u0E30\u0E08\u0E34", nickname: "\u0E14\u0E34\u0E07", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "041", name: "\u0E19\u0E32\u0E22\u0E04\u0E13\u0E34\u0E28\u0E23 \u0E27\u0E23\u0E23\u0E13\u0E27\u0E34\u0E08\u0E34\u0E15\u0E23\u0E4C", nickname: "\u0E04\u0E34\u0E27", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "042", name: "\u0E19\u0E32\u0E22\u0E18\u0E35\u0E23\u0E27\u0E38\u0E12 \u0E19\u0E34\u0E40\u0E08\u0E23\u0E34\u0E0D", nickname: "\u0E27\u0E38\u0E12\u0E34", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "043", name: "\u0E19\u0E32\u0E22\u0E0A\u0E19\u0E30\u0E27\u0E23\u0E23\u0E13 \u0E19\u0E38\u0E27\u0E23\u0E23\u0E13", nickname: "\u0E17\u0E39\u0E48", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "044", name: "\u0E19\u0E32\u0E22\u0E0A\u0E32\u0E19\u0E19 \u0E1B\u0E25\u0E2D\u0E14\u0E41\u0E01\u0E49\u0E27", nickname: "\u0E40\u0E1F\u0E23\u0E21", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "045", name: "\u0E19\u0E32\u0E22\u0E23\u0E30\u0E1E\u0E35 \u0E1A\u0E34\u0E25\u0E25\u0E34\u0E2B\u0E21\u0E31\u0E14", nickname: "\u0E23\u0E30\u0E1E\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "050", name: "\u0E19\u0E32\u0E22\u0E18\u0E35\u0E23\u0E19\u0E31\u0E22 \u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16", nickname: "\u0E19\u0E31\u0E22", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "052", name: "\u0E19\u0E32\u0E22\u0E19\u0E24\u0E19\u0E32\u0E17 \u0E1E\u0E23\u0E2B\u0E21\u0E40\u0E14\u0E0A\u0E30", nickname: "\u0E19\u0E32\u0E17", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "054", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E1B\u0E32\u0E23\u0E34\u0E0A\u0E32\u0E15\u0E34 \u0E44\u0E17\u0E22\u0E19\u0E34\u0E22\u0E21", nickname: "\u0E0A\u0E32\u0E15\u0E34", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "055", name: "\u0E19\u0E32\u0E22\u0E1E\u0E07\u0E29\u0E4C\u0E28\u0E31\u0E01\u0E14\u0E34\u0E4C \u0E2A\u0E38\u0E01\u0E14\u0E33", nickname: "\u0E1E\u0E07\u0E29\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "059", name: "\u0E19\u0E32\u0E22\u0E21\u0E39\u0E2B\u0E30\u0E21\u0E30\u0E0A\u0E32\u0E40\u0E01\u0E23\u0E4C \u0E2A\u0E37\u0E2D\u0E41\u0E21", nickname: "\u0E40\u0E01\u0E23\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "062", name: "\u0E19\u0E32\u0E22\u0E27\u0E0A\u0E23\u0E1E\u0E25 \u0E41\u0E01\u0E49\u0E27\u0E41\u0E2A\u0E27\u0E07", nickname: "\u0E1E\u0E25", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "064", name: "\u0E19\u0E32\u0E22\u0E28\u0E23\u0E31\u0E19\u0E22\u0E4C \u0E2A\u0E21\u0E43\u0E2A\u0E22\u0E4C", nickname: "\u0E23\u0E31\u0E19", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "065", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E2A\u0E38\u0E27\u0E23\u0E23\u0E13\u0E32 \u0E40\u0E21\u0E37\u0E2D\u0E07\u0E40\u0E02\u0E35\u0E22\u0E27", nickname: "\u0E41\u0E1E\u0E07", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "072", name: "\u0E19\u0E32\u0E22\u0E18\u0E19\u0E20\u0E31\u0E17\u0E23 \u0E04\u0E31\u0E19\u0E18\u0E25\u0E34\u0E01\u0E32", nickname: "\u0E20\u0E31\u0E17\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "073", name: "\u0E19\u0E32\u0E22\u0E19\u0E1E\u0E23\u0E31\u0E15\u0E19\u0E4C \u0E02\u0E23\u0E34\u0E1A\u0E40\u0E2D\u0E21", nickname: "\u0E19\u0E1E", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "074", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E23\u0E14\u0E32\u0E21\u0E13\u0E35 \u0E1A\u0E31\u0E27\u0E2A\u0E21", nickname: "\u0E21\u0E13\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "075", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E1B\u0E20\u0E31\u0E2A\u0E28\u0E34\u0E23\u0E34 \u0E2A\u0E38\u0E27\u0E23\u0E23\u0E13\u0E1E\u0E07\u0E28\u0E4C", nickname: "\u0E42\u0E1A\u0E27\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "076", name: "\u0E19\u0E32\u0E22\u0E01\u0E34\u0E15\u0E15\u0E34\u0E28\u0E31\u0E01\u0E14\u0E34\u0E4C \u0E2A\u0E38\u0E14\u0E15\u0E23\u0E07", nickname: "\u0E28\u0E31\u0E01\u0E14\u0E34\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "077", name: "\u0E19\u0E32\u0E22\u0E10\u0E34\u0E15\u0E34\u0E01\u0E23 \u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E23\u0E31\u0E01\u0E29\u0E4C", nickname: "\u0E01\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "078", name: "\u0E19\u0E32\u0E22\u0E17\u0E31\u0E28\u0E19\u0E31\u0E22 \u0E2A\u0E21\u0E15\u0E31\u0E27", nickname: "\u0E17\u0E31\u0E28", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "079", name: "\u0E19\u0E32\u0E22\u0E18\u0E19\u0E1A\u0E14\u0E35 \u0E14\u0E35\u0E2A\u0E21\u0E38\u0E17\u0E23", nickname: "\u0E1A\u0E14\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "080", name: "\u0E19\u0E32\u0E22\u0E18\u0E19\u0E27\u0E31\u0E12\u0E19\u0E4C \u0E21\u0E32\u0E04\u0E07", nickname: "\u0E27\u0E31\u0E12\u0E19\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "081", name: "\u0E19\u0E32\u0E22\u0E18\u0E31\u0E0D\u0E40\u0E17\u0E1E \u0E40\u0E2B\u0E25\u0E47\u0E21\u0E1B\u0E32\u0E19", nickname: "\u0E40\u0E17\u0E1E", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "082", name: "\u0E19\u0E32\u0E22\u0E18\u0E35\u0E23\u0E30\u0E28\u0E31\u0E01\u0E14\u0E34\u0E4C \u0E42\u0E15\u0E4A\u0E30\u0E2B\u0E23\u0E35\u0E21", nickname: "\u0E0B\u0E2D\u0E1A\u0E31\u0E2A", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "083", name: "\u0E19\u0E32\u0E22\u0E19\u0E18\u0E35 \u0E1E\u0E07\u0E29\u0E4C\u0E41\u0E1E\u0E17\u0E22\u0E4C", nickname: "\u0E18\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "085", name: "\u0E19\u0E32\u0E22\u0E1B\u0E23\u0E32\u0E42\u0E21\u0E17\u0E22\u0E4C \u0E1A\u0E31\u0E27\u0E17\u0E2D\u0E07", nickname: "\u0E42\u0E21\u0E17\u0E22\u0E4C", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "086", name: "\u0E19\u0E32\u0E22\u0E1E\u0E38\u0E12\u0E34\u0E1E\u0E07\u0E28\u0E4C \u0E41\u0E01\u0E49\u0E27\u0E01\u0E32\u0E28\u0E23", nickname: "\u0E1E\u0E38\u0E12\u0E34", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "087", name: "\u0E19\u0E32\u0E22\u0E1F\u0E32\u0E14\u0E35\u0E19\u0E32\u0E19 \u0E14\u0E48\u0E32\u0E19\u0E40\u0E17\u0E48\u0E07", nickname: "\u0E19\u0E32\u0E19", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "088", name: "\u0E19\u0E32\u0E22\u0E21\u0E39\u0E2A\u0E33\u0E2B\u0E21\u0E31\u0E14\u0E2D\u0E31\u0E0A\u0E21\u0E35 \u0E40\u0E25\u0E4A\u0E32\u0E30\u0E25\u0E48\u0E2D", nickname: "\u0E21\u0E35", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "089", name: "\u0E19\u0E32\u0E22\u0E28\u0E15\u0E1E\u0E23 \u0E16\u0E36\u0E07\u0E40\u0E01\u0E37\u0E49\u0E2D", nickname: "\u0E1E\u0E23", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "090", name: "\u0E19\u0E32\u0E22\u0E28\u0E34\u0E25\u0E32\u0E14\u0E25 \u0E2D\u0E34\u0E19\u0E17\u0E19\u0E30", nickname: "\u0E14\u0E25", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "091", name: "\u0E19\u0E32\u0E22\u0E2E\u0E32\u0E0A\u0E31\u0E19 \u0E40\u0E2B\u0E25\u0E47\u0E21\u0E41\u0E2B\u0E25\u0E30", nickname: "\u0E0B\u0E31\u0E19", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "member", pos: "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32" },
  { idSuffix: "092", name: "\u0E19\u0E32\u0E07\u0E2A\u0E32\u0E27\u0E40\u0E08\u0E15\u0E0A\u0E25\u0E34\u0E19 \u0E2A\u0E31\u0E15\u0E22\u0E4C\u0E0B\u0E37\u0E48\u0E2D", nickname: "\u0E21\u0E34\u0E49\u0E19", classroom: "\u0E2B\u0E49\u0E2D\u0E07 2", role: "committee", pos: "\u0E23\u0E2D\u0E07\u0E1B\u0E23\u0E30\u0E18\u0E32\u0E19\u0E23\u0E38\u0E48\u0E19" }
];

// server/routes/system.ts
var router2 = Router2();
router2.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString(), dbConnected });
});
router2.get("/system/diagnostics", asyncHandler(async (req, res) => {
  const connected = await testSupabaseConnection();
  const { count: usersCount } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: billsCount } = await supabase.from("monthly_bills").select("*", { count: "exact", head: true });
  const { count: paymentsCount } = await supabase.from("payments").select("*", { count: "exact", head: true });
  const { count: txCount } = await supabase.from("transactions").select("*", { count: "exact", head: true });
  const { count: actCount } = await supabase.from("activities").select("*", { count: "exact", head: true });
  const { count: petCount } = await supabase.from("petitions").select("*", { count: "exact", head: true });
  const { count: rawBase64ImagesCount } = await supabase.from("images").select("id", { count: "exact", head: true }).not("base64", "like", "google_drive:%");
  const { count: rawBase64MarketNotesCount } = await supabase.from("market_items").select("id", { count: "exact", head: true }).like("note", "SLIP_URL:data:image/%");
  const pendingMigrationCount = (rawBase64ImagesCount || 0) + (rawBase64MarketNotesCount || 0);
  let googleDriveConnected = false;
  let googleDriveError = "";
  try {
    const token = await getAccessToken();
    googleDriveConnected = !!token;
  } catch (err) {
    googleDriveError = err.message;
  }
  res.json({
    firebase: { connected, error: dbSyncError, databaseId: "Supabase PostgreSQL", projectId: "student_fund" },
    mongodb: { connected, error: dbSyncError, database: "student_fund", uri: ENV.SUPABASE_URL ? "configured" : "not-configured" },
    localFile: { exists: false, sizeBytes: 0, path: "N/A (using Supabase)" },
    googleDrive: {
      connected: googleDriveConnected,
      error: googleDriveError,
      rootFolderLink: ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK || "not-configured",
      pendingMigrationCount
    },
    counts: { users: usersCount || 0, bills: billsCount || 0, payments: paymentsCount || 0, transactions: txCount || 0, activities: actCount || 0, petitions: petCount || 0 }
  });
}));
router2.post("/system/log-error", asyncHandler(async (req, res) => {
  const { errorMsg, componentStack, userId, url } = req.body;
  const logId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await supabase.from("logs").insert({
    id: logId,
    user_id: userId || "anonymous",
    action: "client_error",
    target_type: "system",
    target_id: url || "client_page",
    details: {
      message: errorMsg || "Unknown React error",
      stack: componentStack || "",
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip || ""
    },
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  res.json({ success: true, logId });
}));
router2.post("/system/generate-summary", asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const state = await loadFullState();
  const dateReadable = (/* @__PURE__ */ new Date()).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" });
  const totalBalance = (state.transactions || []).reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0) - 3802;
  const totalIncome = (state.transactions || []).filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = (state.transactions || []).filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  let latestCycle = { month: getCurrentMonth(), year: getCurrentBuddhistYear() };
  if (state.monthlyBills.length > 0) {
    const sorted = [...state.monthlyBills].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);
    latestCycle = { month: sorted[0].month, year: sorted[0].year };
  }
  const currentBills = state.monthlyBills.filter((b) => b.month === latestCycle.month && b.year === latestCycle.year);
  const paidMembers = currentBills.filter((b) => b.status === "paid").map((b) => {
    const u = state.users.find((user) => user.id === b.userId);
    return u ? `${u.fullName} (${u.nickname || ""})` : "\u0E44\u0E21\u0E48\u0E1E\u0E1A";
  });
  const pendingReviewMembers = currentBills.filter((b) => b.status === "pending_review").map((b) => {
    const u = state.users.find((user) => user.id === b.userId);
    return u ? `${u.fullName} (${u.nickname || ""})` : "\u0E44\u0E21\u0E48\u0E1E\u0E1A";
  });
  const unpaidMembers = currentBills.filter((b) => b.status === "pending").map((b) => {
    const u = state.users.find((user) => user.id === b.userId);
    return u ? `${u.fullName} (${u.nickname || ""})` : "\u0E44\u0E21\u0E48\u0E1E\u0E1A";
  });
  const fundName = state.settings?.fundName || "\u0E40\u0E07\u0E34\u0E19\u0E40\u0E01\u0E47\u0E1A\u0E23\u0E38\u0E48\u0E19";
  let summaryText = `\u{1F31F} \u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E2A\u0E23\u0E38\u0E1B\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E41\u0E25\u0E30\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19 \u{1F31F}
\u{1F3EB} \u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19: ${fundName}
\u{1F4C5} \u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15 \u0E13 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48: ${dateReadable}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

`;
  summaryText += `\u{1F4B5} [\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E23\u0E31\u0E1A-\u0E08\u0E48\u0E32\u0E22\u0E23\u0E27\u0E21]
\u{1F4B0} \u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E2A\u0E38\u0E17\u0E18\u0E34: \u0E3F${totalBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
\u{1F4C8} \u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A\u0E2A\u0E30\u0E2A\u0E21\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14: \u0E3F${totalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
\u{1F4C9} \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E2A\u0E30\u0E2A\u0E21\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14: \u0E3F${totalExpense.toLocaleString("th-TH", { minimumFractionDigits: 2 })}

`;
  summaryText += `\u{1F514} [\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E01\u0E32\u0E23\u0E08\u0E48\u0E32\u0E22\u0E40\u0E07\u0E34\u0E19\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19]
\u0E23\u0E2D\u0E1A\u0E1A\u0E34\u0E25\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14: \u0E40\u0E14\u0E37\u0E2D\u0E19${getMonthThaiName(latestCycle.month)} ${latestCycle.year}

`;
  summaryText += `\u2705 \u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E41\u0E25\u0E49\u0E27 (${paidMembers.length} \u0E04\u0E19):
${paidMembers.length > 0 ? paidMembers.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  - \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19"}

`;
  summaryText += `\u23F3 \u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E2A\u0E25\u0E34\u0E1B (${pendingReviewMembers.length} \u0E04\u0E19):
${pendingReviewMembers.length > 0 ? pendingReviewMembers.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  - \u0E44\u0E21\u0E48\u0E21\u0E35\u0E04\u0E34\u0E27\u0E23\u0E2D\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19"}

`;
  summaryText += `\u274C \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19 (${unpaidMembers.length} \u0E04\u0E19):
${unpaidMembers.length > 0 ? unpaidMembers.map((n, i) => `  ${i + 1}. ${n}`).join("\n") : "  - \u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E17\u0E38\u0E01\u0E04\u0E19\u0E0A\u0E33\u0E23\u0E30\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19\u0E41\u0E25\u0E49\u0E27! \u{1F389}"}`;
  if (userId) await writeLog(userId, "generate_summary_backup", "system", void 0, { dateReadable });
  res.json({ success: true, summaryText, dateReadable });
}));
router2.post("/system/migrate-images-to-drive", asyncHandler(async (req, res) => {
  const { userId, googleToken } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: requester } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!requester || requester.role !== "treasurer") {
    return res.status(403).json({ error: "\u0E02\u0E2D\u0E2D\u0E20\u0E31\u0E22 \u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E1F\u0E31\u0E07\u0E01\u0E4C\u0E0A\u0E31\u0E19\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22\u0E44\u0E1F\u0E25\u0E4C\u0E20\u0E32\u0E1E (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E2B\u0E25\u0E31\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E04\u0E48\u0E30)" });
  }
  const driveConfigured = (googleToken || ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL && ENV.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) && ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK;
  if (!driveConfigured) {
    return res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E25\u0E34\u0E07\u0E01\u0E4C Google Drive \u0E43\u0E19\u0E44\u0E1F\u0E25\u0E4C .env \u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E01\u0E48\u0E2D\u0E19\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E04\u0E48\u0E30" });
  }
  const { data: rawImages, error: fetchErr } = await supabase.from("images").select("id, base64").not("base64", "like", "google_drive:%");
  if (fetchErr) throw fetchErr;
  let migratedCount = 0;
  const errors = [];
  const rootLink = ENV.GOOGLE_DRIVE_ROOT_FOLDER_LINK || "";
  const rootFolderId = parseFolderId(rootLink);
  if (!rootFolderId) {
    return res.status(400).json({ error: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E01\u0E31\u0E14\u0E23\u0E2B\u0E31\u0E2A\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E2B\u0E25\u0E31\u0E01 Google Drive \u0E08\u0E32\u0E01\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E17\u0E35\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E44\u0E14\u0E49\u0E04\u0E48\u0E30" });
  }
  for (const img of rawImages || []) {
    if (!img.base64 || !img.base64.startsWith("data:image/")) continue;
    try {
      let folderId = rootFolderId;
      let filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07_${img.id}.jpg`;
      let folderPath = ["\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"];
      const { data: payment } = await supabase.from("payments").select("bill_id, user_id").eq("slip_url", `/api/images/${img.id}`).limit(1).maybeSingle();
      if (payment) {
        const { data: bill } = await supabase.from("monthly_bills").select("month, year").eq("id", payment.bill_id).single();
        const { data: user } = await supabase.from("users").select("full_name, student_id").eq("id", payment.user_id).single();
        const month = bill?.month || getCurrentMonth();
        const year = bill?.year || getCurrentBuddhistYear();
        const studentId = user?.student_id || "unknown";
        const fullName = user?.full_name || "member";
        const cleanName = fullName.replace(/[\s\/\\]+/g, "_");
        filename = `\u0E2A\u0E25\u0E34\u0E1B_${studentId}_${cleanName}.jpg`;
        folderPath = ["\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19", `\u0E1B\u0E35 \u0E1E.\u0E28. ${year}`, `\u0E40\u0E14\u0E37\u0E2D\u0E19 ${String(month).padStart(2, "0")}`];
      } else {
        const { data: marketWeekAdv } = await supabase.from("market_weeks").select("week_date, team_name").eq("advance_receipt_url", `/api/images/${img.id}`).limit(1).maybeSingle();
        if (marketWeekAdv) {
          const weekDate = marketWeekAdv.week_date;
          const teamName = marketWeekAdv.team_name || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E08\u0E33\u0E2B\u0E19\u0E48\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32";
          const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");
          filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32.jpg`;
          folderPath = ["\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18", `\u0E23\u0E2D\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${weekDate}_${cleanTeam}`];
        } else {
          const { data: marketWeekAdd } = await supabase.from("market_weeks").select("week_date, team_name").eq("additional_advance_receipt_url", `/api/images/${img.id}`).limit(1).maybeSingle();
          if (marketWeekAdd) {
            const weekDate = marketWeekAdd.week_date;
            const teamName = marketWeekAdd.team_name || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E08\u0E33\u0E2B\u0E19\u0E48\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32";
            const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");
            filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21.jpg`;
            folderPath = ["\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18", `\u0E23\u0E2D\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${weekDate}_${cleanTeam}`];
          } else {
            const { data: actRefund } = await supabase.from("activities").select("title").eq("refund_slip_url", `/api/images/${img.id}`).limit(1).maybeSingle();
            if (actRefund) {
              const cleanTitle = actRefund.title.replace(/[\s\/\\]+/g, "_");
              filename = `\u0E2A\u0E25\u0E34\u0E1B_\u0E40\u0E07\u0E34\u0E19\u0E17\u0E2D\u0E19\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D.jpg`;
              folderPath = ["\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E41\u0E25\u0E30\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23_${cleanTitle}`];
            }
          }
        }
      }
      folderId = await getOrCreateFolder(folderPath, rootFolderId, googleToken);
      const driveResult = await uploadFile(img.base64, filename, folderId, googleToken);
      await supabase.from("images").update({ base64: `google_drive:${driveResult.id}` }).eq("id", img.id);
      migratedCount++;
    } catch (err) {
      console.error(`Failed to migrate image ${img.id}:`, err.message);
      errors.push(`\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E ${img.id}: ${err.message}`);
    }
  }
  const { data: marketItems, error: itemsErr } = await supabase.from("market_items").select("id, note, market_week_id, item_name").like("note", "SLIP_URL:data:image/%");
  if (itemsErr) throw itemsErr;
  for (const item of marketItems || []) {
    try {
      const parts = item.note.split("|NOTE:");
      const rawBase64 = parts[0].replace("SLIP_URL:", "");
      const noteText = parts[1] || "";
      const { data: week } = await supabase.from("market_weeks").select("week_date, team_name").eq("id", item.market_week_id).single();
      const weekDate = week?.week_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const teamName = week?.team_name || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E08\u0E33\u0E2B\u0E19\u0E48\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32";
      const cleanTeam = teamName.replace(/[\s\/\\]+/g, "_");
      const cleanItemName = item.item_name.replace(/[\s\/\\]+/g, "_");
      const filename = `\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08_\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32_${cleanItemName}.jpg`;
      const folderPath = ["\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18", `\u0E23\u0E2D\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${weekDate}_${cleanTeam}`];
      const folderId = await getOrCreateFolder(folderPath, rootFolderId, googleToken);
      const driveResult = await uploadFile(rawBase64, filename, folderId, googleToken);
      const imgId = generateId("img_mig");
      await supabase.from("images").insert({ id: imgId, base64: `google_drive:${driveResult.id}` });
      await supabase.from("market_items").update({ note: `SLIP_URL:/api/images/${imgId}|NOTE:${noteText}` }).eq("id", item.id);
      migratedCount++;
    } catch (err) {
      console.error(`Failed to migrate market item note ${item.id}:`, err.message);
      errors.push(`\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 ${item.item_name}: ${err.message}`);
    }
  }
  await writeLog(userId, "migrate_images_to_drive", "system", void 0, { migratedCount, errorsCount: errors.length });
  res.json({ success: true, migratedCount, errors });
}));
router2.post("/system/purge-base64-slips", asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!user || user.role !== "treasurer") {
    return res.status(403).json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E31\u0E48\u0E07\u0E40\u0E04\u0E25\u0E35\u0E22\u0E23\u0E4C\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A" });
  }
  const { data: rawImages, error: fetchErr } = await supabase.from("images").select("id, base64").not("base64", "like", "google_drive:%");
  if (fetchErr) throw fetchErr;
  const count = rawImages?.length || 0;
  if (count === 0) {
    return res.json({ success: true, purgedCount: 0, message: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E Base64 \u0E15\u0E01\u0E04\u0E49\u0E32\u0E07\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30 (\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E27\u0E48\u0E32\u0E07\u0E40\u0E1B\u0E25\u0E48\u0E32 100%)" });
  }
  const idsToPurge = (rawImages || []).map((img) => img.id);
  const { error: deleteErr } = await supabase.from("images").delete().in("id", idsToPurge);
  if (deleteErr) throw deleteErr;
  await writeLog(userId, "purge_base64_slips", "system", void 0, { purgedCount: count });
  res.json({
    success: true,
    purgedCount: count,
    message: `\u{1F389} \u0E40\u0E04\u0E25\u0E35\u0E22\u0E23\u0E4C\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E Base64 \u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E04\u0E25\u0E32\u0E27\u0E14\u0E4C DB \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E08\u0E33\u0E19\u0E27\u0E19 ${count} \u0E23\u0E39\u0E1B! \u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E27\u0E48\u0E32\u0E07\u0E40\u0E1B\u0E25\u0E48\u0E32\u0E41\u0E25\u0E30\u0E40\u0E1A\u0E32\u0E2B\u0E27\u0E34\u0E27 100% \u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30`
  });
}));
router2.post("/system/sync-cloud", asyncHandler(async (req, res) => {
  const connected = await testSupabaseConnection();
  if (!connected) return res.status(500).json({ error: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Supabase \u0E44\u0E14\u0E49" });
  res.json({ success: true, message: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01 Supabase \u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E41\u0E25\u0E30\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30! \u{1F504}" });
}));
router2.post("/system/reset", asyncHandler(async (req, res) => {
  const { userId, keepUsers, keepSettings } = req.body;
  const hashedDefault = hashPassword("123456");
  if (!keepUsers) {
    await supabase.from("users").delete().neq("id", "");
    const seedUsers = REAL_STUDENTS.map((item) => {
      const studentId = `169214210${item.idSuffix}`;
      return {
        id: `usr_${studentId}`,
        student_id: studentId,
        full_name: item.name,
        nickname: item.nickname,
        email: studentId === "169214210002" ? "kritsana.khw@rmutsvmail.com" : `${studentId}@student.university.ac.th`,
        role: item.role,
        position: item.pos,
        phone: "",
        password: hashedDefault,
        is_active: true,
        classroom: item.classroom,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    await supabase.from("users").upsert(seedUsers, { onConflict: "id" });
  } else {
    await supabase.from("users").update({ password: hashedDefault }).neq("id", "");
  }
  if (!keepSettings) {
    await supabase.from("settings").delete().neq("id", "");
    await supabase.from("settings").upsert({
      id: "main",
      fund_name: "\u0E40\u0E07\u0E34\u0E19\u0E40\u0E01\u0E47\u0E1ATns \u0E23\u0E38\u0E48\u0E1906",
      monthly_fee: 150,
      promptpay_number: "081-234-5678",
      promptpay_name: "\u0E19\u0E20\u0E32\u0E27\u0E23\u0E23\u0E13 \u0E41\u0E01\u0E49\u0E27\u0E14\u0E35 (\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19)",
      promptpay_qr_url: "",
      bank_name: "\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E40\u0E1E\u0E22\u0E4C"
    }, { onConflict: "id" });
  }
  await Promise.all([
    supabase.from("monthly_bills").delete().neq("id", ""),
    supabase.from("payments").delete().neq("id", ""),
    supabase.from("transactions").delete().neq("id", ""),
    supabase.from("market_items").delete().neq("id", ""),
    supabase.from("market_teams").delete().neq("id", ""),
    supabase.from("market_weeks").delete().neq("id", ""),
    supabase.from("activities").delete().neq("id", ""),
    supabase.from("budget_requests").delete().neq("id", ""),
    supabase.from("announcements").delete().neq("id", ""),
    supabase.from("notifications").delete().neq("id", ""),
    supabase.from("logs").delete().neq("id", ""),
    supabase.from("petitions").delete().neq("id", ""),
    supabase.from("password_resets").delete().neq("id", "")
  ]);
  await writeLog(userId || "usr_169214210002", "reset_system", "system", void 0, { message: "\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E04\u0E48\u0E32\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19", keepUsers, keepSettings });
  res.json({ success: true, message: "\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30!" });
}));
router2.get("/state", asyncHandler(async (req, res) => {
  const state = await loadFullState();
  res.json(state);
}));
router2.post("/settings", asyncHandler(async (req, res) => {
  const { fundName, monthlyFee, promptpayNumber, promptpayName, promptpayQrUrl, bankName, userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const numericFee = Number(monthlyFee);
  const settingsData = {
    id: "main",
    fund_name: fundName,
    monthly_fee: numericFee,
    promptpay_number: promptpayNumber,
    promptpay_name: promptpayName,
    promptpay_qr_url: promptpayQrUrl || "",
    bank_name: bankName || "\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E40\u0E1E\u0E22\u0E4C",
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await supabase.from("settings").upsert(settingsData, { onConflict: "id" });
  await supabase.from("monthly_bills").update({ amount: numericFee }).eq("status", "pending");
  await writeLog(userId, "update_settings", "settings", "global", settingsData);
  const { data: updatedSettings } = await supabase.from("settings").select("*").eq("id", "main").single();
  res.json({ success: true, settings: convertKeysToCamel(updatedSettings) });
}));
router2.get("/supabase-config", (req, res) => {
  res.json({
    supabaseUrl: ENV.SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || ""
  });
});
var system_default = router2;

// server/routes/bills.ts
import { Router as Router3 } from "express";
var router3 = Router3();
router3.post("/bills/create", asyncHandler(async (req, res) => {
  const { month, year, dueDate, userId } = req.body;
  if (!month || !year || !dueDate || !userId) return res.status(400).json({ error: "Missing required parameters" });
  const { data: activeStudents } = await supabase.from("users").select("*").eq("is_active", true);
  const { data: existingBills } = await supabase.from("monthly_bills").select("user_id").eq("month", Number(month)).eq("year", Number(year));
  const { data: settingsArr } = await supabase.from("settings").select("monthly_fee").eq("id", "main").single();
  const monthlyFee = settingsArr?.monthly_fee || 150;
  const existingUserIds = new Set((existingBills || []).map((b) => b.user_id));
  const newBills = [];
  for (const student of activeStudents || []) {
    if (!existingUserIds.has(student.id)) {
      const billId = `bill_${student.student_id}_${month}_${year}`;
      newBills.push({
        id: billId,
        user_id: student.id,
        month: Number(month),
        year: Number(year),
        amount: monthlyFee,
        status: "pending",
        due_date: dueDate,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  if (newBills.length > 0) {
    await supabase.from("monthly_bills").insert(newBills);
    const targetUserIds = newBills.map((b) => b.user_id);
    await createNotificationsBulk(
      targetUserIds,
      "\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E1A\u0E34\u0E25\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E43\u0E2B\u0E21\u0E48",
      `\u0E1A\u0E34\u0E25\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19 ${month}/${year} \u0E08\u0E33\u0E19\u0E27\u0E19 ${monthlyFee} \u0E1A\u0E32\u0E17 \u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E43\u0E19\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${dueDate}`,
      "bill",
      `${month}/${year}`,
      "bill"
    );
    await writeLog(userId, "create_monthly_bills", "monthly_bills", `${month}/${year}`, { count: newBills.length });
  }
  res.json({ success: true, createdCount: newBills.length });
}));
router3.post("/bills/delete-cycle", asyncHandler(async (req, res) => {
  const { month, year, userId } = req.body;
  if (!month || !year || !userId) return res.status(400).json({ error: "Missing required parameters" });
  const { data: billsToDelete } = await supabase.from("monthly_bills").select("id").eq("month", Number(month)).eq("year", Number(year));
  if (!billsToDelete || billsToDelete.length === 0) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1A\u0E34\u0E25\u0E02\u0E2D\u0E07\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E41\u0E25\u0E30\u0E1B\u0E35\u0E17\u0E35\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A" });
  const billIds = billsToDelete.map((b) => b.id);
  const { data: cyclePayments } = await supabase.from("payments").select("id").in("bill_id", billIds);
  const paymentIds = (cyclePayments || []).map((p) => p.id);
  if (paymentIds.length > 0) {
    await supabase.from("transactions").delete().eq("reference_type", "payment").in("reference_id", paymentIds);
  }
  await supabase.from("payments").delete().in("bill_id", billIds);
  await supabase.from("monthly_bills").delete().eq("month", Number(month)).eq("year", Number(year));
  await writeLog(userId, "delete_monthly_bills", "monthly_bills", `${month}/${year}`, { count: billsToDelete.length });
  res.json({ success: true, deletedCount: billsToDelete.length });
}));
var bills_default = router3;

// server/routes/payments.ts
import { Router as Router4 } from "express";
import { z } from "zod";

// server/utils/math.ts
function roundToTwoDecimals(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// server/services/billService.ts
async function updateBillStatus(billId) {
  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", billId).single();
  if (!bill) return;
  const { data: billPayments } = await supabase.from("payments").select("*").eq("bill_id", billId);
  const totalApproved = roundToTwoDecimals(
    (billPayments || []).filter((p) => p.status === "approved").reduce((sum, p) => roundToTwoDecimals(sum + Number(p.amount || 0)), 0)
  );
  const hasPendingReview = (billPayments || []).some((p) => p.status === "pending_review");
  let newStatus = "pending";
  let paidAt = null;
  if (totalApproved >= bill.amount) {
    newStatus = "paid";
    paidAt = bill.paid_at || (/* @__PURE__ */ new Date()).toISOString();
  } else if (hasPendingReview) {
    newStatus = "pending_review";
  }
  await supabase.from("monthly_bills").update({ status: newStatus, paid_at: paidAt }).eq("id", billId);
}

// server/routes/payments.ts
var router4 = Router4();
router4.post("/payments/cancel", asyncHandler(async (req, res) => {
  const { billId, userId } = req.body;
  if (!billId || !userId) return res.status(400).json({ error: "Missing required parameters" });
  const { data: payment } = await supabase.from("payments").select("*").eq("bill_id", billId).eq("user_id", userId).eq("status", "pending_review").limit(1).single();
  if (!payment) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A" });
  await supabase.from("payments").delete().eq("id", payment.id);
  await updateBillStatus(billId);
  await writeLog(userId, "cancel_payment_request", "payment", payment.id, { billId, amount: payment.amount });
  res.json({ success: true, message: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E04\u0E33\u0E02\u0E2D\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27" });
}));
router4.post("/payments/submit", asyncHandler(async (req, res) => {
  const paymentSchema = z.object({
    billId: z.string().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E2B\u0E31\u0E2A\u0E1A\u0E34\u0E25\u0E04\u0E48\u0E30"),
    userId: z.string().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E04\u0E48\u0E30"),
    amount: z.union([z.number(), z.string()]).transform((val) => Number(val)).refine((num) => !isNaN(num) && num > 0, {
      message: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E42\u0E2D\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17\u0E04\u0E48\u0E30"
    }),
    slipUrl: z.string().optional(),
    note: z.string().max(250, "\u0E04\u0E33\u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E21\u0E35\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E40\u0E01\u0E34\u0E19\u0E44\u0E1B (\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14 250 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23)").optional()
  });
  const parseResult = paymentSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0]?.message || "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E48\u0E07\u0E2A\u0E25\u0E34\u0E1B\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E04\u0E48\u0E30";
    return res.status(400).json({ error: firstError });
  }
  const { billId, userId, amount, slipUrl, note } = parseResult.data;
  const numAmount = roundToTwoDecimals(amount);
  const { data: existingPending } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "pending_review");
  if (existingPending && existingPending.length > 0) return res.status(400).json({ error: "\u0E04\u0E38\u0E13\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E48\u0E07\u0E2A\u0E25\u0E34\u0E1B\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1A\u0E34\u0E25\u0E19\u0E35\u0E49\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27\u0E41\u0E25\u0E30\u0E01\u0E33\u0E25\u0E31\u0E07\u0E23\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E08\u0E32\u0E01\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01" });
  const { data: existingApproved } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "approved");
  if (existingApproved && existingApproved.length > 0) return res.status(400).json({ error: "\u0E04\u0E38\u0E13\u0E44\u0E14\u0E49\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1A\u0E34\u0E25\u0E19\u0E35\u0E49\u0E41\u0E25\u0E30\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27" });
  let processedSlipUrl = slipUrl || "";
  if (processedSlipUrl && !processedSlipUrl.startsWith("/api/images/") && processedSlipUrl.startsWith("data:image/")) {
    processedSlipUrl = await extractAndSaveImage(processedSlipUrl, "/api/payments/submit", { billId, userId });
  }
  const paymentId = generateId("pay");
  const newPayment = { id: paymentId, user_id: userId, bill_id: billId, amount: numAmount, slip_url: processedSlipUrl, status: "pending_review", note: note || "", created_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("payments").insert(newPayment);
  await updateBillStatus(billId);
  const { data: treasurers } = await supabase.from("users").select("id, full_name").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E2A\u0E25\u0E34\u0E1B\u0E43\u0E2B\u0E21\u0E48\u0E23\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A", `\u0E04\u0E38\u0E13 ${user?.full_name || "\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01"} \u0E44\u0E14\u0E49\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E25\u0E34\u0E1B\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1A\u0E34\u0E25\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E41\u0E25\u0E30\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34`, "payment", paymentId, "payment");
  await writeLog(userId, "submit_payment_slip", "payment", paymentId, { billId, amount: numAmount });
  res.json({ success: true, payment: convertKeysToCamel(newPayment) });
}));
router4.post("/payments/record-cash", asyncHandler(async (req, res) => {
  const cashRecordSchema = z.object({
    billId: z.string().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E2B\u0E31\u0E2A\u0E1A\u0E34\u0E25\u0E04\u0E48\u0E30"),
    userId: z.string().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E04\u0E49\u0E32\u0E07\u0E0A\u0E33\u0E23\u0E30\u0E04\u0E48\u0E30"),
    amount: z.union([z.number(), z.string()]).transform((val) => Number(val)).refine((num) => !isNaN(num) && num > 0, {
      message: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17\u0E04\u0E48\u0E30"
    }),
    treasurerId: z.string().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E39\u0E49\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E04\u0E48\u0E30"),
    note: z.string().max(250, "\u0E04\u0E33\u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E21\u0E35\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E40\u0E01\u0E34\u0E19\u0E44\u0E1B (\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14 250 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23)").optional()
  });
  const parseResult = cashRecordSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0]?.message || "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E04\u0E48\u0E30";
    return res.status(400).json({ error: firstError });
  }
  const { billId, userId, amount, treasurerId, note } = parseResult.data;
  const numAmount = roundToTwoDecimals(amount);
  const { data: recorder } = await supabase.from("users").select("*").eq("id", treasurerId).single();
  if (!recorder) {
    return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E39\u0E49\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A" });
  }
  if (recorder.role !== "treasurer" && recorder.role !== "leader") {
    return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E41\u0E25\u0E30\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E2B\u0E49\u0E2D\u0E07\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E44\u0E14\u0E49)" });
  }
  const { data: existingApproved } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "approved");
  if (existingApproved && existingApproved.length > 0) {
    return res.status(400).json({ error: "\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E17\u0E48\u0E32\u0E19\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49\u0E0A\u0E33\u0E23\u0E30\u0E1A\u0E34\u0E25\u0E19\u0E35\u0E49\u0E41\u0E25\u0E30\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27" });
  }
  const { data: existingPending } = await supabase.from("payments").select("id").eq("bill_id", billId).eq("user_id", userId).eq("status", "pending_review");
  if (existingPending && existingPending.length > 0) {
    return res.status(400).json({ error: "\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E17\u0E48\u0E32\u0E19\u0E19\u0E35\u0E49\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E23\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27" });
  }
  const isLeader = recorder.role === "leader";
  const isSelfRecording = treasurerId === userId;
  const paymentId = generateId("pay");
  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", billId).single();
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (isLeader || isSelfRecording) {
    const noteText = isSelfRecording ? note || "\u0E41\u0E08\u0E49\u0E07\u0E0A\u0E33\u0E23\u0E30\u0E14\u0E49\u0E27\u0E22\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14 (\u0E2A\u0E48\u0E07\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A)" : note || "\u0E41\u0E08\u0E49\u0E07\u0E0A\u0E33\u0E23\u0E30\u0E14\u0E49\u0E27\u0E22\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14 (\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E42\u0E14\u0E22\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E2B\u0E49\u0E2D\u0E07)";
    const newPayment2 = {
      id: paymentId,
      user_id: userId,
      bill_id: billId,
      amount: numAmount,
      slip_url: "cash",
      status: "pending_review",
      note: noteText,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    await supabase.from("payments").insert(newPayment2);
    await updateBillStatus(billId);
    const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
    const targetTreasurerIds = (treasurers || []).map((t) => t.id).filter((id) => id !== treasurerId);
    await createNotificationsBulk(targetTreasurerIds, "\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E23\u0E2D\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34 \u{1F4B5}", `\u0E1C\u0E39\u0E49\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E04\u0E38\u0E13 ${recorder.full_name} \u0E44\u0E14\u0E49\u0E41\u0E08\u0E49\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E08\u0E33\u0E19\u0E27\u0E19 ${numAmount} \u0E1A\u0E32\u0E17 \u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13 ${user?.full_name || "\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01"}`, "payment", paymentId, "payment");
    await createNotification(userId, "\u0E2A\u0E48\u0E07\u0E22\u0E2D\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E41\u0E25\u0E49\u0E27 \u{1F4B5}", `\u0E01\u0E32\u0E23\u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E08\u0E33\u0E19\u0E27\u0E19 ${numAmount} \u0E1A\u0E32\u0E17 \u0E16\u0E39\u0E01\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E02\u0E49\u0E32\u0E23\u0E30\u0E1A\u0E1A\u0E41\u0E25\u0E49\u0E27 (\u0E23\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A)`, "payment", paymentId, "payment");
    await writeLog(treasurerId, "record_cash_pending", "payment", paymentId, { studentId: user?.student_id, amount: numAmount });
    return res.json({ success: true, payment: convertKeysToCamel(newPayment2) });
  }
  const monthStr = bill ? String(bill.month).padStart(2, "0") : "00";
  const yearStr = bill ? bill.year : String(getCurrentBuddhistYear());
  const suffix = user ? user.student_id.substring(4) : "0000";
  const receiptNumber = `REC-${yearStr}-${monthStr}-${suffix}`;
  const newPayment = {
    id: paymentId,
    user_id: userId,
    bill_id: billId,
    amount: numAmount,
    slip_url: "cash",
    status: "approved",
    note: note || "\u0E0A\u0E33\u0E23\u0E30\u0E14\u0E49\u0E27\u0E22\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14 (\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E41\u0E25\u0E30\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E14\u0E49\u0E27\u0E22\u0E15\u0E19\u0E40\u0E2D\u0E07)",
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    reviewed_by: treasurerId,
    reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
    receipt_number: receiptNumber
  };
  await supabase.from("payments").insert(newPayment);
  await updateBillStatus(billId);
  const txId = generateId("tx");
  await supabase.from("transactions").insert({
    id: txId,
    type: "income",
    category: "monthly_fee",
    amount: numAmount,
    description: `\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 (\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14) (${bill ? `${bill.month}/${bill.year}` : ""}) - ${user?.full_name || "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32"}`,
    reference_id: paymentId,
    reference_type: "payment",
    created_by: treasurerId,
    approved_by: treasurerId,
    approved_at: (/* @__PURE__ */ new Date()).toISOString(),
    month: bill ? bill.month : getCurrentMonth(),
    year: bill ? bill.year : getCurrentBuddhistYear(),
    is_closed: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  await createNotification(userId, "\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2A\u0E34\u0E49\u0E19\u0E41\u0E25\u0E49\u0E27 \u{1F389}", `\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E44\u0E14\u0E49\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E01\u0E32\u0E23\u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E08\u0E33\u0E19\u0E27\u0E19 ${numAmount} \u0E1A\u0E32\u0E17 \u0E40\u0E25\u0E02\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E04\u0E37\u0E2D ${receiptNumber}`, "payment", paymentId, "payment");
  await writeLog(treasurerId, "record_cash_payment", "payment", paymentId, { studentId: user?.student_id, amount: numAmount });
  res.json({ success: true, payment: convertKeysToCamel(newPayment) });
}));
router4.post("/payments/approve", asyncHandler(async (req, res) => {
  const { paymentId, treasurerId, note } = req.body;
  if (!paymentId || !treasurerId) return res.status(400).json({ error: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19\u0E04\u0E48\u0E30" });
  const { data: actingUser } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!actingUser || actingUser.role !== "treasurer") {
    return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19)" });
  }
  const { data: payment } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  if (!payment) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E19\u0E35\u0E49" });
  if (payment.status === "approved") return res.json({ success: true, payment: convertKeysToCamel(payment) });
  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", payment.bill_id).single();
  const { data: user } = await supabase.from("users").select("*").eq("id", payment.user_id).single();
  const monthStr = bill ? String(bill.month).padStart(2, "0") : "00";
  const yearStr = bill ? bill.year : String(getCurrentBuddhistYear());
  const suffix = user ? user.student_id.substring(4) : "0000";
  const receiptNumber = `REC-${yearStr}-${monthStr}-${suffix}`;
  await supabase.from("payments").update({ status: "approved", reviewed_by: treasurerId, reviewed_at: (/* @__PURE__ */ new Date()).toISOString(), note: note || payment.note, receipt_number: receiptNumber }).eq("id", paymentId);
  if (bill) await updateBillStatus(bill.id);
  const txId = generateId("tx");
  await supabase.from("transactions").insert({ id: txId, type: "income", category: "monthly_fee", amount: payment.amount, description: `\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 (${bill ? `${bill.month}/${bill.year}` : ""}) - ${user?.full_name || "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32"}`, reference_id: payment.id, reference_type: "payment", created_by: treasurerId, approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), month: bill ? bill.month : getCurrentMonth(), year: bill ? bill.year : getCurrentBuddhistYear(), is_closed: false, created_at: (/* @__PURE__ */ new Date()).toISOString() });
  await createNotification(payment.user_id, "\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27 \u{1F389}", `\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E19\u0E35\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19 ${payment.amount} \u0E1A\u0E32\u0E17 \u0E40\u0E25\u0E02\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E04\u0E37\u0E2D ${receiptNumber}`, "payment", payment.id, "payment");
  await writeLog(treasurerId, "approve_payment", "payment", paymentId, { studentId: user?.student_id, amount: payment.amount });
  const { data: updated } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  res.json({ success: true, payment: convertKeysToCamel(updated) });
}));
router4.post("/payments/reject", asyncHandler(async (req, res) => {
  const { paymentId, treasurerId, rejectReason } = req.body;
  if (!paymentId || !treasurerId || !rejectReason) return res.status(400).json({ error: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19\u0E04\u0E48\u0E30" });
  const { data: actingUser } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!actingUser || actingUser.role !== "treasurer") {
    return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19)" });
  }
  const { data: payment } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  if (!payment) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E19\u0E35\u0E49" });
  await supabase.from("payments").update({ status: "rejected", reviewed_by: treasurerId, reviewed_at: (/* @__PURE__ */ new Date()).toISOString(), reject_reason: rejectReason }).eq("id", paymentId);
  const { data: bill } = await supabase.from("monthly_bills").select("id").eq("id", payment.bill_id).single();
  if (bill) await updateBillStatus(bill.id);
  await createNotification(payment.user_id, "\u274C \u0E04\u0E33\u0E02\u0E2D\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18", `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E16\u0E39\u0E01\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E14\u0E49\u0E27\u0E22\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25: "${rejectReason}"`, "payment", payment.id, "payment");
  const { data: user } = await supabase.from("users").select("student_id").eq("id", payment.user_id).single();
  await writeLog(treasurerId, "reject_payment", "payment", paymentId, { studentId: user?.student_id, reason: rejectReason });
  const { data: updated } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  res.json({ success: true, payment: convertKeysToCamel(updated) });
}));
router4.post("/payments/upload-slip-admin", asyncHandler(async (req, res) => {
  const { billId, userId, base64Image, treasurerId, note } = req.body;
  if (!billId || !userId || !base64Image || !treasurerId) {
    return res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19\u0E04\u0E48\u0E30 (billId, userId, base64Image, treasurerId)" });
  }
  const { data: requester } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!requester || requester.role !== "treasurer") {
    return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E2B\u0E25\u0E31\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19)" });
  }
  const { data: bill } = await supabase.from("monthly_bills").select("*").eq("id", billId).single();
  if (!bill) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E2D\u0E1A\u0E1A\u0E34\u0E25\u0E19\u0E35\u0E49\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E04\u0E48\u0E30" });
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E04\u0E48\u0E30" });
  const slipUrl = base64Image.startsWith("/api/images/") ? base64Image : await extractAndSaveImage(base64Image, "/api/payments/submit", { billId, userId });
  const { data: existingPayments } = await supabase.from("payments").select("*").eq("bill_id", billId).eq("user_id", userId);
  const monthStr = String(bill.month).padStart(2, "0");
  const yearStr = bill.year;
  const suffix = user.student_id.substring(4);
  const receiptNumber = `REC-${yearStr}-${monthStr}-${suffix}`;
  let paymentId = generateId("pay");
  let paymentAmount = bill.amount;
  if (existingPayments && existingPayments.length > 0) {
    const existing = existingPayments[0];
    paymentId = existing.id;
    paymentAmount = existing.amount;
    await supabase.from("payments").update({
      slip_url: slipUrl,
      status: "approved",
      reviewed_by: treasurerId,
      reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
      note: note || `\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E41\u0E19\u0E1A\u0E2A\u0E25\u0E34\u0E1B\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07 (\u0E40\u0E14\u0E34\u0E21: ${existing.note || "\u0E44\u0E21\u0E48\u0E21\u0E35"})`,
      receipt_number: receiptNumber
    }).eq("id", paymentId);
    if (existing.status !== "approved") {
      const { data: existingTx } = await supabase.from("transactions").select("id").eq("reference_id", paymentId).eq("reference_type", "payment");
      if (!existingTx || existingTx.length === 0) {
        const txId = generateId("tx");
        await supabase.from("transactions").insert({
          id: txId,
          type: "income",
          category: "monthly_fee",
          amount: Number(paymentAmount),
          description: `\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 (${bill.month}/${bill.year}) - ${user.full_name}`,
          reference_id: paymentId,
          reference_type: "payment",
          created_by: treasurerId,
          approved_by: treasurerId,
          approved_at: (/* @__PURE__ */ new Date()).toISOString(),
          month: bill.month,
          year: bill.year,
          is_closed: false,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  } else {
    const newPayment = {
      id: paymentId,
      user_id: userId,
      bill_id: billId,
      amount: paymentAmount,
      slip_url: slipUrl,
      status: "approved",
      note: note || "\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E41\u0E19\u0E1A\u0E2A\u0E25\u0E34\u0E1B\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07",
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      reviewed_by: treasurerId,
      reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
      receipt_number: receiptNumber
    };
    await supabase.from("payments").insert(newPayment);
    const txId = generateId("tx");
    await supabase.from("transactions").insert({
      id: txId,
      type: "income",
      category: "monthly_fee",
      amount: Number(paymentAmount),
      description: `\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19 (${bill.month}/${bill.year}) - ${user.full_name}`,
      reference_id: paymentId,
      reference_type: "payment",
      created_by: treasurerId,
      approved_by: treasurerId,
      approved_at: (/* @__PURE__ */ new Date()).toISOString(),
      month: bill.month,
      year: bill.year,
      is_closed: false,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  await updateBillStatus(billId);
  await createNotification(userId, "\u0E41\u0E19\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E2A\u0E25\u0E34\u0E1B\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2A\u0E34\u0E49\u0E19\u0E41\u0E25\u0E49\u0E27 \u{1F389}", `\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E44\u0E14\u0E49\u0E17\u0E33\u0E01\u0E32\u0E23\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E2A\u0E25\u0E34\u0E1B\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07\u0E43\u0E2B\u0E49\u0E04\u0E38\u0E13 \u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19 ${paymentAmount} \u0E1A\u0E32\u0E17 \u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48 ${receiptNumber}`, "payment", paymentId, "payment");
  await writeLog(treasurerId, "upload_slip_admin", "payment", paymentId, { studentId: user.student_id, amount: paymentAmount });
  const { data: updatedPayment } = await supabase.from("payments").select("*").eq("id", paymentId).single();
  res.json({ success: true, payment: convertKeysToCamel(updatedPayment) });
}));
var payments_default = router4;

// server/routes/market.ts
import { Router as Router5 } from "express";

// server/services/marketService.ts
async function recalculateWeekTotals(marketWeekId) {
  const { data: weekItems } = await supabase.from("market_items").select("*").eq("market_week_id", marketWeekId);
  const items = weekItems || [];
  const costs = items.filter((i) => i.type === "cost").reduce((sum, i) => roundToTwoDecimals(sum + i.amount * i.quantity), 0);
  const revenues = items.filter((i) => i.type === "revenue").reduce((sum, i) => roundToTwoDecimals(sum + i.amount * i.quantity), 0);
  await supabase.from("market_weeks").update({
    total_cost: costs,
    total_revenue: revenues,
    total_profit: roundToTwoDecimals(revenues - costs)
  }).eq("id", marketWeekId);
}

// server/routes/market.ts
var router5 = Router5();
router5.post("/market/week/create", asyncHandler(async (req, res) => {
  const { weekDate, note, teamName, leaderId, memberIds, userId } = req.body;
  if (!weekDate || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: proposer } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!proposer || proposer.role !== "treasurer" && proposer.role !== "committee") return res.status(403).json({ error: "\u0E02\u0E2D\u0E2D\u0E20\u0E31\u0E22 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E2B\u0E23\u0E37\u0E2D\u0E04\u0E13\u0E30\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14\u0E44\u0E14\u0E49" });
  const weekId = generateId("mkt");
  const newWeek = { id: weekId, week_date: weekDate, total_cost: 0, total_revenue: 0, total_profit: 0, status: "planned", note: note || "", team_name: teamName || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E02\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B", leader_id: leaderId || userId, member_ids: memberIds || [], created_by: userId, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("market_weeks").insert(newWeek);
  await writeLog(userId, "create_market_week", "market_week", weekId, { weekDate, note, teamName });
  res.json({ success: true, marketWeek: convertKeysToCamel(newWeek) });
}));
router5.post("/market/week/update-team", asyncHandler(async (req, res) => {
  const { marketWeekId, teamName, leaderId, memberIds, note, userId } = req.body;
  if (!marketWeekId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14\u0E19\u0E35\u0E49" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");
  if (!isAdmin && !isLeader) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1B\u0E23\u0E31\u0E1A\u0E1B\u0E23\u0E38\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E21 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E17\u0E35\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E04\u0E13\u0E30\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" });
  const updates = {};
  if (teamName !== void 0) updates.team_name = teamName;
  if (leaderId !== void 0) updates.leader_id = leaderId;
  if (memberIds !== void 0) updates.member_ids = memberIds;
  if (note !== void 0) updates.note = note;
  await supabase.from("market_weeks").update(updates).eq("id", marketWeekId);
  await writeLog(userId, "update_market_team", "market_week", marketWeekId, { teamName });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/item/add", asyncHandler(async (req, res) => {
  const { marketWeekId, itemName, type, amount, quantity, note, userId } = req.body;
  if (!marketWeekId || !itemName || !type || !amount || !userId) return res.status(400).json({ error: "Missing parameters" });
  const numAmount = Number(amount);
  const numQuantity = Number(quantity || 1);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "\u0E23\u0E32\u0E04\u0E32\u0E15\u0E48\u0E2D\u0E2B\u0E19\u0E48\u0E27\u0E22\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17" });
  if (isNaN(numQuantity) || numQuantity <= 0) return res.status(400).json({ error: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E0A\u0E34\u0E49\u0E19" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14\u0E19\u0E35\u0E49" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isMember = week.member_ids && week.member_ids.includes(userId);
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");
  if (!isAdmin && !isLeader && !isMember) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E17\u0E35\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" });
  const itemId = generateId("mkt_item");
  const newItem = { id: itemId, market_week_id: marketWeekId, item_name: itemName, type, amount: numAmount, quantity: numQuantity, note: note || "", created_by: userId, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("market_items").insert(newItem);
  await recalculateWeekTotals(marketWeekId);
  const { data: currentWeek } = await supabase.from("market_weeks").select("status").eq("id", marketWeekId).single();
  if (currentWeek?.status === "planned") {
    await supabase.from("market_weeks").update({ status: "active" }).eq("id", marketWeekId);
  }
  await writeLog(userId, "add_market_item", "market_item", itemId, { itemName, type, amount });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, item: convertKeysToCamel(newItem), marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/item/delete", asyncHandler(async (req, res) => {
  const { itemId, userId } = req.body;
  if (!itemId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: item } = await supabase.from("market_items").select("*").eq("id", itemId).single();
  if (!item) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", item.market_week_id).single();
  if (!week) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isMember = week.member_ids && week.member_ids.includes(userId);
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");
  if (!isAdmin && !isLeader && !isMember) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E17\u0E35\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" });
  await supabase.from("market_items").delete().eq("id", itemId);
  await recalculateWeekTotals(item.market_week_id);
  await writeLog(userId, "delete_market_item", "market_item", itemId, { itemName: item.item_name });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", item.market_week_id).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/week/complete", asyncHandler(async (req, res) => {
  const { marketWeekId, userId } = req.body;
  if (!marketWeekId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14\u0E19\u0E35\u0E49" });
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  const isLeader = week.leader_id === userId;
  const isAdmin = user && (user.role === "treasurer" || user.role === "committee");
  if (!isAdmin && !isLeader) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E15\u0E25\u0E32\u0E14 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E17\u0E35\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" });
  await supabase.from("market_weeks").update({ status: "completed" }).eq("id", marketWeekId);
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18\u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A", `\u0E04\u0E38\u0E13 ${user?.full_name || "\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E17\u0E35\u0E21"} \u0E44\u0E14\u0E49\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E01\u0E33\u0E44\u0E23\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18\u0E23\u0E2D\u0E1A\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${updatedWeek?.week_date}`, "market", marketWeekId, "market");
  await writeLog(userId, "complete_market_week", "market_week", marketWeekId, { profit: updatedWeek?.total_profit });
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/week/approve", asyncHandler(async (req, res) => {
  const { marketWeekId, treasurerId } = req.body;
  if (!marketWeekId || !treasurerId) return res.status(400).json({ error: "Missing parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });
  if (week.status === "approved") {
    return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
  }
  await supabase.from("market_weeks").update({ status: "approved", approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", marketWeekId);
  const weekDateObj = week.week_date ? new Date(week.week_date) : /* @__PURE__ */ new Date();
  const weekMonth = !isNaN(weekDateObj.getTime()) ? weekDateObj.getMonth() + 1 : getCurrentMonth();
  const weekBuddhistYear = !isNaN(weekDateObj.getTime()) ? weekDateObj.getFullYear() + 543 : getCurrentBuddhistYear();
  const txBase = { reference_id: week.id, reference_type: "market", created_by: treasurerId, approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), month: weekMonth, year: weekBuddhistYear, is_closed: false, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  const carryMatch = week.note?.match(/\[CARRY_FORWARD_REMAINING:([\d.]+)\]/);
  const carryForwardRemaining = carryMatch ? Number(carryMatch[1]) : 0;
  const totalAdvancePaid = Number(week.advance_requested || 0) + (week.additional_advance_status === "approved" ? Number(week.additional_advance_requested || 0) : 0);
  const parseAdvanceReason = (rawReason) => {
    if (!rawReason) return { reason: "", carryForwardAmount: 0 };
    if (rawReason.startsWith("CARRY_FORWARD_AMOUNT:")) {
      const parts = rawReason.split(" | REASON:");
      const carryForwardAmt = Number(parts[0].replace("CARRY_FORWARD_AMOUNT:", "")) || 0;
      const reasonStr = parts[1] || "";
      return { reason: reasonStr, carryForwardAmount: carryForwardAmt };
    }
    return { reason: rawReason, carryForwardAmount: 0 };
  };
  const { carryForwardAmount } = parseAdvanceReason(week.advance_reason || "");
  const isCapitalOnlyCarry = week.note?.includes("[CARRY_FORWARD_CAPITAL_ONLY:true]");
  if (carryForwardRemaining > 0 && !isCapitalOnlyCarry) {
  } else {
    if (week.total_profit > 0) {
      const { error: txErr } = await supabase.from("transactions").insert({ ...txBase, id: generateId("tx_profit"), type: "income", category: "market_profit", amount: week.total_profit, description: `\u0E01\u0E33\u0E44\u0E23\u0E2A\u0E48\u0E07\u0E04\u0E37\u0E19\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E2B\u0E49\u0E2D\u0E07\u0E40\u0E23\u0E35\u0E22\u0E19\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18: ${week.team_name || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E08\u0E33\u0E2B\u0E19\u0E48\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32"} (${week.week_date})` });
      if (txErr) {
        console.error("Error inserting profit transaction:", txErr);
        throw new Error("\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27\u0E43\u0E19\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E22\u0E2D\u0E14\u0E01\u0E33\u0E44\u0E23\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E15\u0E25\u0E32\u0E14\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25: " + txErr.message);
      }
    }
    if (!isCapitalOnlyCarry) {
      const returnedAmount = Math.max(0, totalAdvancePaid + (week.total_profit < 0 ? week.total_profit : 0));
      if (week.advance_status === "approved" && returnedAmount > 0) {
        const { error: advErr } = await supabase.from("transactions").insert({ ...txBase, id: generateId("tx_adv_ret"), type: "income", category: "other_income", amount: returnedAmount, description: `\u0E23\u0E31\u0E1A\u0E04\u0E37\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18: ${week.team_name || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E08\u0E33\u0E2B\u0E19\u0E48\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32"} (${week.week_date})` });
        if (advErr) {
          console.error("Error inserting advance return transaction:", advErr);
          throw new Error("\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27\u0E43\u0E19\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E22\u0E2D\u0E14\u0E04\u0E37\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25: " + advErr.message);
        }
      }
      if (carryForwardAmount > 0) {
        const { error: carryErr } = await supabase.from("transactions").insert({ ...txBase, id: generateId("tx_carry_ret"), type: "income", category: "other_income", amount: carryForwardAmount, description: `\u0E23\u0E31\u0E1A\u0E04\u0E37\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E41\u0E25\u0E30\u0E01\u0E33\u0E44\u0E23\u0E2A\u0E30\u0E2A\u0E21\u0E17\u0E35\u0E48\u0E22\u0E01\u0E22\u0E2D\u0E14\u0E21\u0E32\u0E08\u0E32\u0E01\u0E23\u0E2D\u0E1A\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32: ${week.team_name || "\u0E01\u0E25\u0E38\u0E48\u0E21\u0E08\u0E33\u0E2B\u0E19\u0E48\u0E32\u0E22\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32"} (\u0E15\u0E25\u0E32\u0E14\u0E23\u0E2D\u0E1A ${week.week_date})` });
        if (carryErr) {
          console.error("Error inserting carry return transaction:", carryErr);
          throw new Error("\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27\u0E43\u0E19\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E22\u0E2D\u0E14\u0E04\u0E37\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E2A\u0E30\u0E2A\u0E21\u0E22\u0E01\u0E22\u0E2D\u0E14\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25: " + carryErr.message);
        }
      }
    }
  }
  const { data: allUsers } = await supabase.from("users").select("id");
  const allUserIds = (allUsers || []).map((u) => u.id);
  await createNotificationsBulk(allUserIds, "\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E2A\u0E23\u0E38\u0E1B\u0E22\u0E2D\u0E14\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18 \u{1F6D2}", `\u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19\u0E01\u0E33\u0E44\u0E23\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18\u0E23\u0E2D\u0E1A ${week.week_date} \u0E08\u0E33\u0E19\u0E27\u0E19 ${week.total_profit} \u0E1A\u0E32\u0E17 \u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2A\u0E21\u0E17\u0E1A\u0E17\u0E38\u0E19\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30`, "market", marketWeekId, "market");
  await writeLog(treasurerId, "approve_market_week", "market_week", marketWeekId, { profit: week.total_profit });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/week/advance/propose", asyncHandler(async (req, res) => {
  const { marketWeekId, amount, reason, requesterId } = req.body;
  if (!marketWeekId || !amount || !requesterId) return res.status(400).json({ error: "Missing required parameters" });
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14\u0E19\u0E35\u0E49" });
  const { data: requester } = await supabase.from("users").select("role").eq("id", requesterId).single();
  const isLeader = week.leader_id === requesterId;
  const isAdmin = requester && (requester.role === "treasurer" || requester.role === "committee");
  if (!isAdmin && !isLeader) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E2A\u0E19\u0E2D\u0E02\u0E2D\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E17\u0E35\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E04\u0E13\u0E30\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" });
  await supabase.from("market_weeks").update({ advance_requested: numAmount, advance_reason: reason || "", advance_status: "pending", advance_reject_reason: "" }).eq("id", marketWeekId);
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E25\u0E32\u0E14 \u{1F4B0}", `\u0E17\u0E35\u0E21 ${updatedWeek?.team_name || "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"} \u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E08\u0E33\u0E19\u0E27\u0E19 ${numAmount} \u0E1A\u0E32\u0E17`, "market", marketWeekId, "market");
  await writeLog(requesterId, "propose_market_advance", "market_week", marketWeekId, { amount: numAmount });
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/week/advance-additional/propose", asyncHandler(async (req, res) => {
  const { marketWeekId, amount, reason, requesterId } = req.body;
  if (!marketWeekId || !amount || !requesterId) return res.status(400).json({ error: "Missing required parameters" });
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14\u0E19\u0E35\u0E49" });
  const { data: requester } = await supabase.from("users").select("role").eq("id", requesterId).single();
  const isLeader = week.leader_id === requesterId;
  const isAdmin = requester && (requester.role === "treasurer" || requester.role === "committee");
  if (!isAdmin && !isLeader) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E2A\u0E19\u0E2D\u0E02\u0E2D\u0E17\u0E38\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E17\u0E35\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E04\u0E13\u0E30\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19" });
  await supabase.from("market_weeks").update({ additional_advance_requested: numAmount, additional_advance_reason: reason || "", additional_advance_status: "pending", additional_advance_reject_reason: "" }).eq("id", marketWeekId);
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E15\u0E25\u0E32\u0E14 \u{1F4B0}", `\u0E17\u0E35\u0E21 ${updatedWeek?.team_name || "\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B"} \u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E17\u0E38\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E08\u0E33\u0E19\u0E27\u0E19 ${numAmount} \u0E1A\u0E32\u0E17`, "market", marketWeekId, "market");
  await writeLog(requesterId, "propose_market_additional_advance", "market_week", marketWeekId, { amount: numAmount });
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/week/advance-additional/approve", asyncHandler(async (req, res) => {
  const { marketWeekId, treasurerId, action, rejectReason, receiptUrl } = req.body;
  if (!marketWeekId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });
  if (action === "approve") {
    if (week.additional_advance_status === "approved") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    if (!receiptUrl) return res.status(400).json({ error: "Missing payment transfer slip" });
    await supabase.from("market_weeks").update({ additional_advance_status: "approved", additional_advance_receipt_url: receiptUrl, additional_advance_approved_by: treasurerId, additional_advance_approved_at: (/* @__PURE__ */ new Date()).toISOString(), additional_advance_reject_reason: "" }).eq("id", marketWeekId);
    if (week.additional_advance_requested > 0) {
      const { error: addAdvErr } = await supabase.from("transactions").insert({ id: generateId("tx_adv_add"), type: "expense", category: "other_expense", amount: week.additional_advance_requested, description: `\u0E08\u0E48\u0E32\u0E22\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18: ${week.team_name} (${week.week_date})`, reference_id: week.id, reference_type: "market", created_by: treasurerId, approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: (/* @__PURE__ */ new Date()).toISOString() });
      if (addAdvErr) {
        console.error("Error inserting additional advance transaction:", addAdvErr);
        throw new Error("\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27\u0E43\u0E19\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21: " + addAdvErr.message);
      }
    }
    const notifyTarget = week.leader_id || week.created_by;
    await createNotification(notifyTarget, "\u0E04\u0E33\u0E02\u0E2D\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E30\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19\u0E41\u0E25\u0E49\u0E27 \u{1F4B0}", `\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E17\u0E38\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E08\u0E33\u0E19\u0E27\u0E19 ${week.additional_advance_requested} \u0E1A\u0E32\u0E17 \u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E42\u0E2D\u0E19\u0E08\u0E48\u0E32\u0E22\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27`, "market", marketWeekId, "market");
  } else {
    if (week.additional_advance_status === "rejected") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    await supabase.from("market_weeks").update({ additional_advance_status: "rejected", additional_advance_reject_reason: rejectReason || "" }).eq("id", marketWeekId);
    const notifyTarget = week.leader_id || week.created_by;
    await createNotification(notifyTarget, "\u0E04\u0E33\u0E02\u0E2D\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E15\u0E25\u0E32\u0E14\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18 \u26A0\uFE0F", `\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E17\u0E38\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21\u0E08\u0E33\u0E19\u0E27\u0E19 ${week.additional_advance_requested} \u0E1A\u0E32\u0E17 \u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18: ${rejectReason || "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25\u0E23\u0E30\u0E1A\u0E38"}`, "market", marketWeekId, "market");
  }
  await writeLog(treasurerId, "respond_market_additional_advance", "market_week", marketWeekId, { action, amount: week.additional_advance_requested });
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/week/advance/approve", asyncHandler(async (req, res) => {
  const { marketWeekId, treasurerId, action, rejectReason, receiptUrl } = req.body;
  if (!marketWeekId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });
  if (action === "approve") {
    if (week.advance_status === "approved") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    if (!receiptUrl && week.advance_requested > 0) return res.status(400).json({ error: "Missing payment transfer slip" });
    await supabase.from("market_weeks").update({ advance_status: "approved", advance_receipt_url: receiptUrl || "", advance_approved_by: treasurerId, advance_approved_at: (/* @__PURE__ */ new Date()).toISOString(), advance_reject_reason: "" }).eq("id", marketWeekId);
    if (week.advance_requested > 0) {
      const weekDateObj = week.week_date ? new Date(week.week_date) : /* @__PURE__ */ new Date();
      const weekMonth = !isNaN(weekDateObj.getTime()) ? weekDateObj.getMonth() + 1 : getCurrentMonth();
      const weekBuddhistYear = !isNaN(weekDateObj.getTime()) ? weekDateObj.getFullYear() + 543 : getCurrentBuddhistYear();
      const { error: advTxErr } = await supabase.from("transactions").insert({ id: generateId("tx_adv"), type: "expense", category: "other_expense", amount: week.advance_requested, description: `\u0E08\u0E48\u0E32\u0E22\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E25\u0E32\u0E14\u0E27\u0E31\u0E19\u0E1E\u0E38\u0E18: ${week.team_name} (${week.week_date})`, reference_id: week.id, reference_type: "market", created_by: treasurerId, approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), month: weekMonth, year: weekBuddhistYear, is_closed: false, created_at: (/* @__PURE__ */ new Date()).toISOString() });
      if (advTxErr) {
        console.error("Error inserting advance transaction:", advTxErr);
        throw new Error("\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27\u0E43\u0E19\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32: " + advTxErr.message);
      }
    }
    if (week.leader_id) await createNotification(week.leader_id, "\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E25\u0E49\u0E27 \u{1F4B0}", `\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E25\u0E32\u0E14\u0E08\u0E33\u0E19\u0E27\u0E19 ${week.advance_requested} \u0E1A\u0E32\u0E17 \u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30`, "market", marketWeekId, "market");
    await writeLog(treasurerId, "approve_market_advance", "market_week", marketWeekId, { amount: week.advance_requested });
  } else {
    if (week.advance_status === "rejected") {
      return res.json({ success: true, marketWeek: convertKeysToCamel(week) });
    }
    await supabase.from("market_weeks").update({ advance_status: "rejected", advance_reject_reason: rejectReason || "\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E42\u0E14\u0E22\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01" }).eq("id", marketWeekId);
    if (week.leader_id) await createNotification(week.leader_id, "\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18 \u26A0\uFE0F", `\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E17\u0E38\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E25\u0E32\u0E14\u0E02\u0E2D\u0E07\u0E17\u0E35\u0E21\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E32\u0E01: ${rejectReason || "\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E42\u0E14\u0E22\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01"}`, "market", marketWeekId, "market");
    await writeLog(treasurerId, "reject_market_advance", "market_week", marketWeekId, { reason: rejectReason });
  }
  const { data: updatedWeek } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  res.json({ success: true, marketWeek: convertKeysToCamel(updatedWeek) });
}));
router5.post("/market/week/delete", asyncHandler(async (req, res) => {
  const { marketWeekId, userId } = req.body;
  if (!marketWeekId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: week } = await supabase.from("market_weeks").select("*").eq("id", marketWeekId).single();
  if (!week) return res.status(404).json({ error: "Market week not found" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "User not found" });
  const isCreator = week.created_by === userId || week.leader_id === userId;
  const isTreasurer = user.role === "treasurer";
  if (!(isTreasurer || isCreator && week.status !== "approved")) return res.status(403).json({ error: "\u0E02\u0E2D\u0E2D\u0E20\u0E31\u0E22 \u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A\u0E23\u0E2D\u0E1A\u0E15\u0E25\u0E32\u0E14\u0E19\u0E35\u0E49" });
  await supabase.from("transactions").delete().eq("reference_type", "market").eq("reference_id", marketWeekId);
  await supabase.from("market_items").delete().eq("market_week_id", marketWeekId);
  await supabase.from("market_weeks").delete().eq("id", marketWeekId);
  await writeLog(userId, "delete_market_week", "market_week", marketWeekId, { weekDate: week.week_date, teamName: week.team_name });
  res.json({ success: true });
}));
var market_default = router5;

// server/routes/activities.ts
import { Router as Router6 } from "express";
var router6 = Router6();
function isCommitteeRole(user) {
  const pos = (user.position || "").toLowerCase();
  return user.role === "treasurer" || user.role === "committee" || pos.includes("\u0E1B\u0E23\u0E30\u0E18\u0E32\u0E19") || pos.includes("\u0E23\u0E2D\u0E07") || pos.includes("\u0E40\u0E25\u0E02") || pos.includes("\u0E40\u0E25\u0E02\u0E32") || pos.includes("\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01");
}
router6.post("/activities/propose", asyncHandler(async (req, res) => {
  const { title, description, eventDate, location, budgetEstimated, documentUrls, userId } = req.body;
  if (!title || !userId) return res.status(400).json({ error: "Missing title or userId" });
  const numBudget = Number(budgetEstimated || 0);
  if (isNaN(numBudget) || numBudget < 0) return res.status(400).json({ error: "\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E01\u0E32\u0E23\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E15\u0E34\u0E14\u0E25\u0E1A\u0E04\u0E48\u0E30" });
  const { data: proposer } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!proposer) return res.status(404).json({ error: "User not found" });
  if (!isCommitteeRole(proposer)) return res.status(403).json({ error: "\u0E02\u0E2D\u0E2D\u0E20\u0E31\u0E22 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01 \u0E04\u0E13\u0E30\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23 \u0E2B\u0E23\u0E37\u0E2D\u0E1C\u0E39\u0E49\u0E21\u0E35\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E40\u0E2A\u0E19\u0E2D\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E44\u0E14\u0E49" });
  const activityId = generateId("act");
  const newActivity = { id: activityId, title, description: description || "", proposed_by: userId, status: "proposed", event_date: eventDate || null, location: location || "", budget_estimated: numBudget, document_urls: documentUrls || [], created_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("activities").insert(newActivity);
  const { data: allUsers } = await supabase.from("users").select("id");
  const recipientIds = (allUsers || []).map((u) => u.id).filter((id) => id !== userId);
  await createNotificationsBulk(recipientIds, "\u0E21\u0E35\u0E01\u0E32\u0E23\u0E40\u0E2A\u0E19\u0E2D\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E43\u0E2B\u0E21\u0E48 \u2728", `\u0E04\u0E38\u0E13 ${proposer.full_name} \u0E44\u0E14\u0E49\u0E40\u0E2A\u0E19\u0E2D\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23: "${title}"`, "activity", activityId, "activity");
  await writeLog(userId, "propose_activity", "activity", activityId, { title });
  res.json({ success: true, activity: convertKeysToCamel(newActivity) });
}));
router6.post("/activities/delete", asyncHandler(async (req, res) => {
  const { activityId, userId } = req.body;
  if (!activityId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "User not found" });
  const isComm = isCommitteeRole(user);
  if (act.status === "completed" && !isComm) return res.status(403).json({ error: "\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2A\u0E34\u0E49\u0E19\u0E41\u0E25\u0E49\u0E27 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E23\u0E23\u0E21\u0E01\u0E32\u0E23\u0E2B\u0E49\u0E2D\u0E07\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E1A\u0E44\u0E14\u0E49" });
  if (!(isComm || act.proposed_by === userId)) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49" });
  const { data: bReqs } = await supabase.from("budget_requests").select("id").eq("activity_id", activityId);
  const bReqIds = (bReqs || []).map((r) => r.id);
  if (bReqIds.length > 0) await supabase.from("transactions").delete().eq("reference_type", "budget_request").in("reference_id", bReqIds);
  const extIncomes = act.external_incomes || [];
  const extIncomeIds = extIncomes.map((i) => i.id);
  if (extIncomeIds.length > 0) await supabase.from("transactions").delete().eq("reference_type", "activity").in("reference_id", extIncomeIds);
  await supabase.from("transactions").delete().eq("reference_type", "payment").eq("reference_id", activityId);
  await supabase.from("budget_requests").delete().eq("activity_id", activityId);
  await supabase.from("activities").delete().eq("id", activityId);
  await writeLog(userId, "delete_activity", "activity", activityId, { title: act.title });
  res.json({ success: true });
}));
router6.post("/activities/update", asyncHandler(async (req, res) => {
  const { activityId, userId, title, description, eventDate, location, budgetEstimated, budgetApproved, actualExpense, refundAmount, expenseReceipts, status } = req.body;
  if (!activityId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!(isCommitteeRole(user) || act.proposed_by === userId)) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E41\u0E01\u0E49\u0E44\u0E02\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49" });
  const updateData = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (title !== void 0) updateData.title = title;
  if (description !== void 0) updateData.description = description;
  if (eventDate !== void 0) updateData.event_date = eventDate || null;
  if (location !== void 0) updateData.location = location;
  if (budgetEstimated !== void 0) updateData.budget_estimated = Number(budgetEstimated || 0);
  if (budgetApproved !== void 0) updateData.budget_approved = Number(budgetApproved || 0);
  if (actualExpense !== void 0) updateData.actual_expense = Number(actualExpense || 0);
  if (refundAmount !== void 0) updateData.refund_amount = Number(refundAmount || 0);
  if (expenseReceipts !== void 0) updateData.expense_receipts = expenseReceipts;
  if (status !== void 0) updateData.status = status;
  const { data: updatedAct, error } = await supabase.from("activities").update(updateData).eq("id", activityId).select("*").single();
  if (error) return res.status(500).json({ error: error.message });
  await writeLog(userId, "update_activity", "activity", activityId, { title: updatedAct.title });
  res.json({ success: true, activity: convertKeysToCamel(updatedAct) });
}));
router6.post("/activities/approve", asyncHandler(async (req, res) => {
  const { activityId, treasurerId, action, rejectReason, budgetApproved } = req.body;
  if (!activityId || !treasurerId || !action) return res.status(400).json({ error: "Missing parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  if (action === "approve") {
    if (act.status === "approved" || act.status === "in_progress" || act.status === "completed") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    await supabase.from("activities").update({ status: "approved", budget_approved: Number(budgetApproved || act.budget_estimated), approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", activityId);
    await createNotification(act.proposed_by, "\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27 \u{1F49A}", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${act.title}" \u0E44\u0E14\u0E49\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34 \u0E22\u0E2D\u0E14\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E04\u0E37\u0E2D ${Number(budgetApproved || act.budget_estimated)} \u0E1A\u0E32\u0E17`, "activity", activityId, "activity");
  } else {
    if (act.status === "rejected") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    await supabase.from("activities").update({ status: "rejected", reject_reason: rejectReason, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", activityId);
    await createNotification(act.proposed_by, "\u274C \u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${act.title}" \u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34: "${rejectReason}"`, "activity", activityId, "activity");
  }
  await writeLog(treasurerId, `${action}_activity`, "activity", activityId, { title: act.title, reason: rejectReason });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));
router6.post("/activities/budget/request", asyncHandler(async (req, res) => {
  const { activityId, title, amount, reason, details, documentUrls, userId } = req.body;
  if (!title || !amount || !userId) return res.status(400).json({ error: "Missing parameters" });
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0 \u0E1A\u0E32\u0E17" });
  const reqId = generateId("bud");
  const newReq = { id: reqId, activity_id: activityId || null, title, amount: numAmount, reason: reason || "", details: details || "", document_urls: documentUrls || [], status: "pending", requested_by: userId, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("budget_requests").insert(newReq);
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E43\u0E2B\u0E21\u0E48", `\u0E04\u0E38\u0E13 ${user?.full_name} \u0E22\u0E37\u0E48\u0E19\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E07\u0E1A: "${title}" \u0E08\u0E33\u0E19\u0E27\u0E19 ${numAmount} \u0E1A\u0E32\u0E17`, "activity", reqId, "budget_request");
  await writeLog(userId, "request_budget", "budget_request", reqId, { title, amount: numAmount });
  res.json({ success: true, budgetRequest: convertKeysToCamel(newReq) });
}));
router6.post("/activities/budget/approve", asyncHandler(async (req, res) => {
  const { requestId, treasurerId, action, rejectReason } = req.body;
  if (!requestId || !treasurerId || !action) return res.status(400).json({ error: "Missing parameters" });
  const { data: budgetReq } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  if (!budgetReq) return res.status(404).json({ error: "Budget request not found" });
  if (action === "approve") {
    if (budgetReq.status === "approved") {
      return res.json({ success: true, budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "approved", approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", requestId);
    await supabase.from("transactions").insert({ id: generateId("tx"), type: "expense", category: "activity_expense", amount: budgetReq.amount, description: `\u0E08\u0E48\u0E32\u0E22\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23: ${budgetReq.title}`, reference_id: budgetReq.id, reference_type: "budget_request", created_by: treasurerId, approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: (/* @__PURE__ */ new Date()).toISOString() });
    if (budgetReq.activity_id) await supabase.from("activities").update({ status: "in_progress", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", budgetReq.activity_id);
    await createNotification(budgetReq.requested_by, "\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27 \u{1F4B8}", `\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E07\u0E1A "${budgetReq.title}" \u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19 ${budgetReq.amount} \u0E1A\u0E32\u0E17 \u0E42\u0E2D\u0E19\u0E08\u0E48\u0E32\u0E22\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22`, "activity", requestId, "budget_request");
  } else {
    if (budgetReq.status === "rejected") {
      return res.json({ success: true, budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "rejected", reject_reason: rejectReason }).eq("id", requestId);
    await createNotification(budgetReq.requested_by, "\u274C \u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E07\u0E1A\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34", `\u0E04\u0E33\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E07\u0E1A "${budgetReq.title}" \u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18: "${rejectReason}"`, "activity", requestId, "budget_request");
  }
  await writeLog(treasurerId, `${action}_budget_request`, "budget_request", requestId, { title: budgetReq.title, amount: budgetReq.amount });
  const { data: updated } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  res.json({ success: true, budgetRequest: convertKeysToCamel(updated) });
}));
router6.post("/activities/budget-expansion/propose", asyncHandler(async (req, res) => {
  const { activityId, originalRequestId, amount, reason, userId } = req.body;
  if (!activityId || !originalRequestId || !amount || !userId) return res.status(400).json({ error: "Missing required parameters" });
  await supabase.from("activities").update({ budget_expansion_requested: Number(amount), budget_expansion_reason: reason || "", budget_expansion_status: "pending", budget_expansion_reject_reason: "" }).eq("id", activityId);
  const { data: originalReq } = await supabase.from("budget_requests").select("title").eq("id", originalRequestId).single();
  const reqId = generateId("exp");
  const newReq = { id: reqId, activity_id: activityId, title: `\u0E02\u0E22\u0E32\u0E22\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 (${originalReq?.title || "\u0E07\u0E1A\u0E22\u0E48\u0E2D\u0E22"})`, amount: Number(amount), reason: reason || "", status: "pending", requested_by: userId, is_expansion: true, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("budget_requests").insert(newReq);
  const { data: act } = await supabase.from("activities").select("title").eq("id", activityId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E04\u0E33\u0E40\u0E2A\u0E19\u0E2D\u0E02\u0E2D\u0E02\u0E22\u0E32\u0E22\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 \u{1F4C8}", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${act?.title}" \u0E22\u0E37\u0E48\u0E19\u0E02\u0E2D\u0E02\u0E22\u0E32\u0E22\u0E07\u0E1A\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 ${amount} \u0E1A\u0E32\u0E17 \u0E42\u0E14\u0E22\u0E04\u0E38\u0E13 ${user?.full_name}`, "activity", reqId, "budget_request");
  await writeLog(userId, "propose_budget_expansion", "activity", activityId, { amount: Number(amount) });
  const { data: updatedAct } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updatedAct), budgetRequest: convertKeysToCamel(newReq) });
}));
router6.post("/activities/budget-expansion/approve", asyncHandler(async (req, res) => {
  const { requestId, treasurerId, action, rejectReason } = req.body;
  if (!requestId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: budgetReq } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  if (!budgetReq) return res.status(404).json({ error: "Budget request not found" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", budgetReq.activity_id).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  if (action === "approve") {
    if (budgetReq.status === "approved") {
      return res.json({ success: true, activity: convertKeysToCamel(act), budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "approved", approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", requestId);
    const newBudget = (act.budget_approved || act.budget_estimated || 0) + budgetReq.amount;
    await supabase.from("activities").update({ budget_approved: newBudget, budget_expansion_status: "approved", budget_expansion_approved_by: treasurerId, budget_expansion_approved_at: (/* @__PURE__ */ new Date()).toISOString(), budget_expansion_reject_reason: "" }).eq("id", budgetReq.activity_id);
    await supabase.from("transactions").insert({ id: generateId("tx"), type: "expense", category: "activity_expense", amount: budgetReq.amount, description: `\u0E08\u0E48\u0E32\u0E22\u0E40\u0E07\u0E34\u0E19\u0E02\u0E22\u0E32\u0E22\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23: ${budgetReq.title}`, reference_id: budgetReq.id, reference_type: "budget_request", created_by: treasurerId, approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: (/* @__PURE__ */ new Date()).toISOString() });
    await createNotification(act.proposed_by, "\u0E04\u0E33\u0E02\u0E2D\u0E02\u0E22\u0E32\u0E22\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27! \u{1F389}", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${act.title}" \u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E07\u0E1A\u0E2D\u0E35\u0E01 ${budgetReq.amount} \u0E1A\u0E32\u0E17`, "activity", budgetReq.activity_id, "activity");
  } else {
    if (budgetReq.status === "rejected") {
      return res.json({ success: true, activity: convertKeysToCamel(act), budgetRequest: convertKeysToCamel(budgetReq) });
    }
    await supabase.from("budget_requests").update({ status: "rejected", reject_reason: rejectReason || "" }).eq("id", requestId);
    await supabase.from("activities").update({ budget_expansion_status: "rejected", budget_expansion_reject_reason: rejectReason || "" }).eq("id", budgetReq.activity_id);
    await createNotification(act.proposed_by, "\u0E04\u0E33\u0E02\u0E2D\u0E02\u0E22\u0E32\u0E22\u0E07\u0E1A\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18 \u274C", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${act.title}" \u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E07\u0E1A: "${rejectReason}"`, "activity", budgetReq.activity_id, "activity");
  }
  await writeLog(treasurerId, `respond_budget_expansion_${action}`, "activity", budgetReq.activity_id, { amount: budgetReq.amount });
  const { data: updatedAct } = await supabase.from("activities").select("*").eq("id", budgetReq.activity_id).single();
  const { data: updatedReq } = await supabase.from("budget_requests").select("*").eq("id", requestId).single();
  res.json({ success: true, activity: convertKeysToCamel(updatedAct), budgetRequest: convertKeysToCamel(updatedReq) });
}));
router6.post("/activities/external-income/propose", asyncHandler(async (req, res) => {
  const { activityId, amount, source, slipUrl, userId } = req.body;
  if (!activityId || !amount || !source || !userId) return res.status(400).json({ error: "Missing required parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const incId = generateId("inc");
  const externalIncomes = act.external_incomes || [];
  externalIncomes.unshift({ id: incId, activityId, amount: Number(amount), source, slipUrl: slipUrl || "", status: "pending", requestedBy: userId, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  await supabase.from("activities").update({ external_incomes: externalIncomes }).eq("id", activityId);
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: user } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E43\u0E2B\u0E21\u0E48 \u{1F4E5}", `\u0E04\u0E38\u0E13 ${user?.full_name} \u0E41\u0E08\u0E49\u0E07\u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19 ${amount} \u0E1A\u0E32\u0E17 \u0E08\u0E32\u0E01 "${source}"`, "activity", incId, "external_income");
  await writeLog(userId, "propose_external_income", "activity", activityId, { amount: Number(amount), source });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));
router6.post("/activities/external-income/approve", asyncHandler(async (req, res) => {
  const { activityId, incomeId, treasurerId, action, rejectReason } = req.body;
  if (!activityId || !incomeId || !treasurerId || !action) return res.status(400).json({ error: "Missing required parameters" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  const externalIncomes = act.external_incomes || [];
  const incIndex = externalIncomes.findIndex((i) => i.id === incomeId);
  if (incIndex === -1) return res.status(404).json({ error: "Income record not found" });
  const income = externalIncomes[incIndex];
  if (action === "approve") {
    if (income.status === "approved") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    income.status = "approved";
    income.approvedBy = treasurerId;
    income.approvedAt = (/* @__PURE__ */ new Date()).toISOString();
    await createNotification(income.requestedBy, "\u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E41\u0E25\u0E49\u0E27! \u{1F389}", `\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E08\u0E33\u0E19\u0E27\u0E19 ${income.amount} \u0E1A\u0E32\u0E17 \u0E08\u0E32\u0E01 "${income.source}" \u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E41\u0E25\u0E49\u0E27`, "activity", activityId, "activity");
  } else {
    if (income.status === "rejected") {
      return res.json({ success: true, activity: convertKeysToCamel(act) });
    }
    income.status = "rejected";
    income.rejectReason = rejectReason || "";
    await createNotification(income.requestedBy, "\u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18 \u274C", `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E08\u0E32\u0E01 "${income.source}" \u0E08\u0E33\u0E19\u0E27\u0E19 ${income.amount} \u0E1A\u0E32\u0E17 \u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18`, "activity", activityId, "activity");
  }
  externalIncomes[incIndex] = income;
  await supabase.from("activities").update({ external_incomes: externalIncomes }).eq("id", activityId);
  await writeLog(treasurerId, `respond_external_income_${action}`, "activity", activityId, { amount: income.amount });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));
router6.post("/activities/settle/propose", asyncHandler(async (req, res) => {
  const { activityId, actualExpense, refundAmount, refundSlipUrl, expenseReceipts, userId } = req.body;
  if (!activityId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: act } = await supabase.from("activities").select("status").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  if (act.status !== "in_progress" && act.status !== "pending_settlement") return res.status(400).json({ error: "\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E07\u0E32\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E22\u0E37\u0E48\u0E19\u0E1B\u0E34\u0E14\u0E07\u0E32\u0E19" });
  await supabase.from("activities").update({ status: "pending_settlement", actual_expense: Number(actualExpense || 0), refund_amount: Number(refundAmount || 0), refund_slip_url: refundSlipUrl || "", expense_receipts: expenseReceipts || [], updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", activityId);
  const { data: updatedAct } = await supabase.from("activities").select("title").eq("id", activityId).single();
  const { data: treasurers } = await supabase.from("users").select("id").eq("role", "treasurer");
  const { data: proposer } = await supabase.from("users").select("full_name").eq("id", userId).single();
  const treasurerIds = (treasurers || []).map((t) => t.id);
  await createNotificationsBulk(treasurerIds, "\u0E21\u0E35\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E22\u0E37\u0E48\u0E19\u0E1B\u0E34\u0E14\u0E07\u0E32\u0E19\u0E41\u0E25\u0E30\u0E17\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19 \u{1F4DD}", `\u0E04\u0E38\u0E13 ${proposer?.full_name} \u0E22\u0E37\u0E48\u0E19\u0E2A\u0E23\u0E38\u0E1B\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${updatedAct?.title}"`, "activity", activityId, "activity");
  await writeLog(userId, "propose_settlement", "activity", activityId, { title: updatedAct?.title, actualExpense, refundAmount });
  const { data: finalAct } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(finalAct) });
}));
router6.post("/activities/settle/approve", asyncHandler(async (req, res) => {
  const { activityId, treasurerId, action, rejectReason } = req.body;
  if (!activityId || !treasurerId || !action) return res.status(400).json({ error: "Missing parameters" });
  const { data: actingUser } = await supabase.from("users").select("role").eq("id", treasurerId).single();
  if (!actingUser || actingUser.role !== "treasurer") return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19)" });
  const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!act) return res.status(404).json({ error: "Activity not found" });
  if (action === "approve" && act.status === "completed") {
    return res.json({ success: true, activity: convertKeysToCamel(act) });
  }
  if (act.status !== "pending_settlement") return res.status(400).json({ error: "\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E02\u0E31\u0E49\u0E19\u0E15\u0E2D\u0E19\u0E23\u0E2D\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E1B\u0E34\u0E14\u0E07\u0E32\u0E19" });
  if (action === "approve") {
    await supabase.from("activities").update({ status: "completed", settled_by: treasurerId, settled_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", activityId);
    if (act.refund_amount && act.refund_amount > 0) {
      await supabase.from("transactions").insert({ id: generateId("tx_refund"), type: "income", category: "other_income", amount: act.refund_amount, description: `\u0E40\u0E07\u0E34\u0E19\u0E17\u0E2D\u0E19/\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E08\u0E32\u0E01\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23: ${act.title} (\u0E19\u0E33\u0E40\u0E02\u0E49\u0E32\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E2A\u0E48\u0E27\u0E19\u0E01\u0E25\u0E32\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14)`, reference_id: act.id, reference_type: "payment", created_by: treasurerId, approved_by: treasurerId, approved_at: (/* @__PURE__ */ new Date()).toISOString(), month: getCurrentMonth(), year: getCurrentBuddhistYear(), is_closed: false, created_at: (/* @__PURE__ */ new Date()).toISOString() });
    }
    await createNotification(act.proposed_by, "\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E1B\u0E34\u0E14\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2A\u0E34\u0E49\u0E19\u0E41\u0E25\u0E49\u0E27 \u{1F389}", `\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${act.title}" \u0E44\u0E14\u0E49\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E1B\u0E34\u0E14\u0E22\u0E2D\u0E14\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27`, "activity", activityId, "activity");
  } else {
    await supabase.from("activities").update({ status: "in_progress", reject_reason: rejectReason || "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", activityId);
    await createNotification(act.proposed_by, "\u274C \u0E04\u0E33\u0E02\u0E2D\u0E1B\u0E34\u0E14\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18", `\u0E04\u0E33\u0E02\u0E2D\u0E1B\u0E34\u0E14\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23 "${act.title}" \u0E44\u0E21\u0E48\u0E1C\u0E48\u0E32\u0E19: "${rejectReason || "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07"}"`, "activity", activityId, "activity");
  }
  await writeLog(treasurerId, `${action}_settlement`, "activity", activityId, { title: act.title, action, reason: rejectReason });
  const { data: updated } = await supabase.from("activities").select("*").eq("id", activityId).single();
  res.json({ success: true, activity: convertKeysToCamel(updated) });
}));
var activities_default = router6;

// server/routes/members.ts
import { Router as Router7 } from "express";
var router7 = Router7();
router7.post("/members/update", asyncHandler(async (req, res) => {
  const { targetUserId, role, position, isActive, userId, fullName, nickname, email, phone, classroom } = req.body;
  if (!targetUserId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: actingUser } = await supabase.from("users").select("*").eq("id", userId).single();
  const { data: targetUser } = await supabase.from("users").select("*").eq("id", targetUserId).single();
  if (!actingUser || !targetUser) return res.status(404).json({ error: "User not found" });
  const isSelf = targetUserId === userId;
  let hasEditPermission = isSelf;
  if (actingUser.role === "treasurer") hasEditPermission = true;
  else if (actingUser.role === "leader" && actingUser.classroom === targetUser.classroom) hasEditPermission = true;
  if (!hasEditPermission) return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E04\u0E19\u0E19\u0E35\u0E49" });
  const isChangingPrivileged = role !== void 0 || position !== void 0 || isActive !== void 0 || classroom !== void 0;
  if (isChangingPrivileged && actingUser.role !== "treasurer") return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1B\u0E23\u0E31\u0E1A\u0E41\u0E15\u0E48\u0E07\u0E1A\u0E17\u0E1A\u0E32\u0E17\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C/\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07/\u0E2B\u0E49\u0E2D\u0E07\u0E40\u0E23\u0E35\u0E22\u0E19" });
  const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (fullName !== void 0) updates.full_name = fullName;
  if (nickname !== void 0) updates.nickname = nickname;
  if (email !== void 0) updates.email = email;
  if (phone !== void 0) updates.phone = phone;
  if (actingUser.role === "treasurer") {
    if (role !== void 0) updates.role = role;
    if (position !== void 0) updates.position = position;
    if (isActive !== void 0) updates.is_active = isActive;
    if (classroom !== void 0) updates.classroom = classroom;
  }
  await supabase.from("users").update(updates).eq("id", targetUserId);
  await writeLog(userId, "update_member_profile", "users", targetUserId, { role, position, isActive, fullName, nickname });
  const { data: updated } = await supabase.from("users").select("*").eq("id", targetUserId).single();
  const { password: _pw, ...safeUpdated } = updated || {};
  res.json({ success: true, user: convertKeysToCamel(safeUpdated) });
}));
router7.post("/members/add", asyncHandler(async (req, res) => {
  const { studentId, fullName, nickname, email, phone, role, position, classroom, userId } = req.body;
  if (!studentId || !fullName || !userId) return res.status(400).json({ error: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19" });
  const { data: creator } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!creator) return res.status(403).json({ error: "User unauthorized" });
  if (creator.role !== "treasurer" && creator.role !== "leader") return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23" });
  const { data: existing } = await supabase.from("users").select("id").eq("student_id", studentId);
  if (existing && existing.length > 0) return res.status(400).json({ error: "\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32\u0E19\u0E35\u0E49\u0E21\u0E35\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E41\u0E25\u0E49\u0E27" });
  let targetClassroom = classroom || "\u0E2B\u0E49\u0E2D\u0E07 1";
  let targetRole = role || "member";
  if (creator.role === "leader") {
    targetClassroom = creator.classroom || "\u0E2B\u0E49\u0E2D\u0E07 1";
    targetRole = "member";
  }
  const newUserId = `usr_${studentId}`;
  const hashedDefault = hashPassword("123456");
  const newUser = { id: newUserId, student_id: studentId, full_name: fullName, nickname: nickname || fullName.split(" ")[0], email: email || `${studentId}@student.university.ac.th`, phone: phone || "", role: targetRole, position: position || "\u0E19\u0E31\u0E01\u0E28\u0E36\u0E01\u0E29\u0E32\u0E0A\u0E31\u0E49\u0E19\u0E1B\u0E35\u0E17\u0E35\u0E48 3", classroom: targetClassroom, is_active: true, password: hashedDefault, created_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("users").insert(newUser);
  await writeLog(userId, "add_member", "users", newUserId, { fullName, studentId, role: targetRole });
  const { password: _pw, ...safeNewUser } = newUser;
  res.json({ success: true, user: convertKeysToCamel(safeNewUser) });
}));
router7.post("/members/delete", asyncHandler(async (req, res) => {
  const { targetUserId, userId } = req.body;
  if (!targetUserId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: creator } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!creator || creator.role !== "treasurer") return res.status(403).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23 (\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19)" });
  if (targetUserId === userId) return res.status(400).json({ error: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E1A\u0E15\u0E31\u0E27\u0E40\u0E2D\u0E07\u0E44\u0E14\u0E49" });
  const { data: deletedUser } = await supabase.from("users").select("*").eq("id", targetUserId).single();
  if (!deletedUser) return res.status(404).json({ error: "User not found" });
  const { data: userBills } = await supabase.from("monthly_bills").select("id").eq("user_id", targetUserId);
  const billIds = (userBills || []).map((b) => b.id);
  const paymentIdsSet = /* @__PURE__ */ new Set();
  if (billIds.length > 0) {
    const { data: billPayments } = await supabase.from("payments").select("id").in("bill_id", billIds);
    (billPayments || []).forEach((p) => paymentIdsSet.add(p.id));
  }
  const { data: directPayments } = await supabase.from("payments").select("id").eq("user_id", targetUserId);
  (directPayments || []).forEach((p) => paymentIdsSet.add(p.id));
  const paymentIds = Array.from(paymentIdsSet);
  if (paymentIds.length > 0) {
    await supabase.from("transactions").delete().eq("reference_type", "payment").in("reference_id", paymentIds);
  }
  if (billIds.length > 0) await supabase.from("payments").delete().in("bill_id", billIds);
  await supabase.from("monthly_bills").delete().eq("user_id", targetUserId);
  await supabase.from("payments").delete().eq("user_id", targetUserId);
  await supabase.from("notifications").delete().eq("user_id", targetUserId);
  await supabase.from("password_resets").delete().eq("user_id", targetUserId);
  await supabase.from("users").delete().eq("id", targetUserId);
  await writeLog(userId, "delete_member", "users", targetUserId, { fullName: deletedUser.full_name, studentId: deletedUser.student_id });
  res.json({ success: true });
}));
var members_default = router7;

// server/routes/misc.ts
import { Router as Router8 } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
var router8 = Router8();
router8.get("/backups/list", asyncHandler(async (req, res) => {
  res.json([]);
}));
router8.post("/backups/create", asyncHandler(async (req, res) => {
  const { note, userId } = req.body;
  const state = await loadFullState();
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const filename = `backup_supabase_${dateStr}.json`;
  if (userId) await writeLog(userId, "create_backup", "system", void 0, { filename });
  res.json({ success: true, filename, cloudSaved: true, message: "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E08\u0E38\u0E14\u0E41\u0E1A\u0E47\u0E01\u0E2D\u0E31\u0E1B\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22 (\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19 Supabase \u0E2D\u0E22\u0E48\u0E32\u0E07\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22)" });
}));
router8.post("/backups/restore", asyncHandler(async (req, res) => {
  res.json({ success: true, message: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E19 Supabase \u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30" });
}));
router8.post("/backups/upload", asyncHandler(async (req, res) => {
  const { uploadedState, userId } = req.body;
  if (!uploadedState) return res.status(400).json({ error: "Missing uploaded state data" });
  res.json({ success: true, message: "\u0E23\u0E30\u0E1A\u0E1A\u0E43\u0E0A\u0E49 Supabase \u0E41\u0E25\u0E49\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E43\u0E0A\u0E49 migration script \u0E41\u0E17\u0E19\u0E04\u0E48\u0E30" });
}));
router8.get("/backups/download", asyncHandler(async (req, res) => {
  const state = await loadFullState();
  const downloadName = `backup_supabase_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`;
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(state, null, 2));
}));
router8.post("/backups/delete", asyncHandler(async (req, res) => {
  res.json({ success: true, message: "\u0E25\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E41\u0E1A\u0E47\u0E01\u0E2D\u0E31\u0E1B\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27\u0E04\u0E48\u0E30" });
}));
router8.post("/announcements/create", asyncHandler(async (req, res) => {
  const { title, content, priority, isPinned, userId } = req.body;
  if (!title || !content || !userId) return res.status(400).json({ error: "Missing fields" });
  const annId = generateId("ann");
  const newAnn = { id: annId, title, content, priority: priority || "normal", is_pinned: !!isPinned, created_by: userId, created_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("announcements").insert(newAnn);
  const { data: allUsers } = await supabase.from("users").select("id");
  const recipientIds = (allUsers || []).map((u) => u.id).filter((id) => id !== userId);
  await createNotificationsBulk(recipientIds, `\u0E1B\u0E23\u0E30\u0E01\u0E32\u0E28\u0E43\u0E2B\u0E21\u0E48: ${title}`, content.length > 100 ? content.substring(0, 100) + "..." : content, "announcement", annId, "announcement");
  await writeLog(userId, "create_announcement", "announcements", annId, { title });
  res.json({ success: true, announcement: convertKeysToCamel(newAnn) });
}));
router8.post("/announcements/delete", asyncHandler(async (req, res) => {
  const { annId, userId } = req.body;
  if (!annId || !userId) return res.status(400).json({ error: "Missing fields" });
  const { data: ann } = await supabase.from("announcements").select("title").eq("id", annId).single();
  if (!ann) return res.status(404).json({ error: "Announcement not found" });
  await supabase.from("announcements").delete().eq("id", annId);
  await writeLog(userId, "delete_announcement", "announcements", annId, { title: ann.title });
  res.json({ success: true });
}));
router8.post("/transactions/close-month", asyncHandler(async (req, res) => {
  const { month, year, userId } = req.body;
  if (!month || !year || !userId) return res.status(400).json({ error: "Missing fields" });
  await supabase.from("transactions").update({ is_closed: true }).eq("month", Number(month)).eq("year", Number(year));
  await writeLog(userId, "close_accounts_month", "transactions", `${month}/${year}`);
  res.json({ success: true });
}));
router8.post("/transactions/delete", asyncHandler(async (req, res) => {
  const { transactionId, userId } = req.body;
  if (!transactionId || !userId) return res.status(400).json({ error: "Missing parameters" });
  const { data: user } = await supabase.from("users").select("role").eq("id", userId).single();
  if (!user || user.role !== "treasurer") return res.status(403).json({ error: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E44\u0E14\u0E49" });
  const { data: tx } = await supabase.from("transactions").select("*").eq("id", transactionId).single();
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  if (tx.reference_type === "payment" && tx.reference_id) {
    const { data: payment } = await supabase.from("payments").select("*").eq("id", tx.reference_id).single();
    if (payment) {
      await supabase.from("payments").delete().eq("id", payment.id);
      if (payment.bill_id) {
        await updateBillStatus(payment.bill_id);
      }
    }
  }
  await supabase.from("transactions").delete().eq("id", transactionId);
  await writeLog(userId, "delete_transaction", "transactions", transactionId, { description: tx.description, amount: tx.amount });
  res.json({ success: true });
}));
router8.post("/petitions/submit", asyncHandler(async (req, res) => {
  const { title, category, content, isAnonymous, userId } = req.body;
  if (!title || !category || !content || !userId) return res.status(400).json({ error: "Missing required fields" });
  const petId = generateId("pet");
  const newPet = { id: petId, title, category, content, status: "pending", is_anonymous: !!isAnonymous, submitted_by: userId, response: "", created_at: (/* @__PURE__ */ new Date()).toISOString() };
  await supabase.from("petitions").insert(newPet);
  await writeLog(userId, "submit_petition", "petitions", petId, { title, category });
  res.json({ success: true, petition: convertKeysToCamel(newPet) });
}));
router8.post("/petitions/respond", asyncHandler(async (req, res) => {
  const { petitionId, status, response, adminId } = req.body;
  if (!petitionId || !status || !adminId) return res.status(400).json({ error: "Missing required fields" });
  await supabase.from("petitions").update({ status, response: response || "", resolved_at: (/* @__PURE__ */ new Date()).toISOString(), resolved_by: adminId }).eq("id", petitionId);
  await writeLog(adminId, "respond_petition", "petitions", petitionId, { status });
  const { data: pet } = await supabase.from("petitions").select("*").eq("id", petitionId).single();
  res.json({ success: true, petition: convertKeysToCamel(pet) });
}));
router8.post("/notifications/read", asyncHandler(async (req, res) => {
  const { notId, userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (notId) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", notId).eq("user_id", userId);
  } else {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
  }
  res.json({ success: true });
}));
router8.post("/notifications/remind", asyncHandler(async (req, res) => {
  const { userId, senderId, message, title } = req.body;
  if (!userId || !senderId || !message) return res.status(400).json({ error: "Missing required fields" });
  const { data: sender } = await supabase.from("users").select("role").eq("id", senderId).single();
  if (!sender || sender.role !== "treasurer") return res.status(403).json({ error: "Only treasurers can send reminders." });
  await createNotification(userId, title || "\u{1F514} \u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E23\u0E32\u0E22\u0E1A\u0E38\u0E04\u0E04\u0E25", message, "bill", senderId, "user");
  await writeLog(senderId, "send_individual_reminder", "users", userId, { message });
  res.json({ success: true, message: "\u0E2A\u0E48\u0E07\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E23\u0E32\u0E22\u0E1A\u0E38\u0E04\u0E04\u0E25\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27" });
}));
router8.post("/gemini/chat", asyncHandler(async (req, res) => {
  const { prompt, history, userId } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });
  const state = await loadFullState();
  const activeStudentsCount = state.users.filter((u) => u.isActive).length;
  const currentFundBalance = state.transactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0) - 3802;
  const totalIncome = state.transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = state.transactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  const currentMonth = getCurrentMonth();
  const currentYear = getCurrentBuddhistYear();
  const currentMonthBills = state.monthlyBills.filter((b) => b.month === currentMonth && b.year === currentYear);
  const paidCount = currentMonthBills.filter((b) => b.status === "paid").length;
  const pendingReviewCount = currentMonthBills.filter((b) => b.status === "pending_review").length;
  const unpaidCount = currentMonthBills.filter((b) => b.status === "pending").length;
  const unpaidStudentsList = currentMonthBills.filter((b) => b.status === "pending").map((b) => {
    const u = state.users.find((usr) => usr.id === b.userId);
    return u ? `${u.fullName} (\u0E23\u0E2B\u0E31\u0E2A ${u.studentId})` : "";
  }).filter(Boolean).join(", ");
  const systemInstruction = `\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D "\u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E40\u0E2B\u0E23\u0E31\u0E0D\u0E0D\u0E34\u0E01 AI" \u0E1B\u0E23\u0E30\u0E08\u0E33 "\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E07\u0E34\u0E19\u0E40\u0E01\u0E47\u0E1ATns \u0E23\u0E38\u0E48\u0E1906"
\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19:
- \u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01: ${activeStudentsCount} \u0E04\u0E19
- \u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D: ${currentFundBalance.toLocaleString()} \u0E1A\u0E32\u0E17 (\u0E23\u0E32\u0E22\u0E23\u0E31\u0E1A: ${totalIncome.toLocaleString()} / \u0E23\u0E32\u0E22\u0E08\u0E48\u0E32\u0E22: ${totalExpense.toLocaleString()})
- \u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07: ${state.settings?.monthlyFee || 150} \u0E1A\u0E32\u0E17/\u0E04\u0E19
- \u0E2A\u0E16\u0E32\u0E19\u0E30\u0E40\u0E14\u0E37\u0E2D\u0E19 ${currentMonth}/${currentYear}: \u0E08\u0E48\u0E32\u0E22\u0E41\u0E25\u0E49\u0E27 ${paidCount} \u0E04\u0E19, \u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08 ${pendingReviewCount} \u0E04\u0E19, \u0E04\u0E49\u0E32\u0E07\u0E0A\u0E33\u0E23\u0E30 ${unpaidCount} \u0E04\u0E19
- \u0E04\u0E49\u0E32\u0E07\u0E0A\u0E33\u0E23\u0E30: [${unpaidStudentsList || "\u0E44\u0E21\u0E48\u0E21\u0E35"}]
\u0E15\u0E2D\u0E1A\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22 \u0E2A\u0E38\u0E20\u0E32\u0E1E \u0E0A\u0E32\u0E0D\u0E09\u0E25\u0E32\u0E14`;
  const apiKey = ENV.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  const contents = [];
  if (history && Array.isArray(history)) {
    history.forEach((msg) => contents.push({ role: msg.role === "user" ? "user" : "model", parts: [{ text: msg.text }] }));
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });
  const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents, config: { systemInstruction, temperature: 0.7 } });
  res.json({ reply: response.text || "\u0E02\u0E2D\u0E2D\u0E20\u0E31\u0E22 \u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E04\u0E33\u0E15\u0E2D\u0E1A\u0E44\u0E14\u0E49" });
}));
router8.get("/images/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Invalid image ID" });
  const cleanId = id.replace(/^google_drive:/, "");
  let base64Str = null;
  const { data: doc } = await supabase.from("images").select("base64").eq("id", cleanId).single();
  if (doc?.base64) base64Str = doc.base64;
  if (!base64Str) {
    try {
      const filePath = path.join(process.cwd(), "src", "uploads", `${cleanId}.txt`);
      if (fs.existsSync(filePath)) base64Str = fs.readFileSync(filePath, "utf-8");
    } catch (err) {
    }
  }
  if (!base64Str && /^[a-zA-Z0-9_-]{15,100}$/.test(cleanId)) {
    base64Str = `google_drive:${cleanId}`;
  }
  if (!base64Str) return res.status(404).json({ error: "Image not found" });
  if (base64Str.startsWith("google_drive:")) {
    const fileId = base64Str.replace("google_drive:", "");
    const customToken = req.query.token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
    try {
      console.log(`[Google Drive Proxy] Fetching image file: ${fileId}`);
      const { data, mimeType } = await downloadFile(fileId, customToken);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(data);
    } catch (err) {
      console.error(`[Google Drive Proxy] Failed to proxy image ${fileId}:`, err.message);
      return res.status(500).json({ error: "Failed to load image from Google Drive" });
    }
  }
  try {
    const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      res.setHeader("Content-Type", match[1]);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      return res.send(Buffer.from(match[2], "base64"));
    }
  } catch (err) {
  }
  res.status(500).json({ error: "Failed to render image" });
}));
router8.get("/realtime-stream", handleRealtimeStream);
var misc_default = router8;

// server/routes/publicPreview.ts
import { Router as Router9 } from "express";
var router9 = Router9();
router9.get("/public/preview", asyncHandler(async (req, res) => {
  const [
    { data: settingsArr },
    { count: memberCount },
    { data: transactions },
    { data: monthlyBills },
    { data: marketWeeks },
    { data: activities },
    { data: announcements }
  ] = await Promise.all([
    supabase.from("settings").select("*"),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("transactions").select("id, type, category, amount, month, year, created_at").order("created_at", { ascending: false }),
    supabase.from("monthly_bills").select("id, month, year, amount, status, due_date, created_at").order("created_at", { ascending: false }),
    supabase.from("market_weeks").select("id, week_date, total_cost, total_revenue, total_profit, status, team_name, created_at").order("created_at", { ascending: false }),
    supabase.from("activities").select("id, title, description, status, event_date, location, created_at, updated_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("announcements").select("id, title, content, priority, is_pinned, created_at").order("created_at", { ascending: false }).limit(5)
  ]);
  const rawSettings = settingsArr && settingsArr.length > 0 ? settingsArr[0] : {};
  const safeSettings = {
    fundName: rawSettings.fund_name || "\u0E40\u0E07\u0E34\u0E19\u0E40\u0E01\u0E47\u0E1ATns \u0E23\u0E38\u0E48\u0E1906",
    monthlyFee: rawSettings.monthly_fee || 150
  };
  const txList = transactions || [];
  const totalIncome = txList.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalExpense = txList.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalBalance = totalIncome - totalExpense - 3802;
  const feeIncome = txList.filter((tx) => tx.category === "monthly_fee").reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const marketProfit = txList.filter((tx) => tx.category === "market_profit").reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const activityExpense = txList.filter((tx) => tx.category === "activity_expense").reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const bills = monthlyBills || [];
  let latestMonth = 0;
  let latestYear = 0;
  if (bills.length > 0) {
    const sorted = [...bills].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
    latestMonth = sorted[0].month;
    latestYear = sorted[0].year;
  }
  const currentCycleBills = bills.filter((b) => b.month === latestMonth && b.year === latestYear);
  const billingSummary = {
    month: latestMonth,
    year: latestYear,
    totalMembers: currentCycleBills.length,
    paidCount: currentCycleBills.filter((b) => b.status === "paid").length,
    pendingReviewCount: currentCycleBills.filter((b) => b.status === "pending_review").length,
    unpaidCount: currentCycleBills.filter((b) => b.status === "pending").length,
    amountPerPerson: currentCycleBills.length > 0 ? currentCycleBills[0].amount : rawSettings.monthly_fee || 150
  };
  const weeks = marketWeeks || [];
  const completedWeeks = weeks.filter((w) => w.status === "completed" || w.status === "approved");
  const marketSummary = {
    totalWeeks: weeks.length,
    completedWeeks: completedWeeks.length,
    totalProfit: completedWeeks.reduce((sum, w) => sum + (w.total_profit || 0), 0),
    totalRevenue: completedWeeks.reduce((sum, w) => sum + (w.total_revenue || 0), 0),
    totalCost: completedWeeks.reduce((sum, w) => sum + (w.total_cost || 0), 0)
  };
  const safeActivities = (activities || []).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description || "",
    status: a.status,
    eventDate: a.event_date || null,
    location: a.location || "",
    createdAt: a.created_at
  }));
  const safeAnnouncements = (announcements || []).map((a) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    priority: a.priority,
    isPinned: a.is_pinned,
    createdAt: a.created_at
  }));
  const cycleMap = /* @__PURE__ */ new Map();
  for (const b of bills) {
    const key = `${b.year}-${b.month}`;
    if (!cycleMap.has(key)) {
      cycleMap.set(key, { month: b.month, year: b.year, total: 0, paid: 0 });
    }
    const entry = cycleMap.get(key);
    entry.total++;
    if (b.status === "paid") entry.paid++;
  }
  const billingHistory = Array.from(cycleMap.values()).sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  }).slice(0, 6);
  res.json({
    settings: safeSettings,
    memberCount: memberCount || 0,
    financialSummary: {
      totalBalance,
      totalIncome,
      totalExpense,
      feeIncome,
      marketProfit,
      activityExpense
    },
    billingSummary,
    billingHistory,
    marketSummary,
    activities: safeActivities,
    announcements: safeAnnouncements,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}));
var publicPreview_default = router9;

// server/index.ts
validateEnv();
process.on("uncaughtException", (err) => {
  console.error("CRITICAL: Caught uncaughtException:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL: Caught unhandledRejection:", reason);
});
function setupGracefulShutdown(server) {
  const shutdown = (signal) => {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("[Server] HTTP server closed.");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("[Server] Force closing after timeout.");
      process.exit(1);
    }, 1e4);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
async function runAutoCleanupOldSlips() {
  try {
    const thirtyDaysAgo = /* @__PURE__ */ new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString();
    const { data: oldPayments, error: fetchError } = await supabase.from("payments").select("id, slip_url").lt("created_at", dateStr).like("slip_url", "/api/images/%");
    if (fetchError) throw fetchError;
    if (!oldPayments || oldPayments.length === 0) return;
    const imageIds = oldPayments.map((p) => p.slip_url.replace("/api/images/", ""));
    const { data: dbImages, error: imgError } = await supabase.from("images").select("id, base64").in("id", imageIds);
    if (imgError) throw imgError;
    const base64ImageIds = (dbImages || []).filter((img) => img.base64 && !img.base64.startsWith("google_drive:")).map((img) => img.id);
    const driveImagesCount = (dbImages || []).length - base64ImageIds.length;
    console.log(`[Auto Cleanup] Found ${oldPayments.length} old monthly bill slips. ${base64ImageIds.length} are base64 (to be deleted), ${driveImagesCount} are on Google Drive (will be skipped).`);
    if (base64ImageIds.length > 0) {
      const { error: deleteError } = await supabase.from("images").delete().in("id", base64ImageIds);
      if (deleteError) throw deleteError;
      const paymentIdsToUpdate = oldPayments.filter((p) => {
        const imgId = p.slip_url.replace("/api/images/", "");
        return base64ImageIds.includes(imgId);
      }).map((p) => p.id);
      if (paymentIdsToUpdate.length > 0) {
        const { error: updateError } = await supabase.from("payments").update({ slip_url: "" }).in("id", paymentIdsToUpdate);
        if (updateError) throw updateError;
      }
      console.log(`[Auto Cleanup] Successfully cleaned up ${base64ImageIds.length} base64 monthly bill slips.`);
    } else {
      console.log("[Auto Cleanup] No base64 monthly bill slips to clean up.");
    }
  } catch (err) {
    console.error("[Auto Cleanup] Error:", err.message);
  }
}
var app = express2();
applySecurityMiddleware(app);
applyBroadcastHook(app);
applyCacheControl(app);
applyImageExtractor(app);
app.use("/api", (req, res, next) => {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 SUPABASE_URL \u0E41\u0E25\u0E30 SUPABASE_SERVICE_KEY \u0E43\u0E19\u0E2B\u0E19\u0E49\u0E32 Settings -> Environment Variables \u0E02\u0E2D\u0E07 Vercel \u0E04\u0E48\u0E30"
    });
  }
  next();
});
app.use("/api", auth_default);
app.use("/api", system_default);
app.use("/api", bills_default);
app.use("/api", payments_default);
app.use("/api", market_default);
app.use("/api", activities_default);
app.use("/api", members_default);
app.use("/api", misc_default);
app.use("/api", publicPreview_default);
app.use(centralizedErrorHandler);
async function startServer() {
  if (ENV.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const viteReact = (await import("@vitejs/plugin-react")).default;
    const tailwindcss = (await import("@tailwindcss/vite")).default;
    const vite = await createViteServer({
      configFile: false,
      plugins: [viteReact(), tailwindcss()],
      resolve: {
        alias: {
          "@": path2.resolve(process.cwd(), "src")
        }
      },
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.join(process.cwd(), "dist");
    app.use(express2.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  const server = app.listen(ENV.PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${ENV.PORT}`);
  });
  setupGracefulShutdown(server);
  console.log("[Supabase] Testing connection...");
  await testSupabaseConnection();
  await runAutoCleanupOldSlips();
  setInterval(runAutoCleanupOldSlips, 24 * 60 * 60 * 1e3);
}
if (!process.env.VERCEL) {
  startServer();
}
var index_default = app;
export {
  app,
  index_default as default
};
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Entry Point - Modular Architecture
 * Supabase PostgreSQL Backend
 * 
 * Refactored from monolithic server.ts (2,189 lines) into modular structure
 * All API endpoints, business logic, and behavior are preserved identically
 */
