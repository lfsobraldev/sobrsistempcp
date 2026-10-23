import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdfjs-serverless"],
  // O modelo oficial do romaneio é lido do disco em tempo de execução.
  outputFileTracingIncludes: { "/api/**": ["./public/templates/**"] }
};

export default nextConfig;
