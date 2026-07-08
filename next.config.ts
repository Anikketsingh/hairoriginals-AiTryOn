import type { NextConfig } from "next";

// Testing on a phone over the LAN needs your machine's local IP allow-listed
// here (Next dev-mode only — ignored in production builds). Set it via env
// instead of hardcoding a developer's personal IP into the repo:
//   DEV_LAN_ORIGINS=10.0.0.5,192.168.1.20 npm run dev
const devLanOrigins = process.env.DEV_LAN_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  images: {
    // Allow data URLs (base64) for local image previews and generated results
    dangerouslyAllowSVG: false,
    unoptimized: false,
  },
  experimental: {
    // Allow larger request bodies for image uploads (25MB)
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  allowedDevOrigins: devLanOrigins,
};

export default nextConfig;
