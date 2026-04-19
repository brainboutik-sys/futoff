import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ratings-images-prod.pulse.ea.com" },
      { protocol: "https", hostname: "cdn.sofifa.net" },
    ],
  },
  experimental: {
    optimizePackageImports: ["clsx", "tailwind-merge"],
  },
};

export default nextConfig;
