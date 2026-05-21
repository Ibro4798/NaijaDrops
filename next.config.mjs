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
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'unpkg.com' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' },
    ],
    formats: ['image/webp', 'image/avif'],
  },

  // ✅ REDIRECTS: Dead pages replaced with Next.js redirects
  // This means the page files can be deleted — Next.js handles the redirect
  async redirects() {
    return [
      // Legacy route aliases
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/send', destination: '/send-package/step-1', permanent: true },
      { source: '/summary', destination: '/vendor/dashboard', permanent: true },
      { source: '/matching', destination: '/vendor/dashboard', permanent: true },
      { source: '/welcome', destination: '/', permanent: true },
      // Duplicate tracking route
      { source: '/track/:orderId', destination: '/tracking/:orderId', permanent: true },
      // Old /admin → ops-terminal (admins bookmarking /admin get sent to the right place)
      { source: '/admin', destination: '/ops-terminal/dashboard', permanent: false },
      { source: '/admin/:path*', destination: '/ops-terminal/:path*', permanent: false },
    ];
  },

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
        source: '/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
