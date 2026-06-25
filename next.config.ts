import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["iyzipay", "postman-request"],
  outputFileTracingIncludes: {
    '/api/checkout': ['./node_modules/iyzipay/**/*', './node_modules/postman-request/**/*'],
    '/api/checkout/callback': ['./node_modules/iyzipay/**/*', './node_modules/postman-request/**/*'],
    '/api/**/*': ['./node_modules/iyzipay/**/*', './node_modules/postman-request/**/*'],
  },
};

export default nextConfig;
