/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Settings, 
  CheckSquare, 
  DollarSign, 
  PlusCircle, 
  Trash2,
  ListFilter,
  QrCode,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  AlertTriangle,
  Copy,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  PieChart,
  Calendar,
  Printer,
  FileText,
  Database,
  RefreshCw,
  Cloud,
  ShieldCheck,
  Activity,
  Lock,
  Server,
  X,
  Loader2,
  LogIn
} from "lucide-react";
import { User, Payment, MonthlyBill, Transaction, getDetailedBillStatus, SystemSettings, PasswordReset, AppState } from "../types";
import { googleSignIn, logoutGoogle, getAccessToken, getStoredUser, auth as driveAuth } from "../lib/driveAuth";
import { 
  uploadBackupToDrive, 
  listBackupsFromDrive, 
  downloadBackupFromDrive, 
  deleteBackupFromDrive, 
  uploadImageToDrive, 
  listImagesFromDrive, 
  downloadImageBlobFromDrive, 
  GoogleDriveFile 
} from "../lib/driveApi";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { safeParseJson } from "../services/apiClient";
import { useLoading } from "./LoadingOverlay";
import { compressImage } from "../utils/imageCompressor";

interface LocalBackupFile {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  note?: string;
  type?: string;
}

interface SystemDiagnostics {
  mongodb?: {
    connected: boolean;
    error?: string;
    database?: string;
  };
  localFile?: {
    exists: boolean;
    sizeBytes: number;
  };
  googleDrive?: {
    connected: boolean;
    error?: string;
    rootFolderLink?: string;
    pendingMigrationCount?: number;
  };
  counts?: {
    users?: number;
    bills?: number;
    payments?: number;
    transactions?: number;
    activities?: number;
    petitions?: number;
  };
}

interface AdminPanelProps {
  currentUser: User;
  users: User[];
  payments: Payment[];
  monthlyBills: MonthlyBill[];
  transactions: Transaction[];
  settings: SystemSettings;
  passwordResets: PasswordReset[];
  onApprovePayment: (paymentId: string, treasurerId: string, note?: string) => Promise<unknown>;
  onRejectPayment: (paymentId: string, treasurerId: string, rejectReason: string) => Promise<unknown>;
  onRecordCashPayment: (billId: string, userId: string, amount: number, note?: string) => Promise<unknown>;
  onUploadSlipAdmin: (billId: string, userId: string, base64Image: string, note?: string) => Promise<unknown>;
  onCreateMonthlyBills: (month: number, year: number, dueDate: string) => Promise<unknown>;
  onDeleteMonthlyBills: (month: number, year: number) => Promise<unknown>;
  onDeleteTransaction?: (transactionId: string) => Promise<unknown>;
  onUpdateSettings: (fundName: string, monthlyFee: number, promptpayNumber: string, promptpayName: string, promptpayQrUrl?: string, bankName?: string) => Promise<unknown>;
  onSendReminder: (targetUserId: string, message: string, title?: string) => Promise<unknown>;
  onResolveResetPassword: (resetId: string) => Promise<unknown>;
  onResetSystemData?: (keepUsers: boolean, keepSettings: boolean) => Promise<unknown>;
}

