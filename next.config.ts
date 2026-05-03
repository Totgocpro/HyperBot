import type { NextConfig } from "next";

const NextConfiguration: NextConfig = {
  reactStrictMode: true,
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"]
    }
  },
  webpack: (WebpackConfiguration) => {
    WebpackConfiguration.resolve = WebpackConfiguration.resolve ?? {};
    WebpackConfiguration.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"]
    };

    return WebpackConfiguration;
  }
};

export default NextConfiguration;
