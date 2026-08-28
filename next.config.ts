import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // For Vercel deployment (default is server-side, which Vercel supports)
  // No need for 'output: export' since Vercel handles SSR natively
};

export default withNextIntl(nextConfig);
