/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility to compress images (File, Blob, or Base64 string) on the client side using HTML5 Canvas.
 * Uses URL.createObjectURL(file) when given a File/Blob and revokes it immediately after drawing,
 * avoiding full raw camera Base64 allocation spikes on mobile browsers.
 */
export function compressImage(
  input: File | Blob | string,
  maxWidth = 800,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve) => {
    if (!input) {
      resolve("");
      return;
    }

    let objectUrl: string | null = null;
    let srcUrl: string;

    if (typeof input === "string") {
      if (!input.startsWith("data:image/") && !input.startsWith("blob:")) {
        resolve(input);
        return;
      }
      srcUrl = input;
    } else {
      objectUrl = URL.createObjectURL(input);
      srcUrl = objectUrl;
    }

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    const img = new Image();
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
          cleanup();
          resolve(compressedBase64);
        } else {
          cleanup();
          resolve(typeof input === "string" ? input : "");
        }
      } catch {
        cleanup();
        resolve(typeof input === "string" ? input : "");
      }
    };
    img.onerror = () => {
      cleanup();
      resolve(typeof input === "string" ? input : "");
    };
    img.src = srcUrl;
  });
}