export default function AdminPanel({
  currentUser,
  users,
  payments,
  monthlyBills,
  transactions,
  settings,
  passwordResets,
  onApprovePayment,
  onRejectPayment,
  onRecordCashPayment,
  onUploadSlipAdmin,
  onCreateMonthlyBills,
  onDeleteMonthlyBills,
  onDeleteTransaction,
  onUpdateSettings,
  onSendReminder,
  onResolveResetPassword,
  onResetSystemData
}: AdminPanelProps) {
  const { withLoading } = useLoading();
  const pendingPayments = payments.filter(p => p.status === "pending_review");
  const activeUsersCount = users.filter(u => u.isActive).length;
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(pendingPayments[0] || null);

  // Backup & Recovery States
  const [backups, setBackups] = useState<LocalBackupFile[]>([]);
  const [diag, setDiag] = useState<SystemDiagnostics | null>(null);
  const [isLoadingBackups, setIsLoadingBackups] = useState<boolean>(false);
  const [backupNote, setBackupNote] = useState<string>("");
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingTxId, setConfirmingTxId] = useState<string | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [showSyncConfirm, setShowSyncConfirm] = useState<boolean>(false);
  const [confirmingCashBillId, setConfirmingCashBillId] = useState<string | null>(null);
  const [cashAmountInput, setCashAmountInput] = useState<string>("");
  const [isRecordingCash, setIsRecordingCash] = useState<boolean>(false);

  const handleUploadSlipAdminFileChange = async (e: React.ChangeEvent<HTMLInputElement>, billId: string, userId: string) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = "";
    try {
      const compressedBase64 = await compressImage(file, 800, 0.6);
      const note = prompt("กรุณาระบุบันทึกประกอบการแนบสลิปย้อนหลัง (ถ้ามี):", "เหรัญญิกแนบสลิปย้อนหลัง");
      if (note === null) return;
      
      await onUploadSlipAdmin(billId, userId, compressedBase64, note);
      alert("อัปโหลดสลิปย้อนหลังและบันทึกข้อมูลเรียบร้อยแล้วค่ะ!");
    } catch (err: any) {
      console.error(err);
      alert(`เกิดข้อผิดพลาดในการอัปโหลด: ${err.message}`);
    }
  };

  // Google Drive Backup & Image Manager States
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState<boolean>(false);
  const [driveBackups, setDriveBackups] = useState<GoogleDriveFile[]>([]);
  const [isLoadingDriveBackups, setIsLoadingDriveBackups] = useState<boolean>(false);
  const [driveBackupNote, setDriveBackupNote] = useState<string>("");
  const [isUploadingToDrive, setIsUploadingToDrive] = useState<boolean>(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [isRestoringFromDriveId, setIsRestoringFromDriveId] = useState<string | null>(null);

  // Google Drive Image Test & Gallery States
  const [driveImages, setDriveImages] = useState<GoogleDriveFile[]>([]);
  const [isLoadingDriveImages, setIsLoadingDriveImages] = useState<boolean>(false);
  const [isUploadingDriveImage, setIsUploadingDriveImage] = useState<boolean>(false);
  const [driveImageSuccessMsg, setDriveImageSuccessMsg] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<{ id: string; name: string; url: string } | null>(null);
  const [isLoadingPreviewImage, setIsLoadingPreviewImage] = useState<boolean>(false);
  const [driveSectionTab, setDriveSectionTab] = useState<"images" | "backups">("images");

  // Summary Report & Auto Backup States
  const [summaryText, setSummaryText] = useState<string>("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [generatedBackupFilename, setGeneratedBackupFilename] = useState<string>("");
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<"approvals" | "billing" | "reports" | "slips_gallery" | "settings">("approvals");
  const [slipGalleryStatusFilter, setSlipGalleryStatusFilter] = useState<string>("all");
  const [slipGalleryStorageFilter, setSlipGalleryStorageFilter] = useState<string>("all");
  const [slipGallerySearch, setSlipGallerySearch] = useState<string>("");
  const [viewingSlipPayment, setViewingSlipPayment] = useState<Payment | null>(null);
  const [isPurgingBase64, setIsPurgingBase64] = useState<boolean>(false);
  const [isMigratingImages, setIsMigratingImages] = useState<boolean>(false);
  const [migrationResult, setMigrationResult] = useState<{ migratedCount: number; errors: string[] } | null>(null);
  const [showMigrationModal, setShowMigrationModal] = useState<boolean>(false);
  const [migrationModalError, setMigrationModalError] = useState<string | null>(null);
  const [migrationModalSuccess, setMigrationModalSuccess] = useState<string | null>(null);

  const handlePurgeBase64Slips = async () => {
    if (!window.confirm("⚠️ ยืนยันการเคลียร์ไฟล์รูปภาพ Base64 ออกจากคลาวด์ DB ใช่หรือไม่?\n\nการดำเนินการนี้จะลบไฟล์รูปภาพ Base64 ที่ตกค้างในตารางคลาวด์ DB เพื่อให้ฐานข้อมูลว่างเปล่าและเบาหวิว 100%\n(ประวัติการชำระเงิน ยอดเงิน เลขใบเสร็จ และสลิปที่ย้ายไป Google Drive แล้วจะยังคงอยู่ครบถ้วน)")) {
      return;
    }

    setIsPurgingBase64(true);
    try {
      const res = await fetch("/api/system/purge-base64-slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการลบรูปภาพ Base64");

      alert(data.message || `🎉 เคลียร์รูปภาพ Base64 ออกจาก DB สำเร็จเรียบร้อยจำนวน ${data.purgedCount} รูป!`);
      await loadBackupsAndDiag();
    } catch (err: any) {
      console.error(err);
      alert(`ไม่สามารถเคลียร์รูปภาพ Base64 ได้: ${err.message}`);
    } finally {
      setIsPurgingBase64(false);
    }
  };

  const handleGenerateSummary = async () => {
    return withLoading(async () => {
      setIsGeneratingSummary(true);
      setCopySuccess(false);
      try {
        const res = await fetch("/api/system/generate-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUser.id })
        });
        if (!res.ok) {
          throw new Error("เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ในการสร้างรายงานและแบ็กอัป");
        }
        const data = await safeParseJson(res);
        if (data.error) throw new Error(String(data.error));

        setSummaryText(String(data.summaryText || ""));
        setGeneratedBackupFilename(String(data.backupFilename || ""));
        await loadBackupsAndDiag(); // Refresh the backup lists
      } catch (err: any) {
        alert("ไม่สามารถสร้างรายงานและแบ็กอัปข้อมูลได้: " + err.message);
      } finally {
        setIsGeneratingSummary(false);
      }
    }, "กำลังสร้างรายงานและสำรองข้อมูลระบบ...");
  };

  const handleCopySummary = () => {
    navigator.clipboard.writeText(summaryText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleMigrateImagesToDrive = () => {
    setMigrationModalError(null);
    setMigrationModalSuccess(null);
    setShowMigrationModal(true);
  };

  const executeImageMigration = async () => {
    let token = googleToken;

    // Automatically try Google Sign-In if client token is missing, but fall back gracefully to server Service Account
    if (!token) {
      try {
        const res = await googleSignIn();
        if (res) {
          setGoogleUser(res.user);
          setGoogleToken(res.accessToken);
          token = res.accessToken;
          loadDriveBackups(res.accessToken);
          loadDriveImages(res.accessToken);
        }
      } catch (err: any) {
        console.warn("[Migrate Images] Client sign-in skipped/cancelled, proceeding with server Service Account:", err?.message);
      }
    }

    setIsMigratingImages(true);
    setMigrationModalError(null);
    setMigrationModalSuccess(null);
    setMigrationResult(null);

    try {
      const res = await fetch("/api/system/migrate-images-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, googleToken: token || undefined })
      });
      if (!res.ok) {
        const errData = await safeParseJson(res);
        throw new Error(String(errData.error || "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ในการย้ายสลิป"));
      }
      const data = await safeParseJson(res);
      if (data.error) throw new Error(String(data.error));

      setMigrationResult({
        migratedCount: Number(data.migratedCount || 0),
        errors: Array.isArray(data.errors) ? data.errors : []
      });

      setMigrationModalSuccess(`🎉 ย้ายสลิปชำระเงินสำเร็จจำนวน ${data.migratedCount} รายการขึ้น Google Drive เรียบร้อยแล้วค่ะ!`);
      await loadBackupsAndDiag(); // Refresh diagnostics status
    } catch (err: any) {
      setMigrationModalError(err.message || "เกิดข้อผิดพลาดในการย้ายรูปภาพขึ้น Google Drive");
    } finally {
      setIsMigratingImages(false);
    }
  };

  const loadDriveBackups = async (token: string) => {
    setIsLoadingDriveBackups(true);
    setDriveError(null);
    try {
      const files = await listBackupsFromDrive(token);
      setDriveBackups(files);
    } catch (err: any) {
      console.error(err);
      setDriveError(err.message || "ไม่สามารถโหลดข้อมูลแบ็กอัปจาก Google Drive ได้");
    } finally {
      setIsLoadingDriveBackups(false);
    }
  };

  const loadDriveImages = async (token: string) => {
    setIsLoadingDriveImages(true);
    setDriveError(null);
    try {
      const files = await listImagesFromDrive(token);
      setDriveImages(files);
    } catch (err: any) {
      console.error(err);
      setDriveError(err.message || "ไม่สามารถโหลดรายชื่อรูปภาพจาก Google Drive ได้");
    } finally {
      setIsLoadingDriveImages(false);
    }
  };

  const handleUploadTestImageToDrive = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!googleToken) {
      alert("กรุณาเชื่อมต่อ Google Drive ก่อนค่ะ");
      return;
    }

    return withLoading(async () => {
      setIsUploadingDriveImage(true);
      setDriveError(null);
      setDriveImageSuccessMsg(null);
      try {
        const filename = `test_image_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const uploadedFile = await uploadImageToDrive(googleToken, file, filename, "รูปภาพทดสอบจากระบบ TNS");
        
        setDriveImageSuccessMsg(`🎉 อัปโหลดรูปภาพ "${uploadedFile.name}" ขึ้น Google Drive สำเร็จแล้ว!`);
        await loadDriveImages(googleToken);
      } catch (err: any) {
        console.error(err);
        setDriveError(`อัปโหลดรูปภาพล้มเหลว: ${err.message}`);
      } finally {
        setIsUploadingDriveImage(false);
        if (e.target) e.target.value = "";
      }
    }, "กำลังอัปโหลดรูปภาพขึ้น Google Drive...");
  };

  const handleFetchPreviewDriveImage = async (fileId: string, fileName: string) => {
    if (!googleToken) {
      alert("กรุณาเชื่อมต่อ Google Drive ก่อนค่ะ");
      return;
    }

    return withLoading(async () => {
      setIsLoadingPreviewImage(true);
      setDriveError(null);
      try {
        const objectUrl = await downloadImageBlobFromDrive(googleToken, fileId);
        setPreviewImageUrl({ id: fileId, name: fileName, url: objectUrl });
      } catch (err: any) {
        console.error(err);
        alert(`ดึงรูปภาพจาก Google Drive ไม่สำเร็จ: ${err.message}`);
      } finally {
        setIsLoadingPreviewImage(false);
      }
    }, "กำลังดึงรูปภาพจาก Google Drive...");
  };

  React.useEffect(() => {
    // 1. Check local stored Google session first
    const token = getAccessToken();
    const storedUser = getStoredUser();
    if (token && storedUser) {
      setGoogleUser(storedUser as any);
      setGoogleToken(token);
      loadDriveBackups(token);
      loadDriveImages(token);
    }

    // 2. Firebase auth observer fallback
    const unsubscribe = onAuthStateChanged(driveAuth, (user) => {
      if (user) {
        setGoogleUser(user as any);
        const t = getAccessToken();
        if (t) {
          setGoogleToken(t);
          loadDriveBackups(t);
          loadDriveImages(t);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleConnectGoogle = async () => {
    return withLoading(async () => {
      setIsConnectingGoogle(true);
      setDriveError(null);
      try {
        const res = await googleSignIn();
        if (res) {
          setGoogleUser(res.user);
          setGoogleToken(res.accessToken);
          alert("เชื่อมต่อ Google Drive สำเร็จแล้ว! 🎉");
          loadDriveBackups(res.accessToken);
          loadDriveImages(res.accessToken);
        }
      } catch (err: any) {
        console.error(err);
        setDriveError(err.message || "การเชื่อมต่อล้มเหลว กรุณาลองใหม่อีกครั้ง");
      } finally {
        setIsConnectingGoogle(false);
      }
    }, "กำลังเชื่อมต่อ Google Drive...");
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm("ต้องการยกเลิกการเชื่อมต่อ Google Drive ใช่หรือไม่?")) return;
    return withLoading(async () => {
      try {
        await logoutGoogle();
        setGoogleUser(null);
        setGoogleToken(null);
        setDriveBackups([]);
      } catch (err: any) {
        console.error(err);
      }
    }, "กำลังยกเลิกการเชื่อมต่อ...");
  };

  const handleBackupToDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleToken) {
      alert("กรุณาเชื่อมต่อ Google Drive ก่อนค่ะ");
      return;
    }
    return withLoading(async () => {
      setIsUploadingToDrive(true);
      setDriveError(null);
      try {
        const stateRes = await fetch(`/api/state?t=${Date.now()}`);
        if (!stateRes.ok) {
          const errData = await safeParseJson(stateRes);
          throw new Error(String(errData.error || "ไม่สามารถเรียกข้อมูลระบบล่าสุดได้"));
        }
        const currentState = await safeParseJson(stateRes);
        if (currentState.error) {
          throw new Error(String(currentState.error));
        }

        const note = driveBackupNote || "สำรองระบบกองทุนแบบกำหนดเอง";
        await uploadBackupToDrive(googleToken, currentState as unknown as AppState, note);
        
        setDriveBackupNote("");
        alert("บันทึกข้อมูลสำรองไปยัง Google Drive ของคุณเรียบร้อยแล้ว! ☁️💾");
        loadDriveBackups(googleToken);
      } catch (err: any) {
        console.error(err);
        setDriveError(err.message || "บันทึกล้มเหลว");
      } finally {
        setIsUploadingToDrive(false);
      }
    }, "กำลังอัปโหลดไฟล์สำรองไปยัง Google Drive...");
  };

  const handleRestoreFromDrive = async (fileId: string, fileName: string) => {
    if (!googleToken) return;
    if (!confirm(`⚠️ คำเตือน! คุณแน่ใจใช่หรือไม่ว่าต้องการกู้คืนข้อมูลระบบทั้งหมดจากไฟล์บน Google Drive: "${fileName}"?\n\nข้อมูลในระบบปัจจุบันทั้งหมดจะถูกเขียนทับ!`)) {
      return;
    }
    
    return withLoading(async () => {
      setIsRestoringFromDriveId(fileId);
      try {
        const backupState = await downloadBackupFromDrive(googleToken, fileId);

        const res = await fetch("/api/backups/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadedState: backupState, userId: currentUser.id })
        });

        if (!res.ok) {
          const errData = await safeParseJson(res);
          throw new Error(String(errData.error || "กู้คืนข้อมูลบนเซิร์ฟเวอร์ล้มเหลว"));
        }

        alert("🎉 ดึงข้อมูลจาก Google Drive และคืนค่าระบบสำเร็จแล้ว!");
        window.location.reload();
      } catch (err: any) {
        console.error(err);
        alert("การกู้คืนล้มเหลว: " + err.message);
      } finally {
        setIsRestoringFromDriveId(null);
      }
    }, "กำลังดาวน์โหลดและกู้คืนข้อมูลจาก Google Drive...");
  };

  const handleDeleteFromDrive = async (fileId: string, fileName: string) => {
    if (!googleToken) return;
    if (!confirm(`⚠️ คำเตือน! ต้องการลบไฟล์สำรอง "${fileName}" ออกจาก Google Drive ถาวรใช่หรือไม่?`)) {
      return;
    }
    
    return withLoading(async () => {
      try {
        await deleteBackupFromDrive(googleToken, fileId);
        alert("ลบไฟล์จาก Google Drive เรียบร้อยแล้วค่ะ");
        loadDriveBackups(googleToken);
      } catch (err: any) {
        console.error(err);
        alert("ลบล้มเหลว: " + err.message);
      }
    }, "กำลังลบไฟล์สำรองออกจาก Google Drive...");
  };

  // Password reset resolver states
  const [resolvingResetId, setResolvingResetId] = useState<string | null>(null);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  const loadBackupsAndDiag = async () => {
    setIsLoadingBackups(true);
    try {
      const [bRes, dRes] = await Promise.all([
        fetch(`/api/backups/list?t=${Date.now()}`),
        fetch(`/api/system/diagnostics?t=${Date.now()}`)
      ]);
      if (bRes.ok) {
        const data = await safeParseJson(bRes);
        if (!data.error) setBackups(data as unknown as LocalBackupFile[]);
      }
      if (dRes.ok) {
        const data = await safeParseJson(dRes);
        if (!data.error) setDiag(data as unknown as SystemDiagnostics);
      }
    } catch (err) {
      console.error("Error loading backups or diagnostics", err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);

  const handleForceSyncCloud = async () => {
    if (isSyncingCloud) return;
    return withLoading(async () => {
      setIsSyncingCloud(true);
      try {
        const res = await fetch("/api/system/sync-cloud", {
          method: "POST"
        });
        const data = await safeParseJson(res);
        if (!res.ok || data.error) {
          throw new Error(String(data.error || "ดึงข้อมูลจาก Cloud ขัดข้อง"));
        }
        setShowSyncConfirm(false);
        window.location.reload();
      } catch (err: any) {
        alert("เกิดข้อผิดพลาด: " + err.message);
      } finally {
        setIsSyncingCloud(false);
      }
    }, "กำลังซิงก์ข้อมูลจากคลาวด์ล่าสุด...");
  };

  React.useEffect(() => {
    loadBackupsAndDiag();
  }, []);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingBackup) return;
    return withLoading(async () => {
      setIsCreatingBackup(true);
      try {
        const res = await fetch("/api/backups/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: backupNote, userId: currentUser.id })
        });
        if (!res.ok) throw new Error("การสร้างแบ็กอัปขัดข้อง");
        setBackupNote("");
        alert("สร้างจุดกู้คืนและซิงก์คลาวด์สำเร็จแล้ว! 🔒");
        await loadBackupsAndDiag();
      } catch (err: any) {
        alert("เกิดข้อผิดพลาด: " + err.message);
      } finally {
        setIsCreatingBackup(false);
      }
    }, "กำลังสร้างจุดกู้คืนและสำรองข้อมูลระบบ...");
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!confirm("⚠️ คำเตือน! คุณต้องการกู้คืนระบบและแทนที่ข้อมูลปัจจุบันด้วยแบ็กอัปนี้ใช่หรือไม่?")) return;
    return withLoading(async () => {
      setRestoringId(backupId);
      try {
        const res = await fetch("/api/backups/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupId, userId: currentUser.id })
        });
        if (!res.ok) {
          const errData = await safeParseJson(res);
          throw new Error(String(errData.error || "ไม่สามารถกู้คืนได้"));
        }
        const resData = await safeParseJson(res);
        if (resData.error) {
          throw new Error(String(resData.error));
        }
        alert(String(resData.message || "คืนค่าระบบเรียบร้อยแล้ว!"));
        window.location.reload(); // Reload to pick up new state
      } catch (err: any) {
        alert("เกิดข้อผิดพลาด: " + err.message);
      } finally {
        setRestoringId(null);
      }
    }, "กำลังดำเนินการกู้คืนระบบจากจุดสำรองข้อมูล...");
  };

  const handleDeleteBackup = async (backupId: string) => {
    return withLoading(async () => {
      setDeletingId(backupId);
      setConfirmingDeleteId(null);
      try {
        const res = await fetch("/api/backups/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupId, userId: currentUser?.id })
        });
        const data = await safeParseJson(res);
        if (!res.ok || data.error) {
          throw new Error(String(data.error || "ลบจุดแบ็กอัปขัดข้อง"));
        }
        await loadBackupsAndDiag(); // Reload the backup list without reloading the whole page!
      } catch (err: any) {
        alert("เกิดข้อผิดพลาด: " + err.message);
      } finally {
        setDeletingId(null);
      }
    }, "กำลังลบจุดสำรองข้อมูลระบบ...");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      return withLoading(async () => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (!confirm("⚠️ คำเตือน! ต้องการเขียนทับระบบปัจจุบันและกู้คืนจากการอัปโหลดไฟล์ JSON นี้ใช่หรือไม่?")) return;
          
          const res = await fetch("/api/backups/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadedState: parsed, userId: currentUser.id })
          });
          if (!res.ok) {
            const errData = await safeParseJson(res);
            throw new Error(String(errData.error || "อัปโหลดล้มเหลว"));
          }
          alert("อัปโหลดและคืนค่าระบบสำเร็จแล้ว!");
          window.location.reload();
        } catch (err: any) {
          alert("อัปโหลดหรือแปลงไฟล์ขัดข้อง: " + err.message);
        }
      }, "กำลังนำเข้าและคืนค่าข้อมูลระบบจากไฟล์อัปโหลด...");
    };
    reader.readAsText(file);
  };

  // Monthly summary reporting states
  const [showMonthlySummary, setShowMonthlySummary] = useState<boolean>(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Group transactions by month and year
  const monthlySummaries = React.useMemo(() => {
    const summaryMap: Record<string, {
      month: number;
      year: number;
      income: number;
      expense: number;
      monthly_fee: number;
      market_profit: number;
      activity_expense: number;
      other_income: number;
      other_expense: number;
      txCount: number;
      transactionsList: Transaction[];
    }> = {};

    transactions.forEach(tx => {
      const key = `${tx.month}_${tx.year}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          month: tx.month,
          year: tx.year,
          income: 0,
          expense: 0,
          monthly_fee: 0,
          market_profit: 0,
          activity_expense: 0,
          other_income: 0,
          other_expense: 0,
          txCount: 0,
          transactionsList: []
        };
      }

      summaryMap[key].txCount += 1;
      summaryMap[key].transactionsList.push(tx);

      if (tx.type === "income") {
        summaryMap[key].income += tx.amount;
        if (tx.category === "monthly_fee") summaryMap[key].monthly_fee += tx.amount;
        else if (tx.category === "market_profit") summaryMap[key].market_profit += tx.amount;
        else if (tx.category === "other_income") summaryMap[key].other_income += tx.amount;
      } else {
        summaryMap[key].expense += tx.amount;
        if (tx.category === "activity_expense") summaryMap[key].activity_expense += tx.amount;
        else if (tx.category === "other_expense") summaryMap[key].other_expense += tx.amount;
      }
    });

    // Convert to sorted list (newest first)
    return Object.values(summaryMap).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [transactions]);

  // Export and PDF print preview states
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printSummary, setPrintSummary] = useState<any | null>(null);

  const getCategoryLabelText = (cat: string) => {
    switch (cat) {
      case "monthly_fee": return "ค่าบำรุงกองทุน";
      case "market_profit": return "กำไรตลาดวันพุธ";
      case "activity_expense": return "งบกิจกรรม";
      case "other_income": return "รายรับอื่น";
      case "other_expense": return "รายจ่ายอื่น";
      default: return cat;
    }
  };

  const handleExportMonthCSV = (summary: any) => {
    const BOM = "\uFEFF";
    let csvContent = "";
    
    csvContent += `รายงานสรุปงบการเงินประจำเดือน,${getThaiMonthName(summary.month)} ${summary.year}\n`;
    csvContent += `ชื่อกองทุน,${settings.fundName || "กองทุนห้อง"}\n`;
    csvContent += `จัดทำโดย,${currentUser.fullName} (${currentUser.role === "treasurer" ? "เหรัญญิก" : currentUser.role === "leader" ? "หัวหน้าห้อง" : "กรรมการ"})\n`;
    csvContent += `วันที่ออกรายงาน,${new Date().toLocaleDateString("th-TH")}\n\n`;
    
    csvContent += `สรุปสถานะการคลัง\n`;
    csvContent += `รายรับรวม,฿${summary.income}\n`;
    csvContent += `รายจ่ายรวม,฿${summary.expense}\n`;
    csvContent += `กำไรสุทธิ,฿${summary.income - summary.expense}\n\n`;
    
    csvContent += `สัดส่วนรายรับ-รายจ่ายรายหมวดหมู่\n`;
    csvContent += `หมวดหมู่,ประเภท,จำนวนเงิน\n`;
    csvContent += `ค่าบำรุงรายเดือน,รายรับ,฿${summary.monthly_fee}\n`;
    csvContent += `กำไรตลาดวันพุธ,รายรับ,฿${summary.market_profit}\n`;
    csvContent += `รายรับอื่นๆ,รายรับ,฿${summary.other_income}\n`;
    csvContent += `งบกิจกรรม/โครงการ,รายจ่าย,฿${summary.activity_expense}\n`;
    csvContent += `รายจ่ายอื่นๆ,รายจ่าย,฿${summary.other_expense}\n\n`;
    
    csvContent += `รายการเดินบัญชีประจำเดือน\n`;
    csvContent += `รหัสรายการ,วันที่ทำรายการ,รายละเอียด,ประเภท,หมวดหมู่,จำนวนเงิน\n`;
    
    summary.transactionsList.forEach((tx: any) => {
      const txDate = new Date(tx.createdAt).toLocaleDateString("th-TH");
      const typeLabel = tx.type === "income" ? "รายรับ" : "รายจ่าย";
      const categoryLabel = getCategoryLabelText(tx.category);
      const description = tx.description.replace(/,/g, " ");
      csvContent += `${tx.id},${txDate},${description},${typeLabel},${categoryLabel},${tx.amount}\n`;
    });
    
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานการเงิน_${getThaiMonthName(summary.month)}_${summary.year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAllCSV = () => {
    const BOM = "\uFEFF";
    let csvContent = "";
    
    csvContent += `รายงานประวัติธุรกรรมและการเงินทั้งหมด,${settings.fundName || "กองทุนห้อง"}\n`;
    csvContent += `จัดทำโดย,${currentUser.fullName} (${currentUser.role === "treasurer" ? "เหรัญญิก" : currentUser.role === "leader" ? "หัวหน้าห้อง" : "กรรมการ"})\n`;
    csvContent += `วันที่ออกรายงาน,${new Date().toLocaleDateString("th-TH")}\n\n`;
    
    csvContent += `รหัสรายการ,วันที่ทำรายการ,รายละเอียด,ประเภท,หมวดหมู่,จำนวนเงิน,ปีงวดบัญชี,เดือนงวดบัญชี\n`;
    
    transactions.forEach((tx: any) => {
      const txDate = new Date(tx.createdAt).toLocaleDateString("th-TH");
      const typeLabel = tx.type === "income" ? "รายรับ" : "รายจ่าย";
      const categoryLabel = getCategoryLabelText(tx.category);
      const description = tx.description.replace(/,/g, " ");
      csvContent += `${tx.id},${txDate},${description},${typeLabel},${categoryLabel},${tx.amount},${tx.year},${tx.month}\n`;
    });
    
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานประวัติการเงินทั้งหมด_${settings.fundName || "กองทุนห้อง"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bill Trigger Form States (dynamically set default month, year and future due date)
  const [billMonth, setBillMonth] = useState<number>(() => {
    return new Date().getMonth() + 1;
  });
  const [billYear, setBillYear] = useState<number>(() => {
    return new Date().getFullYear() + 543;
  });
  const [billDueDate, setBillDueDate] = useState<string>(() => {
    const defaultDate = new Date();
    // Default to the 15th of the current month, or if past the 15th, the 15th of the next month
    if (defaultDate.getDate() > 15) {
      defaultDate.setMonth(defaultDate.getMonth() + 1);
    }
    defaultDate.setDate(15);
    return defaultDate.toISOString().split('T')[0];
  });
  const [isCreatingBills, setIsCreatingBills] = useState<boolean>(false);
  const [isDeletingBills, setIsDeletingBills] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // System settings states
  const [setFundName, setSetFundName] = useState<string>(settings.fundName);
  const [setMonthlyFee, setSetMonthlyFee] = useState<number>(settings.monthlyFee);
  const [setPromptpayNumber, setSetPromptpayNumber] = useState<string>(settings.promptpayNumber);
  const [setPromptpayName, setSetPromptpayName] = useState<string>(settings.promptpayName);
  const [promptpayQrUrl, setPromptpayQrUrl] = useState<string>(settings.promptpayQrUrl || "");
  const [setBankName, setSetBankName] = useState<string>(settings.bankName || "พร้อมเพย์");
  const [isUpdatingSettings, setIsUpdatingSettings] = useState<boolean>(false);

  React.useEffect(() => {
    setSetFundName(settings.fundName);
    setSetMonthlyFee(settings.monthlyFee);
    setSetPromptpayNumber(settings.promptpayNumber);
    setSetPromptpayName(settings.promptpayName);
    setPromptpayQrUrl(settings.promptpayQrUrl || "");
    setSetBankName(settings.bankName || "พร้อมเพย์");
  }, [settings]);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const compressed = await compressImage(file, 600, 0.8);
      setPromptpayQrUrl(compressed);
    }
  };

  // Reject Reason
  const [rejectReason, setRejectReason] = useState<string>("");
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);

  // States and Helpers for Unpaid Members Tracker & Notification template
  const [unpaidSearch, setUnpaidSearch] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [adminClassroomFilter, setAdminClassroomFilter] = useState<string>("all");

  // States for Smart Reminder System (ระบบแจ้งเตือนทวงถามอัตโนมัติรายบุคคล)
  const [activeReminderUserId, setActiveReminderUserId] = useState<string | null>(null);
  const [customReminderMessage, setCustomReminderMessage] = useState<string>("");
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [sentReminders, setSentReminders] = useState<string[]>([]);

  const getThaiMonthName = (month: number) => {
    const months = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    return months[month - 1] || "";
  };

  // Compute unpaid bills for each user (status "pending" or "pending_review")
  const unpaidUsersList = users
    .filter(u => {
      if (currentUser.role === "leader") {
        return u.classroom === currentUser.classroom && u.isActive;
      }
      if (adminClassroomFilter !== "all") {
        return u.classroom === adminClassroomFilter && u.isActive;
      }
      return u.isActive;
    })
    .map(user => {
    const userUnpaidBills = monthlyBills.filter(b => b.userId === user.id && b.status !== "paid");
    
    // Filter out bills that have been fully paid via approved payments (remaining balance <= 0)
    const unpaidBills = userUnpaidBills.filter(b => {
      const approvedAmt = payments
        .filter(p => p.billId === b.id && p.status === "approved")
        .reduce((s, p) => s + p.amount, 0);
      return b.amount - approvedAmt > 0;
    });

    const totalUnpaidAmount = unpaidBills.reduce((sum, b) => {
      const approvedAmt = payments
        .filter(p => p.billId === b.id && p.status === "approved")
        .reduce((s, p) => s + p.amount, 0);
      return sum + (b.amount - approvedAmt);
    }, 0);

    return {
      user,
      unpaidBills,
      totalUnpaidAmount,
      isUnpaid: totalUnpaidAmount > 0
    };
  }).filter(item => item.isUnpaid);

  // Filter based on search term
  const filteredUnpaidUsers = unpaidUsersList.filter(item => {
    const term = unpaidSearch.toLowerCase();
    return item.user.fullName.toLowerCase().includes(term) ||
           item.user.studentId.includes(term) ||
           item.user.nickname.toLowerCase().includes(term);
  });

  const handleCopyUnpaidList = () => {
    if (unpaidUsersList.length === 0) {
      alert("ไม่มีผู้ค้างชำระเงินในขณะนี้ 🎉");
      return;
    }

    const today = new Date().toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    let message = `📢 [ประกาศรายชื่อผู้มียอดค้างชำระเงินกองทุน Tns รุ่น 06]\n`;
    message += `ข้อมูลอัปเดต ณ วันที่ ${today}\n\n`;
    message += `รายชื่อแยกตามห้องเรียนดังนี้ค่ะ/ครับ:\n\n`;

    const classrooms = ["ห้อง 1", "ห้อง 2"];
    classrooms.forEach(room => {
      const roomUnpaid = unpaidUsersList.filter(item => item.user.classroom === room);
      if (roomUnpaid.length > 0) {
        message += `📍 --- ${room} (${roomUnpaid.length} คน) ---\n`;
        roomUnpaid.forEach((item, index) => {
          message += `${index + 1}. ${item.user.fullName} (${item.user.nickname})\n`;
        });
        message += `\n`;
      }
    });

    const noRoomUnpaid = unpaidUsersList.filter(item => !item.user.classroom || !classrooms.includes(item.user.classroom));
    if (noRoomUnpaid.length > 0) {
      message += `📍 --- สมาชิกอื่นๆ (${noRoomUnpaid.length} คน) ---\n`;
      noRoomUnpaid.forEach((item, index) => {
        message += `${index + 1}. ${item.user.fullName} (${item.user.nickname})\n`;
      });
      message += `\n`;
    }

    message += `(รวมยอดค้างชำระสะสมทั้งหมด ${unpaidUsersList.length} คน)\n\n`;
    message += `รบกวนเพื่อนๆ เข้าไปแนบสลิปชำระเงินในระบบเว็บกองทุนด้วยนะคะ/ครับ 🙏✨`;

    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
      alert("คัดลอกไม่สำเร็จ กรุณาลองคัดลอกด้วยตนเอง");
    });
  };

  const handleApprove = async () => {
    if (!selectedPayment || isApproving) return;
    setIsApproving(true);
    try {
      await onApprovePayment(selectedPayment.id, currentUser.id);
      setSelectedPayment(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment || !rejectReason || isApproving) return;
    setIsApproving(true);
    try {
      await onRejectPayment(selectedPayment.id, currentUser.id, rejectReason);
      setRejectReason("");
      setShowRejectInput(false);
      setSelectedPayment(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsApproving(false);
    }
  };

  const handleTriggerReminderForm = (userId: string, unpaidBills: MonthlyBill[], totalAmount: number, userFullName: string) => {
    setActiveReminderUserId(userId === activeReminderUserId ? null : userId);
    const monthsStr = unpaidBills.map(b => getThaiMonthName(b.month)).join(", ");
    setCustomReminderMessage(
      `สวัสดีค่ะคุณ ${userFullName} รบกวนชำระเงินเก็บTns รุ่น06 ที่มียอดค้างชำระของรอบเดือน [ ${monthsStr} ] ยอดรวมสะสม ฿${totalAmount.toLocaleString()} ด้วยนะคะ/ครับ หากสะดวกแล้วสามารถโอนเงินและแนบสลิปผ่านทางระบบส่วนกลางได้เลยจ้า ✨`
    );
  };

  const handleApplyReminderTemplate = (type: string, userFullName: string, unpaidBills: MonthlyBill[], totalAmount: number) => {
    const monthsStr = unpaidBills.map(b => getThaiMonthName(b.month)).join(", ");
    if (type === "gentle") {
      setCustomReminderMessage(
        `สวัสดีค่ะคุณ ${userFullName} รบกวนชำระเงินเก็บTns รุ่น06 ที่มียอดค้างชำระของรอบเดือน [ ${monthsStr} ] ยอดรวมสะสม ฿${totalAmount.toLocaleString()} ด้วยนะคะ/ครับ หากสะดวกแล้วสามารถโอนเงินและแนบสลิปผ่านทางระบบส่วนกลางได้เลยจ้า ✨`
      );
    } else if (type === "friendly") {
      setCustomReminderMessage(
        `เตงงง อย่าลืมเคลียร์เงินเก็บTns รุ่น06 น้าา ยอดสะสมของรอบเดือน [ ${monthsStr} ] รวมแล้ว ฿${totalAmount.toLocaleString()} โอนเงินและแนบรูปสลิปในเว็บได้เลยจ้า ขอบคุณหลายๆ น้าาา ❤️`
      );
    } else if (type === "urgent") {
      setCustomReminderMessage(
        `⚠️ [แจ้งเตือนด่วนที่สุด] รบกวนคุณ ${userFullName} ชำระเงินเก็บTns รุ่น06 สะสมเดือน [ ${monthsStr} ] ยอดค้างชำระรวม ฿${totalAmount.toLocaleString()} เนื่องจากเหรัญญิกจำเป็นต้องใช้ยอดเงินดังกล่าวในการเคลียร์ค่าใช้จ่ายกิจกรรมชั้นเรียน ดำเนินการด่วนด้วยนะคะ/ครับ ขอบคุณค่ะ`
      );
    }
  };

  const handleSubmitIndividualReminder = async (targetUserId: string) => {
    if (!customReminderMessage.trim()) return;
    setSendingReminderId(targetUserId);
    try {
      await onSendReminder(targetUserId, customReminderMessage.trim(), "🔔 แจ้งเตือนสิทธิ์ค้างชำระค่ากองทุนรายบุคคล");
      setSentReminders(prev => [...prev, targetUserId]);
      setActiveReminderUserId(null);
    } catch (err) {
      console.error(err);
      alert("ไม่สามารถส่งแจ้งเตือนได้สำเร็จ");
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleTriggerBills = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingBills(true);
    try {
      const res = await onCreateMonthlyBills(billMonth, billYear, billDueDate) as { createdCount?: number } | undefined;
      if (res && res.createdCount !== undefined) {
        if (res.createdCount > 0) {
          alert(`สร้างบิลและส่งการแจ้งเตือนทวงเงินใหม่สำเร็จจำนวน ${res.createdCount} คน เรียบร้อยแล้วค่ะ!`);
        } else {
          alert(`สมาชิกทุกคนในระบบ (${activeUsersCount} คน) มีบิลรอบเดือน ${getThaiMonthName(billMonth)} พ.ศ. ${billYear} ครบถ้วนแล้วค่ะ ไม่จำเป็นต้องสร้างใหม่!`);
        }
      } else {
        alert("สร้างบิลและส่งการแจ้งเตือนทวงเงินให้สมาชิกทุกคนเรียบร้อยแล้วค่ะ!");
      }
    } catch (err: any) {
      console.error(err);
      alert("ไม่สามารถสร้างบิลได้: " + (err.message || String(err)));
    } finally {
      setIsCreatingBills(false);
    }
  };

  const handleDeleteBillsCycle = async () => {
    if (!window.confirm(`⚠️ คำเตือนสำคัญ!\n\nคุณกำลังจะทำการ "ลบบิลทั้งหมด" ของรอบเดือน ${getThaiMonthName(billMonth)} พ.ศ. ${billYear} ใช่หรือไม่?\n\nการดำเนินการนี้จะลบบิลของสมาชิกทุกคนในรอบเดือนนี้ และจะเคลียร์ข้อมูลการโอนเงิน/สลิปของเดือนนี้ที่ยังไม่ได้รับอนุมัติออกไปด้วย กรุณาตรวจสอบให้มั่นใจก่อนกดยืนยัน!`)) {
      return;
    }
    
    setIsDeletingBills(true);
    try {
      const res = await onDeleteMonthlyBills(billMonth, billYear) as { deletedCount?: number };
      alert(`ลบบิลรอบเดือน ${getThaiMonthName(billMonth)} พ.ศ. ${billYear} สำเร็จเรียบร้อยแล้วค่ะ! (ลบจำนวน ${res?.deletedCount || 0} บิล)`);
    } catch (err: any) {
      console.error(err);
      alert("ไม่สามารถลบบิลรอบนี้ได้: " + (err.message || String(err)));
    } finally {
      setIsDeletingBills(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingSettings(true);
    try {
      await onUpdateSettings(setFundName, setMonthlyFee, setPromptpayNumber, setPromptpayName, promptpayQrUrl, setBankName);
      alert("บันทึกการตั้งค่าระบบกองทุนหลักสำเร็จ");
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleResolvePasswordReset = async (resetId: string, studentName: string) => {
    if (!confirm(`คุณต้องการรีเซ็ตรหัสผ่านของ ${studentName} กลับไปเป็นค่าเริ่มต้น "123456" ใช่หรือไม่?`)) {
      return;
    }
    setResolvingResetId(resetId);
    setResetSuccessMsg(null);
    try {
      await onResolveResetPassword(resetId);
      setResetSuccessMsg(`รีเซ็ตรหัสผ่านของคุณ ${studentName} เป็น "123456" สำเร็จเรียบร้อยแล้วค่ะ! 🔑`);
      setTimeout(() => setResetSuccessMsg(null), 5000);
    } catch (err: any) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setResolvingResetId(null);
    }
  };

  const pendingResetCount = (passwordResets || []).filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Upper Control Bar: Treasurer Admin Console Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200/60">
            🛡️ Treasurer Admin Console
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2 tracking-tight">
            ระบบจัดการหลังบ้านของเหรัญญิกและกรรมการรุ่น
          </h2>
          <p className="text-xs text-slate-500">
            ตรวจสอบหลักฐานสลิป ออกบิลเรียกเก็บเงินสะสม สรุปงบการเงินรายเดือน และสำรองฐานข้อมูลคลาวด์
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs shrink-0">
          <div className="px-3.5 py-2 rounded-2xl bg-blue-50/70 border border-blue-200/60 flex items-center gap-2">
            <span className="text-slate-600 font-medium">สลิปรอตรวจ:</span>
            <strong className="text-blue-700 font-extrabold tabular-nums">{pendingPayments.length}</strong>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-rose-50/70 border border-rose-200/60 flex items-center gap-2">
            <span className="text-slate-600 font-medium">ค้างชำระ:</span>
            <strong className="text-rose-700 font-extrabold tabular-nums">{unpaidUsersList.length} คน</strong>
          </div>
          {pendingResetCount > 0 && (
            <div className="px-3.5 py-2 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center gap-2">
              <span className="text-amber-800 font-medium">ขอรีเซ็ตรหัส:</span>
              <strong className="text-amber-700 font-extrabold tabular-nums">{pendingResetCount}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Sleek Segmented Control Navigation Bar (5 Main Tabs) */}
      <div className="flex overflow-x-auto gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs no-scrollbar">
        <button
          type="button"
          onClick={() => setAdminTab("approvals")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            adminTab === "approvals"
              ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
          }`}
        >
          <span>💳 ตรวจสลิป & ติดตามยอด</span>
          {(pendingPayments.length > 0 || pendingResetCount > 0) && (
            <span className="bg-rose-500 text-white text-[11px] font-bold h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center tabular-nums">
              {pendingPayments.length + pendingResetCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAdminTab("billing")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            adminTab === "billing"
              ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
          }`}
        >
          <span>📢 จัดการรอบบิล</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAdminTab("reports");
            // Auto select first month if not set
            if (!selectedMonthKey && monthlySummaries.length > 0) {
              const firstKey = `${monthlySummaries[0].month}_${monthlySummaries[0].year}`;
              setSelectedMonthKey(firstKey);
            }
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            adminTab === "reports"
              ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
          }`}
        >
          <span>📊 สรุปรายงาน & พิมพ์ A4</span>
          {monthlySummaries.length > 0 && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
              adminTab === "reports" ? "bg-blue-50 text-blue-700" : "bg-slate-200/70 text-slate-600"
            }`}>
              {monthlySummaries.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAdminTab("slips_gallery")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            adminTab === "slips_gallery"
              ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
          }`}
        >
          <span>🖼️ คลังสลิป & Google Drive</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
            adminTab === "slips_gallery" ? "bg-blue-50 text-blue-700" : "bg-slate-200/70 text-slate-600"
          }`}>
            {payments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            adminTab === "settings"
              ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
          }`}
        >
          <span>⚙️ ตั้งค่าระบบ & สำรองข้อมูล</span>
        </button>
      </div>

      {/* Historical Slips Vault Panel */}
      {adminTab === "slips_gallery" && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ImageIcon size={20} className="text-indigo-600" /> คลังหลักฐานรูปภาพสลิปชำระเงินย้อนหลัง (Slips Vault)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ตรวจสอบรูปสลิปการโอนเงินของสมาชิกย้อนหลังทั้งหมดในระบบ ทั้งที่ผ่านการอนุมัติแล้ว และที่จัดเก็บไว้ในคลัง
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMigrationModal(true)}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Cloud size={14} /> ย้ายสลิปขึ้น Google Drive
              </button>
              <button
                type="button"
                disabled={isPurgingBase64}
                onClick={handlePurgeBase64Slips}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                title="ลบไฟล์รูปภาพ Base64 ที่ตกค้างใน DB เพื่อให้ความจุฐานข้อมูลโล่ง 100%"
              >
                <Trash2 size={14} /> {isPurgingBase64 ? "กำลังเคลียร์..." : "🧹 เคลียร์สลิป Base64 ใน DB"}
              </button>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-xs">
            <div className="relative">
              <input
                type="text"
                value={slipGallerySearch}
                onChange={(e) => setSlipGallerySearch(e.target.value)}
                placeholder="ค้นหาตามชื่อสมาชิก, รหัสนักศึกษา, เลขใบเสร็จ..."
                className="w-full text-xs p-2.5 pl-8 border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-blue-500"
              />
              <span className="absolute left-2.5 top-3 text-slate-400">🔍</span>
            </div>

            <select
              value={slipGalleryStatusFilter}
              onChange={(e) => setSlipGalleryStatusFilter(e.target.value)}
              className="text-xs p-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 font-bold focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">📌 ทุกสถานะ (อนุมัติ / รอตรวจ / ปฏิเสธ)</option>
              <option value="approved">✅ อนุมัติแล้ว (Approved)</option>
              <option value="pending_review">⏳ รอตรวจสอบ (Pending Review)</option>
              <option value="rejected">❌ ถูกปฏิเสธ (Rejected)</option>
            </select>

            <select
              value={slipGalleryStorageFilter}
              onChange={(e) => setSlipGalleryStorageFilter(e.target.value)}
              className="text-xs p-2.5 border border-slate-200 rounded-xl bg-white text-slate-700 font-bold focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">📂 ทุกประเภทหลักฐานจัดเก็บ</option>
              <option value="drive">☁️ อยู่บน Google Drive</option>
              <option value="db">💾 เก็บในฐานข้อมูล DB (Base64)</option>
              <option value="cash">💵 ชำระด้วยเงินสด (ไม่มีรูป)</option>
            </select>
          </div>

          {/* Slips Cards Grid */}
          {(() => {
            const filteredPayments = payments.filter(p => {
              const matchesStatus = slipGalleryStatusFilter === "all" || p.status === slipGalleryStatusFilter;
              
              const isDrive = p.slipUrl?.includes("google_drive:") || p.slipUrl?.includes("drive.google.com");
              const isCash = p.slipUrl === "cash";
              const matchesStorage = slipGalleryStorageFilter === "all"
                || (slipGalleryStorageFilter === "drive" && isDrive)
                || (slipGalleryStorageFilter === "db" && !isDrive && !isCash && p.slipUrl)
                || (slipGalleryStorageFilter === "cash" && isCash);

              const student = users.find(u => u.id === p.userId);
              const searchLower = slipGallerySearch.toLowerCase();
              const matchesSearch = !slipGallerySearch ||
                (student?.fullName.toLowerCase().includes(searchLower)) ||
                (student?.studentId.toLowerCase().includes(searchLower)) ||
                (p.receiptNumber?.toLowerCase().includes(searchLower)) ||
                (p.note?.toLowerCase().includes(searchLower));

              return matchesStatus && matchesStorage && matchesSearch;
            });

            if (filteredPayments.length === 0) {
              return (
                <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs italic">
                  ไม่พบรายการรูปภาพสลิปชำระเงินตามเงื่อนไขที่ระบุค่ะ 🔍
                </div>
              );
            }

            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-medium px-1">
                  <span>พบทั้งหมด <strong className="text-slate-800 font-bold tabular-nums">{filteredPayments.length}</strong> รายการ</span>
                  <span className="text-xs text-indigo-600 font-bold">คลิกที่การ์ดเพื่อขยายดูรายละเอียดและหลักฐานย้อนหลัง</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto p-1">
                  {filteredPayments.map(p => {
                    const student = users.find(u => u.id === p.userId);
                    const bill = monthlyBills.find(b => b.id === p.billId);
                    const isDrive = p.slipUrl?.includes("google_drive:") || p.slipUrl?.includes("drive.google.com");
                    const isCash = p.slipUrl === "cash";

                    return (
                      <div
                        key={p.id}
                        className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-2xl p-4 transition-all shadow-xs space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          {/* Student Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-slate-800 text-xs">{student?.fullName || "สมาชิก"}</h4>
                              <p className="text-[11px] text-slate-500 font-mono tabular-nums">รหัส: {student?.studentId || "-"}</p>
                            </div>
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                              p.status === "approved"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : p.status === "pending_review"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}>
                              {p.status === "approved" ? "✅ อนุมัติแล้ว" : p.status === "pending_review" ? "⏳ รอตรวจ" : "❌ ปฏิเสธ"}
                            </span>
                          </div>

                          {/* Image Thumbnail Box */}
                          <div className="w-full h-36 bg-slate-200/60 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center relative group">
                            {isCash ? (
                              <div className="text-center p-4">
                                <span className="text-2xl">💵</span>
                                <p className="text-xs text-slate-600 font-bold mt-1">ชำระด้วยเงินสดแก่เหรัญญิก</p>
                              </div>
                            ) : p.slipUrl ? (
                              <>
                                <img
                                  src={p.slipUrl}
                                  alt="Slip Preview"
                                  loading="lazy"
                                  className="w-full h-full object-contain bg-slate-100 group-hover:scale-105 transition-all duration-200"
                                />
                                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <button
                                    type="button"
                                    onClick={() => setViewingSlipPayment(p)}
                                    className="bg-white/95 hover:bg-white text-slate-800 font-bold text-xs px-3 py-1.5 rounded-xl shadow-lg flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye size={13} /> ดูรูปสลิปเต็ม
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-slate-400 text-xs">ไม่มีไฟล์รูปภาพ</div>
                            )}

                            {/* Storage Location Badge */}
                            <div className="absolute top-2 left-2">
                              {isCash ? (
                                <span className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow">💵 เงินสด</span>
                              ) : isDrive ? (
                                <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow flex items-center gap-1">
                                  <Cloud size={11} /> Google Drive
                                </span>
                              ) : (
                                <span className="bg-slate-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow flex items-center gap-1">
                                  <Database size={11} /> DB Base64
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Payment Meta */}
                          <div className="text-xs space-y-1 font-sans">
                            <div className="flex justify-between">
                              <span className="text-slate-500">รอบบิล:</span>
                              <span className="font-bold text-slate-800 tabular-nums">{bill ? `${bill.month}/${bill.year}` : "-"}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">ยอดชำระ:</span>
                              <span className="font-bold font-mono text-emerald-600 tabular-nums">฿{p.amount.toLocaleString()}</span>
                            </div>
                            {p.receiptNumber && (
                              <div className="flex justify-between">
                                <span className="text-slate-500">เลขใบเสร็จ:</span>
                                <span className="font-mono text-[11px] text-slate-700 tabular-nums">{p.receiptNumber}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-slate-500">วันที่ทำรายการ:</span>
                              <span className="text-slate-600 text-[11px] tabular-nums">{new Date(p.createdAt).toLocaleDateString("th-TH")}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action button */}
                        <button
                          type="button"
                          onClick={() => setViewingSlipPayment(p)}
                          className="w-full bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200/80 font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        >
                          <Eye size={13} /> ดูรายละเอียดสลิปเต็ม
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Monthly Summary Interactive Panel */}
      {adminTab === "reports" && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                📊 สรุปรายงานรายรับ - รายจ่ายรายเดือน
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ประมวลผลข้อมูลการทำรายการจริงในแต่ละเดือน จากประวัติและสลิปที่อนุมัติเข้าระบบแล้วค่ะ
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportAllCSV}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/70 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <FileText size={13} /> ส่งออกบัญชีทั้งหมดเป็น Excel (.csv)
              </button>
              <button 
                onClick={() => setAdminTab("approvals")} 
                className="text-xs text-slate-500 hover:text-slate-700 font-bold px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              >
                ✕ ปิด
              </button>
            </div>
          </div>

          {monthlySummaries.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              ยังไม่มีข้อมูลการทำธุรกรรมในระบบที่จะนำมาสรุปผลได้ในขณะนี้ค่ะ
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Monthly List Selection */}
              <div className="lg:col-span-1 space-y-2 border-r border-slate-100 pr-0 lg:pr-4">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">เลือกเดือนที่ต้องการดูรายงาน</p>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {monthlySummaries.map((summary) => {
                    const key = `${summary.month}_${summary.year}`;
                    const netProfit = summary.income - summary.expense;
                    const isSelected = selectedMonthKey === key;
                    
                    return (
                      <div
                        key={key}
                        onClick={() => setSelectedMonthKey(key)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all text-xs flex items-center justify-between ${
                          isSelected
                            ? "bg-blue-50/50 border-blue-500 font-bold shadow-xs"
                            : "bg-slate-50 border-slate-200/70 hover:bg-slate-100"
                        }`}
                      >
                        <div className="space-y-1">
                          <p className="text-slate-800 font-bold flex items-center gap-1.5">
                            <Calendar size={13} className="text-slate-400" />
                            {getThaiMonthName(summary.month)} {summary.year}
                          </p>
                          <span className="inline-block text-[11px] text-slate-500 font-medium bg-white border border-slate-200/80 px-2 py-0.5 rounded-full tabular-nums">
                            {summary.txCount} รายการ
                          </span>
                        </div>

                        <div className="text-right space-y-1">
                          <p className={`font-bold font-mono text-xs tabular-nums ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {netProfit >= 0 ? "+" : ""}฿{netProfit.toLocaleString()}
                          </p>
                          <p className="text-[11px] text-slate-500 font-normal tabular-nums">
                            รับ ฿{summary.income.toLocaleString()} | จ่าย ฿{summary.expense.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Columns: Detailed Monthly Breakdown */}
              <div className="lg:col-span-2 space-y-5">
                {(() => {
                  const currentSummary = monthlySummaries.find(
                    s => `${s.month}_${s.year}` === selectedMonthKey
                  );
                  if (!currentSummary) {
                    return (
                      <div className="text-center py-16 text-slate-400 text-xs italic flex items-center justify-center h-full">
                        กรุณาเลือกเดือนในรายการฝั่งซ้ายเพื่อดูงบการเงินและสัดส่วนรายรับ-รายจ่ายค่ะ
                      </div>
                    );
                  }

                  const net = currentSummary.income - currentSummary.expense;

                  return (
                    <div className="space-y-5 text-xs">
                      {/* Summary Cards */}
                      <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
                        <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                          📌 สรุปยอดประจำเดือน {getThaiMonthName(currentSummary.month)} {currentSummary.year}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportMonthCSV(currentSummary)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            title="ส่งออกรายงานเดือนนี้เป็นไฟล์ Excel (.csv)"
                          >
                            <FileText size={13} /> ส่งออก Excel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPrintSummary(currentSummary);
                              setShowPrintModal(true);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            title="เปิดหน้าต่างพิมพ์รายงานสรุปหรือบันทึกเป็น PDF"
                          >
                            <Printer size={13} /> สั่งพิมพ์ / PDF
                          </button>
                        </div>
                      </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-emerald-50/50 border border-emerald-200/70 p-3.5 rounded-2xl">
                            <div className="flex items-center gap-1 text-emerald-700 font-bold mb-1">
                              <TrendingUp size={14} />
                              <span className="text-xs">รายรับรวม</span>
                            </div>
                            <span className="font-bold font-mono text-base text-emerald-700 tabular-nums">
                              ฿{currentSummary.income.toLocaleString()}
                            </span>
                          </div>

                          <div className="bg-rose-50/50 border border-rose-200/70 p-3.5 rounded-2xl">
                            <div className="flex items-center gap-1 text-rose-700 font-bold mb-1">
                              <TrendingDown size={14} />
                              <span className="text-xs">รายจ่ายรวม</span>
                            </div>
                            <span className="font-bold font-mono text-base text-rose-700 tabular-nums">
                              ฿{currentSummary.expense.toLocaleString()}
                            </span>
                          </div>

                          <div className={`p-3.5 rounded-2xl border ${net >= 0 ? "bg-blue-50/50 border-blue-200/70" : "bg-amber-50/40 border-amber-200/70"}`}>
                            <div className={`font-bold mb-1 text-xs ${net >= 0 ? "text-blue-700" : "text-amber-700"}`}>
                              {net >= 0 ? "🟢 กำไรสุทธิ" : "🟡 ดุลบัญชีติดลบ"}
                            </div>
                            <span className={`font-bold font-mono text-base tabular-nums ${net >= 0 ? "text-blue-700" : "text-amber-800"}`}>
                              {net >= 0 ? "+" : ""}฿{net.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Category Breakdown list */}
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">สัดส่วนตามประเภทบัญชี</p>
                        
                        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 space-y-3">
                          
                          {/* Income Breakdown */}
                          <div className="space-y-2">
                            <p className="font-bold text-emerald-700 text-xs flex items-center gap-1">
                              🟢 หมวดรายรับ (Incomes)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                                <span className="text-[11px] text-slate-500">ค่าบำรุงรายเดือน:</span>
                                <p className="font-bold font-mono text-slate-800 mt-0.5 tabular-nums">฿{currentSummary.monthly_fee.toLocaleString()}</p>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                                <span className="text-[11px] text-slate-500">กำไรตลาดวันพุธ:</span>
                                <p className="font-bold font-mono text-slate-800 mt-0.5 tabular-nums">฿{currentSummary.market_profit.toLocaleString()}</p>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                                <span className="text-[11px] text-slate-500">รายรับอื่นๆ:</span>
                                <p className="font-bold font-mono text-slate-800 mt-0.5 tabular-nums">฿{currentSummary.other_income.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-slate-200/60 my-2"></div>

                          {/* Expense Breakdown */}
                          <div className="space-y-2">
                            <p className="font-bold text-rose-700 text-xs flex items-center gap-1">
                              🔴 หมวดรายจ่าย (Expenses)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                                <span className="text-[11px] text-slate-500">งบกิจกรรม/โครงการ:</span>
                                <p className="font-bold font-mono text-slate-800 mt-0.5 tabular-nums">฿{currentSummary.activity_expense.toLocaleString()}</p>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200/60">
                                <span className="text-[11px] text-slate-500">รายจ่ายอื่นๆ:</span>
                                <p className="font-bold font-mono text-slate-800 mt-0.5 tabular-nums">฿{currentSummary.other_expense.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>

                      {/* Transaction List for Selected Month */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">รายการที่เกิดขึ้นในเดือนนี้ ({currentSummary.transactionsList.length})</p>
                          {txError && (
                            <button 
                              onClick={() => setTxError(null)}
                              className="text-xs text-red-600 hover:underline cursor-pointer font-bold"
                            >
                              เคลียร์ข้อผิดพลาด ❌
                            </button>
                          )}
                        </div>
                        {txError && (
                          <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl animate-in fade-in duration-200">
                            ⚠️ {txError}
                          </div>
                        )}
                        <div className="max-h-[190px] overflow-y-auto space-y-1.5 pr-1 font-sans">
                          {currentSummary.transactionsList.map((tx) => (
                            <div key={tx.id} className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between text-xs hover:border-slate-300 transition-all">
                              <div className="space-y-0.5 min-w-0 pr-2">
                                <p className="font-bold text-slate-800 line-clamp-1">{tx.description}</p>
                                <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                                  {new Date(tx.createdAt).toLocaleDateString("th-TH")} • ID: {tx.id.substring(0, 15)}...
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className={`font-mono font-bold tabular-nums ${tx.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                                  {tx.type === "income" ? "+" : "-"}฿{tx.amount.toLocaleString()}
                                </span>
                                {onDeleteTransaction && (
                                  <div className="flex items-center">
                                    {confirmingTxId === tx.id ? (
                                      <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 p-1 rounded-xl animate-in fade-in duration-200">
                                        <span className="text-[11px] text-rose-700 font-bold px-1">ลบจริงไหม?</span>
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setDeletingTxId(tx.id);
                                            setConfirmingTxId(null);
                                            try {
                                              await onDeleteTransaction(tx.id);
                                            } catch (err: any) {
                                              setTxError(err.message || "ลบล้มเหลว");
                                            } finally {
                                              setDeletingTxId(null);
                                            }
                                          }}
                                          className="text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded-lg cursor-pointer transition-all"
                                        >
                                          ลบ ⚠️
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmingTxId(null);
                                            setTxError(null);
                                          }}
                                          className="text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded-lg cursor-pointer transition-all"
                                        >
                                          ไม่
                                        </button>
                                      </div>
                                    ) : deletingTxId === tx.id ? (
                                      <span className="text-[11px] font-medium text-rose-500 flex items-center gap-1">
                                        <Trash2 size={12} className="animate-spin" /> กำลังลบ...
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmingTxId(tx.id);
                                          setTxError(null);
                                        }}
                                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                                        title="ลบรายการบัญชีนี้"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {adminTab === "approvals" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          <div className="lg:col-span-2 space-y-6">
            {currentUser.role === "treasurer" && (
              <>
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              <CheckSquare size={18} className="text-blue-600" /> ตรวจสอบอนุมัติสลิปโอนเงินค่ากองทุน ({pendingPayments.length})
            </h2>
            <p className="text-xs text-slate-500">ตรวจสอบความถูกต้องของการโอนและยอดเงินก่อนกดอนุมัติเข้าบัญชีหลัก</p>
  
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left inside: Pending lists */}
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {pendingPayments.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs bg-slate-50/70 rounded-2xl border border-slate-100">
                    ไม่มีสลิปการโอนเงินรอกรรมการตรวจสอบอนุมัติในขณะนี้ 🎉
                  </div>
                ) : (
                  pendingPayments.map((p) => {
                    const student = users.find(u => u.id === p.userId);
                    return (
                      <div 
                        key={p.id}
                        onClick={() => {
                          setSelectedPayment(p);
                          setShowRejectInput(false);
                        }}
                        className={`p-3.5 rounded-2xl border cursor-pointer text-xs transition-all space-y-1.5 ${
                          selectedPayment?.id === p.id 
                            ? "border-blue-500 bg-blue-50/50 font-bold shadow-xs" 
                            : "border-slate-200/80 bg-slate-50 hover:bg-slate-100/80"
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-bold text-slate-900">{student?.fullName || "สมาชิก"}</span>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">{student?.studentId}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-slate-500 truncate">{p.note || "ไม่มีหมายเหตุ"}</span>
                          <span className="font-extrabold text-blue-700 font-display text-sm tabular-nums shrink-0">฿{p.amount.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
  
              {/* Right inside: Detail of chosen slip */}
              <div>
                {selectedPayment ? (
                  <div className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50 space-y-4 text-xs">
                    <div className="flex items-center justify-between pb-2.5 border-b border-dashed border-slate-200">
                      <span className="font-bold text-slate-800">สลิปหลักฐานโอนเงิน</span>
                      <span className="font-extrabold text-blue-700 font-display text-sm tabular-nums">฿{selectedPayment.amount.toLocaleString()}</span>
                    </div>
  
                    {selectedPayment.slipUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-xs max-h-52 relative">
                        <img src={selectedPayment.slipUrl} alt="Student Slip" className="w-full h-52 object-contain bg-slate-100" />
                        <a 
                          href={selectedPayment.slipUrl} 
                          target="_blank" 
                          rel="noreferrer"
                          className="absolute bottom-2.5 right-2.5 bg-slate-900/85 hover:bg-slate-900 text-white rounded-xl px-2.5 py-1.5 transition-all flex items-center gap-1.5 text-xs font-bold shadow-md"
                        >
                          <Eye size={13} /> ดูรูปเต็ม
                        </a>
                      </div>
                    )}
  
                    {showRejectInput ? (
                      <form onSubmit={handleReject} className="space-y-2.5">
                        <label className="block text-xs text-slate-600 font-bold">เหตุผลการไม่อนุมัติสลิป</label>
                        <input 
                          type="text" 
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="เช่น วันเวลาไม่ตรง หรือ ยอดเงินโอนไม่ครบ" 
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none"
                          required
                          disabled={isApproving}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button 
                            type="submit" 
                            disabled={isApproving}
                            className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                          >
                            {isApproving ? "กำลังดำเนินการ..." : "ยืนยันการปฏิเสธ"}
                          </button>
                          <button 
                            type="button" 
                            disabled={isApproving}
                            onClick={() => setShowRejectInput(false)} 
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3.5 py-2 rounded-xl disabled:opacity-50 cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5">
                        <button 
                          onClick={handleApprove}
                          disabled={isApproving}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {isApproving ? (
                            "กำลังอนุมัติ..."
                          ) : (
                            <>
                              <CheckCircle2 size={14} /> อนุมัติสลิป
                            </>
                          )}
                        </button>
                        <button 
                          onClick={() => setShowRejectInput(true)}
                          disabled={isApproving}
                          className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <XCircle size={14} /> ปฏิเสธสลิป
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border border-slate-200 border-dashed rounded-2xl p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center h-full">
                    คลิกที่รายการสลิปค้างตรวจสอบฝั่งซ้ายเพื่อเปิดแผงอนุมัติการเงิน
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tab 1.5: Password Reset Requests */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Lock size={18} className="text-amber-500" /> คำขอรีเซ็ตรหัสผ่านจากเพื่อนๆ ({ (passwordResets || []).filter(r => r.status === "pending").length })
              </h2>
              <span className="text-xs bg-amber-50 text-amber-700 font-bold px-2.5 py-1 rounded-full border border-amber-200/80">
                สิทธิ์เริ่มต้น (123456)
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              เมื่อเพื่อนๆ กด "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ รายชื่อจะมาแจ้งเตือนที่นี่ เหรัญญิกสามารถคลิกเพื่อรีเซ็ตรหัสผ่านกลับเป็นสแตนดาร์ด "123456" เพื่อให้ล็อกอินเข้ามาตั้งรหัสใหม่ได้ค่ะ
            </p>

            {resetSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200/80 text-emerald-700 font-bold rounded-2xl flex items-center gap-2 text-xs">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>{resetSuccessMsg}</span>
              </div>
            )}

            <div className="space-y-2">
              { (passwordResets || []).filter(r => r.status === "pending").length === 0 ? (
                <div className="text-center py-8 border border-slate-200/80 border-dashed rounded-2xl text-slate-400 text-xs">
                  ไม่มีคำขอรีเซ็ตรหัสผ่านในขณะนี้ค่ะ ✨ เพื่อนทุกคนเข้าใช้ระบบปกติ
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {(passwordResets || [])
                    .filter(r => r.status === "pending")
                    .map((req) => (
                      <div 
                        key={req.id}
                        className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900">{req.fullName}</span>
                            <span className="text-xs text-slate-500 font-mono tabular-nums">({req.studentId})</span>
                            <span className="text-[11px] bg-slate-200/80 text-slate-700 font-semibold px-2 py-0.5 rounded-lg">
                              {req.classroom}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            ร้องขอเมื่อ: {new Date(req.requestedAt).toLocaleString("th-TH")}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={resolvingResetId === req.id}
                          onClick={() => handleResolvePasswordReset(req.id, req.fullName)}
                          className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs text-xs self-start sm:self-auto cursor-pointer"
                        >
                          <RefreshCw size={13} className={resolvingResetId === req.id ? "animate-spin" : ""} />
                          {resolvingResetId === req.id ? "กำลังรีเซ็ต..." : "🔄 รีเซ็ตเป็น 123456"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
            </>
          )}
        </div>
        <div className="lg:col-span-1 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <AlertCircle size={18} className="text-rose-500" /> ติดตามคนค้างชำระ ({unpaidUsersList.length} คน)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">เมื่อสร้างบิลรอบใหม่ บิลเก่าที่ค้างจะสะสมรวมเป็นยอดค้างชำระเพื่อให้ตามเก็บได้ครบถ้วน</p>
            </div>
            <button
              type="button"
              onClick={handleCopyUnpaidList}
              className={`text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs shrink-0 self-start sm:self-auto cursor-pointer ${
                copied 
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold" 
                  : "bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold"
              }`}
            >
              {copied ? (
                <>
                  <CheckCircle2 size={13} /> คัดลอกแล้ว!
                </>
              ) : (
                <>
                  <Copy size={13} /> คัดลอกส่ง LINE
                </>
              )}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input 
                type="text" 
                value={unpaidSearch}
                onChange={(e) => setUnpaidSearch(e.target.value)}
                placeholder="ค้นหาตามชื่อ, ชื่อเล่น, รหัสนิสิต..." 
                className="w-full text-xs p-2.5 pl-8 border border-slate-200 rounded-xl focus:outline-none"
              />
              <span className="absolute left-2.5 top-3 text-slate-400 text-xs">🔍</span>
            </div>
             {currentUser.role === "treasurer" && (
              <select
                value={adminClassroomFilter}
                onChange={(e) => setAdminClassroomFilter(e.target.value)}
                className="text-xs p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 font-bold focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">🎓 ทุกห้องเรียน (รุ่น 06)</option>
                <option value="ห้อง 1">🎓 ห้อง 1</option>
                <option value="ห้อง 2">🎓 ห้อง 2</option>
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredUnpaidUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs italic bg-slate-50/70 rounded-2xl border border-slate-100">
                ยินดีด้วย! ไม่มีเพื่อนคนไหนค้างชำระค่ากองทุนตามเงื่อนไขที่ค้นหา 🎉
              </div>
            ) : (
              filteredUnpaidUsers.map(({ user, unpaidBills, totalUnpaidAmount }) => {
                const hasPendingReview = unpaidBills.some(b => b.status === "pending_review");
                return (
                  <div key={user.id} className="p-3.5 border border-slate-200/80 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all text-xs flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900 text-xs">{user.fullName} ({user.nickname})</span>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">รหัสนักศึกษา: {user.studentId}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-rose-600 font-extrabold block text-sm tabular-nums">฿{totalUnpaidAmount.toLocaleString()}</span>
                        <span className="inline-block text-[11px] text-rose-700 font-bold bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full tabular-nums mt-0.5">
                          ค้าง {unpaidBills.length} เดือน
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {unpaidBills.map(b => {
                        const isConfirming = confirmingCashBillId === `${user.id}_${b.id}`;
                        const approvedAmt = payments
                          .filter(p => p.billId === b.id && p.status === "approved")
                          .reduce((sum, p) => sum + p.amount, 0);
                        const remainingAmt = b.amount - approvedAmt;

                        return (
                          <div 
                            key={b.id} 
                            className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200/80 rounded-xl p-2 shadow-2xs"
                          >
                            <span 
                              className={`text-[11px] px-2.5 py-1 rounded-lg font-bold tabular-nums ${
                                b.status === "pending_review"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200/80"
                                  : "bg-rose-50 text-rose-700 border border-rose-200/80"
                              }`}
                              title={b.status === "pending_review" ? "ส่งหลักฐานการโอนเงินแล้ว รอกรรมการตรวจสอบสลิป" : `ค้างชำระ ยอดคงเหลือ: ฿${remainingAmt}`}
                            >
                              {getThaiMonthName(b.month)} {b.year} {approvedAmt > 0 ? `(ค้าง ฿${remainingAmt})` : ""} {b.status === "pending_review" ? "⏳" : "❌"}
                            </span>
                            
                            {/* Manual cash payment & slip upload (Touch-friendly on mobile) */}
                            {b.status !== "paid" && (
                              isConfirming ? (
                                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 animate-in fade-in duration-100">
                                  <input
                                    type="number"
                                    min={1}
                                    max={remainingAmt}
                                    value={cashAmountInput}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      if (val > remainingAmt) {
                                        setCashAmountInput(String(remainingAmt));
                                      } else {
                                        setCashAmountInput(e.target.value);
                                      }
                                    }}
                                    className="w-16 px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 tabular-nums"
                                    title={`ระบุจำนวนเงินสดที่จะรับ (ค้าง ฿${remainingAmt})`}
                                    placeholder={String(remainingAmt)}
                                  />
                                  <button
                                    type="button"
                                    disabled={isRecordingCash || !cashAmountInput || Number(cashAmountInput) <= 0}
                                    onClick={async () => {
                                      setIsRecordingCash(true);
                                      try {
                                        await onRecordCashPayment(b.id, user.id, Number(cashAmountInput), "ชำระเงินสดแก่เหรัญญิก");
                                        setConfirmingCashBillId(null);
                                      } catch (err) {
                                        console.error(err);
                                      } finally {
                                        setIsRecordingCash(false);
                                      }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-xs active:scale-95 transition-all cursor-pointer"
                                  >
                                    {isRecordingCash ? "..." : "ตกลง"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isRecordingCash}
                                    onClick={() => setConfirmingCashBillId(null)}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold px-2 py-1 rounded-lg cursor-pointer"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmingCashBillId(`${user.id}_${b.id}`);
                                      setCashAmountInput(String(remainingAmt));
                                    }}
                                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                                    title={`บันทึกชำระด้วยเงินสด (ยอดค้าง: ฿${remainingAmt})`}
                                  >
                                    💵 รับเงินสด
                                  </button>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    id={`upload-slip-admin-${user.id}-${b.id}`}
                                    className="hidden"
                                    onChange={(e) => handleUploadSlipAdminFileChange(e, b.id, user.id)}
                                  />
                                  <label
                                    htmlFor={`upload-slip-admin-${user.id}-${b.id}`}
                                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                                    title="อัปโหลดและบันทึกสลิปแทนสมาชิกย้อนหลัง (อัปโหลดเข้า Google Drive อัตโนมัติ)"
                                  >
                                    📤 แนบสลิป
                                  </label>
                                </div>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600 font-sans">
                      <span className="flex items-center gap-1 font-mono tabular-nums">
                        📞 <strong>{user.phone || "ไม่ระบุเบอร์"}</strong>
                      </span>
                      {hasPendingReview ? (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                          รอกรรมการตรวจสอบสลิป
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                          ยังไม่ได้จ่ายเงิน
                        </span>
                      )}
                    </div>

                    {/* Smart Reminder trigger button */}
                    <div className="pt-2 border-t border-slate-200/60 flex flex-col gap-2">
                      {sentReminders.includes(user.id) ? (
                        <div className="text-center py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200 text-xs flex items-center justify-center gap-1.5">
                          ✓ ส่งแจ้งเตือนทวงถามส่วนตัวแล้ว
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleTriggerReminderForm(user.id, unpaidBills, totalUnpaidAmount, user.fullName)}
                          className={`w-full font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            activeReminderUserId === user.id
                              ? "bg-slate-200 text-slate-700"
                              : "bg-amber-500 hover:bg-amber-600 text-white shadow-xs"
                          }`}
                        >
                          🔔 {activeReminderUserId === user.id ? "ปิดการพิมพ์แจ้งเตือน" : "แจ้งเตือนรายบุคคล (In-app)"}
                        </button>
                      )}

                      {/* Customize Reminder panel */}
                      {activeReminderUserId === user.id && (
                        <div className="bg-amber-50/60 rounded-2xl p-3 border border-amber-200/80 space-y-2 mt-1 animate-in fade-in duration-200">
                          <p className="text-[11px] text-amber-900 font-bold">เลือกสไตล์การทวงถาม:</p>
                          <div className="flex gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleApplyReminderTemplate("gentle", user.fullName, unpaidBills, totalUnpaidAmount)}
                              className="bg-white hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                            >
                              😊 สุภาพ/ทางการ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyReminderTemplate("friendly", user.fullName, unpaidBills, totalUnpaidAmount)}
                              className="bg-white hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                            >
                              💬 กันเอง/เป็นมิตร
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyReminderTemplate("urgent", user.fullName, unpaidBills, totalUnpaidAmount)}
                              className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-[11px] px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                            >
                              ⚠️ ด่วนที่สุด
                            </button>
                          </div>
                          
                          <textarea
                            value={customReminderMessage}
                            onChange={(e) => setCustomReminderMessage(e.target.value)}
                            rows={3}
                            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-amber-400 font-sans leading-relaxed text-slate-700"
                            placeholder="พิมพ์ข้อความทวงถามรายบุคคลส่วนตัว..."
                          />

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setActiveReminderUserId(null)}
                              className="text-xs text-slate-600 font-bold hover:underline px-2 py-1 cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              disabled={sendingReminderId === user.id}
                              onClick={() => handleSubmitIndividualReminder(user.id)}
                              className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer"
                            >
                              {sendingReminderId === user.id ? "กำลังส่ง..." : "🚀 ส่งข้อความเตือน"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
        </div>
          </div>
        </div>
      </div>
      )}

      {/* Tab 2: Monthly billing triggers */}
      {adminTab === "billing" && (
        <div className="lg:col-span-3 animate-in fade-in duration-200">
          {currentUser.role === "treasurer" ? (
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <PlusCircle size={18} className="text-indigo-600" /> เรียกเก็บบิลค่าบำรุงกองทุนประจำเดือน
              </h2>
              <p className="text-xs text-slate-500">ระบบจะทำการสร้างบิลเรียกเก็บเงินให้กับสมาชิกทั้งหมด พร้อมแจ้งเตือนให้อัปโหลดสลิปทันที</p>

              <form onSubmit={handleTriggerBills} className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 text-xs">
                <div>
                  <label className="block text-xs text-slate-600 font-bold mb-1">ประจำเดือน</label>
                  <select 
                    value={billMonth}
                    onChange={(e) => setBillMonth(Number(e.target.value))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none font-medium"
                  >
                    <option value={1}>มกราคม (01)</option>
                    <option value={2}>กุมภาพันธ์ (02)</option>
                    <option value={3}>มีนาคม (03)</option>
                    <option value={4}>เมษายน (04)</option>
                    <option value={5}>พฤษภาคม (05)</option>
                    <option value={6}>มิถุนายน (06)</option>
                    <option value={7}>กรกฎาคม (07)</option>
                    <option value={8}>สิงหาคม (08)</option>
                    <option value={9}>กันยายน (09)</option>
                    <option value={10}>ตุลาคม (10)</option>
                    <option value={11}>พฤศจิกายน (11)</option>
                    <option value={12}>ธันวาคม (12)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 font-bold mb-1">ปี พ.ศ.</label>
                  <input 
                    type="number" 
                    value={billYear}
                    onChange={(e) => setBillYear(Number(e.target.value))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none tabular-nums font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 font-bold mb-1">วันครบกำหนดชำระ</label>
                  <input 
                    type="date" 
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                    required
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button 
                    type="submit"
                    disabled={isCreatingBills || isDeletingBills}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-3 rounded-xl transition-all shadow-sm active:scale-95 text-center text-xs cursor-pointer tabular-nums"
                  >
                    {isCreatingBills ? "กำลังออกบิล..." : `ออกบิลเก็บเงิน ${activeUsersCount} คน`}
                  </button>
                  <button 
                    type="button"
                    disabled={isCreatingBills || isDeletingBills}
                    onClick={handleDeleteBillsCycle}
                    className="bg-rose-50 hover:bg-rose-100 disabled:opacity-50 border border-rose-200 text-rose-700 font-bold py-3 px-3 rounded-xl transition-all shadow-xs active:scale-95 flex items-center justify-center gap-1 shrink-0 text-xs cursor-pointer"
                    title="ลบบิลทั้งหมดของรอบเดือนและปีที่ระบุด้านบน"
                  >
                    {isDeletingBills ? "ลบ..." : "❌ ลบบิลรอบนี้"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs text-center text-slate-400 text-xs italic">
              🔒 เฉพาะเหรัญญิกหรือคณะกรรมการหลักเท่านั้นที่มีสิทธิ์สร้างบิลและติดตามยอดเรียกเก็บรายเดือนค่ะ
            </div>
          )}
        </div>
      )}

      {/* Tab 4: System settings configuration */}
      {adminTab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          {currentUser.role === "treasurer" ? (
            <>
              <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
            <Settings size={18} className="text-slate-600" /> ตั้งค่าข้อมูลระบบกองทุน
          </h2>
          <p className="text-xs text-slate-500">แก้ไขข้อมูลบัญชีรับโอนเงิน PromptPay และอัตราเงินเรียกเก็บเฉลี่ยในระบบกองทุนกลาง</p>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">ชื่อกองทุนสัญญาร่วมรุ่น</label>
              <input 
                type="text" 
                value={setFundName}
                onChange={(e) => setSetFundName(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none bg-slate-50 focus:bg-white focus:border-blue-500 transition-colors"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">ค่าบำรุงรายคนต่อเดือน (บาท)</label>
              <input 
                type="number" 
                value={setMonthlyFee}
                onChange={(e) => setSetMonthlyFee(Number(e.target.value))}
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none bg-slate-50 focus:bg-white focus:border-blue-500 transition-colors tabular-nums font-semibold"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">ชื่อธนาคาร / ช่องทางรับเงิน</label>
              <div className="space-y-2">
                <select 
                  value={
                    ["พร้อมเพย์", "ธนาคารกสิกรไทย", "ธนาคารไทยพาณิชย์", "ธนาคารกรุงไทย", "ธนาคารกรุงเทพ", "ธนาคารทหารไทยธนชาต", "ธนาคารออมสิน"].includes(setBankName)
                      ? setBankName 
                      : "other"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "other") {
                      setSetBankName(e.target.value);
                    } else {
                      setSetBankName("");
                    }
                  }}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none bg-slate-50 text-xs font-medium"
                >
                  <option value="พร้อมเพย์">พร้อมเพย์ (PromptPay)</option>
                  <option value="ธนาคารกสิกรไทย">ธนาคารกสิกรไทย (KBank)</option>
                  <option value="ธนาคารไทยพาณิชย์">ธนาคารไทยพาณิชย์ (SCB)</option>
                  <option value="ธนาคารกรุงไทย">ธนาคารกรุงไทย (KTB)</option>
                  <option value="ธนาคารกรุงเทพ">ธนาคารกรุงเทพ (BBL)</option>
                  <option value="ธนาคารทหารไทยธนชาต">ธนาคารทหารไทยธนชาต (TTB)</option>
                  <option value="ธนาคารออมสิน">ธนาคารออมสิน (GSB)</option>
                  <option value="other">ระบุช่องทางอื่น ๆ...</option>
                </select>
                
                {(!["พร้อมเพย์", "ธนาคารกสิกรไทย", "ธนาคารไทยพาณิชย์", "ธนาคารกรุงไทย", "ธนาคารกรุงเทพ", "ธนาคารทหารไทยธนชาต", "ธนาคารออมสิน"].includes(setBankName) || !setBankName) && (
                  <input 
                    type="text" 
                    value={setBankName}
                    onChange={(e) => setSetBankName(e.target.value)}
                    placeholder="พิมพ์ระบุชื่อธนาคาร / ช่องทางอื่น ๆ"
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none bg-slate-50 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
                    required
                  />
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">เลขบัญชีธนาคาร / เบอร์ PromptPay</label>
              <input 
                type="text" 
                value={setPromptpayNumber}
                onChange={(e) => setSetPromptpayNumber(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none bg-slate-50 focus:bg-white focus:border-blue-500 transition-colors font-mono tabular-nums"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">ชื่อบัญชีรับเงิน (ไทย)</label>
              <input 
                type="text" 
                value={setPromptpayName}
                onChange={(e) => setSetPromptpayName(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none bg-slate-50 focus:bg-white focus:border-blue-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">ลิงก์ / รูปภาพ QR Code PromptPay ของกองทุน (ตัวเลือก)</label>
              <div className="space-y-2">
                <input 
                  type="text" 
                  value={promptpayQrUrl}
                  onChange={(e) => setPromptpayQrUrl(e.target.value)}
                  placeholder="ลิงก์ URL หรือ ปล่อยว่างเพื่อใช้ระบบเจน QR อัตโนมัติ"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none bg-slate-50 font-sans text-xs"
                />
                
                <div className="flex flex-wrap items-center gap-3">
                  <input 
                    type="file" 
                    id="admin_qr_upload" 
                    accept="image/*"
                    onChange={handleQrUpload}
                    className="hidden" 
                  />
                  <label 
                    htmlFor="admin_qr_upload"
                    className="cursor-pointer bg-blue-50 border border-blue-200/80 hover:bg-blue-100 text-blue-700 font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all text-xs"
                  >
                    <Upload size={13} /> อัปโหลดไฟล์รูปภาพ QR Code ของตนเอง
                  </label>
                  {promptpayQrUrl && (
                    <button 
                      type="button"
                      onClick={() => setPromptpayQrUrl("")}
                      className="text-rose-600 hover:text-rose-700 font-semibold text-xs cursor-pointer"
                    >
                      ล้างรูปภาพ/ลิงก์
                    </button>
                  )}
                </div>

                {promptpayQrUrl && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 w-fit">
                    <p className="text-[11px] text-slate-600 font-bold flex items-center gap-1">
                      <QrCode size={12} /> ตัวอย่างรูปภาพ QR Code ที่ตั้งค่า:
                    </p>
                    <img 
                      src={promptpayQrUrl} 
                      alt="PromptPay QR Preview" 
                      className="w-32 h-32 object-contain bg-white p-2 border border-slate-100 rounded-lg shadow-xs" 
                    />
                  </div>
                )}
              </div>
            </div>

            <button 
              type="submit"
              disabled={isUpdatingSettings}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-all shadow-md cursor-pointer"
            >
              {isUpdatingSettings ? "กำลังบันทึก..." : "บันทึกข้อมูลกองทุนหลัก"}
            </button>
          </form>
        </div>
              </div>
              
            <div className="lg:col-span-2">
                {/* System Diagnostics & Database Cloud Backup Recovery Panel */}
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Database size={18} className="text-blue-600" /> ศูนย์ตรวจสอบและกู้คืนฐานข้อมูล (Cloud & Backups)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">ระบบสำรองข้อมูลเชื่อมต่อคลาวด์แบบเรียลไทม์ ป้องกันปัญหาข้อมูลสูญหาย 100%</p>
            </div>
            <button
              type="button"
              onClick={loadBackupsAndDiag}
              disabled={isLoadingBackups}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-all hover:text-slate-800 cursor-pointer"
              title="รีเฟรชข้อมูลสุขภาพระบบ"
            >
              <RefreshCw size={15} className={isLoadingBackups ? "animate-spin text-blue-600" : ""} />
            </button>
          </div>

          {/* Database Diagnostics Info Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Cloud Status */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-1.5 text-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-500 font-bold uppercase block">สถานะการเชื่อมต่อ Cloud</span>
                {diag?.mongodb?.connected ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold mt-1">
                    <Cloud size={14} /> เชื่อมต่อ Supabase สำเร็จ (Online)
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-rose-500 font-bold mt-1">
                    <Cloud size={14} /> ขัดข้อง: ไม่สามารถเชื่อมต่อฐานข้อมูลได้
                  </div>
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  ระบบฐานข้อมูล: <span className="font-mono font-semibold text-slate-700">Supabase PostgreSQL</span>
                </p>
              </div>
              <div className="pt-2.5 border-t border-slate-200/60 mt-2">
                {!showSyncConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowSyncConfirm(true)}
                    className="w-full py-2 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    title="คลิกเพื่อดึงข้อมูลเวอร์ชันล่าสุดจาก Supabase"
                  >
                    <RefreshCw size={12} />
                    🔄 ซิงก์ดึงข้อมูลจาก Cloud
                  </button>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleForceSyncCloud}
                      disabled={isSyncingCloud}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                    >
                      <RefreshCw size={11} className={isSyncingCloud ? "animate-spin" : ""} />
                      {isSyncingCloud ? "กำลังดึง..." : "ยืนยันซิงก์ 🔄"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSyncConfirm(false)}
                      disabled={isSyncingCloud}
                      className="py-1.5 px-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
            </div>


            {/* Google Drive Status */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-1.5 text-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-500 font-bold uppercase block">สถานะคลังภาพ Google Drive</span>
                {diag?.googleDrive?.connected ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold mt-1">
                    <Cloud size={14} className="text-emerald-500" /> เชื่อมต่อคลังภาพสำเร็จ
                  </div>
                ) : googleUser ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold mt-1">
                    <Cloud size={14} className="text-emerald-500" /> เชื่อมต่อผ่านบัญชี Google แล้ว
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-rose-500 font-bold mt-1">
                    <Cloud size={14} className="text-rose-500" /> ขัดข้อง: {diag?.googleDrive?.error || "ยังไม่ได้เชื่อมต่อ"}
                  </div>
                )}
                <p className="text-[11px] text-slate-500 mt-1 truncate max-w-[220px]" title={diag?.googleDrive?.rootFolderLink}>
                  โฟลเดอร์หลัก: {diag?.googleDrive?.rootFolderLink ? "กำหนดลิงก์แล้ว" : "ไม่ได้กำหนดลิงก์"}
                </p>
                <p className="text-[11px] mt-0.5">
                  บัญชีผู้ใช้: {googleUser ? (
                    <span className="text-emerald-600 font-bold">{googleUser.email}</span>
                  ) : (
                    <span className="text-slate-500">ยังไม่ได้ล็อกอิน Google</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-600 font-bold mt-0.5 tabular-nums">
                  สลิปสะสมในระบบ: <span className="text-indigo-600 font-mono">{diag?.googleDrive?.pendingMigrationCount || 0}</span> รูป
                </p>
              </div>
              <div className="pt-2.5 border-t border-slate-200/60 mt-2">
                <button
                  type="button"
                  onClick={handleMigrateImagesToDrive}
                  disabled={isMigratingImages || (!diag?.googleDrive?.connected && !googleUser && !googleToken) || !diag?.googleDrive?.pendingMigrationCount}
                  className="w-full py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-100 disabled:text-slate-400 text-indigo-700 border border-indigo-200/60 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed tabular-nums"
                  title="ย้ายรูปภาพสลิปที่เก็บในฐานข้อมูล Supabase ทั้งหมดขึ้นไปจัดหมวดหมู่ใน Google Drive"
                >
                  <Upload size={12} className={isMigratingImages ? "animate-bounce" : ""} />
                  {isMigratingImages ? "กำลังย้ายสลิป..." : `☁️ ย้าย ${diag?.googleDrive?.pendingMigrationCount || 0} รูปขึ้น Drive`}
                </button>
              </div>
            </div>

            {/* Local Storage File Status */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-1.5 text-xs flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-500 font-bold uppercase block">สถานะการสำรองข้อมูลท้องถิ่น</span>
                <div className="flex items-center gap-1.5 text-xs text-slate-800 font-bold mt-1 tabular-nums">
                  <Server size={14} className="text-blue-500" /> แบ็กอัปสะสม: {backups.length} ชุด
                </div>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  ขนาดไฟล์ล่าสุด: <span className="font-mono font-semibold text-slate-700">{(diag?.localFile?.sizeBytes ? diag.localFile.sizeBytes / 1024 : 0).toFixed(2)} KB</span>
                </p>
              </div>
              <div className="pt-2.5 border-t border-slate-200/60 mt-2">
                <div className="text-[11px] text-slate-400 italic text-center py-1">
                  ระบบจัดเก็บสำรองประวัติแยกอิสระ
                </div>
              </div>
            </div>
          </div>

          {/* Smart Share Summary & Backup Section */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-indigo-200/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <span className="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                  <span className="p-1 rounded-lg bg-indigo-500/15 text-indigo-700">📊</span>
                  สร้างรายงานสรุปส่งเพื่อน & สำรองข้อมูลด่วน (Auto Backup + Summary Report)
                </span>
                <p className="text-xs text-slate-600">สร้างข้อความสรุปยอดค้างชำระและเงินกองทุนสำหรับคัดลอกส่งลงกลุ่ม LINE/Facebook พร้อมเซฟจุดกู้คืนระบบคลาวด์ให้อัตโนมัติในปุ่มเดียว</p>
              </div>
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all shrink-0 self-start sm:self-center flex items-center gap-1.5 cursor-pointer"
              >
                {isGeneratingSummary ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" /> กำลังสร้างและเซฟ...
                  </>
                ) : (
                  <>📋 สร้างสรุป & แบ็กอัปด่วน</>
                )}
              </button>
            </div>

            {summaryText && (
              <div className="space-y-2 mt-2 bg-white p-3 rounded-xl border border-indigo-100">
                <div className="flex items-center justify-between text-xs text-slate-500 border-b border-indigo-50 pb-1.5">
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={13} /> สำรองข้อมูลปลอดภัย 100% แล้ว ({generatedBackupFilename})
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 text-xs bg-indigo-50 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    {copySuccess ? "✅ คัดลอกสำเร็จ!" : "📋 คัดลอกข้อความสรุป"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={summaryText}
                  rows={8}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-slate-700 resize-y"
                />
              </div>
            )}
          </div>

          {/* Record statistics summary */}
          <div className="px-4 py-3 rounded-2xl bg-indigo-50/40 border border-indigo-100/80 grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-center text-xs">
            <div>
              <span className="text-[11px] text-slate-500 block font-bold">บัญชีสมาชิก</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm tabular-nums">{diag?.counts?.users || 0}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-bold">รอบบิลสะสม</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm tabular-nums">{diag?.counts?.bills || 0}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-bold">ประวัติแนบสลิป</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm tabular-nums">{diag?.counts?.payments || 0}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-bold">ธุรกรรมคลัง</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm tabular-nums">{diag?.counts?.transactions || 0}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-bold">โครงการกิจกรรม</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm tabular-nums">{diag?.counts?.activities || 0}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-bold">คำร้องเรียน</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm tabular-nums">{diag?.counts?.petitions || 0}</span>
            </div>
          </div>

          {/* Action 1: Create Manual Cloud/Local Backup point */}
          <form onSubmit={handleCreateBackup} className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">สร้างจุดคืนค่าระบบใหม่ด่วน (Instant System Restore Point)</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                value={backupNote}
                onChange={(e) => setBackupNote(e.target.value)}
                placeholder="ระบุชื่อย่อหรือเหตุการณ์ (เช่น ก่อนออกบิลเดือนสิงหาคม)"
                className="flex-1 text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-400 bg-slate-50"
              />
              <button
                type="submit"
                disabled={isCreatingBackup}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm shrink-0 cursor-pointer"
              >
                {isCreatingBackup ? "กำลังเซฟ..." : "🚀 เซฟแบ็กอัป"}
              </button>
            </div>
          </form>

          {/* Action 2: Manual backup file upload recovery */}
          <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/40 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-800 flex items-center gap-1 text-xs">
                📤 นำเข้าไฟล์คลังสำรองเพื่อคืนค่าระบบ (Import Recovery JSON)
              </span>
              <p className="text-xs text-slate-500">ในกรณีระบบขัดข้องหรือแอพหาย คุณสามารถอัปโหลดไฟล์สำรอง (.json) เพื่อกู้คืนสถานะกลับมาทันที</p>
            </div>
            <div className="relative shrink-0">
              <input
                type="file"
                id="file_backup_upload"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="file_backup_upload"
                className="cursor-pointer bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all text-xs shadow-xs"
              >
                <Upload size={12} /> เลือกไฟล์กู้คืน (.json)
              </label>
            </div>
          </div>

          {/* Backup History Table */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              📚 ประวัติจุดกู้คืนและแบ็กอัปอัตโนมัติที่มีอยู่ ({backups.length} รายการ)
            </span>
            <div className="border border-slate-200/80 rounded-2xl overflow-hidden max-h-[220px] overflow-y-auto pr-1">
              {backups.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs italic">
                  ยังไม่มีประวัติการสำรองข้อมูลในระบบ
                </div>
              ) : (
                <div className="divide-y divide-slate-100 bg-slate-50/20 text-xs">
                  {backups.map((b) => (
                    <div key={b.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 transition-all">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 text-xs truncate">
                            {b.note || b.filename}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            b.type === "cloud"
                              ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                              : "bg-amber-50 text-amber-700 border border-amber-200/80"
                          }`}>
                            {b.type === "cloud" ? "☁️ Cloud Backup" : "💾 Local Storage"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          สำรองเมื่อ: {new Date(b.createdAt).toLocaleDateString("th-TH")} {new Date(b.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                          {b.size && ` | ขนาด: ${(b.size / 1024).toFixed(1)} KB`}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        <a
                          href={`/api/backups/download?backupId=${b.id}`}
                          download
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 font-bold text-xs px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1"
                          title="ดาวน์โหลดไฟล์สำรองข้อมูล JSON ลงเครื่องคอมพิวเตอร์ของคุณ"
                        >
                          📥 โหลดไฟล์
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRestoreBackup(b.id)}
                          disabled={restoringId !== null || deletingId !== null}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 font-bold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                        >
                          {restoringId === b.id ? "กำลังกู้คืน..." : "⏪ กู้คืนจุดนี้"}
                        </button>
                        {confirmingDeleteId !== b.id ? (
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteId(b.id)}
                            disabled={deletingId !== null || restoringId !== null}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 font-bold text-xs px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer"
                            title="ลบจุดสำรองข้อมูลนี้ออกจากระบบอย่างถาวร"
                          >
                            <Trash2 size={12} />
                            ลบ
                          </button>
                        ) : (
                          <div className="flex gap-1 items-center bg-rose-50 border border-rose-200 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => handleDeleteBackup(b.id)}
                              disabled={deletingId === b.id}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] px-2 py-1 rounded-lg transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                            >
                              <Trash2 size={11} className={deletingId === b.id ? "animate-spin" : ""} />
                              {deletingId === b.id ? "กำลังลบ..." : "ยืนยันลบ ⚠️"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(null)}
                              disabled={deletingId === b.id}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] px-2 py-1 rounded-lg transition-all cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action 3: Google Drive External Backup Solution */}
          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Cloud className="text-emerald-500" size={15} /> ☁️ คลังสำรองข้อมูลภายนอก (Google Drive Backup)
                </span>
                <p className="text-xs text-slate-500">สำรองข้อมูลระบบออกไปเก็บใน Google Drive ส่วนตัวของคุณ ป้องกันพื้นที่คลาวด์ของแอพเต็มและเก็บข้อมูลได้ยาวนาน &gt;3 ปี</p>
              </div>
              
              {!googleUser ? (
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={isConnectingGoogle}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw size={12} className={isConnectingGoogle ? "animate-spin" : ""} />
                  🔌 เชื่อมต่อ Google Drive
                </button>
              ) : (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="text-right text-[11px]">
                    <p className="font-bold text-slate-700">เชื่อมต่อแล้ว</p>
                    <p className="text-slate-500 max-w-[160px] truncate">{googleUser.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 font-bold text-xs px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    ตัดการเชื่อมต่อ
                  </button>
                </div>
              )}
            </div>

            {driveError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle size={14} /> {driveError}
              </div>
            )}

            {googleUser && (
              <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/80">
                {/* Sub-tab Selection */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setDriveSectionTab("images")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      driveSectionTab === "images"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <span>🖼️</span> ทดสอบอัปโหลด & ดึงรูปภาพ ({driveImages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDriveSectionTab("backups")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      driveSectionTab === "backups"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <span>💾</span> จุดสำรองข้อมูลระบบ ({driveBackups.length})
                  </button>
                </div>

                {driveSectionTab === "images" ? (
                  /* IMAGE UPLOAD & RETRIEVAL TESTING PANEL */
                  <div className="space-y-4">
                    {/* Upload Box */}
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-100 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="block text-xs font-bold text-slate-800">📤 ทดสอบอัปโหลดรูปภาพลง Google Drive</span>
                          <p className="text-[11px] text-slate-500">เลือกไฟล์รูปภาพ (JPG, PNG) จากเครื่องเพื่ออัปโหลดไปยัง Google Drive ของคุณโดยตรง</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => loadDriveImages(googleToken!)}
                          disabled={isLoadingDriveImages}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                          title="รีเฟรชรูปภาพ"
                        >
                          <RefreshCw size={12} className={isLoadingDriveImages ? "animate-spin text-emerald-600" : ""} /> รีเฟรช
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingDriveImage}
                          onChange={handleUploadTestImageToDrive}
                          className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                        />
                      </div>

                      {driveImageSuccessMsg && (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
                          <span>{driveImageSuccessMsg}</span>
                          <button onClick={() => setDriveImageSuccessMsg(null)} className="text-xs font-bold text-emerald-600 hover:underline">ปิด</button>
                        </div>
                      )}
                    </div>

                    {/* Image Preview Canvas Modal / Display Box if fetched */}
                    {previewImageUrl && (
                      <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-3 animate-in fade-in zoom-in-95 duration-200 border border-slate-700 shadow-xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            <span className="text-xs font-bold text-emerald-400">✅ ผลลัพธ์การดึงรูปภาพจาก Google Drive API สำเร็จ</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewImageUrl(null)}
                            className="text-slate-400 hover:text-white text-xs font-bold bg-slate-800 px-2.5 py-1 rounded-lg cursor-pointer"
                          >
                            ✕ ปิดการแสดงรูป
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-4">
                          <div className="w-full sm:w-48 h-48 bg-black/50 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center shrink-0">
                            <img
                              src={previewImageUrl.url}
                              alt={previewImageUrl.name}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <div className="space-y-2 text-xs w-full min-w-0">
                            <div>
                              <span className="text-slate-400 text-[11px] block">ชื่อไฟล์บน Google Drive:</span>
                              <span className="font-mono font-bold text-white break-all">{previewImageUrl.name}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[11px] block">File ID:</span>
                              <span className="font-mono text-[11px] bg-slate-800 px-2 py-1 rounded text-emerald-300 block truncate">{previewImageUrl.id}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <a
                                href={previewImageUrl.url}
                                download={previewImageUrl.name}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                              >
                                ⬇️ ดาวน์โหลดรูป
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(`https://drive.google.com/file/d/${previewImageUrl.id}/view`);
                                  alert("คัดลอกลิงก์ Google Drive เรียบร้อยแล้ว!");
                                }}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                              >
                                📋 คัดลอกลิงก์ Drive
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Gallery of Drive Images */}
                    <div className="space-y-2">
                      <span className="block text-xs font-bold text-slate-700">🖼️ รายการรูปภาพทั้งหมดบน Google Drive ({driveImages.length} รายการ)</span>
                      
                      {isLoadingDriveImages ? (
                        <div className="p-8 text-center text-slate-400 text-xs italic bg-white rounded-xl border border-slate-200 flex items-center justify-center gap-2">
                          <RefreshCw size={14} className="animate-spin text-emerald-500" /> กำลังดึงรายชื่อรูปภาพจาก Google Drive...
                        </div>
                      ) : driveImages.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs italic bg-white rounded-xl border border-slate-200">
                          ยังไม่พบไฟล์รูปภาพใน Google Drive ของคุณ (ทดสอบอัปโหลดรูปภาพด้านบนได้เลยค่ะ)
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto p-1">
                          {driveImages.map((imgFile) => (
                            <div key={imgFile.id} className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all space-y-2 flex flex-col justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center text-slate-400 text-xs">
                                  {imgFile.thumbnailLink ? (
                                    <img src={imgFile.thumbnailLink} alt={imgFile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    "🖼️"
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 text-xs truncate" title={imgFile.name}>{imgFile.name}</p>
                                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                    {new Date(imgFile.createdTime).toLocaleDateString("th-TH")}
                                    {imgFile.size && ` | ${(parseInt(imgFile.size) / 1024).toFixed(0)} KB`}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => handleFetchPreviewDriveImage(imgFile.id, imgFile.name)}
                                  disabled={isLoadingPreviewImage}
                                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all flex-1 text-center truncate cursor-pointer"
                                >
                                  🔍 ดึงรูปมาใช้
                                </button>
                                {imgFile.webViewLink && (
                                  <a
                                    href={imgFile.webViewLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all shrink-0"
                                    title="เปิดบนไดรฟ์"
                                  >
                                    🔗 เปิดดู
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* SYSTEM BACKUPS PANEL */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Save Backup to Google Drive */}
                    <form onSubmit={handleBackupToDrive} className="space-y-2.5 border-b md:border-b-0 md:border-r border-slate-200/80 pb-3 md:pb-0 md:pr-4">
                      <span className="block text-xs font-bold text-slate-800">🚀 ส่งออกข้อมูลระบบไปเก็บใน Google Drive</span>
                      <p className="text-[11px] text-slate-500">กรอกหัวข้อหรือช่วงเวลาในการสำรอง เพื่อระบุประวัติไฟล์บนไดรฟ์อย่างชัดเจน</p>
                      <div className="space-y-2">
                        <input
                          type="text"
                          required
                          value={driveBackupNote}
                          onChange={(e) => setDriveBackupNote(e.target.value)}
                          placeholder="เช่น แบ็กอัปสะสมครบ 3 ปี ณ เดือนมิถุนายน 2569"
                          className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-400 bg-white"
                        />
                        <button
                          type="submit"
                          disabled={isUploadingToDrive}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          {isUploadingToDrive ? "กำลังอัปโหลดขึ้น Google Drive..." : "☁️ อัปโหลดแบ็กอัปขึ้น Google Drive"}
                        </button>
                      </div>
                    </form>

                    {/* List and Restore Google Drive Backups */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="block text-xs font-bold text-slate-800">📚 ประวัติจุดกู้คืนบน Google Drive ({driveBackups.length} รายการ)</span>
                        <button
                          type="button"
                          onClick={() => loadDriveBackups(googleToken!)}
                          disabled={isLoadingDriveBackups}
                          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-all cursor-pointer"
                          title="รีเฟรชข้อมูล Google Drive"
                        >
                          <RefreshCw size={13} className={isLoadingDriveBackups ? "animate-spin text-emerald-600" : ""} />
                        </button>
                      </div>

                      <div className="border border-slate-200/80 rounded-xl overflow-hidden max-h-[180px] overflow-y-auto bg-white">
                        {isLoadingDriveBackups ? (
                          <div className="p-6 text-center text-slate-400 text-xs italic flex items-center justify-center gap-2">
                            <RefreshCw size={14} className="animate-spin text-emerald-500" /> กำลังดึงรายชื่อไฟล์ใน Google Drive...
                          </div>
                        ) : driveBackups.length === 0 ? (
                          <div className="p-6 text-center text-slate-400 text-xs italic">
                            ยังไม่พบคลังสำรองของระบบนี้ใน Google Drive ของคุณ
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 text-xs">
                            {driveBackups.map((dbFile) => (
                              <div key={dbFile.id} className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50/50 transition-all">
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-800 text-xs block truncate" title={dbFile.name}>
                                    {dbFile.description?.replace("Housing Community System Backup: ", "") || dbFile.name}
                                  </span>
                                  <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                                    อัปโหลดเมื่อ: {new Date(dbFile.createdTime).toLocaleDateString("th-TH")} {new Date(dbFile.createdTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                                    {dbFile.size && ` | ขนาด: ${(parseInt(dbFile.size) / 1024).toFixed(1)} KB`}
                                  </p>
                                </div>

                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreFromDrive(dbFile.id, dbFile.name)}
                                    disabled={isRestoringFromDriveId !== null}
                                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                                  >
                                    {isRestoringFromDriveId === dbFile.id ? "กำลังกู้..." : "⏪ กู้คืนจุดนี้"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteFromDrive(dbFile.id, dbFile.name)}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 font-bold text-[11px] p-1.5 rounded-lg transition-all cursor-pointer"
                                    title="ลบไฟล์ออกจากไดรฟ์"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
            </>
          ) : (
            <div className="lg:col-span-3 bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs text-center text-slate-400 text-xs italic animate-in fade-in duration-200">
              🔒 เฉพาะเหรัญญิกหลักเท่านั้นที่มีสิทธิ์ตรวจสอบสุขภาพฐานข้อมูล ตั้งค่าสิทธิ์และเรียกคืนจุดกู้คืนระบบค่ะ
            </div>
          )}
        </div>
      )}

    {/* Printable PDF Report Modal */}
    {showPrintModal && printSummary && (
      <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-50 overflow-y-auto flex flex-col items-center p-0 md:p-6 print-modal-container">
        {/* Action Bar at the Top */}
        <div className="sticky top-0 w-full max-w-4xl bg-slate-800 text-white p-4 shadow-xl flex items-center justify-between z-10 md:rounded-t-3xl border-b border-slate-700 no-print">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold flex items-center gap-2">
              🖨️ หน้าตัวอย่างเอกสารรายงานการเงิน (Print/PDF Preview)
            </h3>
            <p className="text-[10px] text-slate-400">
              คุณสามารถเลือกบันทึกเป็นไฟล์ PDF (Save as PDF) หรือพิมพ์ผ่านเครื่องปริ้นท์เตอร์ในหน้าต่างถัดไปค่ะ
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer size={14} /> เริ่มการสั่งพิมพ์ / บันทึก PDF
            </button>
            <button
              onClick={() => {
                setShowPrintModal(false);
                setPrintSummary(null);
              }}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              ✕ ปิดหน้าต่างนี้
            </button>
          </div>
        </div>

        {/* Printable Sheet (Standard A4 layout, White paper-like design) */}
        <div className="bg-white text-slate-900 w-full max-w-4xl min-h-[1120px] p-8 md:p-12 shadow-2xl md:rounded-b-3xl border-x border-b border-slate-200 print-area relative flex flex-col justify-between font-sans">
          
          {/* Custom print-only CSS injection to ensure only this block prints */}
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 10mm 12mm;
              }
              html, body {
                background: #ffffff !important;
                color: #000000 !important;
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .no-print {
                display: none !important;
              }
              .print-modal-container {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                background: #ffffff !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible !important;
                z-index: 999999 !important;
              }
              .print-area {
                position: relative !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                font-size: 11pt !important;
                line-height: 1.4 !important;
                color: #000000 !important;
              }
            }
          `}} />

          <div className="space-y-6">
            {/* Document Header */}
            <div className="border-b-4 border-slate-800 pb-5 text-center relative">
              <span className="absolute left-0 top-0 text-[10px] uppercase font-mono tracking-widest text-slate-400 border border-slate-300 px-2 py-1 rounded">
                เอกสารรายงานภายใน
              </span>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 font-sans">
                รายงานสรุปฐานะทางการเงินและรายละเอียดรายรับ-รายจ่าย
              </h1>
              <p className="text-sm font-semibold text-slate-600 mt-1">
                ประจำงวดเดือน {getThaiMonthName(printSummary.month)} ประจำปี พ.ศ. {printSummary.year}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ระบบบัญชีกองทุนกลางสวัสดิการและกิจกรรมนักศึกษารุ่น • {settings.fundName || "เงินเก็บTns รุ่น06"}
              </p>
            </div>

            {/* Document Meta Info Table */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="space-y-1.5 font-sans">
                <p><strong>ชื่อโครงการ/กองทุน:</strong> {settings.fundName || "กองทุนห้อง"}</p>
                <p><strong>ประเภทงวดบัญชี:</strong> ประมวลผลรอบรายเดือน (Monthly Report)</p>
                <p><strong>จำนวนสมาชิกที่มีสิทธิ์ทั้งหมด:</strong> {users.length} คน (รายชื่ออ้างอิงล่าสุด)</p>
              </div>
              <div className="space-y-1.5 text-right font-sans">
                <p><strong>ผู้ออกรายงาน:</strong> {currentUser.fullName} ({currentUser.role === "treasurer" ? "เหรัญญิกห้อง" : currentUser.role === "leader" ? "หัวหน้าห้องเรียน" : "กรรมการรุ่น"})</p>
                <p><strong>วันที่จัดทำเอกสาร:</strong> {new Date().toLocaleDateString("th-TH")} เวลา {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</p>
                <p><strong>รหัสอ้างอิงงวดคลัง:</strong> REP-{printSummary.month}-{printSummary.year}-TRANS</p>
              </div>
            </div>

            {/* Core Financial Stat Blocks */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. สรุปดุลทางการเงิน (Financial Summary Statement)
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="border-2 border-slate-300 p-4 rounded-xl text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">ยอดรายรับสะสมรวม (Total Incomes)</span>
                  <p className="text-lg md:text-xl font-bold font-mono text-slate-900 mt-1">
                    ฿{printSummary.income.toLocaleString()}
                  </p>
                </div>
                <div className="border-2 border-slate-300 p-4 rounded-xl text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">ยอดรายจ่ายสะสมรวม (Total Expenses)</span>
                  <p className="text-lg md:text-xl font-bold font-mono text-slate-900 mt-1">
                    ฿{printSummary.expense.toLocaleString()}
                  </p>
                </div>
                <div className={`border-2 p-4 rounded-xl text-center ${printSummary.income - printSummary.expense >= 0 ? "border-slate-800 bg-slate-50" : "border-rose-400 bg-rose-50"}`}>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">ดุลบัญชีสุทธิประจำเดือน (Net Balance)</span>
                  <p className="text-lg md:text-xl font-bold font-mono text-slate-900 mt-1">
                    {printSummary.income - printSummary.expense >= 0 ? "+" : ""}฿{(printSummary.income - printSummary.expense).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Details breakdown by categories */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. รายละเอียดสัดส่วนหมวดบัญชี (Account Classification)
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                {/* Incomes */}
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <p className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                    <span>🟢 รายละเอียดส่วนรับ (Incomes Detail)</span>
                    <span className="font-bold font-mono">฿{printSummary.income.toLocaleString()}</span>
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-600">
                      <span>• ค่าบำรุงกองทุนรายเดือน (Monthly Fees)</span>
                      <span className="font-mono">฿{printSummary.monthly_fee.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>• กำไรกิจกรรมตลาดวันพุธ (Market Profits)</span>
                      <span className="font-mono">฿{printSummary.market_profit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>• รายรับอื่นๆ (Other Incomes)</span>
                      <span className="font-mono">฿{printSummary.other_income.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Expenses */}
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <p className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                    <span>🔴 รายละเอียดส่วนจ่าย (Expenses Detail)</span>
                    <span className="font-bold font-mono">฿{printSummary.expense.toLocaleString()}</span>
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-600">
                      <span>• งบกิจกรรม/โครงการรุ่น (Activities Expense)</span>
                      <span className="font-mono">฿{printSummary.activity_expense.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>• รายจ่ายสวัสดิการอื่นๆ (Other Expenses)</span>
                      <span className="font-mono">฿{printSummary.other_expense.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions list table */}
            <div className="space-y-2 font-sans">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                3. รายการเดินบัญชีทั้งหมดประจำเดือน (Statement Ledger Logs)
              </h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="p-2 border-r border-slate-200 text-center">ลำดับ</th>
                      <th className="p-2 border-r border-slate-200 text-center">วันที่ทำรายการ</th>
                      <th className="p-2 border-r border-slate-200">รายละเอียดและคำอธิบายรายการ</th>
                      <th className="p-2 border-r border-slate-200 text-center">หมวดหมู่บัญชี</th>
                      <th className="p-2 border-r border-slate-200 text-center">ประเภท</th>
                      <th className="p-2 text-right">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printSummary.transactionsList.map((tx: any, idx: number) => (
                      <tr key={tx.id} className="border-b border-slate-150 hover:bg-slate-50 text-slate-800">
                        <td className="p-2 border-r border-slate-200 font-mono text-center">{idx + 1}</td>
                        <td className="p-2 border-r border-slate-200 font-mono text-center">
                          {new Date(tx.createdAt).toLocaleDateString("th-TH")}
                        </td>
                        <td className="p-2 border-r border-slate-200 font-sans font-medium">
                          {tx.description}
                        </td>
                        <td className="p-2 border-r border-slate-200 font-sans text-center">
                          {getCategoryLabelText(tx.category)}
                        </td>
                        <td className="p-2 border-r border-slate-200 font-sans font-bold text-center">
                          <span className={tx.type === "income" ? "text-emerald-700" : "text-rose-700"}>
                            {tx.type === "income" ? "รับ" : "จ่าย"}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono font-bold">
                          ฿{tx.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Official Signature Verification Footer */}
          <div className="pt-8 mt-8 border-t border-dashed border-slate-300 font-sans">
            <p className="text-[10px] text-slate-400 text-center mb-10">
              รายงานสรุปงบการเงินนี้ สร้างขึ้นโดยระบบอัตโนมัติของเงินเก็บTns รุ่น06 ขอรับรองว่าข้อมูลข้างต้นเป็นข้อมูลธุรกรรมจริงที่ผ่านการอนุมัติตรวจสอบแล้วทุกรายการ
            </p>
            <div className="grid grid-cols-2 gap-12 text-xs text-slate-800">
              <div className="text-center space-y-4">
                <p>ลงชื่อ................................................................ เหรัญญิกรุ่นห้อง</p>
                <p className="font-semibold">({currentUser.fullName})</p>
                <p className="text-[10px] text-slate-500">ผู้จัดทำและลงบันทึกรายละเอียดบัญชีรายรับ-รายจ่าย</p>
                <p className="text-[11px] text-slate-500 font-mono">วันที่ ....../............/...........</p>
              </div>
              <div className="text-center space-y-4">
                <p>ลงชื่อ................................................................ พยานตรวจสอบ</p>
                <p className="font-semibold text-slate-400">(................................................................)</p>
                <p className="text-[10px] text-slate-500">ตำแหน่ง: ................................................................</p>
                <p className="text-[11px] text-slate-500 font-mono">วันที่ ....../............/...........</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    )}

    {/* Google Drive Migration Custom Modal */}
    {showMigrationModal && (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-5 relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Cloud size={22} className={isMigratingImages ? "animate-bounce" : ""} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">ย้ายสลิปชำระเงินขึ้น Google Drive</h3>
                <p className="text-xs text-slate-500">ลดขนาดพื้นที่คลังข้อมูลและจัดระเบียบรูปภาพสลิป</p>
              </div>
            </div>
            {!isMigratingImages && (
              <button
                type="button"
                onClick={() => setShowMigrationModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Body Content */}
          {migrationModalSuccess ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span>ดำเนินการย้ายสลิปสำเร็จ!</span>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                {migrationModalSuccess}
              </p>
              {migrationResult && migrationResult.errors.length > 0 && (
                <div className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl mt-2 border border-amber-200">
                  ⚠️ พบบางไฟล์ที่มีคำเตือน: {migrationResult.errors.join(", ")}
                </div>
              )}
            </div>
          ) : migrationModalError ? (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle size={18} className="text-rose-600" />
                <span>เกิดข้อผิดพลาดในการย้ายสลิป</span>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed">
                {migrationModalError}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100/80 text-indigo-950 space-y-2 text-xs">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-slate-600">สลิปสะสมรอการย้าย:</span>
                  <span className="text-indigo-600 text-sm font-mono">{diag?.googleDrive?.pendingMigrationCount || 0} รูป</span>
                </div>
                <div className="flex justify-between items-center text-[11px] border-t border-indigo-100 pt-2">
                  <span className="text-slate-500">บัญชีที่จะใช้จัดเก็บ:</span>
                  <span className="font-semibold text-slate-700">
                    {googleUser ? `Google Account (${googleUser.email})` : "Google Drive Service Connection"}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                สลิปภาพถ่ายดิบทั้งหมดจะถูกย้ายขึ้นไปเก็บเป็นไฟล์รูปภาพใน Google Drive แล้วเปลี่ยนรหัสสลิปในฐานข้อมูลเป็นลิงก์ URL ซึ่งช่วยประหยัดพื้นที่คลังข้อมูลได้มากกว่า 95%
              </p>

              {!googleUser && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-600">
                    <span className="font-bold block text-slate-700">ต้องการจัดเก็บใน Google Drive ส่วนตัว?</span>
                    ท่านสามารถล็อกอินบัญชี Google ได้ตามต้องการ
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={isConnectingGoogle || isMigratingImages}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl shadow-sm whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <LogIn size={13} /> {isConnectingGoogle ? "กำลังเชื่อมต่อ..." : "ล็อกอิน Google"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            {migrationModalSuccess ? (
              <button
                type="button"
                onClick={() => setShowMigrationModal(false)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl shadow-md transition-all cursor-pointer"
              >
                ตกลง (ปิดหน้าต่าง)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowMigrationModal(false)}
                  disabled={isMigratingImages}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 font-bold text-xs rounded-2xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={executeImageMigration}
                  disabled={isMigratingImages || (!diag?.googleDrive?.pendingMigrationCount)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isMigratingImages ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>กำลังย้ายสลิปขึ้นคลาวด์...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={15} />
                      <span>เริ่มย้าย {diag?.googleDrive?.pendingMigrationCount || 0} รูปทันที</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Full Historical Slip Viewer Modal */}
    {viewingSlipPayment && (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full p-6 space-y-5 relative max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <FileText size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">รายละเอียดหลักฐานการชำระเงินย้อนหลัง</h3>
                <p className="text-xs text-slate-500">รหัสอ้างอิงรายการ: {viewingSlipPayment.id}</p>
              </div>
            </div>
            <button
              onClick={() => setViewingSlipPayment(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>

          {/* Student & Payment Info Box */}
          {(() => {
            const student = users.find(u => u.id === viewingSlipPayment.userId);
            const bill = monthlyBills.find(b => b.id === viewingSlipPayment.billId);
            const reviewer = users.find(u => u.id === viewingSlipPayment.reviewedBy);
            const isDrive = viewingSlipPayment.slipUrl?.includes("google_drive:") || viewingSlipPayment.slipUrl?.includes("drive.google.com");
            const isCash = viewingSlipPayment.slipUrl === "cash";

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <div className="space-y-1.5">
                    <p><strong className="text-slate-600">ชื่อนักศึกษา:</strong> <span className="font-bold text-slate-800">{student?.fullName || "สมาชิก"} ({student?.nickname || "-"})</span></p>
                    <p><strong className="text-slate-600">รหัสนักศึกษา:</strong> <span className="font-mono">{student?.studentId || "-"}</span></p>
                    <p><strong className="text-slate-600">ห้องเรียน:</strong> <span className="font-bold">{student?.classroom || "ไม่ระบุ"}</span></p>
                    <p><strong className="text-slate-600">รอบบิลประจำเดือน:</strong> <span className="font-bold text-blue-600">{bill ? `${bill.month}/${bill.year}` : "-"}</span></p>
                  </div>
                  <div className="space-y-1.5 sm:text-right">
                    <p><strong className="text-slate-600">จำนวนเงินที่ชำระ:</strong> <span className="font-bold font-mono text-emerald-600 text-sm tabular-nums">฿{viewingSlipPayment.amount.toLocaleString()}</span></p>
                    <p><strong className="text-slate-600">เลขใบเสร็จ:</strong> <span className="font-mono text-blue-600 tabular-nums">{viewingSlipPayment.receiptNumber || "-"}</span></p>
                    <p><strong className="text-slate-600">สถานะรายการ:</strong> <span className={`font-bold ${viewingSlipPayment.status === "approved" ? "text-emerald-600" : viewingSlipPayment.status === "pending_review" ? "text-amber-600" : "text-rose-600"}`}>{viewingSlipPayment.status === "approved" ? "อนุมัติแล้ว" : viewingSlipPayment.status === "pending_review" ? "รอตรวจสอบ" : "ปฏิเสธ"}</span></p>
                    <p><strong className="text-slate-600">ผู้ทำรายการ/ตรวจสอบ:</strong> <span>{reviewer?.fullName || "เหรัญญิก/ระบบ"}</span></p>
                  </div>
                </div>

                {/* Slip Image View */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">🖼️ รูปสลิปหลักฐานโอนเงิน</span>
                    <span className="text-xs text-slate-500 font-medium">
                      {isCash ? "💵 ชำระเงินสด" : isDrive ? "☁️ จัดเก็บอยู่บน Google Drive" : "💾 จัดเก็บในฐานข้อมูล DB"}
                    </span>
                  </div>

                  <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 flex items-center justify-center min-h-[250px]">
                    {isCash ? (
                      <div className="text-center p-6 space-y-2">
                        <span className="text-4xl">💵</span>
                        <h4 className="font-bold text-slate-700 text-sm">รายการนี้เป็นการชำระด้วยเงินสดแก่เหรัญญิก</h4>
                        <p className="text-xs text-slate-500">ไม่มีไฟล์รูปสลิปแนบ เหรัญญิกเป็นผู้รับเงินสดและกดบันทึกเข้าระบบ</p>
                      </div>
                    ) : viewingSlipPayment.slipUrl ? (
                      <img
                        src={viewingSlipPayment.slipUrl}
                        alt="Full Slip Image"
                        className="max-h-[450px] w-auto object-contain rounded-xl shadow-md border border-slate-300"
                      />
                    ) : (
                      <p className="text-slate-400 text-xs">ไม่พบไฟล์รูปสลิป</p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  {viewingSlipPayment.slipUrl && !isCash && (
                    <a
                      href={viewingSlipPayment.slipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-1.5 transition-all"
                    >
                      <Eye size={14} /> เปิดรูปสลิปขนาดใหญ่ในแท็บใหม่
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewingSlipPayment(null)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    ปิดหน้าต่าง
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    )}
  </div>
  );
}
