// path: apps/dashboard/next.config.js

const allowedOrigins = ['localhost:3000', 'lake-pass-dashboard.vercel.app'];
// Vercel sets this automatically on every deploy, including preview builds
// for branches/PRs, so those get a real origin too instead of failing the
// serverActions origin check (which was surfacing as a false "offline" banner).
if (process.env.VERCEL_URL) allowedOrigins.push(process.env.VERCEL_URL);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@lake-pass/shared'],
  images: {
    domains: ['lake-pass-uploads.s3.amazonaws.com'],
  },
  experimental: {
    serverActions: { allowedOrigins },
  },
};

module.exports = nextConfig;
