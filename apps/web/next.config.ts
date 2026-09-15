import path from "node:path";
import type { NextConfig } from "next";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  eslint: { ignoreDuringBuilds: true },
  devIndicators: false, // бейдж Next.js перекрывал мобильную панель записи
  // В проде /api/* перехватывает Caddy; в dev проксируем на FastAPI
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
