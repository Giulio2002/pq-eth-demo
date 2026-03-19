/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546",
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545",
  },
};
module.exports = nextConfig;
