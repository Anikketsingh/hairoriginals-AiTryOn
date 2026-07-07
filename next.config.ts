import type { NextConfig } from "next";

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
  allowedDevOrigins: ["10.110.121.93"],
};

export default nextConfig;
