/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare's edge runtime has no Next image optimizer, and every photo is a plain static file anyway.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
