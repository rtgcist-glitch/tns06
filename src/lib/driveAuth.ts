import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Configure Google Provider
export const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive");
provider.addScope("https://www.googleapis.com/auth/drive.file");

export interface GoogleDriveUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

let cachedAccessToken: string | null = typeof window !== "undefined" ? localStorage.getItem("gdrive_access_token") : null;
let cachedUser: GoogleDriveUser | null = (() => {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem("gdrive_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
})();

let isSigningIn = false;

// Pre-load GIS script immediately if running in browser
if (typeof window !== "undefined") {
  if (!(window as any).google?.accounts?.oauth2) {
    const existingScript = document.getElementById("google-gis-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-gis-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }
}

export const googleSignIn = async (): Promise<{ user: any; accessToken: string } | null> => {
  if (isSigningIn) return null;
  isSigningIn = true;

  try {
    // 1. Try GIS (Google Identity Services) first - direct OAuth without iframe/cookie restrictions
    const google = typeof window !== "undefined" ? (window as any).google : undefined;
    if (google?.accounts?.oauth2) {
      try {
        const tokenResponse = await new Promise<any>((resolve, reject) => {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: firebaseConfig.oAuthClientId,
            scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
            callback: (response: any) => {
              if (response.error) {
                reject(new Error(response.error_description || response.error));
              } else {
                resolve(response);
              }
            },
            error_callback: (err: any) => {
              reject(err);
            }
          });
          // Synchronous invocation preserves user gesture activation
          client.requestAccessToken({ prompt: "consent" });
        });

        if (tokenResponse?.access_token) {
          const accessToken = tokenResponse.access_token;

          let userInfo = { sub: "google_user_" + Date.now(), email: "", name: "ผู้ใช้งาน Google Drive", picture: "" };
          try {
            const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (userRes.ok) {
              userInfo = await userRes.json();
            }
          } catch (e) {
            console.warn("Could not fetch Google user info:", e);
          }

          const user: GoogleDriveUser = {
            uid: userInfo.sub,
            email: userInfo.email || "user@gmail.com",
            displayName: userInfo.name || "ผู้ใช้งาน Google Drive",
            photoURL: userInfo.picture || undefined
          };

          cachedAccessToken = accessToken;
          cachedUser = user;
          localStorage.setItem("gdrive_access_token", accessToken);
          localStorage.setItem("gdrive_user", JSON.stringify(user));

          return { user, accessToken };
        }
      } catch (gisErr: any) {
        console.warn("[GIS Auth] GIS request failed or closed, trying Firebase popup fallback:", gisErr?.message || gisErr);
      }
    }

    // 2. Fallback to Firebase Auth signInWithPopup
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Google sign in");
    }

    const accessToken = credential.accessToken;
    const fbUser = result.user;
    const user: GoogleDriveUser = {
      uid: fbUser.uid,
      email: fbUser.email || "user@gmail.com",
      displayName: fbUser.displayName || "ผู้ใช้งาน Google Drive",
      photoURL: fbUser.photoURL || undefined
    };

    cachedAccessToken = accessToken;
    cachedUser = user;
    localStorage.setItem("gdrive_access_token", accessToken);
    localStorage.setItem("gdrive_user", JSON.stringify(user));

    return { user, accessToken };
  } catch (error: any) {
    if (error?.code === "auth/popup-blocked" || error?.message?.includes("popup-blocked") || error?.message?.includes("popup_blocked")) {
      throw new Error("เบราว์เซอร์บล็อกหน้าต่างป๊อปอัปไว้! กรุณากดอนุญาตป๊อปอัปที่แถบที่อยู่ (Address Bar) ของเบราว์เซอร์ หรือกดเปิดแอปในหน้าต่างใหม่ (Open in new tab) แล้วลองกดเชื่อมต่ออีกครั้งค่ะ");
    }
    if (error?.code === "auth/popup-closed-by-user" || error?.message?.includes("popup_closed") || error?.message?.includes("closed")) {
      throw new Error("การเชื่อมต่อ Google ถูกยกเลิก หรือป๊อปอัปถูกปิด กรุณากดปุ่ม 'เชื่อมต่อ Google Drive' อีกครั้งค่ะ");
    }
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken || (typeof window !== "undefined" ? localStorage.getItem("gdrive_access_token") : null);
};

export const getStoredUser = (): GoogleDriveUser | null => {
  if (cachedUser) return cachedUser;
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem("gdrive_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("gdrive_access_token", token);
    } else {
      localStorage.removeItem("gdrive_access_token");
    }
  }
};

export const logoutGoogle = async () => {
  try {
    await auth.signOut();
  } catch {}
  cachedAccessToken = null;
  cachedUser = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("gdrive_access_token");
    localStorage.removeItem("gdrive_user");
  }
};
