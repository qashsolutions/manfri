import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The contracts package is shipped as TS source (single source of truth for
  // the BFF↔FastAPI seam); Next transpiles it rather than consuming a build.
  transpilePackages: ["@manfriday/contracts"],
};

export default nextConfig;
