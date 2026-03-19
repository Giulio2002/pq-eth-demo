/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Exclude .wasm files from webpack processing
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });
    // Prevent webpack from trying to bundle the WASM binary import
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546",
  },
};
module.exports = nextConfig;
