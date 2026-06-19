import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pdf-parse@2` ships a self-contained CJS bundle that uses a
  // relative `./pdf.worker.mjs` path internally for its in-process
  // worker. When Turbopack bundles the package for the SSR runtime
  // it can't resolve that relative path. Externalising the package
  // forces Next to load it through Node's resolver (CommonJS),
  // which keeps the relative worker path intact.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
