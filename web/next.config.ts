import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages shipped as TS source — Next transpiles them rather than
  // consuming a build. @manfriday/db is the lean Supabase data layer used by the
  // /api/v1/* route handlers; @manfriday/contracts is the legacy OpenAPI types.
  transpilePackages: ["@manfriday/contracts", "@manfriday/db"],
};

export default nextConfig;
