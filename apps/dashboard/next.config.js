/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@lake-pass/shared'],
  images: {
    domains: ['lake-pass-uploads.s3.amazonaws.com'],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
};

module.exports = nextConfig;
