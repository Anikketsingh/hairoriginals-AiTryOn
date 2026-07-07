/**
 * lib/validation.ts
 *
 * Client-side photo quality validation pipeline for AI try-on portraits.
 * Analyzes lighting, framing, and resolution for both uploaded photos and camera captures.
 */

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0 to 100
  warnings: string[];
}

/**
 * Validates a photo dataUrl or Image element for AI try-on quality.
 */
export async function validatePortraitPhoto(dataUrl: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const warnings: string[] = [];
      let score = 100;

      // 1. Resolution check
      const minDimension = Math.min(img.width, img.height);
      if (minDimension < 300) {
        warnings.push("Low resolution — photo might appear blurry.");
        score -= 25;
      }

      // 2. Lighting & Luminance check via Canvas
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = Math.min(img.width, 200);
          canvas.height = Math.min(img.height, 200);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          let totalLuminance = 0;

          for (let i = 0; i < data.length; i += 4) {
            // Perceptual luminance weights
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            totalLuminance += luminance;
          }

          const avgLuminance = totalLuminance / (data.length / 4);

          if (avgLuminance < 45) {
            warnings.push("Lighting is too dark — try taking a photo in brighter light.");
            score -= 30;
          } else if (avgLuminance > 220) {
            warnings.push("Lighting is overly harsh or overexposed.");
            score -= 20;
          }
        }
      } catch (e) {
        console.warn("[validation] Luminance check skipped:", e);
      }

      // 3. Aspect Ratio check
      const aspectRatio = img.width / img.height;
      if (aspectRatio > 1.8 || aspectRatio < 0.5) {
        warnings.push("Unusual photo framing — a portrait aspect ratio works best.");
        score -= 15;
      }

      resolve({
        isValid: score >= 60,
        score: Math.max(0, score),
        warnings,
      });
    };

    img.onerror = () => {
      resolve({
        isValid: false,
        score: 0,
        warnings: ["Could not load image file."],
      });
    };

    img.src = dataUrl;
  });
}
