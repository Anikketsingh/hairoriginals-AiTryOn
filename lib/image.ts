import type { UploadedImage } from "@/lib/types";

/** Read a File into an UploadedImage (dataUrl + base64). */
export function fileToUploadedImage(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({ file, dataUrl, base64, mimeType: file.type });
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Re-encodes an image as a JPEG no larger than `maxDim` on its longest side.
 *
 * For the AI Stylist scan, which sends the photo on to a vision model. Measured
 * against /api/suggest with an identical prompt: a 2MB PNG took 16.1s while a
 * 145KB JPEG of the same photo took 2.2s — for the *same* 1722 prompt tokens.
 * The cost is transfer (browser → route → Google), not model work, so shrinking
 * the payload is close to free latency. A modern phone photo is 3-8MB, which
 * would otherwise routinely blow the vision call's timeout.
 *
 * 1024px is far more resolution than face shape and hair texture need.
 * Returns the original file untouched if the canvas step fails for any reason.
 */
export function downscaleImage(
  dataUrl: string,
  fallback: File,
  maxDim = 1024,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(fallback);
        // JPEG has no alpha channel — without this, a transparent PNG's
        // background is composited onto black.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(fallback);
            resolve(new File([blob], "scan.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      } catch {
        resolve(fallback);
      }
    };
    img.onerror = () => resolve(fallback);
    img.src = dataUrl;
  });
}

/** Fetch a remote image URL and turn it into an UploadedImage. */
export async function urlToUploadedImage(
  url: string,
  filename: string,
  productId?: string
): Promise<UploadedImage> {
  const res = await fetch(url);
  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  const file = new File([blob], filename, { type });
  const img = await fileToUploadedImage(file);
  return { ...img, mimeType: type, productId };
}
