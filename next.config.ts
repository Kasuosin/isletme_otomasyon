import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["iyzipay"],
  outputFileTracingIncludes: {
    '/api/checkout': ['./node_modules/iyzipay/**/*'],
    '/api/checkout/callback': ['./node_modules/iyzipay/**/*'],
    '/api/**/*': ['./node_modules/iyzipay/**/*'],
  },
};

export default nextConfig;
