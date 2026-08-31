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
 * Ceiling on what actually leaves the browser.
 *
 * A modern phone photo is 3-15MB, but a serverless request body is capped far
 * below that (4.5MB on Vercel) and a body that overruns the cap is dropped at
 * the edge — which reaches the browser as a bare `TypeError: Failed to fetch`,
 * not a readable error. That was the intermittent "Failed to fetch" on
 * generate: a camera capture (a small canvas JPEG) always fit, a picked photo
 * only sometimes did. So every picked file is re-encoded down to this budget
 * before it goes near a route handler. 1600px is well past what the try-on
 * model resolves, and two images at 1.5MB still leave headroom in one request.
 */
export const UPLOAD_MAX_DIMENSION = 1600;
export const UPLOAD_TARGET_BYTES = 1.5 * 1024 * 1024;

/**
 * Draw `src` onto a canvas capped at `maxDim` and read it back as a JPEG.
 * Resolves null if any step is unavailable, so callers can fall back to the
 * file they already have.
 */
function renderToJpeg(
  src: string,
  maxDim: number,
  quality: number,
  filename: string
): Promise<File | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        // JPEG has no alpha channel — without this, a transparent PNG's
        // background is composited onto black.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], filename, { type: "image/jpeg" }) : null),
          "image/jpeg",
          quality
        );
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
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
export async function downscaleImage(
  dataUrl: string,
  fallback: File,
  maxDim = 1024,
  quality = 0.85
): Promise<File> {
  return (await renderToJpeg(dataUrl, maxDim, quality, "scan.jpg")) ?? fallback;
}

/**
 * Shrinks a file until it fits UPLOAD_TARGET_BYTES, so a large photo can't
 * silently blow the request-body cap (see the constant above). Anything
 * already under budget — a camera capture, a small catalogue image — is
 * returned untouched, and every failure path returns the original file: a
 * too-big upload that might work beats a picker that refuses the photo.
 */
export async function compressForUpload(file: File): Promise<File> {
  if (file.size <= UPLOAD_TARGET_BYTES) return file;

  const filename = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  // An object URL, not a data URL: base64-ing a 20MB file first costs ~27MB of
  // string on a phone that is already holding the photo twice.
  const src = URL.createObjectURL(file);
  try {
    let best: File | null = null;
    // Quality first, then resolution — the model loses less to JPEG artefacts
    // than it does to missing pixels.
    for (const [maxDim, quality] of [
      [UPLOAD_MAX_DIMENSION, 0.85],
      [UPLOAD_MAX_DIMENSION, 0.7],
      [1200, 0.6],
    ] as const) {
      const encoded = await renderToJpeg(src, maxDim, quality, filename);
      if (!encoded) return best ?? file; // canvas unavailable — nothing to gain by retrying
      if (encoded.size <= UPLOAD_TARGET_BYTES) return encoded;
      if (!best || encoded.size < best.size) best = encoded;
    }
    return best ?? file;
  } finally {
    URL.revokeObjectURL(src);
  }
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
