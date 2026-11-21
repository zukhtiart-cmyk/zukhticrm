import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  serverExternalPackages: ["@react-pdf/renderer"],
  // Fonts for the quote PDFs are read from disk at run time.
  outputFileTracingIncludes: { "/projects/[id]/quote/[quoteId]/pdf": ["./assets/fonts/**"], "/portal/[token]/quote/[quoteId]/pdf": ["./assets/fonts/**"] },
  images: { remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }] },
};

export default nextConfig;
