import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  logging: {
    fetches: { fullUrl: false },
    serverFunctions: false,
    browserToTerminal: false,
    incomingRequests: {
      ignore: [/\/api\/(?:auth|session|workspaces|audit)(?:\/|$)/],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
