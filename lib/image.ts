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
