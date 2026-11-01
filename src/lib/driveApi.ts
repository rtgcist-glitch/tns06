/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppState } from "../types";

export interface GoogleDriveFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
  description?: string;
  mimeType?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
}

/**
 * Upload an image file (Base64 string or Blob/File) to Google Drive
 */
export async function uploadImageToDrive(
  accessToken: string,
  imageInput: string | Blob | File,
  filename: string = "uploaded_image.jpg",
  description: string = "ภาพอัปโหลดจากระบบเงินเก็บTNS",
  folderId?: string
): Promise<GoogleDriveFile> {
  const boundary = "321_DRIVE_IMAGE_BOUNDARY_999";
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  let mimeType = "image/jpeg";
  let binaryBuffer: Uint8Array;

  if (typeof imageInput === "string") {
    const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      const base64Str = match[2];
      const binaryStr = atob(base64Str);
      binaryBuffer = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        binaryBuffer[i] = binaryStr.charCodeAt(i);
      }
    } else {
      const binaryStr = atob(imageInput);
      binaryBuffer = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        binaryBuffer[i] = binaryStr.charCodeAt(i);
      }
    }
  } else {
    mimeType = imageInput.type || "image/jpeg";
    const arrayBuffer = await imageInput.arrayBuffer();
    binaryBuffer = new Uint8Array(arrayBuffer);
  }

  const metadata: Record<string, any> = {
    name: filename,
    mimeType: mimeType,
    description: description,
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const encoder = new TextEncoder();
  const part1 = encoder.encode(
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const part2 = binaryBuffer;
  const part3 = encoder.encode(close_delim);

  const fullBody = new Uint8Array(part1.length + part2.length + part3.length);
  fullBody.set(part1, 0);
  fullBody.set(part2, part1.length);
  fullBody.set(part3, part1.length + part2.length);

  const response = await fetchWithRetryAndTimeout(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime,size,description,webViewLink,webContentLink,thumbnailLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: fullBody,
    },
    3,
    1000,
    30000
  );

  return await response.json();
}

/**
 * List image files available in user's Google Drive
 */
export async function listImagesFromDrive(accessToken: string): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent("mimeType contains 'image/' and trashed=false");
  const response = await fetchWithRetryAndTimeout(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&fields=files(id,name,mimeType,createdTime,size,description,webViewLink,webContentLink,thumbnailLink)`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    3,
    1000,
    15000
  );

  const data = await response.json();
  return data.files || [];
}

/**
 * Download image file binary from Google Drive and return object URL for direct rendering
 */
export async function downloadImageBlobFromDrive(accessToken: string, fileId: string): Promise<string> {
  const response = await fetchWithRetryAndTimeout(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    3,
    1000,
    25000
  );

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Enhanced fetch with retry and timeout capabilities to handle transient network issues
 */
async function fetchWithRetryAndTimeout(
  url: string,
  options: RequestInit,
  retries: number = 3,
  delayMs: number = 1000,
  timeoutMs: number = 20000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // 401 Unauthorized means token expired/invalid, escalate immediately
      if (response.status === 401) {
        throw new Error("UNAUTHORIZED");
      }

      if (response.ok || (response.status < 500 && response.status !== 408)) {
        return response;
      }
      
      console.warn(`Google Drive API warning: status ${response.status}. Attempt ${i + 1} of ${retries}.`);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const error = err as Error;
      if (error.name === "AbortError") {
        console.warn(`Google Drive API timeout after ${timeoutMs}ms. Attempt ${i + 1} of ${retries}.`);
      } else if (error.message === "UNAUTHORIZED") {
        throw new Error("Google Drive access token has expired or is unauthorized. Please sign in again.");
      } else {
        console.warn(`Google Drive API connection error: ${error.message}. Attempt ${i + 1} of ${retries}.`);
      }
    }

    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Google Drive API request failed after ${retries} attempts.`);
}

/**
 * Upload system backup state JSON to Google Drive
 */
export async function uploadBackupToDrive(
  accessToken: string,
  stateData: AppState,
  note: string = "สำรองข้อมูลระบบกองทุน"
): Promise<GoogleDriveFile> {
  const boundary = "321_DRIVE_BACKUP_BOUNDARY_123";
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `community_backup_${dateStr}.json`;

  const metadata = {
    name: filename,
    mimeType: "application/json",
    description: `Housing Community System Backup: ${note}`,
  };

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(stateData, null, 2) +
    close_delim;

  const response = await fetchWithRetryAndTimeout(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    },
    3,
    1000,
    25000 // 25s timeout for larger state uploads
  );

  return await response.json();
}

/**
 * List backup JSON files created by this app in Google Drive
 */
export async function listBackupsFromDrive(accessToken: string): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent("mimeType='application/json' and name contains 'community_backup_' and trashed=false");
  const response = await fetchWithRetryAndTimeout(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&fields=files(id,name,createdTime,size,description)`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    3,
    1000,
    15000
  );

  const data = await response.json();
  return data.files || [];
}

/**
 * Get the backup JSON contents of a file on Google Drive
 */
export async function downloadBackupFromDrive(accessToken: string, fileId: string): Promise<AppState> {
  const response = await fetchWithRetryAndTimeout(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    3,
    1000,
    25000 // 25s timeout for downloading backup
  );

  return await response.json() as AppState;
}

/**
 * Delete a file on Google Drive
 */
export async function deleteBackupFromDrive(accessToken: string, fileId: string): Promise<void> {
  await fetchWithRetryAndTimeout(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    3,
    1000,
    15000
  );
}

/**
 * Client-side: Find a folder by name inside a parent folder
 */
export async function findFolderOnClient(accessToken: string, folderName: string, parentFolderId?: string): Promise<string | null> {
  let query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    console.error("[Google Drive Client] Find folder error:", await response.text());
    return null;
  }

  const data = await response.json() as { files?: Array<{ id: string }> };
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Client-side: Create a folder inside a parent folder
 */
export async function createFolderOnClient(accessToken: string, folderName: string, parentFolderId?: string): Promise<string> {
  const metadata: Record<string, any> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[Google Drive Client] Create folder failed: ${errText}`);
  }

  const data = await response.json() as { id: string };
  return data.id;
}

// Simple folder ID cache for client side
const folderIdCacheOnClient = new Map<string, string>();

/**
 * Client-side: Get or recursively create a folder path on Google Drive
 */
export async function getOrCreateFolderOnClient(accessToken: string, folderPath: string[], parentFolderId?: string): Promise<string> {
  let currentParentId = parentFolderId;

  for (const folderName of folderPath) {
    const cacheKey = `${currentParentId || "root"}:${folderName}`;
    let foundId = folderIdCacheOnClient.get(cacheKey);

    if (!foundId) {
      foundId = await findFolderOnClient(accessToken, folderName, currentParentId);
      if (!foundId) {
        foundId = await createFolderOnClient(accessToken, folderName, currentParentId);
        console.log(`[Google Drive Client] Created folder: ${folderName}`);
      }
      folderIdCacheOnClient.set(cacheKey, foundId);
    } else {
      console.log(`[Google Drive Client] Cache hit for folder: ${folderName} (${foundId})`);
    }
    currentParentId = foundId;
  }

  return currentParentId!;
}

