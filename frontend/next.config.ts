import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ESLint runs in CI / pre-commit. Don't block production builds on stylistic rules.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
