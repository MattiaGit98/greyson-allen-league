import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
