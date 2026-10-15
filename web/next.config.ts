import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the Next.js dev badge out of screen recordings.
  devIndicators: false,
  async redirects() {
    // The workspace starts at the live pool; older links keep working.
    return [
      ...["/overview", "/surgery", "/integrity", "/medication"].map((source) => ({ source, destination: "/pool", permanent: false })),
      { source: "/family", destination: "/case/P-0154", permanent: false },
      { source: "/cypher", destination: "/graph", permanent: false },
      { source: "/exchanges", destination: "/swaps", permanent: false },
    ];
  },
};

export default nextConfig;
