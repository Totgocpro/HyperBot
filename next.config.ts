import type { NextConfig } from "next";

const NextConfiguration: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
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

    WebpackConfiguration.ignoreWarnings = [
      { module: /PluginSettingsPanel/ } // This is intentional, for allowing custom plugin to have custom configs
    ];

    return WebpackConfiguration;
  }
};

export default NextConfiguration;
