import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a minimal server bundle for the Docker production image.
  output: "standalone",
  // pino uses worker threads and dynamic requires; keep it (and its dev
  // transport) out of the Next.js bundler.
  serverExternalPackages: ["pino", "pino-pretty"],
};

export default nextConfig;
