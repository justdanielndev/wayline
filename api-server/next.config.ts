import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@aws-sdk/client-s3': false,
      };
    }
    return config;
  },
  serverExternalPackages: ['mongoose', 'unzipper'],
};

export default nextConfig;