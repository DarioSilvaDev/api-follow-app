import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo: fija el root de Turbopack en el directorio del frontend para
    // evitar el warning "We detected multiple lockfiles ... set turbopack.root".
    root: path.join(__dirname),
  },
};

export default nextConfig;
