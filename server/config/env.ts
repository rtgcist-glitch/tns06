/**
 * Environment variable validation
 * Fail-fast with descriptive error messages if required vars are missing
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

export function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(", ")}`);
    console.error("Please set these in your .env file or Vercel Environment Variables.");
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }

  // Google Service Account optional check (with warnings)
  const googleDriveVars = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_DRIVE_ROOT_FOLDER_LINK"];
  const missingGoogle = googleDriveVars.filter((key) => !process.env[key]);
  if (missingGoogle.length > 0) {
    console.warn(`[Google Drive] ⚠️ Google Drive integration is disabled. Missing configuration: ${missingGoogle.join(", ")}`);
  } else {
    console.log("[Google Drive] ✅ Integration credentials configured!");
  }
}

export const ENV = {
  get SUPABASE_URL(): string {
    return process.env.SUPABASE_URL!;
  },
  get SUPABASE_SERVICE_KEY(): string {
    return process.env.SUPABASE_SERVICE_KEY!;
  },
  get GEMINI_API_KEY(): string | undefined {
    return process.env.GEMINI_API_KEY;
  },
  get NODE_ENV(): string {
    return process.env.NODE_ENV || "development";
  },
  get PORT(): number {
    return Number(process.env.PORT) || 3000;
  },
  get GOOGLE_SERVICE_ACCOUNT_EMAIL(): string | undefined {
    return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  },
  get GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY(): string | undefined {
    return process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  },
  get GOOGLE_DRIVE_ROOT_FOLDER_LINK(): string {
    const raw = process.env.GOOGLE_DRIVE_ROOT_FOLDER_LINK;
    if (!raw || raw.includes("your-folder-id")) {
      return "https://drive.google.com/drive/folders/1GLcxUIo3asg_RYAfh589bPLGEC1hchye?usp=drive_link";
    }
    return raw;
  },
};
