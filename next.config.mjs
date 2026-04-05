/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for mapbox-gl Web Worker to compile correctly under Next.js/Turbopack
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'framer-motion', 'motion-dom', 'motion-utils'],



  // Compress all responses (gzip/brotli)
  compress: true,

  // Reduce the build output noise in production
  productionBrowserSourceMaps: false,

  // Strict mode for catching bugs early in development
  reactStrictMode: true,

  images: {
    // Domains from which external images can be served via next/image
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'unpkg.com' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' },
    ],
    // Convert images to WebP format automatically
    formats: ['image/webp', 'image/avif'],
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Aggressive caching for static assets (fonts, images, etc.)
        source: '/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
