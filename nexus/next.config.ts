import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The desktop bridge shells out with execFile; keep it on the Node runtime.
  serverExternalPackages: [],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Camera for hand tracking, microphone for voice. Nothing else.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
