import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* every page here is per-user and auth-gated, so static caching buys nothing */
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
